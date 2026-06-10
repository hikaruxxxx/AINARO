/**
 * L3 Shotlist v2 — bible + episode brief → shotlist.json
 *
 * Codex CLI 経由で extractStructuredJson を呼び、ep1 の scene + panel skeleton を生成。
 * 各 panel は character_id / location_id を必ず bible.id から選ぶ (free string 不可)。
 */
import type { BibleSnapshotV2 } from "../schemas-v2";
import { extractStructuredJson } from "../llm/codex-text";
import { buildPanelCountHintTable } from "../page-director-v2/panel-count-hint";

export type ShotlistScene = {
  scene_id: string;
  scene_no: number;
  beat: "hook" | "buildup" | "turn" | "climax" | "resolution" | "cliffhanger";
  summary: string;
  /** scene 内 panel idx 範囲 */
  panel_idx_range: [number, number];
  involved_character_ids: string[];
  primary_location_id: string;
};

export type ShotlistPanelSkeleton = {
  panel_id: string;
  panel_no: number;
  scene_id: string;
  shot_type: "close_up" | "medium" | "wide" | "establishing";
  camera: "eye_level" | "low_angle" | "high_angle" | "over_shoulder" | "birds_eye";
  bleed: boolean;
  silence: boolean;
  importance: 1 | 2 | 3 | 4 | 5;
  involved_character_ids: string[];
  location_id: string;
  prop_ids: string[];
  focus_entity_id: string;
  action_brief: string;
  key_visual: string;
};

export type ShotlistV2 = {
  schema_version: 2;
  episode_id: string;
  episode_no: number;
  total_panels: number;
  total_pages_target: number;
  scenes: ShotlistScene[];
  panels: ShotlistPanelSkeleton[];
};

const SHOTLIST_SCHEMA = `
type ShotlistOutput = {
  total_panels: number;
  scenes: Array<{
    scene_id: string;          // "s01", "s02"...
    scene_no: number;
    beat: "hook" | "buildup" | "turn" | "climax" | "resolution" | "cliffhanger";
    summary: string;           // シーンを 1 文で
    panel_idx_range: [number, number];   // 1-indexed inclusive
    involved_character_ids: string[];    // bible.characters[].id 必須
    primary_location_id: string;         // bible.locations[].id 必須
  }>;
  panels: Array<{
    panel_id: string;          // "p01", "p02"...
    panel_no: number;
    scene_id: string;
    shot_type: "close_up" | "medium" | "wide" | "establishing";
    camera: "eye_level" | "low_angle" | "high_angle" | "over_shoulder" | "birds_eye";
    bleed: boolean;
    silence: boolean;
    importance: 1 | 2 | 3 | 4 | 5;
    involved_character_ids: string[];   // bible.characters[].id 必須
    location_id: string;                // bible.locations[].id 必須
    prop_ids: string[];                 // bible.props[].id (なければ空配列)
    focus_entity_id: string;            // 主役 (キャラ.id / ロケ.id / プロップ.id)
    action_brief: string;
    key_visual: string;
  }>;
};
`;

export async function extractShotlistFromBible(args: {
  bible: BibleSnapshotV2;
  episodeNo: number;
  episodeBrief: string;
  targetPages: number;
  /** 1ページあたりの平均パネル数。default 5 (商業漫画的には 5-6 が中央値) */
  targetPanelsPerPage?: number;
  /** 1ページあたりのパネル数許容レンジ。default {min:4,max:7}。
   *  prompt で variation を促し、固定 N の monotonous な出力を避ける目的 */
  panelsPerPageRange?: { min: number; max: number };
  cwd?: string;
  timeoutMs?: number;
}): Promise<ShotlistV2> {
  const { bible, episodeNo, episodeBrief, targetPages } = args;
  const avgPanelsPerPage = args.targetPanelsPerPage ?? 5;
  const targetPanels = Math.round(targetPages * avgPanelsPerPage);

  const charsBlock = bible.characters
    .map(
      (c) => `- ${c.id} :: ${c.name} (${c.role})  // ${c.appearance_notes ?? ""}`
    )
    .join("\n");
  const locsBlock = bible.locations
    .map((l) => `- ${l.id} :: ${l.name}  // ${l.spec.atmosphere ?? ""}`)
    .join("\n");
  const propsBlock = bible.props
    .map((p) => `- ${p.id} :: ${p.name}  // owner=${p.owner_character_id ?? "none"}`)
    .join("\n");

  const result = await extractStructuredJson<{
    total_panels: number;
    scenes: ShotlistScene[];
    panels: ShotlistPanelSkeleton[];
  }>({
    systemContext: [
      "あなたはB6判 KDP 横読み白黒漫画のショット計画 (shotlist) エージェントです。",
      "1話あたり目標ページ数を守り、scene 単位 + panel 単位で構造化します。",
      "重要ルール:",
      "- character_id / location_id / prop_id は必ず下記 bible リストから選ぶこと。free 文字列禁止。",
      "- shot_type/camera/importance を物語のリズム (hook→buildup→turn→climax→resolution→cliffhanger) で配分",
      "- bleed=true は establishing/cliffhanger の見せゴマのみ。1ページに最大1コマ。",
      "- silence=true は感情ショット / 余韻のみ。連続2コマ禁止。",
    ].join("\n"),
    materials: {
      bible_meta: JSON.stringify(bible.meta, null, 2),
      world: JSON.stringify(bible.world, null, 2),
      characters: charsBlock,
      locations: locsBlock,
      props: propsBlock,
      style_directives: JSON.stringify(bible.style_directives, null, 2),
      visual_motifs: JSON.stringify(bible.visual_motifs, null, 2),
      volume_synopsis: JSON.stringify(bible.volume_synopsis, null, 2),
      episode_no: String(episodeNo),
      episode_brief: episodeBrief,
      target_pages: String(targetPages),
      target_panels_total: String(targetPanels),
    },
    instruction: [
      `第${episodeNo}話の shotlist を構築してください。`,
      `総ページ数 ${targetPages}、総コマ数 ${targetPanels} 前後。`,
      "各ページの panel_count は page_role 別 hint を主指針にし、固定 N の monotonous な配分は商業漫画的に NG。",
      buildPanelCountHintTable("balanced"),
      "scenes は 4-7 個、各 scene の panel_idx_range が連続していて重複なく全 panel を覆うこと。",
      "panels は 1-indexed の panel_no で連続採番。最終 panel が cliffhanger に対応する。",
    ].join("\n"),
    outputSchema: SHOTLIST_SCHEMA,
    cwd: args.cwd,
    timeoutMs: args.timeoutMs ?? 8 * 60 * 1000,
    maxRetries: 2,
  });

  return {
    schema_version: 2,
    episode_id: `${bible.meta.slug}-ep${String(episodeNo).padStart(2, "0")}`,
    episode_no: episodeNo,
    total_panels: result.total_panels,
    total_pages_target: targetPages,
    scenes: result.scenes,
    panels: result.panels,
  };
}

// ============================================================
// Validation (entity_id が bible に存在するか)
// ============================================================

export function validateShotlistAgainstBible(
  shotlist: ShotlistV2,
  bible: BibleSnapshotV2
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const charSet = new Set(bible.characters.map((c) => c.id));
  const locSet = new Set(bible.locations.map((l) => l.id));
  const propSet = new Set(bible.props.map((p) => p.id));

  for (const s of shotlist.scenes) {
    for (const cid of s.involved_character_ids) {
      if (!charSet.has(cid)) errors.push(`scene ${s.scene_id}: unknown character_id "${cid}"`);
    }
    if (!locSet.has(s.primary_location_id)) {
      errors.push(`scene ${s.scene_id}: unknown location_id "${s.primary_location_id}"`);
    }
  }
  for (const p of shotlist.panels) {
    for (const cid of p.involved_character_ids) {
      if (!charSet.has(cid)) errors.push(`panel ${p.panel_id}: unknown character_id "${cid}"`);
    }
    if (!locSet.has(p.location_id)) {
      errors.push(`panel ${p.panel_id}: unknown location_id "${p.location_id}"`);
    }
    for (const pid of p.prop_ids) {
      if (!propSet.has(pid)) errors.push(`panel ${p.panel_id}: unknown prop_id "${pid}"`);
    }
    const focusOk =
      charSet.has(p.focus_entity_id) || locSet.has(p.focus_entity_id) || propSet.has(p.focus_entity_id);
    if (!focusOk) errors.push(`panel ${p.panel_id}: unknown focus_entity_id "${p.focus_entity_id}"`);
  }
  return { ok: errors.length === 0, errors };
}
