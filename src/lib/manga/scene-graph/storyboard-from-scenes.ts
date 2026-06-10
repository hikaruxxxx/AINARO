/**
 * Scene-Graph → Storyboard 変換 (Phase β B5-5a)
 *
 * scene-graph (L3.5) を入力に、決定論的に storyboard skeleton (L4 出力相当) を生成する。
 *
 * scene → panel の継承ルール:
 *   - panel.entities.location_id ← scene.location_id (sub_locations 内なら個別 panel で上書き許可)
 *   - panel.entities.characters ← scene.cast (presence を CharacterPanelRole / OnScreenVia に変換)
 *   - panel.dialogue / monologue ← scene.dialogue_plan.key_lines を分配
 *   - panel_no ← scene.panel_range.start_panel_no から連番で採番 (決定論)
 *   - page_no ← scene.page_range の範囲内で均等割り
 *
 * panel の本文 (action / key_visual) は scene.key_visual_intent と panel index の組合せで
 * 暫定文を埋める。本格的な panel 詳細化は B5-5b の LLM pass で行う。
 *
 * 仕様: docs/plans/manga/scene-graph-l3-5.md "4. panel との関係 (L4 インターフェース契約)"
 */

import type {
  BibleSnapshotV2,
  EpisodeStoryboardV2,
  StoryboardPageV2,
  PanelV2,
  PanelEntities,
  ShotType,
  CameraType,
  PageRoleV2,
  CharacterPanelRole,
  OnScreenVia,
  CliffhangerPatternId,
  PullLink as PullLinkV2,
  FactNode,
} from "../schemas-v2";
import type { Scene, SceneGraphV1, CastEntry, KeyLine, SceneMode } from "./schema";
import { runCodexText } from "../llm/codex-text";
import { contextForSceneV2 } from "../bible/broker-v3";
import { buildDialogueDensityFloorDirective } from "../qa-v2/dialogue-density-floor";

// ============================================================================
// Top-level entry
// ============================================================================

export type BuildStoryboardOptions = {
  /** B5-5a 段階では panel.action と key_visual に scene 由来の placeholder を入れる */
  placeholderActions?: boolean;
  /** Phase 2 opt-in: beat_type に応じて scene.panel_range の page 配分を調整する */
  panelRangeProfile?: { byBeatType?: boolean };
};

/**
 * L2b VolumePlot.episodes[ep].scenes[].directing_intent を SceneGraphV1.scenes[].directing_intent に
 * 転記する。scene_no による位置マッチ (両者とも 1-based)。
 *
 * これにより L3.5 が L2b skeleton を継承していなくても L4 panel 詳細化プロンプトに
 * directing_intent を流し込める (上流リカバリ)。
 *
 * 戻り値: 新しい SceneGraphV1 (immutable update)。元のオブジェクトは変更しない。
 */
export function mergeDirectingIntentFromVolumePlot(
  sceneGraph: SceneGraphV1,
  volumeEpisode: { scenes?: Array<{ scene_no: number; directing_intent?: unknown }> } | undefined,
): SceneGraphV1 {
  if (!volumeEpisode?.scenes || volumeEpisode.scenes.length === 0) return sceneGraph;
  const intentByNo = new Map<number, unknown>();
  for (const s of volumeEpisode.scenes) {
    if (s.directing_intent) intentByNo.set(s.scene_no, s.directing_intent);
  }
  if (intentByNo.size === 0) return sceneGraph;
  return {
    ...sceneGraph,
    scenes: sceneGraph.scenes.map((sc) => {
      // 既に scene が directing_intent を持っている場合は L3.5 の判断を優先 (上書きしない)
      if (sc.directing_intent) return sc;
      const intent = intentByNo.get(sc.scene_no);
      if (!intent) return sc;
      return { ...sc, directing_intent: intent as Scene["directing_intent"] };
    }),
  };
}

export function buildStoryboardFromSceneGraph(
  sceneGraph: SceneGraphV1,
  bible: BibleSnapshotV2,
  options: BuildStoryboardOptions = {}
): EpisodeStoryboardV2 {
  const placeholderActions = options.placeholderActions ?? true;

  // page_no -> 集約された panel リストを作る
  const pageToPanels = new Map<number, PanelV2[]>();
  const pageToRole = new Map<number, PageRoleV2>();

  for (const scene of sceneGraph.scenes) {
    const panels = buildPanelsForScene(scene, bible, placeholderActions);
    for (const panel of panels) {
      const pageNo = pickPageForPanel(panel, scene, options.panelRangeProfile);
      const list = pageToPanels.get(pageNo) ?? [];
      list.push(panel);
      pageToPanels.set(pageNo, list);
      // page_role は最初に定義した scene の beat_type から決定的に決める。
      // 同 page に複数 scene が乗る場合は先勝ち (B5-5b で page_role の解決ルールを精緻化予定)
      if (!pageToRole.has(pageNo)) {
        pageToRole.set(pageNo, mapBeatTypeToPageRole(scene.beat_type));
      }
    }
  }

  // page を昇順に並べる
  const pages: StoryboardPageV2[] = [];
  const pageNos = Array.from(pageToPanels.keys()).sort((a, b) => a - b);
  for (const pageNo of pageNos) {
    const panels = (pageToPanels.get(pageNo) ?? []).sort((a, b) => a.panel_no - b.panel_no);
    // page 内の reading_order を再採番
    panels.forEach((p, idx) => {
      p.reading_order = idx + 1;
    });
    pages.push({
      page_no: pageNo,
      page_role: pageToRole.get(pageNo) ?? "buildup",
      panels,
    });
  }

  return {
    schema_version: 2,
    episode_id: sceneGraph.episode_id,
    total_pages: pages.length,
    pages,
    pull_link: convertPullLink(sceneGraph.pull_link),
  };
}

const KNOWN_CLIFF_PATTERN_IDS: CliffhangerPatternId[] = [
  "unknown_threat_silhouette",
  "protagonist_resolve_monologue",
  "daily_intrusion",
  "next_volume_foreshadow",
  "relationship_shift",
  "ability_or_identity_glimpse",
];

function convertPullLink(pl: SceneGraphV1["pull_link"]): PullLinkV2 | undefined {
  if (!pl) return undefined;
  // scene-graph schema の current_episode_cliff は string、schemas-v2 は CliffhangerPatternId union。
  // 既知の pattern 名の場合のみ変換、それ以外は ability_or_identity_glimpse にフォールバック (B5-5b で精緻化)
  const cliff = (KNOWN_CLIFF_PATTERN_IDS as string[]).includes(pl.current_episode_cliff)
    ? (pl.current_episode_cliff as CliffhangerPatternId)
    : ("ability_or_identity_glimpse" as CliffhangerPatternId);
  return {
    current_episode_cliff: cliff,
    next_opening_hook_hint: pl.next_opening_hook_hint,
    is_volume_end: pl.is_volume_end,
  };
}

// ============================================================================
// 1 scene → panel array
// ============================================================================

function buildPanelsForScene(
  scene: Scene,
  bible: BibleSnapshotV2,
  placeholderActions: boolean
): PanelV2[] {
  const startNo = scene.panel_range.start_panel_no;
  const endNo = scene.panel_range.end_panel_no;
  const count = endNo - startNo + 1;
  if (count <= 0) return [];

  const characters = scene.cast.map((c) => mapCastEntryToPanelChar(c));
  const focusEntityId =
    characters.find((c) => c.role === "speaker")?.character_id ??
    characters[0]?.character_id ??
    scene.location_id;

  // dialogue を panel に分配 (シンプルに均等分配、最初の panel から順に key_lines を入れる)
  const lineSlots: Array<{ dialogue: KeyLine[]; monologue: KeyLine[] }> = Array.from(
    { length: count },
    () => ({ dialogue: [], monologue: [] })
  );
  const distributableLines = scene.dialogue_plan.key_lines;
  const linesPerPanel = Math.max(1, Math.ceil(distributableLines.length / Math.max(1, count)));
  for (let i = 0; i < distributableLines.length; i++) {
    const slotIdx = Math.min(count - 1, Math.floor(i / linesPerPanel));
    const line = distributableLines[i];
    // モノローグかセリフかを intent から大まかに判定: callback / hook / cliff はセリフ寄り、establish はモノローグ寄り
    const isMono =
      line.intent === "establish" &&
      scene.cast.find((c) => c.character_id === line.speaker)?.presence === "in_person";
    if (isMono) {
      lineSlots[slotIdx].monologue.push(line);
    } else {
      lineSlots[slotIdx].dialogue.push(line);
    }
  }

  const panels: PanelV2[] = [];
  for (let i = 0; i < count; i++) {
    const panelNo = startNo + i;
    const importance = pickImportanceForPanel(i, count, scene.beat_type);
    const shot = pickShotForPanel(i, count, scene.mode);
    const camera = pickCameraForPanel(i, count, scene.mode);
    const bleed = i === 0 || i === count - 1; // scene 境界は誌面端見せの可能性が高い
    const silence = scene.mode === "silence" && lineSlots[i].dialogue.length === 0 && lineSlots[i].monologue.length === 0;

    // 2026-05-07 追加: panel-specific expression を埋める。
    // bible の expr_*.png variant (anger / default / focus / gentle / grin / laugh / relaxed / smile / surprise)
    // から scene.mode + panel index に応じて決定論的に選ぶ。
    const panelCharacters = characters.map((ch) => ({
      ...ch,
      expression: inferExpression(scene.mode, i, count, ch.role),
    }));

    const entities: PanelEntities = {
      characters: panelCharacters,
      location_id: scene.location_id,
      props: [],
      focus_entity_id: focusEntityId,
    };

    // dialogue / monologue を schema_v2 の形に変換
    const dialogue = lineSlots[i].dialogue.map((kl) => ({
      character_id: kl.speaker,
      text: kl.text,
    }));
    const monologue = lineSlots[i].monologue.map((kl) => ({
      character_id: kl.speaker,
      text: kl.text,
    }));

    const panel: PanelV2 = {
      panel_id: `p${String(panelNo).padStart(2, "0")}`,
      panel_no: panelNo,
      reading_order: i + 1, // page 単位で後で再採番される
      shot_type: shot,
      camera,
      bleed,
      silence,
      importance,
      entities,
      action: placeholderActions
        ? buildPlaceholderAction(scene, i, count)
        : "",
      key_visual: placeholderActions ? scene.key_visual_intent : "",
      dialogue,
      monologue,
      narration: [],
      sfx: [],
    };
    panels.push(panel);
  }

  return panels;
}

// ============================================================================
// page_no resolution
// ============================================================================

/**
 * panel が属する page_no を scene の page_range から決定する。
 * scene の panel_range と page_range は呼び出し元が整合するように与える前提。
 * 同 scene 内の panel を page_range に均等割り。
 */
function pickPageForPanel(
  panel: PanelV2,
  scene: Scene,
  panelRangeProfile?: BuildStoryboardOptions["panelRangeProfile"]
): number {
  const pageStart = scene.page_range.start;
  const pageEnd = scene.page_range.end;
  const pageCount = pageEnd - pageStart + 1;
  if (pageCount <= 1) return pageStart;
  const panelStart = scene.panel_range.start_panel_no;
  const panelEnd = scene.panel_range.end_panel_no;
  const panelTotal = panelEnd - panelStart + 1;
  const panelOffset = panel.panel_no - panelStart;
  if (panelRangeProfile?.byBeatType && isSparseBeatType(scene.beat_type)) {
    const pageIdx = Math.min(pageCount - 1, Math.floor(panelOffset / 3));
    return pageStart + pageIdx;
  }
  const pageIdx = Math.min(
    pageCount - 1,
    Math.floor((panelOffset / Math.max(1, panelTotal)) * pageCount)
  );
  return pageStart + pageIdx;
}

// ============================================================================
// helpers
// ============================================================================

function mapCastEntryToPanelChar(cast: CastEntry): PanelEntities["characters"][number] {
  // CastEntry.presence -> OnScreenVia / CharacterPanelRole の決定的マッピング
  const presence = cast.presence;
  let onScreenVia: OnScreenVia;
  let role: CharacterPanelRole;
  switch (presence) {
    case "in_person":
      onScreenVia = "in_person";
      role = "speaker";
      break;
    case "voice_off":
      onScreenVia = "voice_off";
      role = "speaker";
      break;
    case "tv":
      onScreenVia = "tv";
      role = "background";
      break;
    case "phone_screen":
      onScreenVia = "phone";
      role = "background";
      break;
    case "memory":
      onScreenVia = "in_person";
      role = "background";
      break;
    case "log_visual":
      // PanelEntities.OnScreenVia には log_visual がない (schemas-v2 側) ので photo で代替
      onScreenVia = "photo";
      role = "background";
      break;
    default:
      onScreenVia = "in_person";
      role = "background";
  }
  return {
    character_id: cast.character_id,
    role,
    on_screen_via: onScreenVia,
    expression: "",
  };
}

/**
 * 2026-05-07 追加: scene.mode + panel position から expression を決定論的に選ぶ。
 * bible の expr_*.png variant 9 種を返す:
 *   anger / default / focus / gentle / grin / laugh / relaxed / smile / surprise
 *
 * background ロール (画面後方の脇役) は default 固定。speaker は scene.mode で振り分け。
 */
function inferExpression(
  mode: SceneMode,
  idx: number,
  total: number,
  role: CharacterPanelRole
): string {
  // background キャラは表情強調しない (脇役として default)
  if (role === "background") return "default";

  const isLast = idx === total - 1;
  const isFirst = idx === 0;

  switch (mode) {
    case "action":
      // 戦闘・追跡: 後半ほど鋭く
      return isLast ? "anger" : "focus";
    case "silence":
      // 沈黙シーン: 集中 (silent close-up は感情の溜め)
      return isLast ? "focus" : "default";
    case "introspection":
      // 内省: 集中 or デフォルト
      return idx % 2 === 0 ? "focus" : "default";
    case "establishing":
      // 場所紹介: 主人公はまだ無感情
      return "default";
    case "dialogue":
      // 対話: 落ち着き → やや表情豊か
      return isFirst ? "default" : "gentle";
    case "external_social":
      // 群衆・SNS: 周囲のリアクションが入る、主人公は集中 or default
      return isLast ? "focus" : "default";
    case "transition_montage":
      // モンタージュ: 中性的
      return "default";
    default:
      return "default";
  }
}

function pickShotForPanel(idx: number, total: number, mode: SceneMode): ShotType {
  // 大まかなルール: scene の最初は establishing / wide、中盤は medium、ピークは close_up
  if (idx === 0) {
    if (mode === "establishing") return "establishing";
    return "wide";
  }
  if (idx === total - 1) return "close_up";
  if (mode === "action") return idx % 2 === 0 ? "medium" : "wide";
  if (mode === "silence" || mode === "introspection") return "close_up";
  return "medium";
}

function pickCameraForPanel(idx: number, total: number, mode: SceneMode): CameraType {
  if (idx === 0 && mode === "establishing") return "high_angle";
  if (mode === "action") return idx % 2 === 0 ? "low_angle" : "eye_level";
  if (mode === "introspection" || mode === "silence") return "eye_level";
  return "eye_level";
}

function pickImportanceForPanel(idx: number, total: number, beat: Scene["beat_type"]): 1 | 2 | 3 | 4 | 5 {
  // beat_type の盛り上がり位置で importance を盛る
  const isPeak = beat === "payoff" || beat === "cliff" || beat === "reveal";
  if (idx === total - 1 && isPeak) return 5;
  if (idx === 0) return 4;
  if (idx === total - 1) return 4;
  return 3;
}

function mapBeatTypeToPageRole(beat: Scene["beat_type"]): PageRoleV2 {
  switch (beat) {
    case "introduce":
      return "buildup";
    case "setup":
      return "buildup";
    case "reveal":
      return "reveal";
    case "turn":
      return "buildup";
    case "payoff":
      return "action";
    case "cliff":
      return "cliffhanger";
    case "aftermath":
      return "aftermath";
    case "transition":
      return "establishing";
    default:
      return "buildup";
  }
}

function isSparseBeatType(beat: Scene["beat_type"]): boolean {
  return beat === "cliff" || (beat as string) === "hook";
}

function buildPlaceholderAction(scene: Scene, idx: number, total: number): string {
  // B5-5a placeholder。B5-5b の LLM pass で書き換え予定。
  const head = `${scene.scene_id} (${scene.beat_type}/${scene.mode}) panel ${idx + 1}/${total}: ${scene.key_visual_intent}`;
  return head;
}

// ============================================================================
// B5-5b: panel 詳細化 LLM pass
// ============================================================================

export type EnrichedPanelDetail = {
  panel_no: number;
  action?: string;
  key_visual?: string;
  shot_type?: ShotType;
  camera?: CameraType;
  dialogue?: unknown;
  monologue?: unknown;
  narration?: unknown;
  sfx?: unknown;
};

export type PanelLintFeedback = {
  panel_no: number;
  findings: Array<{
    rule: string;
    severity: "warn" | "fatal";
    message: string;
    hint?: string;
  }>;
};

export type PromptBibleContext = {
  characters: FactNode[];
  location: FactNode[];
  world_rules: FactNode[];
  motifs: FactNode[];
};

type DialogueLikeLine = { character_id: string; text: string };

function normalizeStringArray(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  const out: string[] = [];
  for (const item of items) {
    if (typeof item === "string" && item.trim().length > 0) {
      out.push(item.trim());
    } else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      if (typeof o.text === "string" && o.text.trim().length > 0) {
        out.push(o.text.trim());
      }
    }
  }
  return out;
}

function normalizeDialogueLike(items: unknown): DialogueLikeLine[] {
  if (!Array.isArray(items)) return [];
  const out: DialogueLikeLine[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const characterId = typeof o.character_id === "string" ? o.character_id : null;
    if (!characterId) continue;

    if (typeof o.text === "string") {
      out.push({ character_id: characterId, text: o.text });
      continue;
    }

    for (const key of ["key_lines", "lines", "dialogue", "monologue"]) {
      const values = o[key];
      if (!Array.isArray(values)) continue;
      for (const value of values) {
        if (typeof value === "string") {
          out.push({ character_id: characterId, text: value });
        } else if (value && typeof value === "object") {
          const nested = value as Record<string, unknown>;
          if (typeof nested.text === "string") out.push({ character_id: characterId, text: nested.text });
        }
      }
    }
  }
  return out;
}

function buildPromptBibleContext(bible: BibleSnapshotV2, scene: Scene): PromptBibleContext {
  const context = contextForSceneV2(bible, scene, "in_world_only", { char: { min: 400, max: 1800 } });
  return {
    characters: context.characters,
    location: context.location,
    world_rules: context.world_rules,
    motifs: context.motifs,
  };
}

function appendVisibilitySections(
  lines: string[],
  bibleContext: PromptBibleContext,
  atVolume: number
): void {
  lines.push(`## visibility 制約 (重要・最優先)`);
  lines.push(`この panel で書ける text 種別ごとに、参照していい知識層が違います。`);
  lines.push("");
  lines.push(`- **cast の monologue** (登場キャラの内面独白): cast が「自分視点で実感している」感情・観察に限定。in_world_belief 層 (キャラ本人や周囲が世界の中で信じている事実) のみ言及可。`);
  lines.push(`- **cast の dialogue** (登場キャラの台詞): 同じく in_world_belief 層のみ。`);
  lines.push(`- **narration** (作者地の文): 第 ${atVolume} 巻までに reveal された事実 (revealed_at_volume <= ${atVolume}) まで言及可。`);
  lines.push("");
  lines.push(`以下は dialogue / monologue / narration に**絶対に書かない**:`);
  lines.push(`- キャラの origin_wound_deep / psychology_deep / dark_mirror_to_protagonist のような meta_truth 層の語彙`);
  lines.push(`- 作者視点で初めて成立する逆説的・象徴的な内省 (例: 「自分が author の手駒である」「この世界はシステム仕様によって動いている」)`);
  lines.push(`- そのキャラがまだ知らない他者の秘密・本心 (revealed_at_volume が現巻より後の事実、または別キャラの meta_truth)`);
  lines.push(`- 後の巻で reveal される予定の固有名詞・概念`);
  lines.push("");
  lines.push(`逆に書いてよいもの:`);
  lines.push(`- bible context (下の節) に列挙された in_world_belief 層の事実`);
  lines.push(`- scene.protagonist_arc_state.belief / goal / emotion から自然に出る感情・判断`);
  lines.push(`- scene 内の key_lines で示された text`);
  lines.push("");
  lines.push(`## bible context (cast 視点で知りうる事実 — visibility=in_world_only)`);
  appendFactSection(lines, `### キャラクター (in_world_belief 層, cast のみ)`, bibleContext.characters);
  appendFactSection(lines, `### この場所`, bibleContext.location);
  appendFactSection(lines, `### 適用される世界ルール (in_world_belief / system_specification 層)`, bibleContext.world_rules);
  appendFactSection(lines, `### モチーフ (描き方指示)`, bibleContext.motifs);
  lines.push("");
}

function appendFactSection(lines: string[], heading: string, facts: FactNode[]): void {
  if (facts.length === 0) return;
  lines.push("");
  lines.push(heading);
  for (const fact of facts) {
    const prefix = fact.entity_id ? `${fact.entity_id}: ` : "";
    lines.push(`- ${prefix}${fact.body}`);
  }
}

/**
 * B5-5a で生成された storyboard の placeholder panel を Codex CLI 経由で本番文に書き換える。
 *
 * 処理単位は scene。1 scene = 1 Codex call (panel 数分の詳細を一度に返してもらう)。
 *
 * 入力 storyboard は buildStoryboardFromSceneGraph 出力を想定。panel.entities (location/cast/
 * focus_entity_id) と panel_no / panel_id / scene 由来構造は維持し、action / key_visual /
 * dialogue / monologue を Codex 出力で置換する。
 */
export async function enrichStoryboardWithLLM(
  storyboard: EpisodeStoryboardV2,
  sceneGraph: SceneGraphV1,
  options?: {
    timeoutMsPerScene?: number;
    cwd?: string;
    generationProfileDirective?: string;
    lintFeedback?: PanelLintFeedback[];
    targetSceneIds?: string[];
    bible?: BibleSnapshotV2;
    enforceVisibility?: boolean;
    atVolume?: number;
  }
): Promise<EpisodeStoryboardV2> {
  const cwd = options?.cwd ?? process.env.AINARO_REPO_ROOT ?? process.cwd();
  const timeoutMs = options?.timeoutMsPerScene ?? 5 * 60 * 1000;
  const targetSceneIds = options?.targetSceneIds ? new Set(options.targetSceneIds) : null;
  const enforceVisibility = options?.enforceVisibility ?? Boolean(options?.bible);

  // panel_no -> Scene の逆引き
  const panelToScene = new Map<number, Scene>();
  for (const scene of sceneGraph.scenes) {
    for (
      let p = scene.panel_range.start_panel_no;
      p <= scene.panel_range.end_panel_no;
      p++
    ) {
      panelToScene.set(p, scene);
    }
  }

  // 各 panel の詳細を集めるバケツ
  const enriched = new Map<number, EnrichedPanelDetail>();

  // scene ごとに Codex 呼び出し
  for (const scene of sceneGraph.scenes) {
    if (targetSceneIds && !targetSceneIds.has(scene.scene_id)) continue;
    const start = scene.panel_range.start_panel_no;
    const end = scene.panel_range.end_panel_no;
    const count = end - start + 1;
    if (count <= 0) continue;

    const sceneLintFeedback = (options?.lintFeedback ?? []).filter(
      (feedback) => feedback.panel_no >= start && feedback.panel_no <= end
    );
    const atVolume = scene.arc_position?.volume ?? options?.atVolume ?? 1;
    const bibleContext = options?.bible && enforceVisibility
      ? buildPromptBibleContext(options.bible, scene)
      : undefined;
    const task = buildPanelDetailPrompt(
      scene,
      count,
      options?.generationProfileDirective,
      sceneLintFeedback,
      bibleContext,
      bibleContext ? { atVolume } : undefined
    );
    const result = await runCodexText<{ panels: EnrichedPanelDetail[] }>({
      task,
      format: "json",
      cwd,
      timeoutMs,
      maxRetries: 1,
    });
    if (!result.parsed || !Array.isArray(result.parsed.panels)) {
      throw new Error(
        `[storyboard-from-scenes] enrichStoryboardWithLLM: Codex returned unparseable JSON for scene ${scene.scene_id}. stdout head: ${result.stdout.slice(0, 300)}`
      );
    }
    // panel_no を 0-indexed offset から実 panel_no に正規化
    for (let i = 0; i < result.parsed.panels.length; i++) {
      const detail = result.parsed.panels[i];
      // Codex が panel_no を相対値 (1..N) や絶対値で返すケース両対応:
      // 範囲内なら絶対値、それ以外なら start からのオフセットとみなす
      const panelNo =
        detail.panel_no >= start && detail.panel_no <= end
          ? detail.panel_no
          : start + i;
      enriched.set(panelNo, { ...detail, panel_no: panelNo });
    }
  }

  // storyboard を enriched で上書き (mutate せずに新しいオブジェクトを返す)
  return {
    ...storyboard,
    pages: storyboard.pages.map((page) => ({
      ...page,
      panels: page.panels.map((panel): PanelV2 => {
        const e = enriched.get(panel.panel_no);
        if (!e) return panel;
        return {
          ...panel,
          action: e.action ?? panel.action,
          key_visual: e.key_visual ?? panel.key_visual,
          shot_type: e.shot_type ?? panel.shot_type,
          camera: e.camera ?? panel.camera,
          dialogue: e.dialogue !== undefined ? normalizeDialogueLike(e.dialogue) : panel.dialogue,
          monologue: e.monologue !== undefined ? normalizeDialogueLike(e.monologue) : panel.monologue,
          narration: e.narration !== undefined ? normalizeStringArray(e.narration) : panel.narration,
          sfx: e.sfx !== undefined ? normalizeStringArray(e.sfx) : panel.sfx,
        };
      }),
    })),
  };
}

/**
 * 1 scene 分の panel 詳細を Codex に書かせるプロンプト。
 * scene の文脈 (key_visual_intent / beat / mode / dialogue_plan / protagonist_arc_state) を渡し、
 * 各 panel の action / key_visual / shot_type / camera / dialogue / monologue を返してもらう。
 */
export function buildPanelDetailPrompt(
  scene: Scene,
  panelCount: number,
  generationProfileDirective?: string,
  lintFeedback: PanelLintFeedback[] = [],
  bibleContext?: PromptBibleContext,
  visibilityPolicy?: { atVolume: number }
): string {
  const startNo = scene.panel_range.start_panel_no;
  const pageCount = Math.max(1, scene.page_range.end - scene.page_range.start + 1);
  const panelsPerPageHint = Math.max(1, Math.ceil(panelCount / pageCount));
  const lines: string[] = [];
  lines.push(`あなたは AINARO 漫画 v2 の panel 詳細化エージェントです。`);
  lines.push(
    `1 つの scene について ${panelCount} 個の panel を詳細化し、各 panel の action / key_visual / shot_type / camera / dialogue / monologue を JSON で返してください。`
  );
  lines.push("");
  lines.push(`## scene 文脈`);
  lines.push(`- scene_id: ${scene.scene_id}`);
  lines.push(`- beat: ${scene.beat_type}, mode: ${scene.mode}`);
  lines.push(`- location_id: ${scene.location_id}` + (scene.sub_locations ? `, sub: ${scene.sub_locations.join(", ")}` : ""));
  lines.push(`- key_visual_intent: ${scene.key_visual_intent}`);
  lines.push(
    `- protagonist: belief="${scene.protagonist_arc_state.belief}" / goal="${scene.protagonist_arc_state.goal}" / emotion=${scene.protagonist_arc_state.emotion}`
  );
  lines.push(`- panel_range: panel#${startNo}-${scene.panel_range.end_panel_no} (${panelCount} panels)`);
  lines.push(`- page_range: p${scene.page_range.start}-p${scene.page_range.end} (${pageCount} pages, 約 ${panelsPerPageHint} panels/page)`);
  lines.push(`- protagonist_delta_from_prev: ${scene.protagonist_arc_state.delta_from_prev}`);
  if (scene.turn_anchor.at_panel_no !== null) {
    lines.push(`- turn_anchor: panel#${scene.turn_anchor.at_panel_no} (${scene.turn_anchor.type})`);
  }
  // L2b directing_intent 注入 (最優先反映)
  if (scene.directing_intent && scene.directing_intent.kind !== "normal") {
    lines.push("");
    appendDirectingIntentSection(lines, scene, panelCount, startNo);
  }
  lines.push("");
  lines.push(`## cast (panel.entities.characters と一致)`);
  for (const c of scene.cast) {
    lines.push(`- ${c.character_id} (${c.presence})`);
  }
  lines.push("");
  if (scene.dialogue_plan.key_lines.length > 0) {
    lines.push(`## key_lines (これらを panel に分配)`);
    for (const kl of scene.dialogue_plan.key_lines) {
      lines.push(`- [${kl.speaker}] 「${kl.text}」 (${kl.intent}, ${kl.uniqueness})`);
    }
    lines.push("");
  }
  if (bibleContext) {
    appendVisibilitySections(lines, bibleContext, visibilityPolicy?.atVolume ?? scene.arc_position?.volume ?? 1);
  }
  lines.push(`## 制約`);
  lines.push(`1. panel_no は ${startNo} から ${scene.panel_range.end_panel_no} まで連番で必ず ${panelCount} 個。`);
  lines.push(`2. action は 1 文 (50 字程度) で具体的な動作・視点を記述。`);
  lines.push(`3. key_visual は 1 行で「読者が最も覚える絵」を伝える。`);
  lines.push(`4. shot_type は close_up / medium / wide / establishing から選択。`);
  lines.push(`5. camera は eye_level / low_angle / high_angle / over_shoulder / birds_eye から選択。`);
  lines.push(`6. dialogue / monologue の character_id は cast 内のもの限定。key_lines は確実に panel に分配する (どの panel に置くかは LLM 判断、ただし全 key_lines を必ず使う)。`);
  lines.push(`   key_lines に加えて、各 panel の状況に応じた短い反応セリフ・モノローグ・narration を追加してよい (visibility 制約は厳守)。新規追加分の長さガイド: dialogue は 8-30 字、monologue は 6-25 字、narration は 10-40 字。`);
  lines.push(`   dialogue / monologue の出力形式は必ず { "character_id": "...", "text": "..." }。text は単一 string、配列ではない。key_lines 配列を直接埋めるのは禁止。`);
  lines.push(`   複数台詞があれば配列の別要素に分ける: [{ "character_id": "X", "text": "..." }, { "character_id": "X", "text": "..." }]`);
  lines.push(`   NG: { "character_id": "X", "key_lines": ["..."] }`);
  lines.push(`   OK: { "character_id": "X", "text": "..." }`);
  lines.push(`6b. **台詞密度の目標 (商業 narou 系コミカライズ水準)**: この scene 全 ${panelCount} panel のうち、最低 ${Math.max(1, Math.ceil(panelCount * 0.6))} panel (60%) には何らかのテキスト (dialogue / monologue / narration のいずれか) を入れる。完全無音 page は禁止 (page をまたぐ scene の場合、自分の panel 範囲内では最低 1 panel には text を置く)。`);
  // 2026-05-18 Sprint 20 案1: page_role 別 dialogue/text 下限 directive を追加 (qa-v2 audit と同期)
  lines.push("");
  lines.push(buildDialogueDensityFloorDirective());
  lines.push("");
  lines.push(`   追加 text のパターン例:`);
  lines.push(`   - 反応モノローグ: 「……」「ふ」「やはり、か」「数字、合うのか」のような短い内心`);
  lines.push(`   - 状況説明 narration: 「午前六時十四分」「外気五度」「公社アプリ通知音」のような時刻・気温・音の地の文`);
  lines.push(`   - リアクション dialogue: 「……は？」「了解です」「待ってください」のような短い応答`);
  lines.push(`   silent panel として残してよいのは: emotion 余韻の 1 panel (importance>=4 直後)、scene 冒頭の establishing 1 panel、scene mode=silence の panel のみ。それ以外で text 0 は禁止。`);
  lines.push(`6c. **SFX (擬音) の使い分け**: 視覚的アクション (魔物撃破、ドア開閉、通知、走る) がある panel には sfx (擬音語) を 1-2 個入れる。例: 「ガコッ」「ザッ」「ピロン」。SFX は dialogue/monologue/narration とは別カウントで、追加することで panel の「漫画らしさ」が増す。`);
  lines.push(`7. scene_exclusive uniqueness の text は他 scene で使われていないため、この scene 内 panel でのみ書ける。`);
  lines.push(`8. importance / hero panel: 内部設計として panel ごとに importance 1-5 を割り振る。各 page 推定範囲ごとに最低 1 panel は importance >= 4 相当の hero panel にし、action/key_visual の密度と見せ場で明確に表現する。全部 3 のようなフラット配置は禁止。`);
  lines.push(`9. shot_type 多様性: 同 page 内で 2 種類以上の shot_type を使う。close_up / medium / wide / establishing を scene の意図に合わせて混ぜる。close_up 連続 3 panel 以上は禁止。`);
  lines.push(`10. key_visual の具体性: 「青白い光」「灰色の壁」「白いシーツ」のような定型的・抽象的な描写は禁止。この作品固有の小道具・状況・身分差・UI・傷や汚れを絡める。`);
  lines.push(`    NG: 「青白い看板光」「白いビニール袋」「夜のガラス」「灰色の背中」`);
  lines.push(`    OK: 「コンビニ廃棄弁当の半額シール」「ヒビ入りスマホの公社アプリ Fランク表示」「中古鉄パイプの錆」のように bible / brief / scene 由来の固有物を入れる。`);
  lines.push(`11. dialogue の自然さ: dialogue はキャラの実際の語彙で書く。比喩は本人が使う言葉として違和感ない範囲に留め、教科書的・作家的台詞を避ける。`);
  lines.push(`    NG: 「同じ教室にいたはずなのに、俺だけ改札の向こうに置いていかれた」`);
  lines.push(`    OK: 「俺もあの教室にいたんだけどな」または台詞にせず表情・手元・沈黙で出す。`);
  lines.push(`12. panel 間の論理連結: 各 panel は前 panel の何に反応し、何を受けて次へ進むかが分かるように書く。並列の情景羅列は禁止。`);
  lines.push(`    例: TV を見る → TV の光が顔に当たる → 目を閉じて情報を遮断する、のように因果でつなぐ。`);
  lines.push(`13. emotion arc: scene 内で主人公の emotion を最低 2 段変化させる。出発点は scene.protagonist_arc_state.emotion とし、終端では別の感情または感情の強度変化へ移行させる。`);
  lines.push(`14. cliffhanger / opening_hook: beat=cliff は最終 panel に次ページをめくらせる異変・通知・声・視線のシフトを必ず置く。beat=introduce/opening は最初 1-2 panel に読者を世界へ引き込む異質な絵・不穏な音・逆転の視点を置く。`);
  lines.push(`15. scene pacing: 重要 beat (turn / payoff / cliff) は最低 2 panel 使って情報過密を避ける。説明 panel 連続 3 個超は禁止。mode=action は page あたり 4-5 panel、mode=silence/dialogue は 3-4 panel を目安にリズムを作る。`);
  lines.push("");
  lines.push(`## beat_type 別の重点`);
  lines.push(beatSpecificPromptDirective(scene));
  if (lintFeedback.length > 0) {
    lines.push("");
    lines.push(`## 修正指示 (前回 lint で指摘された問題)`);
    lines.push(`以下の panel は前回 lint で fatal/warn 指摘があります。対象 panel の action / key_visual / shot_type / camera / dialogue / monologue を優先的に改善してください。`);
    for (const feedback of lintFeedback) {
      lines.push(`panel #${feedback.panel_no}:`);
      for (const finding of feedback.findings) {
        lines.push(`  - rule: ${finding.rule} (${finding.severity})`);
        lines.push(`    指摘: ${finding.message}`);
        if (finding.hint) lines.push(`    ヒント: ${finding.hint}`);
      }
    }
  }
  if (generationProfileDirective) {
    lines.push("");
    lines.push(`## generation profile`);
    lines.push(generationProfileDirective);
  }
  lines.push("");
  lines.push(`## 出力形式`);
  lines.push("```json");
  lines.push(`{ "panels": [`);
  lines.push(`  { "panel_no": ${startNo}, "action": "...", "key_visual": "...", "shot_type": "...", "camera": "...", "dialogue": [], "monologue": [], "narration": ["..."], "sfx": ["..."] }`);
  lines.push(`  // narration は string[] (例: ["午前六時十四分", "通り雨が止む"])。sfx も string[] (例: ["ガコッ", "ピロン"])。空配列なら省略可。`);
  lines.push(`  /* ${panelCount} 個 */`);
  lines.push(`]}`);
  lines.push("```");
  return lines.join("\n");
}

/**
 * L2b SceneSkeleton.directing_intent を panel 詳細化プロンプトに注入する。
 *
 * - opening_hook: 最初 1-2 panel に narration_lines を必ず配置、key_visual を panel.key_visual に反映
 * - world_anchor: いずれかの panel の narration として target_facts を必ず分配 (delivery に応じて手段選択)
 * - midpoint_turn: scene 終盤 panel で reveal を ナレ or 台詞 で明示
 * - cliffhanger_setup: scene 内で build_up を段階展開し、最終 panel に向けて緊張を上げる
 * - final_pull: 最終 panel に pull_visual + next_episode_hook を配置
 */
function appendDirectingIntentSection(
  lines: string[],
  scene: Scene,
  panelCount: number,
  startNo: number,
): void {
  const di = scene.directing_intent;
  if (!di || di.kind === "normal") return;
  const endNo = startNo + panelCount - 1;
  lines.push(`## ⚠️ L2b DIRECTING_INTENT (最優先反映、scene の演出指示)`);
  switch (di.kind) {
    case "opening_hook":
      lines.push(`- kind: **opening_hook** (hook_pattern=${di.hook_pattern})`);
      lines.push(`- key_visual: ${di.key_visual}`);
      lines.push(
        `- **配置ルール**: 最初の 1-2 panel (panel#${startNo}〜#${Math.min(startNo + 1, endNo)}) で必ず実現する。最初 panel の key_visual には上記 key_visual を反映し、強い引き絵にする。`,
      );
      if (di.narration_lines && di.narration_lines.length > 0) {
        lines.push(`- **narration_lines (必須配置)**:`);
        di.narration_lines.forEach((n, i) => {
          lines.push(`  ${i + 1}. 「${n}」`);
        });
        lines.push(
          `  → 上記 narration を最初 ${Math.min(di.narration_lines.length, 3)} panel の narration フィールドに必ず分配 (省略禁止、改変は意味を変えない範囲で軽微に)`,
        );
      }
      break;
    case "world_anchor":
      lines.push(`- kind: **world_anchor** (delivery=${di.delivery})`);
      lines.push(`- **target_facts (読者に伝える世界観事実、必須伝達)**:`);
      di.target_facts.forEach((f, i) => {
        lines.push(`  ${i + 1}. ${f}`);
      });
      switch (di.delivery) {
        case "narration":
          lines.push(
            `- **配置ルール**: 上記 facts を narration として scene 内 panel に分配。ナレ枠 (text フィールドの narration) で読者に直接伝える。`,
          );
          break;
        case "dialogue":
          lines.push(
            `- **配置ルール**: 上記 facts を登場人物の自然な台詞として scene 内に分配。説明セリフ感は避け、状況の中で必然性ある発話に変換する。`,
          );
          break;
        case "visual_repetition":
          lines.push(
            `- **配置ルール**: 上記 facts を視覚 (看板/掲示/モニター/小道具反復) で間接的に伝達。文字情報無しでも読者が世界観を体感できる構図にする。`,
          );
          break;
        case "system_text":
          lines.push(
            `- **配置ルール**: 上記 facts を UI/ステータス/通知/システム音声テキストの形で panel 上に描く。架空 UI のテロップとして提示。`,
          );
          break;
      }
      break;
    case "midpoint_turn":
      lines.push(`- kind: **midpoint_turn**`);
      lines.push(`- reveal: ${di.reveal}`);
      lines.push(`- emotional_shift: ${di.emotional_shift}`);
      lines.push(
        `- **配置ルール**: scene 中盤 panel (panel#${Math.floor(startNo + panelCount / 2)} 付近) で reveal を明示し、主人公の表情/視線/姿勢で emotional_shift を絵で表現する。`,
      );
      break;
    case "cliffhanger_setup":
      lines.push(`- kind: **cliffhanger_setup**`);
      lines.push(`- build_up: ${di.build_up}`);
      lines.push(
        `- **配置ルール**: scene 全 panel を通じて段階的に緊張を上げる。最初 panel は小さな違和感、中盤で確信、最終 panel で次 scene/episode の引きへ繋ぐ build_up を描く。`,
      );
      break;
    case "final_pull":
      lines.push(`- kind: **final_pull** (episode 最終 scene)`);
      lines.push(`- pull_visual: ${di.pull_visual}`);
      lines.push(`- next_episode_hook: ${di.next_episode_hook}`);
      lines.push(
        `- **配置ルール**: 最終 panel (panel#${endNo}) に pull_visual を必ず反映。次話の謎/予兆を 1 行ナレ or 視覚要素として埋め込み、読者が「次を読みたい」状態で page を閉じさせる。`,
      );
      break;
  }
  lines.push(
    `- 注意: 上記 directing_intent は L2b で物語設計上必須と判断された演出。panel 詳細化時に他の制約より優先して反映する。`,
  );
}

function beatSpecificPromptDirective(scene: Scene): string {
  switch (scene.beat_type) {
    case "cliff":
      return `- beat=cliff: 最終 panel の引きが弱いと scene 全体が崩壊します。単に立ち止まる・去るだけでなく、異変/通知/声/視線のズレなど次ページの疑問を作ってください。`;
    case "introduce":
      return `- beat=introduce: 最初 1-2 panel で opening_hook を作り、${scene.protagonist_arc_state.emotion} から始まる emotion arc の出発点を絵で見せてください。`;
    case "turn":
      return `- beat=turn: emotion 変化と因果連結が最優先です。直前 panel の情報を受けて、主人公の判断や視線が変わる瞬間を分解してください。`;
    case "payoff":
      return `- beat=payoff: hero panel が必須です。回収される情報と感情爆発を 1 panel に集約し、その前後に受け/余韻を置いてください。`;
    case "transition":
      return `- beat=transition: 前 scene と次 scene の連結を明確にし、pacing は短く保ってください。説明だけで 3 panel 以上続けないでください。`;
    default:
      return `- beat=${scene.beat_type}: scene の beat と mode に合わせ、key_visual の固有性、panel 間の因果、emotion arc、pacing を必ず両立してください。`;
  }
}
