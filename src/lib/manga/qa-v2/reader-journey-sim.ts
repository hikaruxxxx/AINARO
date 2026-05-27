/**
 * L4.5 Reader Journey Simulation
 *
 * LLM に「初見読者」をシミュレートさせ、ページ単位で
 * 理解度・感情・離脱リスク・疑問点を構造化 FB する。
 *
 * 入力: scene_graph.json + storyboard.json (render 前に実行可能)
 * 出力: episodes/epNN/reader_journey.json
 *
 * engagement-audit.ts (L5.5) が「退屈ページ検出」なのに対し、
 * journey-sim は「読者体験全体の質」を診断する。
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { extractStructuredJson } from "../llm/codex-text";
import type { BibleSnapshotV2, EpisodeStoryboardV2, StoryboardPageV2 } from "../schemas-v2";
import type { SceneGraphV1, Scene } from "../scene-graph/schema";

// ===== 型定義 =====

export type ReaderPersona = {
  age_range: string;
  manga_literacy: "low" | "mid" | "high";
  genre_familiarity: "newcomer" | "casual" | "fan";
  primary_desire: string;
};

export type ReadingMoment = {
  page_no: number;
  comprehension: number;
  engagement: number;
  emotion: string;
  internal_monologue: string;
  unanswered_questions: string[];
  page_turning_motivation: "strong" | "moderate" | "weak" | "at_risk";
  drop_off_trigger?: string;
};

export type JourneySummary = {
  overall_satisfaction: number;
  hook_effectiveness: number;
  world_clarity: number;
  protagonist_likability: number;
  cliffhanger_pull: number;
  pacing_assessment: "rushed" | "well_paced" | "slow" | "uneven";
  emotional_arc: string;
  strongest_moment: { page_no: number; reason: string };
  weakest_moment: { page_no: number; reason: string };
  desire_fulfillment: Record<string, number>;
};

export type ImprovementSuggestion = {
  target_pages: number[];
  category: "pacing" | "clarity" | "emotion" | "hook" | "character" | "visual";
  severity: "critical" | "important" | "minor";
  problem: string;
  suggestion: string;
};

export type ReaderJourneyResult = {
  schema_version: 1;
  generated_at: string;
  slug: string;
  episode_id: string;
  persona: ReaderPersona;
  moments: ReadingMoment[];
  summary: JourneySummary;
  suggestions: ImprovementSuggestion[];
};

// ===== prompt 構築 =====

function summarizeSceneGraph(sg: SceneGraphV1): string {
  return sg.scenes
    .map((s: Scene) => {
      const cast = s.cast.map((c) => c.character_id).join(", ");
      return [
        `### Scene ${s.scene_id} (p${s.page_range.start}-p${s.page_range.end})`,
        `beat: ${s.beat_type} | mode: ${s.mode}`,
        `cast: ${cast}`,
        `arc: ${s.arc_position.arc_phase} (pos=${s.arc_position.arc_position_normalized.toFixed(2)})`,
        s.dialogue_plan.key_lines.slice(0, 3).map((l) => `  ${l.speaker}: 「${l.text}」`).join("\n"),
      ].join("\n");
    })
    .join("\n\n");
}

function summarizeStoryboard(sb: EpisodeStoryboardV2): string {
  return sb.pages
    .map((page: StoryboardPageV2) => {
      const panels = page.panels
        .map((p) => {
          const speech = [
            ...p.dialogue.map((d) => `${d.character_id}: 「${d.text}」`),
            ...p.monologue.map((m) => `${m.character_id}(心): 「${m.text}」`),
            ...p.narration.map((n) => `[ナレ] ${n}`),
          ].join(" / ");
          return `  panel#${p.panel_no}: ${p.action.slice(0, 80)}${speech ? " | " + speech : ""}`;
        })
        .join("\n");
      return `## page ${page.page_no} (${page.page_role})\n${panels}`;
    })
    .join("\n\n");
}

function defaultPersona(bible: BibleSnapshotV2): ReaderPersona {
  const genre = (bible.meta as Record<string, unknown>).genre as string | undefined;
  const isIsekai = genre?.includes("異世界") || genre?.includes("ファンタジー") || genre?.includes("ダンジョン");
  return {
    age_range: isIsekai ? "20-30代男性" : "20-30代",
    manga_literacy: "mid",
    genre_familiarity: "casual",
    primary_desire: isIsekai ? "dominate" : "discover",
  };
}

const JOURNEY_SCHEMA = `
type ReaderJourneyOutput = {
  moments: Array<{
    page_no: number;
    comprehension: number;       // 0-100
    engagement: number;          // 0-100
    emotion: string;             // "わくわく" / "退屈" / "困惑" / "緊張" 等
    internal_monologue: string;  // 読者の内心 40-80字
    unanswered_questions: string[];
    page_turning_motivation: "strong" | "moderate" | "weak" | "at_risk";
    drop_off_trigger?: string;
  }>;
  summary: {
    overall_satisfaction: number;   // 0-100
    hook_effectiveness: number;     // 0-100
    world_clarity: number;          // 0-100
    protagonist_likability: number; // 0-100
    cliffhanger_pull: number;       // 0-100
    pacing_assessment: "rushed" | "well_paced" | "slow" | "uneven";
    emotional_arc: string;          // 感情曲線の要約 100字
    strongest_moment: { page_no: number; reason: string };
    weakest_moment: { page_no: number; reason: string };
    desire_fulfillment: Record<string, number>; // 0-100
  };
  suggestions: Array<{
    target_pages: number[];
    category: "pacing" | "clarity" | "emotion" | "hook" | "character" | "visual";
    severity: "critical" | "important" | "minor";
    problem: string;    // 50字
    suggestion: string; // 80字
  }>;
};
`;

// ===== メイン関数 =====

export async function runReaderJourneySim(args: {
  sceneGraph: SceneGraphV1;
  storyboard: EpisodeStoryboardV2;
  bible: BibleSnapshotV2;
  persona?: ReaderPersona;
  cwd?: string;
  timeoutMs?: number;
}): Promise<ReaderJourneyResult> {
  const persona = args.persona ?? defaultPersona(args.bible);
  const slug = args.bible.meta.slug;
  const episodeId = args.storyboard.episode_id;

  const result = await extractStructuredJson<{
    moments?: ReadingMoment[];
    summary?: JourneySummary;
    suggestions?: ImprovementSuggestion[];
  }>({
    systemContext: [
      "あなたは漫画の読者体験シミュレーターです。",
      "以下のペルソナになりきり、漫画を1ページずつ読み進めてください。",
      "各ページで「この時点で何を理解しているか」「どう感じているか」「読み続けたいか」を記録します。",
      "",
      "## ペルソナ",
      `- 年齢層: ${persona.age_range}`,
      `- 漫画リテラシー: ${persona.manga_literacy}`,
      `- ジャンル慣れ: ${persona.genre_familiarity}`,
      `- 主要欲求: ${persona.primary_desire}`,
      "",
      "## 重要ルール",
      "- 初見読者として振る舞う。先の展開は知らない前提で各ページに反応する",
      "- comprehension は「世界観・状況・キャラの立場」の理解度 (0-100)",
      "- engagement は「読み続けたい」度合い (0-100)",
      "- page_turning_motivation が at_risk の場合は必ず drop_off_trigger を記入",
      "- 最初の 3 ページは hook_effectiveness の判定に直結する",
      "- suggestions は具体的かつ実行可能な改善案のみ (最大 8 個)",
    ].join("\n"),
    materials: {
      scene_graph: summarizeSceneGraph(args.sceneGraph),
      storyboard: summarizeStoryboard(args.storyboard),
    },
    instruction: [
      "上記の scene_graph と storyboard を page 1 から順に読み進め、",
      "各ページでの ReadingMoment を記録してください。",
      "全ページ読了後に JourneySummary と ImprovementSuggestion を出力してください。",
      "",
      "desire_fulfillment には以下の欲求軸の充足度 (0-100) を記入:",
      "rewarded / revenge / dominate / loved / protected / escape / discover / grow / connect / observe",
    ].join("\n"),
    outputSchema: JOURNEY_SCHEMA,
    cwd: args.cwd,
    timeoutMs: args.timeoutMs ?? 10 * 60 * 1000,
    maxRetries: 1,
  });

  if (!result.moments || result.moments.length === 0) {
    throw new Error(`reader-journey-sim: moments が空 (${episodeId})`);
  }
  if (!result.summary) {
    throw new Error(`reader-journey-sim: summary が空 (${episodeId})`);
  }

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    slug,
    episode_id: episodeId,
    persona,
    moments: result.moments,
    summary: result.summary,
    suggestions: result.suggestions ?? [],
  };
}

// ===== ファイル I/O =====

export async function loadAndRunJourney(args: {
  sceneGraphPath: string;
  storyboardPath: string;
  biblePath: string;
  outputPath: string;
  persona?: ReaderPersona;
  cwd?: string;
}): Promise<ReaderJourneyResult> {
  const [sgRaw, sbRaw, bibleRaw] = await Promise.all([
    fs.readFile(args.sceneGraphPath, "utf-8"),
    fs.readFile(args.storyboardPath, "utf-8"),
    fs.readFile(args.biblePath, "utf-8"),
  ]);

  const sceneGraph = JSON.parse(sgRaw) as SceneGraphV1;
  const storyboard = JSON.parse(sbRaw) as EpisodeStoryboardV2;
  const bible = JSON.parse(bibleRaw) as BibleSnapshotV2;

  const result = await runReaderJourneySim({
    sceneGraph,
    storyboard,
    bible,
    persona: args.persona,
    cwd: args.cwd,
  });

  await fs.mkdir(path.dirname(args.outputPath), { recursive: true });
  await fs.writeFile(args.outputPath, JSON.stringify(result, null, 2), "utf-8");
  // eslint-disable-next-line no-console
  console.log(`[reader-journey-sim] wrote ${args.outputPath}`);
  return result;
}
