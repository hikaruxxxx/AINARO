/**
 * L0 プロット層
 *
 * 1 話分の本文 + 既存シーン分割を入力に、エピソードのプロット骨格
 * （主題・主人公感情曲線・ビート列・引き・モチーフ・余韻）を抽出する。
 *
 * 旧 shot-planner との違い:
 *   - 旧設計はシーン → 即パネル化で「コマの存在意義」を考えなかった
 *   - 本層は「読者にとっての面白さ」をビート単位で先に固定し、ネーム層が参照する
 *
 * Codex CLI 経由（ANTHROPIC_API_KEY 課金前提にしない原則）。
 */

import { extractStructuredJson } from "../llm/codex-text";
import type { EpisodePlotData } from "../schemas";
import type { SceneEntry } from "../shotlist/scene-splitter";

const SCHEMA = `
type Plot = {
  theme: string;
  protagonist_arc: { start: string; turn: string; end: string };
  beats: Array<{
    label: 'hook'|'inciting_incident'|'rising'|'turn'|'climax'|'resolution'|'cliffhanger';
    summary: string;
    emotional_intensity: number;     // 0-1
    key_visual: string;              // 「絵で覚えてほしい一場面」を 1 行
    scene_ids: string[];             // SceneEntry.scene_id を厳密に列挙
    characters: string[];            // 既知キャラ名から
    foreshadow_seed?: string;
    foreshadow_payoff?: string;
    page_budget?: {
      target_pages: number;          // このbeatで使う目標ページ数
      min_pages: number;
      max_pages: number;
      target_panels?: number;        // 目安。target_pages × 5-7 程度
    };
  }>;
  cliffhanger_hook: string;
  motifs: string[];
  intended_reading_experience: string;
  episode_target_panels: number;
  episode_target_pages?: number;     // 横読みPhase A の主入力
};
`;

export async function extractEpisodePlot(args: {
  episodeNum: number;
  episodeBody: string;
  scenes: SceneEntry[];
  knownCharacterNames: string[];
  /** 横読み Phase A の主入力 (KDP B6, 1話 16-26p) */
  targetPages: number;
  /** panel 総数の目安 (target_pages × avg_panels_per_page) */
  targetPanels: number;
  /** 1巻スケジュールから受け取る必須イベント (Volume Planner 連携) */
  mustIncludeEvents?: string[];
  /** 直前話の cliffhanger（多話横断のため、初話は省略可） */
  prevEpisodeHook?: string;
  cwd?: string;
}): Promise<EpisodePlotData> {
  const sceneCards = args.scenes
    .map((s) => {
      return [
        `### ${s.scene_id} [${s.dramatic_intent}, intensity=${s.intensity_hint.toFixed(2)}]`,
        `- 場所: ${s.location_name ?? "?"}`,
        `- 登場: ${s.characters_present.join(", ") || "?"}`,
        `- 要約: ${s.summary}`,
      ].join("\n");
    })
    .join("\n\n");

  const mustEventsLine =
    args.mustIncludeEvents && args.mustIncludeEvents.length > 0
      ? args.mustIncludeEvents.join(" / ")
      : "(なし)";

  const result = await extractStructuredJson<{
    theme: string;
    protagonist_arc: { start: string; turn: string; end: string };
    beats: Array<{
      label: import("../schemas").PlotBeatLabel;
      summary: string;
      emotional_intensity: number;
      key_visual: string;
      scene_ids: string[];
      characters: string[];
      foreshadow_seed?: string;
      foreshadow_payoff?: string;
      page_budget?: {
        target_pages: number;
        min_pages: number;
        max_pages: number;
        target_panels?: number;
      };
    }>;
    cliffhanger_hook: string;
    motifs: string[];
    intended_reading_experience: string;
    episode_target_panels: number;
    episode_target_pages?: number;
  }>({
    systemContext: [
      "あなたは横読み白黒漫画 (KDP B6 1巻160-200p) 用の「プロット骨格抽出」エージェントです。",
      "1話分の本文とシーン分割から、",
      " - 主題（読者にとっての面白さの中核）",
      " - 主人公の感情曲線（start→turn→end）",
      " - 起承転結のビート列（hook → inciting_incident → rising → turn → climax → resolution → cliffhanger）",
      " - 各 beat のページ予算（target_pages の合計が episode_target_pages と一致する制約）",
      " - 引き（次話遷移率の最大要因）",
      " - 視覚モチーフ（繰り返し使う記号・色・小物）",
      "を構造化します。",
      "",
      "確定要件:",
      " - 「コマの存在意義」が説明できる単位までビートを切ること",
      " - 引きはエピソード末尾の余韻と、読者が次話で何を見たいかを言語化すること",
      " - 5-7 ビート、最大8 を上限とする",
      " - 各 beat に page_budget (target_pages / min_pages / max_pages) を必ず付与し、",
      "   target_pages の合計が episode_target_pages と一致すること",
    ].join("\n"),
    materials: {
      episode_body: args.episodeBody,
      scenes: sceneCards,
      known_characters:
        args.knownCharacterNames.length > 0
          ? args.knownCharacterNames.join(", ")
          : "(なし)",
      target_pages: String(args.targetPages),
      target_panels: String(args.targetPanels),
      must_include_events: mustEventsLine,
      prev_episode_hook: args.prevEpisodeHook ?? "(初話 / 引き継ぎなし)",
    },
    instruction: [
      `第${args.episodeNum}話のプロット骨格を構造化してください。`,
      `1話の目標ページ数は ${args.targetPages}p、目標パネル数は ${args.targetPanels} です。`,
      "",
      "重要なルール:",
      "1. beats は 5-7 個を基本（最低 4、最大 8）。各 beat の scene_ids には SceneEntry.scene_id を厳密に流用する（新規発明禁止）。",
      "2. 1 つのシーンが 2 つの beat にまたがってもよいが、scene_ids が空の beat は禁止。",
      "3. emotional_intensity は隣接 beat と差をつける（単調抑制）。最後の beat (cliffhanger) は 0.85 以上。",
      "4. key_visual は 1 文で『絵で覚えてほしい一場面』を視覚的に書く（カメラ/構図/光源を入れる）。",
      "5. cliffhanger_hook は次話で読者が知りたくなる『未解決の問い』として書く。",
      "6. motifs は 3-5 個。色・小物・繰り返しの構図など視覚的に再利用できるもののみ。",
      "7. intended_reading_experience は読者が読了後に抱くべき感情を 1-2 文で。",
      "8. 各 beat に page_budget を必ず付与する:",
      `   - target_pages の合計 == ${args.targetPages} (厳守)`,
      "   - climax / cliffhanger beat は 2-4p を推奨（見せ場確保）",
      "   - hook / resolution は 1-2p で済ませる",
      "   - target_panels は target_pages × 5-7 程度を目安",
      "9. must_include_events が指定されていれば、対応する beat の summary または key_visual で必ず触れる。",
      `10. episode_target_panels は ${args.targetPanels} を流用（±10 まで微調整可）。`,
      `11. episode_target_pages は ${args.targetPages} を必ず出力する。`,
    ].join("\n"),
    outputSchema: SCHEMA,
    timeoutMs: 5 * 60 * 1000,
    maxRetries: 2,
    cwd: args.cwd,
  });

  // beat_idx を 1-indexed で振り直し、不正値をクランプ
  const beats = (result.beats ?? []).map((b, i) => ({
    beat_idx: i + 1,
    label: b.label,
    summary: b.summary,
    emotional_intensity: clamp01(b.emotional_intensity ?? 0.5),
    key_visual: b.key_visual ?? "",
    scene_ids: b.scene_ids ?? [],
    characters: b.characters ?? [],
    foreshadow_seed: b.foreshadow_seed,
    foreshadow_payoff: b.foreshadow_payoff,
    page_budget: b.page_budget,
  }));

  if (beats.length === 0) {
    throw new Error("プロット抽出に失敗しました（beats=0）");
  }

  return {
    theme: result.theme ?? "",
    protagonist_arc: result.protagonist_arc ?? { start: "", turn: "", end: "" },
    beats,
    cliffhanger_hook: result.cliffhanger_hook ?? "",
    motifs: result.motifs ?? [],
    intended_reading_experience: result.intended_reading_experience ?? "",
    episode_target_panels: result.episode_target_panels ?? args.targetPanels,
    episode_target_pages: result.episode_target_pages ?? args.targetPages,
    must_include_events: args.mustIncludeEvents,
    ep_num: args.episodeNum,
  };
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0.5;
  return Math.max(0, Math.min(1, v));
}
