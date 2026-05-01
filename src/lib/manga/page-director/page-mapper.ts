/**
 * ページ分割 + slot マッピング（ルールベース）
 *
 * 入力: storyboard が出した連続コマ列 ShotlistPanelEntry[]
 * 出力: MangaPagePlan[] (ページ単位の IR、テンプレ + slot 割当済)
 *
 * 設計判断:
 *   - LLM 不要のルールベース。storyboard 段階で narrative_function / role / aspect /
 *     cut_type / scroll_pause_intent が埋まっているため、ページ役割は決定的に推定可能。
 *   - 後で LLM 補強できる構造を保つ（splitIntoPages / inferPageContext は純関数）。
 *
 * ページ分割ルール:
 *   1. aspect が page/spread/splash → そのコマで強制単独ページ
 *   2. role==='cliffhanger' or narrative_function==='beat_button' → そのコマでページ閉じ
 *   3. 累積コマ数が targetPagePanels に達した場合の自然区切り候補:
 *      - cut_type が 'smash_cut' / 'time_skip'
 *      - narrative_function === 'establishing'
 *      - scene_id が直前と異なる
 *   4. 累積コマ数が maxPanelsPerPage を超えたら強制で切る
 *
 * テンプレ選択 → slot 割当:
 *   - importance を aspect/role/narrative_function から導出
 *   - 重要度高いコマを role_hint 付き slot or 大 slot へ優先割当
 *   - 残りは reading_order 順で埋める
 */

import type { ShotlistPanelEntry, EpisodePlotData } from "../schemas";
import type { PanelAspect, PanelRole, NarrativeFunction } from "../types";
import { selectBestTemplate } from "./template-selector";
import { TEMPLATES_BY_ID } from "./layout-templates";
import { PAGE_DIMENSIONS } from "./types";
import type {
  DialogueDensity,
  FocalRegion,
  LayoutTemplate,
  MangaPagePlan,
  PagePanel,
  PagePromptBlueprint,
  PageRole,
  PageSide,
  PanelImportance,
  PanelSizeClass,
  ReadingDirection,
  RenderConstraints,
  RenderStrategy,
  TemplateSlot,
  TurnStrength,
  VisualDensity,
} from "./types";

// ============================================================
// マッピング辞書
// ============================================================

/** PanelAspect → PanelSizeClass マッピング */
function aspectToSizeClass(aspect: PanelAspect): PanelSizeClass {
  switch (aspect) {
    case "page":
    case "spread":
    case "splash":
      return "splash";
    case "big":
    case "panel_tall":
      return "extra_large";
    case "panel_landscape":
    case "panel_portrait":
      return "large";
    case "panel_square":
    case "square":
    case "vertical":
    default:
      return "medium";
  }
}

/** ShotlistPanelEntry → importance 1-5 */
function inferImportance(p: ShotlistPanelEntry): PanelImportance {
  // 強強: cliffhanger / splash 系 / beat_button
  if (p.role === "cliffhanger") return 5;
  if (p.aspect === "splash" || p.aspect === "spread" || p.aspect === "page") return 5;
  if (p.narrative_function === "beat_button") return 5;
  if (p.narrative_function === "reveal") return 4;
  if (p.aspect === "big" || p.aspect === "panel_tall") return 4;
  if (p.role === "action") return 4;
  if (p.role === "emotion" || p.narrative_function === "emote") return 3;
  if (p.role === "information" || p.role === "transition") return 2;
  if (p.narrative_function === "silence" || p.narrative_function === "pause") return 2;
  return 3;
}

// ============================================================
// ページ分割
// ============================================================

export type PageMapperOptions = {
  /** 1ページあたりの目標コマ数（自然区切り判定の基準） */
  targetPagePanels?: number;
  /** RenderConstraints (ModelCapabilityProfile から派生) */
  constraints: RenderConstraints;
  /** 読み方向（日本漫画は rtl） */
  readingDirection?: ReadingDirection;
  /** F-2 ページ一発生成を許すか（Profile.recommended_strategy に従う） */
  recommendedStrategy?: RenderStrategy;
  /** episode plot（page_role 推定に turn/climax 情報を活用する場合に渡す） */
  plot?: EpisodePlotData;
};

/** ページ分割中間表現 */
type PageGroup = {
  panels: ShotlistPanelEntry[];
};

function isStrongCloser(p: ShotlistPanelEntry): boolean {
  if (p.role === "cliffhanger") return true;
  if (p.narrative_function === "beat_button") return true;
  return false;
}

function isSplashLike(p: ShotlistPanelEntry): boolean {
  return p.aspect === "page" || p.aspect === "spread" || p.aspect === "splash";
}

function isNaturalBreak(
  p: ShotlistPanelEntry,
  prev: ShotlistPanelEntry | undefined
): boolean {
  if (!prev) return false;
  if (p.cut_type === "smash_cut" || p.cut_type === "time_skip") return true;
  if (p.narrative_function === "establishing") return true;
  if (p.scene_id !== prev.scene_id) return true;
  return false;
}

/**
 * 連続コマ列をページ単位に分割
 *
 * 切断ロジック:
 *  1. splash/spread/page → 単独ページ（直前まで貯まっていれば先 flush）
 *  2. 強い締め (role=cliffhanger or narrative_function=beat_button) でページ閉じ
 *  3. 自然区切り (cut_type=smash_cut/time_skip / establishing / scene 切替) は
 *     `cur.length >= ceil(target * 0.7)` で発火
 *  4. effectiveMax (= max(avg+1, max-1)) を超えたら強制 flush。
 *     buffer を 1 コマ残すので、直後の splash 等で 1コマ孤立ページになりにくい。
 */
export function splitIntoPages(
  panels: ShotlistPanelEntry[],
  opts: { targetPagePanels: number; maxPanelsPerPage: number }
): PageGroup[] {
  const pages: PageGroup[] = [];
  let cur: ShotlistPanelEntry[] = [];
  const flush = () => {
    if (cur.length > 0) {
      pages.push({ panels: cur });
      cur = [];
    }
  };

  // 自然区切り閾値: target の 70%（最低 3）
  const naturalBreakThreshold = Math.max(
    3,
    Math.ceil(opts.targetPagePanels * 0.7)
  );
  // 実質 max: max-1 と target+1 の大きい方。max ぴったりに張り付かせない
  const effectiveMax = Math.max(
    opts.targetPagePanels + 1,
    opts.maxPanelsPerPage - 1
  );

  for (let i = 0; i < panels.length; i++) {
    const p = panels[i];
    const prev = panels[i - 1];

    // 1. splash 系は単独ページ
    if (isSplashLike(p)) {
      flush();
      cur.push(p);
      flush();
      continue;
    }

    // 2. 自然区切りチャンス
    if (cur.length >= naturalBreakThreshold && isNaturalBreak(p, prev)) {
      flush();
    }

    // 3. 実質 max 到達時に強制 flush
    if (cur.length >= effectiveMax) {
      flush();
    }

    cur.push(p);

    // 4. 強い締め
    if (isStrongCloser(p)) {
      flush();
    }
  }
  flush();

  return pages;
}

// ============================================================
// ページ抽象コンテキスト推定
// ============================================================

/** ページ役割を推定。allow_action_pages=false のとき action を抑制 */
export function inferPageRole(
  group: PageGroup,
  ctx: { isLastPage: boolean; allowActionPages?: boolean }
): PageRole {
  const allowAction = ctx.allowActionPages ?? true;
  const panels = group.panels;
  const last = panels[panels.length - 1];

  // 1. 末尾コマが cliffhanger
  if (last && (last.role === "cliffhanger" || last.narrative_function === "beat_button")) {
    return "cliffhanger";
  }

  // 2. splash 系は単独で reveal/action/cliffhanger いずれか
  if (panels.length === 1 && isSplashLike(panels[0])) {
    if (panels[0].role === "action" && allowAction) return "action";
    return "reveal";
  }

  // 3. role / narrative_function 集計
  const roleCount = new Map<PanelRole, number>();
  const fnCount = new Map<NarrativeFunction, number>();
  let dialoguePanels = 0;
  for (const p of panels) {
    roleCount.set(p.role, (roleCount.get(p.role) ?? 0) + 1);
    if (p.narrative_function) {
      fnCount.set(p.narrative_function, (fnCount.get(p.narrative_function) ?? 0) + 1);
    }
    if (p.dialogue && p.dialogue.length > 0) dialoguePanels += 1;
  }

  const actionN = roleCount.get("action") ?? 0;
  const emotionN = roleCount.get("emotion") ?? 0;
  const openingN = roleCount.get("opening") ?? 0;
  const transitionN = roleCount.get("transition") ?? 0;
  const informationN = roleCount.get("information") ?? 0;
  const revealN = fnCount.get("reveal") ?? 0;
  const silenceN =
    (fnCount.get("silence") ?? 0) +
    (fnCount.get("pause") ?? 0) +
    (fnCount.get("emote") ?? 0);

  // 4. 優先順位ベース判定（強い signal から）
  if (actionN >= 2) return allowAction ? "action" : "reveal";
  if (revealN >= 2) return "reveal";

  // 5. opening を含むページは setup（establishing 系を含むため）
  if (openingN >= 1 && panels.length <= 6) return "setup";

  // 6. dialogue 比率
  const dialogueRatio = dialoguePanels / panels.length;
  if (dialogueRatio >= 0.5) return "dialogue";

  // 7. silence/pause/emote が支配的 → aftermath
  if (silenceN >= Math.ceil(panels.length / 2)) return "aftermath";

  // 8. information 中心 → setup
  if (informationN >= Math.ceil(panels.length / 2)) return "setup";
  if (emotionN >= Math.ceil(panels.length / 2)) return "aftermath";

  // 9. transition が多い → setup（シーン転換群）
  if (transitionN >= Math.ceil(panels.length / 2)) return "setup";

  // 10. デフォルト
  return "dialogue";
}

/** 視覚密度を panel_count から推定 */
export function inferVisualDensity(panelCount: number): VisualDensity {
  if (panelCount <= 4) return "light";
  if (panelCount >= 7) return "heavy";
  return "normal";
}

/** セリフ密度を dialogue 持ちパネル比率から推定 */
export function inferDialogueDensity(panels: ShotlistPanelEntry[]): DialogueDensity {
  const n = panels.filter((p) => p.dialogue && p.dialogue.length > 0).length;
  const ratio = panels.length === 0 ? 0 : n / panels.length;
  if (ratio >= 0.65) return "high";
  if (ratio <= 0.25) return "low";
  return "normal";
}

/** ターン強度をプロットビート + 末尾role から 0-5 で推定 */
export function inferTurnStrength(
  group: PageGroup,
  plot?: EpisodePlotData
): TurnStrength {
  const last = group.panels[group.panels.length - 1];
  if (last?.role === "cliffhanger") return 5;
  if (last?.narrative_function === "beat_button") return 4;

  // beat_idx から該当 beat の emotional_intensity の最大を採用
  if (plot) {
    const beatIdxs = new Set(group.panels.map((p) => p.beat_idx).filter((v): v is number => v != null));
    let maxIntensity = 0;
    for (const idx of beatIdxs) {
      const beat = plot.beats.find((b) => b.beat_idx === idx);
      if (beat && beat.emotional_intensity > maxIntensity) {
        maxIntensity = beat.emotional_intensity;
      }
    }
    // 0-1 を 0-5 にマッピング (clamp + round)
    const v = Math.round(maxIntensity * 5);
    if (v < 0) return 0;
    if (v > 5) return 5;
    return v as TurnStrength;
  }

  // plot なし: aspect/role から推定
  const hasSplash = group.panels.some(isSplashLike);
  if (hasSplash) return 4;
  const hasAction = group.panels.some((p) => p.role === "action");
  if (hasAction) return 3;
  return 2;
}

// ============================================================
// slot 割当
// ============================================================

/**
 * 1ページ分のコマを slot に割当てる。
 *
 * 戦略:
 *  1. importance 降順でコマを並べる
 *  2. importance 5 のコマはまず role_hint を持つ slot 優先
 *  3. role_hint slot が無ければ size_class が大きい slot から埋める
 *  4. 残りは入力順（=reading_order）で空き slot に詰める
 */
function assignSlots(
  panels: ShotlistPanelEntry[],
  template: LayoutTemplate
): PagePanel[] {
  // テンプレが panel.length より多くの slot を持つ → 余り slot は使わない
  // panels.length > template.panel_count の場合は呼び出し側で防いでいる前提だが
  // 念のため切り捨てる
  const usePanels = panels.slice(0, template.panel_count);

  // slot を default_reading_order でソート
  const slots = [...template.slots].sort(
    (a, b) => a.default_reading_order - b.default_reading_order
  );

  // 重要度で panels をソート（同点はもとの順序、=ストーリー時系列）
  const indexed = usePanels.map((p, i) => ({
    panel: p,
    origIdx: i,
    importance: inferImportance(p),
  }));
  const sortedByImportance = [...indexed].sort((a, b) => {
    if (b.importance !== a.importance) return b.importance - a.importance;
    return a.origIdx - b.origIdx;
  });

  // size_class の階層
  const sizeOrder: PanelSizeClass[] = [
    "splash",
    "extra_large",
    "large",
    "medium",
    "small",
    "tiny",
  ];
  const sizeRank = (c: PanelSizeClass) => sizeOrder.indexOf(c);

  // slot 割当マップ: origIdx -> TemplateSlot
  const assigned = new Map<number, TemplateSlot>();
  const usedSlotIds = new Set<string>();

  for (const item of sortedByImportance) {
    const wantSize = aspectToSizeClass(item.panel.aspect);

    // 候補 slot を、importance>=4 なら role_hint 優先 → size_class 一致 → 大きい順、で並べる
    const candidates = slots.filter((s) => !usedSlotIds.has(s.id));
    if (candidates.length === 0) break;

    candidates.sort((a, b) => {
      if (item.importance >= 4) {
        const aHint = a.role_hint ? 1 : 0;
        const bHint = b.role_hint ? 1 : 0;
        if (aHint !== bHint) return bHint - aHint;
      }
      // size_class 一致を優先
      const aMatch = a.size_class === wantSize ? 1 : 0;
      const bMatch = b.size_class === wantSize ? 1 : 0;
      if (aMatch !== bMatch) return bMatch - aMatch;
      // 大きい順
      const aRank = sizeRank(a.size_class);
      const bRank = sizeRank(b.size_class);
      if (aRank !== bRank) return aRank - bRank;
      // 同条件なら default_reading_order が早い方
      return a.default_reading_order - b.default_reading_order;
    });

    const chosen = candidates[0];
    assigned.set(item.origIdx, chosen);
    usedSlotIds.add(chosen.id);
  }

  // PagePanel 生成（panel_idx は 0-indexed = origIdx）
  const result: PagePanel[] = usePanels.map((p, i) => {
    const slot = assigned.get(i);
    if (!slot) {
      throw new Error(
        `slot 割当失敗: panel_idx=${i} aspect=${p.aspect}（テンプレ slots 数不足）`
      );
    }
    const importance = inferImportance(p);
    return {
      panel_idx: i,
      slot_id: slot.id,
      rect: { ...slot.rect },
      render_size_class: slot.size_class,
      reading_order: slot.default_reading_order,
      importance,
      balloon_zones: [...slot.balloon_zones],
      focal_region: deriveFocalRegion(slot),
    };
  });

  return result;
}

/** slot の rect 位置から focal_region を簡易推定。PAGE_DIMENSIONS に追従 */
function deriveFocalRegion(slot: TemplateSlot): FocalRegion {
  const cx = slot.rect.x + slot.rect.w / 2;
  const cy = slot.rect.y + slot.rect.h / 2;
  const isLeft = cx < PAGE_DIMENSIONS.width / 2;
  const isTop = cy < PAGE_DIMENSIONS.height / 2;
  if (isTop && isLeft) return "top_left";
  if (isTop && !isLeft) return "top_right";
  if (!isTop && isLeft) return "bottom_left";
  if (!isTop && !isLeft) return "bottom_right";
  return "center";
}

// ============================================================
// blueprint 構築（F-2 page_one_shot 用）
// ============================================================

function buildBlueprint(
  pagePanels: PagePanel[],
  storyboardPanels: ShotlistPanelEntry[]
): PagePromptBlueprint {
  // panel_roles: ShotlistPanelEntry の role + narrative_function を簡易結合
  const roles = pagePanels.map((pp) => {
    const sb = storyboardPanels[pp.panel_idx];
    if (!sb) return "panel";
    const r = sb.role;
    const fn = sb.narrative_function ?? "";
    return fn ? `${r}_${fn}` : r;
  });

  // 支配的コマ位置: 最大面積 panel の focal_region
  let dominantIdx = 0;
  let maxArea = 0;
  for (const pp of pagePanels) {
    const area = pp.rect.w * pp.rect.h;
    if (area > maxArea) {
      maxArea = area;
      dominantIdx = pp.panel_idx;
    }
  }
  const dominantFocal = pagePanels[dominantIdx]?.focal_region ?? "center";

  // 吹き出し予約領域（全 panel の balloon_zones を flatten + dedup）
  const reserved = new Set<string>();
  for (const pp of pagePanels) {
    for (const z of pp.balloon_zones) reserved.add(z);
  }

  return {
    panel_count: pagePanels.length,
    panel_order: pagePanels.map((p) => p.panel_idx),
    panel_roles: roles,
    dominant_panel_position: dominantFocal,
    reserved_bubble_regions: Array.from(reserved),
    must_not_draw_text: true,
  };
}

// ============================================================
// メイン
// ============================================================

/**
 * storyboard panel 列 → MangaPagePlan[] へ変換
 */
export function mapStoryboardToPages(
  panels: ShotlistPanelEntry[],
  opts: PageMapperOptions
): MangaPagePlan[] {
  const targetPagePanels = opts.targetPagePanels ?? opts.constraints.avg_panels_per_page;
  const maxPanelsPerPage = opts.constraints.max_panels_per_page;
  const readingDirection: ReadingDirection = opts.readingDirection ?? "rtl";
  const strategy: RenderStrategy = opts.recommendedStrategy ?? "panel_composite";

  const groups = splitIntoPages(panels, {
    targetPagePanels,
    maxPanelsPerPage,
  });

  const result: MangaPagePlan[] = [];

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const isLastPage = i === groups.length - 1;
    const pageSide: PageSide = i % 2 === 0 ? "right" : "left";

    const page_role = inferPageRole(g, {
      isLastPage,
      allowActionPages: opts.constraints.allow_action_pages,
    });
    const visual_density = inferVisualDensity(g.panels.length);
    const dialogue_density = inferDialogueDensity(g.panels);
    const turn_strength = inferTurnStrength(g, opts.plot);

    // splash/spread の単独ページは特別扱い
    const isSplashOnly = g.panels.length === 1 && isSplashLike(g.panels[0]);

    const ctx = {
      page_role,
      visual_density,
      dialogue_density,
      panel_count: g.panels.length,
      page_side: pageSide,
    };

    // splash 単独 → splash_single 強制
    let template: LayoutTemplate | null;
    if (isSplashOnly) {
      template = TEMPLATES_BY_ID.get("splash_single") ?? null;
    } else {
      template = selectBestTemplate(ctx, opts.constraints);
    }

    if (!template) {
      throw new Error(
        `ページ ${i} (panels=${g.panels.length}, role=${page_role}) に適合するテンプレが見つかりません`
      );
    }

    // panel_count > template.panel_count の場合は切り捨てて警告（呼び出し側で警告を捕捉）
    const usePanelCount = Math.min(g.panels.length, template.panel_count);
    const trimmedPanels = g.panels.slice(0, usePanelCount);

    const pagePanels = assignSlots(trimmedPanels, template);

    // F-2 / hybrid のとき blueprint を埋める
    let blueprint: PagePromptBlueprint | undefined;
    let renderStrategy: RenderStrategy = strategy;
    if (isSplashOnly) {
      // splash 単独は page_one_shot が現実的
      renderStrategy = "page_one_shot";
    }
    if (renderStrategy === "page_one_shot" || renderStrategy === "hybrid") {
      blueprint = buildBlueprint(pagePanels, trimmedPanels);
    }

    result.push({
      page_idx: i,
      spread_idx: Math.floor(i / 2),
      page_side: pageSide,
      reading_direction: readingDirection,
      layout_template_id: template.id,
      page_role,
      actual_panel_count: pagePanels.length,
      visual_density,
      dialogue_density,
      turn_strength,
      render_strategy: renderStrategy,
      panels: pagePanels,
      page_prompt_blueprint: blueprint,
    });
  }

  return result;
}

// ============================================================
// 警告レポート
// ============================================================

export type PageMapperWarning = {
  page_idx: number;
  kind: "panel_overflow" | "no_template_match" | "low_importance_max" | "high_dialogue_density";
  detail: string;
};

/**
 * ページプラン群から人間可読な警告を抽出
 * （validator.ts は構造的な不正を検査、こちらは演出的な懸念を検査）
 */
export function reportPageMapperWarnings(
  plans: MangaPagePlan[],
  storyboard: ShotlistPanelEntry[]
): PageMapperWarning[] {
  const warnings: PageMapperWarning[] = [];

  // ページ単位の panel_idx 走査用にオフセットを計算
  let consumedPanels = 0;
  for (const plan of plans) {
    const sliceEnd = consumedPanels + plan.actual_panel_count;
    const sb = storyboard.slice(consumedPanels, sliceEnd);
    consumedPanels = sliceEnd;

    // 元 storyboard で抜けたコマ（テンプレ数超過で trim された）を検出
    const remainingForPage = storyboard.length - sliceEnd;
    if (sb.length < plan.actual_panel_count) {
      warnings.push({
        page_idx: plan.page_idx,
        kind: "panel_overflow",
        detail: `ページ ${plan.page_idx} の actual=${plan.actual_panel_count} に対し storyboard 残=${sb.length}`,
      });
    }
    if (remainingForPage < 0) {
      // ありえないが念のため
      warnings.push({
        page_idx: plan.page_idx,
        kind: "panel_overflow",
        detail: "consumedPanels が storyboard 長を超過",
      });
    }

    // 高密度セリフ + heavy 視覚密度の組み合わせ警告
    if (plan.dialogue_density === "high" && plan.visual_density === "heavy") {
      warnings.push({
        page_idx: plan.page_idx,
        kind: "high_dialogue_density",
        detail: "セリフ密度=high + 視覚密度=heavy。SVG 吹き出し配置で重なりが発生しやすい",
      });
    }

    // importance 最大コマが大ゴマでない場合
    const maxImportance = Math.max(...plan.panels.map((p) => p.importance));
    const maxPanel = plan.panels.find((p) => p.importance === maxImportance);
    if (maxPanel) {
      const ok =
        maxPanel.render_size_class === "splash" ||
        maxPanel.render_size_class === "extra_large" ||
        maxPanel.render_size_class === "large";
      if (!ok && maxImportance >= 4) {
        warnings.push({
          page_idx: plan.page_idx,
          kind: "low_importance_max",
          detail: `重要度=${maxImportance}コマが size_class=${maxPanel.render_size_class}（large 以上が望ましい）`,
        });
      }
    }
  }

  return warnings;
}
