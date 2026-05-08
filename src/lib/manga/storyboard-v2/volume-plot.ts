/**
 * Volume Plot Generator
 *
 * bible.snapshot + V2企画書.main_arc/volume_outline → volumes/v{NN}/plot.json
 * 10話分の章構成 + 伏線蒔き/回収マップ + cliffhanger 設計
 *
 * 各 ep の brief は L3 入力として使う想定。
 *
 * Phase X WX-3 (2026-05-06) でジャンル非依存化:
 *   - 旧版は「現代ダンジョン × システム音声」「コンビニ夜勤 or 装備値切り」をハードコード
 *   - 新版は bible.meta.art_style から MangaGenrePreset を逆引きして prompt に注入
 *   - tone_profile.recovery_cadence ≤ 0.3 の bible には「小報酬 beat 必須」を強制注入
 */
import { runCodexText } from "../llm/codex-text";
import type { BibleSnapshotV2, PullLink } from "../schemas-v2";
import type { V2Concept } from "../bible/v2-adapter";
import { findGenreByArtStyle } from "../storyboard/genre-presets";

export type EpisodeBeat = {
  beat_idx: number;
  label: "hook" | "buildup" | "turn" | "climax" | "resolution" | "cliffhanger";
  summary: string;
  emotional_intensity: number;          // 0-1
  key_visual: string;
};

export type VolumeEpisodePlan = {
  episode_no: number;
  title_working: string;
  theme: string;
  protagonist_arc: { start: string; turn: string; end: string };
  /** Phase 11-1: その話で core_hook の何を拡大するか。後方互換 optional */
  core_hook_usage?: string;
  /** Phase 11-2: その話で推し関係性をどう進展させるか。後方互換 optional */
  pairing_progression?: string;
  beats: EpisodeBeat[];
  must_include_events: string[];
  cliffhanger_hook: string;
  page_target: number;
  brief_for_L3: string;                 // L3 _brief.md にそのまま流せる本文
  /** Phase Y WY-3 で追加。後方互換 optional。cliffhanger architect が pattern_id と次話 hook を設計 */
  pull_link?: PullLink;
};

export type VolumePlot = {
  schema_version: 1;
  slug: string;
  volume_no: number;
  title_working: string;
  volume_theme: string;
  estimated_pages: number;
  foreshadow_map: Array<{
    seed_in_episode: number;
    payoff_in_episode: number;
    description: string;
  }>;
  episodes: VolumeEpisodePlan[];
};

const VOLUME_PLOT_SCHEMA = `
type VolumePlotOutput = {
  title_working: string;
  volume_theme: string;                    // 巻全体のテーマ 100字+
  estimated_pages: number;
  foreshadow_map: Array<{
    seed_in_episode: number;               // 1-10
    payoff_in_episode: number;             // 1-10 か 11+ (次巻持ち越し)
    description: string;                   // 80字+
  }>;
  episodes: Array<{
    episode_no: number;                    // 1-10
    title_working: string;
    theme: string;                         // 50字
    protagonist_arc: { start: string; turn: string; end: string };  // 各 50字
    core_hook_usage: string;                // 40-120字。この話で core_hook の何を拡大するか
    pairing_progression?: string;           // 40-120字。この話で推し関係性をどう進展させるか
    beats: Array<{
      beat_idx: number;                    // 1-7
      label: "hook" | "buildup" | "turn" | "climax" | "resolution" | "cliffhanger";
      summary: string;                     // 100字+
      emotional_intensity: number;         // 0-1
      key_visual: string;                  // 50字
    }>;
    must_include_events: string[];         // 3-5項目
    cliffhanger_hook: string;              // 80字+
    page_target: number;                   // 18-26
    brief_for_L3: string;                  // 1000-2000字、L3 _brief.md にそのまま使える
  }>;
};
`;

function buildCoreHookContract(bible: BibleSnapshotV2): string {
  const coreHook = bible.meta.core_hook;
  if (!coreHook) {
    return [
      "## Core Hook Contract (必須参照)",
      "- 未設定。既存 bible との後方互換のため生成は継続するが、各話は meta.genre / volume_synopsis から一文ギミックを補って設計すること。",
    ].join("\n");
  }
  return [
    "## Core Hook Contract (必須参照)",
    `- 一文: ${coreHook.one_liner}`,
    `- 類型: ${coreHook.type} / メカニクス: ${coreHook.mechanic ?? "(未設定)"}`,
    `- 読者の問い: ${coreHook.reader_question ?? "(未設定)"}`,
    `- 報酬モード: ${coreHook.reward_mode ?? "(未設定)"}`,
    coreHook.reward_mode === "custom"
      ? `- カスタム報酬: ${coreHook.custom_reward_mode ?? "(未設定)"}`
      : "",
    `- 参考作: ${coreHook.hit_references.join(", ")}`,
  ].filter(Boolean).join("\n");
}

function buildRecommendedPairings(bible: BibleSnapshotV2): string {
  const recommendedPairings = bible.relations.filter((r) => r.is_recommended_pairing === true);
  if (recommendedPairings.length === 0) return "";
  return [
    "## Recommended Pairings (推し導線、必須参照)",
    ...recommendedPairings.map((rel) => {
      const score = rel.appeal_score_manual ?? rel.appeal_score_auto;
      const scoreText = typeof score === "number" ? ` / score=${score}` : "";
      return `- ${rel.from_character_id} ⇔ ${rel.to_character_id}: ${rel.appeal_axis ?? "(axis 未指定)"}${scoreText} — ${rel.description}`;
    }),
    "- 各 episode に「どの推し関係性をどれだけ進展させるか」を outline 内で具体化する",
    "- 推し関係性が主要訴求の場合は pairing_progression に関係性の進展を 40-120字で明示する",
  ].join("\n");
}

export async function generateVolumePlot(args: {
  bible: BibleSnapshotV2;
  v2Concept: V2Concept;
  volumeNo: number;
  episodesPerVolume: number;
  pagesPerEpisode: number;
  cwd?: string;
  timeoutMs?: number;
}): Promise<VolumePlot> {
  // Phase X WX-3: art_style から genre preset を逆引き
  const genrePreset = findGenreByArtStyle(args.bible.meta.art_style);
  const genreLabel = genrePreset
    ? `${genrePreset.display_name} (${genrePreset.art_style})`
    : `汎用 (${args.bible.meta.art_style ?? "art_style未設定"})`;

  // Phase X WX-3: tone_profile.recovery_cadence が低い bible には小報酬 beat 必須を強制
  const tone = args.bible.meta.tone_profile;
  const recoveryRequired =
    tone && tone.recovery_cadence <= 0.3
      ? "- ⚠️ tone_profile.recovery_cadence ≤ 0.3 のため、各話に必ず『小報酬/生活感/相棒との温度』の beat を1個以上入れること (Phase X WX-3 強制)"
      : tone && tone.recovery_cadence >= 0.7
        ? "- tone_profile.recovery_cadence ≥ 0.7 のため、各話に『小報酬/生活感/相棒との温度』beat を 2-3 回入れることを推奨 (light_recovery 標準)"
        : "";

  // Phase X WX-3: ジャンル別の必須3要素 (旧版「機転 / ナビ / コンビニ」のハードコード置換)
  const genreThreeElements = genrePreset
    ? [
        `must_have_volume_1_scenes より:`,
        ...genrePreset.must_have_volume_1_scenes.slice(0, 5).map((s) => `  - ${s}`),
      ].join("\n")
    : "- ジャンル preset がないため、3 要素はストーリーのジャンル定石に従って自由に決定";

  const result = await runCodexText({
    task: [
      `あなたは商業漫画 (${genreLabel}) の編集者として、`,
      `1巻 (${args.episodesPerVolume}話 × ${args.pagesPerEpisode}ページ) の構成プロットを書いてください。`,
      "",
      "## ヒット作と並ぶ深さの条件",
      "- 各話に明確な beat 構造 (hook → buildup → turn → climax → resolution → cliffhanger)",
      "- 巻全体に伏線蒔きと回収のマップ (foreshadow_map で対応関係を明示)",
      "- 主人公の感情曲線が 1 巻通して右肩上がりではなく揺れがある (5-7話で踏み外し、9-10話で立て直し)",
      "- 各話の cliffhanger が次話を読みたくなる強さ (turn_strength 4+)",
      `- 1巻必須シーン (このジャンルの定石): ${genreThreeElements}`,
      recoveryRequired,
      "- 各 episode に core_hook_usage を必ず入れ、その話で Core Hook Contract の一文/メカニクス/読者の問い/報酬モードの何を拡大するかを短く明示する",
      "- 各話の brief_for_L3 は L3 Shotlist にそのまま流せる本文を 1000-2000字で書く (各シーンの場所/登場人物/出来事/モノローグ核ライン)",
      "",
      buildCoreHookContract(args.bible),
      buildRecommendedPairings(args.bible),
      "",
      "## bible (登場人物 / 世界観 / 視覚モチーフ)",
      "```json",
      JSON.stringify({
        meta: args.bible.meta,
        world: args.bible.world,
        characters: args.bible.characters.map((c) => ({ id: c.id, name: c.name, role: c.role })),
        relations: args.bible.relations.map((r) => ({
          from_character_id: r.from_character_id,
          to_character_id: r.to_character_id,
          relation_type: r.relation_type,
          description: r.description,
          appeal_axis: r.appeal_axis,
          appeal_score_manual: r.appeal_score_manual,
          appeal_score_auto: r.appeal_score_auto,
          is_recommended_pairing: r.is_recommended_pairing,
        })),
        locations: args.bible.locations.map((l) => ({ id: l.id, name: l.name })),
        visual_motifs: args.bible.visual_motifs,
        volume_synopsis: args.bible.volume_synopsis,
      }, null, 2).slice(0, 30000),
      "```",
      "",
      "## V2企画書 main_arc / volume_outline (詳細素材)",
      "```json",
      JSON.stringify({
        main_arc: args.v2Concept.main_arc,
        volume_outline: args.v2Concept.volume_outline,
        volume1_detail: args.v2Concept.volume1_detail,
      }, null, 2).slice(0, 30000),
      "```",
      "",
      "## 出力スキーマ",
      "```typescript",
      VOLUME_PLOT_SCHEMA,
      "```",
      "",
      `## 期待する量
- foreshadow_map: 6件以上
- episodes: ${args.episodesPerVolume}話 (1-${args.episodesPerVolume})
- 各 episode の brief_for_L3: 1000-2000字`,
      "",
      "## 出力形式",
      "上記スキーマに従う JSON のみを返してください。説明文・前置き・後書きは不要。",
      "出力は ```json ... ``` のコードブロックで囲んでください。",
    ].join("\n"),
    format: "json",
    cwd: args.cwd,
    timeoutMs: args.timeoutMs ?? 12 * 60 * 1000,
    maxRetries: 1,
  });

  if (!result.parsed) throw new Error("volume-plot JSON 抽出失敗");
  const parsed = result.parsed as Omit<VolumePlot, "schema_version" | "slug" | "volume_no">;
  return {
    schema_version: 1,
    slug: args.bible.meta.slug,
    volume_no: args.volumeNo,
    ...parsed,
  };
}
