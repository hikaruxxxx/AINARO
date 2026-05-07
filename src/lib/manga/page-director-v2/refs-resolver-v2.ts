/**
 * L7 Refs Resolution v2
 *
 * page_plan + bible.refs/_provenance.json + capability → resolved_refs.json
 *
 * 決定論ルール (RULE 1-10):
 *   1 常時: + style_plate (weight 1.0)
 *   2 close_up & 1キャラ: + char_face_front + char_face_diagonal(0.5)
 *   3 medium & 1キャラ: + char_full_front + char_face_front(0.5)
 *   4 wide & no character focus: + loc wide_establishing
 *   5 over_shoulder: + char_full_back(0.5) + loc interior_eye_level
 *   6 establishing & bleed: + loc wide_establishing のみ
 *   7 on_screen_via=tv: + char tv_variant (無ければ face)
 *   8 continuity_group_ids 指定: 該当 ref を weight 1.0 で強制
 *   9 multi-character (3+): focus_entity に face/full、その他 outfit/full、>3人で silhouette
 *  10 budget 超過時優先: style > continuity_forced > focus_entity > キャラ > location
 *
 * weight は capability.ref_weighting=false なら 1.0 固定 (現 gpt-image-2)
 */
import path from "node:path";
import type {
  BackgroundTreatment,
  BibleSnapshotV2,
  EpisodeStoryboardV2,
  PagePlanV2,
  PanelV2,
  ResolvedRefs,
  ResolvedRefPacket,
  ResolvedRef,
  RefRole,
  RenderStrategy,
} from "../schemas-v2";
import type { CapabilityProfile } from "../capability/capability";
import {
  loadProvenance,
  isAllowedForProduction,
} from "../bible/provenance";

/**
 * RULE 11 (2026-05-06 追加, 同日 atmospheric_fade も拡張): background_treatment による ref 抑制
 *
 * pattern dictionary 由来の panel.background_treatment を読んで、
 * 背景描画が不要なコマでは location ref を渡さない (LLM が背景を勝手に描かないように)。
 * floating_ui は UI が panel そのものなので character も渡さない。
 *
 * 2026-05-06 補強: atmospheric_fade も skip 対象に追加。
 * 当初は weight 0.5 で残す設計だったが、capability ref_weighting=false の現環境では
 * 実効 weight が 1.0 のままで location ref が支配的になり、
 * 「フェードしろ」という prompt 指示が無視されて detailed_bg が生成された
 * (a07 ep01 page 1 v3 vision audit で実証)。location ref を渡さず prompt 指示で
 * 「主体の周囲だけ描け、それ以外は白/速度線で抜け」と強く言う方針に転換。
 */
function shouldSkipLocationRef(bgt: BackgroundTreatment | undefined): boolean {
  return (
    bgt === "tone_back" ||
    bgt === "solid_white" ||
    bgt === "solid_black" ||
    bgt === "floating_ui" ||
    bgt === "atmospheric_fade"
  );
}

function shouldSkipCharacterRef(bgt: BackgroundTreatment | undefined): boolean {
  return bgt === "floating_ui";
}

type ProvenanceLookup = {
  byEntity: Map<string, Array<{ asset_id: string; path: string; variant: string }>>;
};

async function buildLookup(refsDir: string): Promise<ProvenanceLookup> {
  const prov = await loadProvenance(refsDir);
  const byEntity = new Map<string, Array<{ asset_id: string; path: string; variant: string }>>();
  for (const r of prov.refs) {
    if (!isAllowedForProduction(r)) continue; // kindle_archive 等を除外
    const arr = byEntity.get(r.target_entity_id) ?? [];
    arr.push({ asset_id: r.asset_id, path: path.join(refsDir, r.path), variant: r.variant });
    byEntity.set(r.target_entity_id, arr);
  }
  return { byEntity };
}

function findVariant(
  lookup: ProvenanceLookup,
  entityId: string,
  variant: string
): { asset_id: string; path: string; variant: string } | null {
  const arr = lookup.byEntity.get(entityId);
  if (!arr) return null;
  return arr.find((e) => e.variant === variant) ?? null;
}

function findVariantPrefer(
  lookup: ProvenanceLookup,
  entityId: string,
  variants: string[]
): { asset_id: string; path: string; variant: string } | null {
  for (const v of variants) {
    const found = findVariant(lookup, entityId, v);
    if (found) return found;
  }
  // フォールバック: 何でも 1 枚返す
  const arr = lookup.byEntity.get(entityId);
  return arr?.[0] ?? null;
}

function buildPanelPacket(args: {
  panel: PanelV2;
  bible: BibleSnapshotV2;
  lookup: ProvenanceLookup;
  capability: CapabilityProfile;
  stylePlatePath: string | null;
  scope: "panel" | "page";
  /** PagePlanPanel から伝播された背景表現種別 (RULE 11 で使用) */
  backgroundTreatment?: BackgroundTreatment;
}): ResolvedRefPacket {
  const { panel, bible, lookup, capability, stylePlatePath, scope, backgroundTreatment } = args;
  const refs: ResolvedRef[] = [];
  const warnings: string[] = [];
  const unresolved: string[] = [];

  const skipLocation = shouldSkipLocationRef(backgroundTreatment);
  const skipCharacter = shouldSkipCharacterRef(backgroundTreatment);
  if (skipLocation) {
    warnings.push(
      `RULE 11: background_treatment=${backgroundTreatment} → location ref を抑制 (背景を描かない指示)`
    );
  }
  if (skipCharacter) {
    warnings.push(
      `RULE 11: background_treatment=${backgroundTreatment} → character ref も抑制 (UI/HUD 主体パネル)`
    );
  }

  const useWeight = capability.ref_api_capability.ref_weighting;
  const W = (w: number) => (useWeight ? w : 1.0);

  // RULE 1: style plate
  if (stylePlatePath) {
    refs.push({
      asset_id: "style_global_v1",
      path: stylePlatePath,
      weight: W(1.0),
      role: "style",
      source: "deterministic",
      rationale: "RULE 1: 全コマ style plate 強制",
    });
  }

  // RULE 8: continuity_group_ids が注入されていれば該当 ref を強制
  // (continuity_group_ids は L6 が注入する。group_id は seed.target_id にマップする bible.refs を引く)
  for (const groupId of panel.continuity_group_ids ?? []) {
    // group_id 例: "char_kiryuu_ren_v1_face_v1" / "loc_lawson_interior_v1_layout_v1"
    // bible.continuity_seeds から target_id と kind を引く必要があるが、
    // 簡略実装: group_id の "_face_v1" 等 suffix から variant を推定
    // 先に bible.continuity_seeds を引いて target_id 解決
    const seed = bible.continuity_seeds.find((s) => s.group_id === groupId);
    if (!seed) continue;

    let variants: string[] = [];
    if (seed.kind === "character_face") variants = ["face_front", "face_diagonal", "face_side"];
    else if (seed.kind === "character_outfit") variants = ["full_front", "full_back"];
    else if (seed.kind === "character_back") variants = ["full_back", "full_front"];
    else if (seed.kind === "location_layout") {
      if (panel.shot_type === "wide" || panel.shot_type === "establishing")
        variants = ["wide_establishing", "exterior_night", "interior_eye_level"];
      else if (panel.camera === "high_angle") variants = ["interior_high_angle", "interior_eye_level"];
      else variants = ["interior_eye_level", "interior_high_angle"];
    } else if (seed.kind === "tv_variant") variants = ["tv_screen", "face_front"];
    else if (seed.kind === "prop") variants = ["default", "held"];

    const found = findVariantPrefer(lookup, seed.target_id, variants);
    if (!found) {
      unresolved.push(seed.target_id);
      warnings.push(`continuity_group ${groupId}: refs not found for ${seed.target_id}`);
      continue;
    }
    // 重複排除
    if (refs.some((r) => r.asset_id === found.asset_id)) continue;

    let role: RefRole = "continuity_anchor";
    if (seed.kind === "character_face") role = "character_face";
    else if (seed.kind === "character_outfit") role = "character_outfit";
    else if (seed.kind === "character_back") role = "character_back";
    else if (seed.kind === "location_layout") role = "location";
    else if (seed.kind === "prop") role = "prop";

    refs.push({
      asset_id: found.asset_id,
      path: found.path,
      weight: W(1.0),
      role,
      target_entity_id: seed.target_id,
      source: "continuity_forced",
      rationale: `RULE 8: continuity_group_id ${groupId} (kind=${seed.kind}) forced`,
    });
  }

  // RULE 4 / 6: wide / establishing は location 中心
  const isWide = panel.shot_type === "wide" || panel.shot_type === "establishing";
  const isCloseUp = panel.shot_type === "close_up";
  const isMedium = panel.shot_type === "medium";
  const isOverShoulder = panel.camera === "over_shoulder";
  const numCharacters = panel.entities.characters.length;

  // RULE 4 / 6 location 補強 (continuity 注入で出ていなければ)
  // RULE 11 で skip 指示が出ている場合 (tone_back/solid_*/floating_ui) は location ref を attach しない
  if (!skipLocation && !refs.some((r) => r.role === "location")) {
    let locVariants: string[] = ["interior_eye_level"];
    if (isWide && panel.bleed) locVariants = ["wide_establishing", "exterior_night"];
    else if (isWide) locVariants = ["wide_establishing", "interior_eye_level"];
    else if (panel.camera === "high_angle") locVariants = ["interior_high_angle", "interior_eye_level"];
    const loc = findVariantPrefer(lookup, panel.entities.location_id, locVariants);
    if (loc) {
      const isAtmosphericFade = backgroundTreatment === "atmospheric_fade";
      refs.push({
        asset_id: loc.asset_id,
        path: loc.path,
        // atmospheric_fade では location ref を弱め (背景はフェード/部分描画なので参考程度)
        weight: W(isAtmosphericFade ? 0.5 : 0.8),
        role: "location",
        target_entity_id: panel.entities.location_id,
        source: "deterministic",
        rationale: isAtmosphericFade
          ? `RULE 4/6+11: shot_type=${panel.shot_type} → location ${loc.variant} (atmospheric_fade なので weight 抑制)`
          : `RULE 4/6: shot_type=${panel.shot_type} → location ${loc.variant}`,
      });
    } else {
      unresolved.push(panel.entities.location_id);
    }
  }

  // RULE 9: multi-character handling (voice_off キャラは数えない)
  // RULE 11 で character ref も skip (floating_ui) の場合は character 全体をバイパス
  const visibleChars = panel.entities.characters.filter((c) => c.on_screen_via !== "voice_off");
  if (skipCharacter) {
    // skip — UI/HUD が panel そのもの。キャラを抽出しても意味がない
  } else if (visibleChars.length >= 3) {
    const focus = panel.entities.focus_entity_id;
    // focus キャラのみ強い ref
    const focusChar = visibleChars.find((c) => c.character_id === focus);
    if (focusChar) {
      const hasFocusExpression = !!focusChar.expression && focusChar.expression !== "";
      const variants = isCloseUp
        ? hasFocusExpression
          ? [`expr_${focusChar.expression}`, "face_front", "face_diagonal"]
          : ["face_front", "face_diagonal"]
        : isMedium
        ? hasFocusExpression
          ? ["full_front", `expr_${focusChar.expression}`, "face_front"]
          : ["full_front", "face_front"]
        : ["full_front"];
      const f = findVariantPrefer(lookup, focusChar.character_id, variants);
      if (f && !refs.some((r) => r.asset_id === f.asset_id)) {
        refs.push({
          asset_id: f.asset_id,
          path: f.path,
          weight: W(1.0),
          role: isCloseUp ? "character_face" : "character_full",
          target_entity_id: focusChar.character_id,
          source: "deterministic",
          rationale: hasFocusExpression
            ? `RULE 9+expr: multi-char (n=${numCharacters}) focus=${focus} (expression=${focusChar.expression})`
            : `RULE 9: multi-char (n=${numCharacters}) focus=${focus}`,
        });
      }
    }
    // 他キャラは outfit のみ (silhouette/distant 化)
    for (const ch of visibleChars) {
      if (ch.character_id === focus) continue;
      const f = findVariantPrefer(lookup, ch.character_id, ["full_front", "face_front"]);
      if (f && !refs.some((r) => r.asset_id === f.asset_id)) {
        refs.push({
          asset_id: f.asset_id,
          path: f.path,
          weight: W(0.4),
          role: "character_outfit",
          target_entity_id: ch.character_id,
          source: "deterministic",
          rationale: `RULE 9: multi-char (n=${numCharacters}) supporting`,
        });
      }
    }
  } else if (visibleChars.length >= 1) {
    // RULE 2/3/5/7: 単独 or 2人キャラ
    for (const ch of panel.entities.characters) {
      // voice_off (画面に映らない声のみ) は ref 不要
      if (ch.on_screen_via === "voice_off") continue;
      // tv 越し
      if (ch.on_screen_via === "tv") {
        const tv = findVariantPrefer(lookup, ch.character_id, ["tv_screen", "face_front", "face_diagonal"]);
        if (tv && !refs.some((r) => r.asset_id === tv.asset_id)) {
          refs.push({
            asset_id: tv.asset_id,
            path: tv.path,
            weight: W(1.0),
            role: "character_face",
            target_entity_id: ch.character_id,
            source: "deterministic",
            rationale: `RULE 7: tv variant for ${ch.character_id}`,
          });
        }
        continue;
      }
      // close_up
      if (isCloseUp) {
        // 2026-05-07 追加: expression が指定されていれば expr_{expression}.png を最優先
        const exprVariants: string[] = ch.expression && ch.expression !== ""
          ? [`expr_${ch.expression}`, "face_front", "face_diagonal"]
          : ["face_front", "face_diagonal"];
        const f = findVariantPrefer(lookup, ch.character_id, exprVariants);
        if (f && !refs.some((r) => r.asset_id === f.asset_id)) {
          refs.push({
            asset_id: f.asset_id, path: f.path, weight: W(1.0),
            role: "character_face", target_entity_id: ch.character_id,
            source: "deterministic",
            rationale: ch.expression && ch.expression !== ""
              ? `RULE 2+expr: close_up face (expression=${ch.expression})`
              : "RULE 2: close_up face",
          });
        }
        // diagonal を 0.5 で補強
        const d = findVariantPrefer(lookup, ch.character_id, ["face_diagonal", "face_side"]);
        if (d && d.asset_id !== f?.asset_id && !refs.some((r) => r.asset_id === d.asset_id)) {
          refs.push({
            asset_id: d.asset_id, path: d.path, weight: W(0.5),
            role: "character_3view", target_entity_id: ch.character_id,
            source: "deterministic", rationale: "RULE 2: close_up diagonal",
          });
        }
      } else if (isMedium) {
        const full = findVariantPrefer(lookup, ch.character_id, ["full_front"]);
        if (full && !refs.some((r) => r.asset_id === full.asset_id)) {
          refs.push({
            asset_id: full.asset_id, path: full.path, weight: W(1.0),
            role: "character_full", target_entity_id: ch.character_id,
            source: "deterministic", rationale: "RULE 3: medium full",
          });
        }
        // face supplement (expression-aware)
        const exprVariants: string[] = ch.expression && ch.expression !== ""
          ? [`expr_${ch.expression}`, "face_front"]
          : ["face_front"];
        const face = findVariantPrefer(lookup, ch.character_id, exprVariants);
        if (face && !refs.some((r) => r.asset_id === face.asset_id)) {
          refs.push({
            asset_id: face.asset_id, path: face.path, weight: W(0.5),
            role: "character_face", target_entity_id: ch.character_id,
            source: "deterministic",
            rationale: ch.expression && ch.expression !== ""
              ? `RULE 3+expr: medium face (expression=${ch.expression})`
              : "RULE 3: medium face supplement",
          });
        }
      } else if (isOverShoulder) {
        // 2026-05-07 追加: 表情指定がある肩越しカットでは表情 ref を優先
        const exprVariants: string[] = ch.expression && ch.expression !== ""
          ? [`expr_${ch.expression}`, "full_back", "full_front"]
          : ["full_back", "full_front"];
        const back = findVariantPrefer(lookup, ch.character_id, exprVariants);
        if (back && !refs.some((r) => r.asset_id === back.asset_id)) {
          const isExpressionRef = back.variant.startsWith("expr_");
          refs.push({
            asset_id: back.asset_id, path: back.path, weight: W(0.5),
            role: isExpressionRef ? "character_face" : "character_back",
            target_entity_id: ch.character_id,
            source: "deterministic",
            rationale: isExpressionRef
              ? `RULE 5+expr: over_shoulder face (expression=${ch.expression})`
              : "RULE 5: over_shoulder",
          });
        }
      } else if (isWide) {
        // wide ではキャラ ref 不要 (顔崩壊リスク)
        // skip
      }
    }
  }

  // RULE 10: budget 超過時の切り捨て
  const budgetMax = capability.reference_image_max;
  const budgetOptimal = capability.reference_image_optimal;
  let truncated = false;

  // 優先度: style > continuity_forced > focus_entity > その他キャラ > location > その他
  const prioritized = [...refs].sort((a, b) => {
    const score = (r: ResolvedRef): number => {
      if (r.role === "style") return 100;
      if (r.source === "continuity_forced") return 90;
      if (r.target_entity_id === panel.entities.focus_entity_id) return 80;
      if (
        r.role === "character_face" ||
        r.role === "character_full" ||
        r.role === "character_back" ||
        r.role === "character_outfit"
      ) return 60;
      if (r.role === "location") return 40;
      return 20;
    };
    return score(b) - score(a);
  });

  let kept: ResolvedRef[] = prioritized.slice(0, budgetOptimal);
  if (refs.length > budgetOptimal) {
    truncated = true;
    warnings.push(`budget truncated: ${refs.length} → ${kept.length}`);
  }
  if (kept.length > budgetMax) {
    kept = kept.slice(0, budgetMax);
    truncated = true;
  }

  return {
    scope,
    refs: kept,
    budget: { max: budgetMax, optimal: budgetOptimal, used: kept.length },
    truncated,
    unresolved_entities: [...new Set(unresolved)],
    warnings,
  };
}

export async function resolveRefsForEpisode(args: {
  pagePlan: PagePlanV2;
  storyboard: EpisodeStoryboardV2;
  bible: BibleSnapshotV2;
  refsDir: string;
  capability: CapabilityProfile;
  stylePlatePath: string | null;
}): Promise<ResolvedRefs> {
  const lookup = await buildLookup(args.refsDir);

  const storyboardPanelById = new Map<string, PanelV2>();
  for (const page of args.storyboard.pages) {
    for (const p of page.panels) storyboardPanelById.set(p.panel_id, p);
  }

  const packets: Record<string, ResolvedRefPacket> = {};

  for (const page of args.pagePlan.pages) {
    if (page.render_strategy === "page_one_shot") {
      // page スコープ: 全 panel の refs を集約
      const aggregated: ResolvedRef[] = [];
      const allWarnings: string[] = [];
      const allUnresolved = new Set<string>();
      for (const pp of page.panels) {
        const sb = storyboardPanelById.get(pp.panel_id);
        if (!sb) continue;
        // continuity_group_ids は L6 が page-plan の panel に注入済みなので panel に詰める
        const sbWithGroups: PanelV2 = { ...sb, continuity_group_ids: pp.continuity_group_ids };
        const packet = buildPanelPacket({
          panel: sbWithGroups,
          bible: args.bible,
          lookup,
          capability: args.capability,
          stylePlatePath: args.stylePlatePath,
          scope: "panel",
          backgroundTreatment: pp.background_treatment,
        });
        for (const r of packet.refs) {
          if (!aggregated.some((a) => a.asset_id === r.asset_id)) aggregated.push(r);
        }
        allWarnings.push(...packet.warnings);
        for (const u of packet.unresolved_entities) allUnresolved.add(u);
      }
      // budget cap
      const sortedAgg = [...aggregated].sort((a, b) => {
        if (a.role === "style") return -1;
        if (b.role === "style") return 1;
        if (a.source === "continuity_forced" && b.source !== "continuity_forced") return -1;
        if (b.source === "continuity_forced" && a.source !== "continuity_forced") return 1;
        return 0;
      });
      const kept = sortedAgg.slice(0, args.capability.reference_image_optimal);
      packets[`page_${page.page_no}`] = {
        scope: "page",
        refs: kept,
        budget: {
          max: args.capability.reference_image_max,
          optimal: args.capability.reference_image_optimal,
          used: kept.length,
        },
        truncated: aggregated.length > kept.length,
        unresolved_entities: [...allUnresolved],
        warnings: allWarnings,
      };
    } else {
      // panel scope
      for (const pp of page.panels) {
        const sb = storyboardPanelById.get(pp.panel_id);
        if (!sb) continue;
        const sbWithGroups: PanelV2 = { ...sb, continuity_group_ids: pp.continuity_group_ids };
        packets[pp.panel_id] = buildPanelPacket({
          panel: sbWithGroups,
          bible: args.bible,
          lookup,
          capability: args.capability,
          stylePlatePath: args.stylePlatePath,
          scope: "panel",
          backgroundTreatment: pp.background_treatment,
        });
      }
    }
  }

  // render_strategy: page でも panel でも episode 全体としては単一が現状
  const strategies = new Set(args.pagePlan.pages.map((p) => p.render_strategy));
  const epStrategy: RenderStrategy =
    strategies.size === 1 ? args.pagePlan.pages[0].render_strategy : "hybrid";

  return {
    schema_version: 1,
    episode_id: args.pagePlan.episode_id,
    capability_profile_id: args.capability.profile_id,
    render_strategy: epStrategy,
    packets,
  };
}
