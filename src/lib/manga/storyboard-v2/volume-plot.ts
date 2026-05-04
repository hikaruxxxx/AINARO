/**
 * Volume Plot Generator
 *
 * bible.snapshot + V2企画書.main_arc/volume_outline → volumes/v{NN}/plot.json
 * 10話分の章構成 + 伏線蒔き/回収マップ + cliffhanger 設計
 *
 * 各 ep の brief は L3 入力として使う想定。
 */
import { runCodexText } from "../llm/codex-text";
import type { BibleSnapshotV2 } from "../schemas-v2";
import type { V2Concept } from "../bible/v2-adapter";

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
  beats: EpisodeBeat[];
  must_include_events: string[];
  cliffhanger_hook: string;
  page_target: number;
  brief_for_L3: string;                 // L3 _brief.md にそのまま流せる本文
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

export async function generateVolumePlot(args: {
  bible: BibleSnapshotV2;
  v2Concept: V2Concept;
  volumeNo: number;
  episodesPerVolume: number;
  pagesPerEpisode: number;
  cwd?: string;
  timeoutMs?: number;
}): Promise<VolumePlot> {
  const result = await runCodexText({
    task: [
      "あなたは商業漫画 (なろう系コミカライズ、現代ダンジョン × システム音声 ジャンル) の編集者として、",
      `1巻 (${args.episodesPerVolume}話 × ${args.pagesPerEpisode}ページ) の構成プロットを書いてください。`,
      "",
      "## ヒット作と並ぶ深さの条件",
      "- 各話に明確な beat 構造 (hook → buildup → turn → climax → resolution → cliffhanger)",
      "- 巻全体に伏線蒔きと回収のマップ (foreshadow_map で対応関係を明示)",
      "- 主人公の感情曲線が 1 巻通して右肩上がりではなく揺れがある (5-7話で踏み外し、9-10話で立て直し)",
      "- 各話の cliffhanger が次話を読みたくなる強さ (turn_strength 4+)",
      "- 1話に必ず『機転 (情報強者の証明)』『ナビとのやりとり (関係性ドラマ)』『コンビニ夜勤 or 装備値切り (地の質感)』の 3 要素を入れる",
      "- 各話の brief_for_L3 は L3 Shotlist にそのまま流せる本文を 1000-2000字で書く (各シーンの場所/登場人物/出来事/モノローグ核ライン)",
      "",
      "## bible (登場人物 / 世界観 / 視覚モチーフ)",
      "```json",
      JSON.stringify({
        meta: args.bible.meta,
        world: args.bible.world,
        characters: args.bible.characters.map((c) => ({ id: c.id, name: c.name, role: c.role })),
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
