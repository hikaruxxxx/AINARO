/**
 * シーンスプリッター
 *
 * 1話分の本文を 3-8 シーンに分割し、各シーンのメタ情報を抽出する。
 * Codex CLI 経由（ANTHROPIC_API_KEY 課金前提にしない原則）。
 *
 * 出力はパネル設計（shot-planner）とリズム曲線（rhythm-curve）の入力になる。
 */

import { extractStructuredJson } from "../llm/codex-text";

export type DramaticIntent =
  | "introduction"
  | "rising"
  | "turn"
  | "climax"
  | "cliffhanger"
  | "cooldown";

export type SceneEntry = {
  /** 同一エピソード内でユニークな ID。'ep{N}-s{idx}' 形式 */
  scene_id: string;
  /** 1-indexed の通し番号 */
  scene_idx: number;
  /** 1-2 文要約 */
  summary: string;
  /** location_bibles.location_name と一致させる（曖昧なら null） */
  location_name: string | null;
  /** character_bibles.character_name の配列 */
  characters_present: string[];
  /** LLM が見立てた強度ヒント 0-1（リズム曲線の入力） */
  intensity_hint: number;
  /** ドラマ役割 */
  dramatic_intent: DramaticIntent;
  /** 本文中の対応箇所抜粋（最大 600 文字） */
  body_excerpt: string;
  /** このシーンに使うべきパネル数の目安（shot-planner が参照） */
  suggested_panel_count: number;
};

const SCHEMA = `
type SceneSplit = {
  scenes: Array<{
    summary: string;
    location_name: string | null;
    characters_present: string[];
    intensity_hint: number;     // 0-1
    dramatic_intent: 'introduction' | 'rising' | 'turn' | 'climax' | 'cliffhanger' | 'cooldown';
    body_excerpt: string;       // 本文からの抜粋（500文字以内）
    suggested_panel_count: number;  // 2-8
  }>;
};
`;

/**
 * 1話分の本文を構造化シーンへ分割する
 */
export async function splitScenes(args: {
  episodeNum: number;
  episodeBody: string;
  /** ヒント: 既知のキャラ名リスト（character_bibles から） */
  knownCharacterNames: string[];
  /** ヒント: 既知のロケ名リスト（location_bibles から） */
  knownLocationNames: string[];
  /** 1話あたりの目標パネル数（30-50 推奨） */
  targetPanelCount?: number;
  cwd?: string;
}): Promise<SceneEntry[]> {
  const targetPanels = args.targetPanelCount ?? 40;

  const result = await extractStructuredJson<{
    scenes: Omit<SceneEntry, "scene_id" | "scene_idx">[];
  }>({
    systemContext: [
      "あなたは縦読み漫画用の「シーンスプリッター」です。",
      "1話分の小説本文を、漫画のエピソード構成として 3-8 シーンに分割します。",
      "縦読み漫画は「導入低 → 中盤起伏 → クライマックス → 引きで急上昇」のリズムを持つため、",
      "シーン分割もこの構造を意識してください。",
    ].join("\n"),
    materials: {
      episode_body: args.episodeBody,
      known_characters:
        args.knownCharacterNames.length > 0
          ? args.knownCharacterNames.join(", ")
          : "(キャラ聖書未登録)",
      known_locations:
        args.knownLocationNames.length > 0
          ? args.knownLocationNames.join(", ")
          : "(ロケ聖書未登録)",
      target_panel_count: String(targetPanels),
    },
    instruction: [
      `第${args.episodeNum}話の本文を 3-8 シーンに分割してください。`,
      "",
      "重要なルール:",
      "1. シーンは『場所が変わる / 時間が飛ぶ / 視点が切り替わる / 状況が変化する』境界で切る。",
      "2. 各シーンの suggested_panel_count の合計が target_panel_count に近づくこと（±5）。",
      `   - 目標: ${targetPanels} パネル（最後のシーンは引きとして 4-7 パネル多めでよい）`,
      "3. characters_present・location_name は known_characters・known_locations に存在する名前を優先する。",
      "   存在しない名前を使う場合は本文の表記そのままで構わない（後で fallback）。",
      "4. dramatic_intent は: 1番目=introduction, 中盤=rising/turn, 山場=climax, 最後=cliffhanger を基本に。",
      "   cooldown は climax の直後・短いインターミッションのみに使う。",
      "5. intensity_hint は 0.1 (静か) ~ 1.0 (最高潮) の連続値。最後のシーンは 0.8 以上にすること（縦読みの引き）。",
      "6. body_excerpt は本文からの引用 500 文字以内。要約ではなく原文を切り出す。",
    ].join("\n"),
    outputSchema: SCHEMA,
    timeoutMs: 5 * 60 * 1000,
    maxRetries: 2,
    cwd: args.cwd,
  });

  const scenes = (result.scenes ?? []).map((s, i) => ({
    scene_id: `ep${args.episodeNum}-s${i + 1}`,
    scene_idx: i + 1,
    summary: s.summary,
    location_name: s.location_name,
    characters_present: s.characters_present ?? [],
    intensity_hint: clamp01(s.intensity_hint ?? 0.5),
    dramatic_intent: s.dramatic_intent ?? "rising",
    body_excerpt: (s.body_excerpt ?? "").slice(0, 600),
    suggested_panel_count: clampInt(s.suggested_panel_count ?? 5, 1, 12),
  }));

  if (scenes.length === 0) {
    throw new Error("シーン分割に失敗しました（0件）");
  }
  return scenes;
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0.5;
  return Math.max(0, Math.min(1, v));
}

function clampInt(v: number, min: number, max: number): number {
  const i = Math.round(v);
  if (Number.isNaN(i)) return min;
  return Math.max(min, Math.min(max, i));
}
