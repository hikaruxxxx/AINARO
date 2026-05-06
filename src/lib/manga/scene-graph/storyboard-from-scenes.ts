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
} from "../schemas-v2";
import type { Scene, SceneGraphV1, CastEntry, KeyLine, SceneMode } from "./schema";

// ============================================================================
// Top-level entry
// ============================================================================

export type BuildStoryboardOptions = {
  /** B5-5a 段階では panel.action と key_visual に scene 由来の placeholder を入れる */
  placeholderActions?: boolean;
};

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
      const pageNo = pickPageForPanel(panel, scene);
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

    const entities: PanelEntities = {
      characters,
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
function pickPageForPanel(panel: PanelV2, scene: Scene): number {
  const pageStart = scene.page_range.start;
  const pageEnd = scene.page_range.end;
  const pageCount = pageEnd - pageStart + 1;
  if (pageCount <= 1) return pageStart;
  const panelStart = scene.panel_range.start_panel_no;
  const panelEnd = scene.panel_range.end_panel_no;
  const panelTotal = panelEnd - panelStart + 1;
  const panelOffset = panel.panel_no - panelStart;
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

function buildPlaceholderAction(scene: Scene, idx: number, total: number): string {
  // B5-5a placeholder。B5-5b の LLM pass で書き換え予定。
  const head = `${scene.scene_id} (${scene.beat_type}/${scene.mode}) panel ${idx + 1}/${total}: ${scene.key_visual_intent}`;
  return head;
}
