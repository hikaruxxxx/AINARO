/**
 * L5.5 Engagement LLM Audit (Phase Y WY-4)
 *
 * 設計根拠:
 *   - Plan: /Users/hikarumori/.claude/plans/groovy-wishing-castle.md WY-4
 *   - Codex 修正: 「render 後 (L11.5) ではなく render 前 (L5.5、L5 page-director の後)」に位置
 *   - 機械audit (L8.6) では検出できない「面白いか/退屈か」を LLM で判定
 *
 * 役割:
 *   - storyboard + page_plan のテキストを LLM (claude opus 経由) に渡し、各 page で「読者離脱リスク」を採点
 *   - 退屈 page / キャラ好感度推移 / 小報酬間隔 を抽出
 *   - render コスト発生前の判定なので、修正は L4 storyboard / L4.1 hook / L4.5 narration への再走で対応
 *
 * 設計上の制約:
 *   - kill 判定には使わず人間レビュー送り (Codex 指摘)
 *   - 編集判断カードDB を few-shot prompt として注入
 *   - 教師データ (人間採点 50-100 episode) は Phase Y 後半で別途蓄積
 *
 * 出力: episodes/ep{NN}/engagement_audit.json
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { extractStructuredJson } from "../llm/codex-text";
import type {
  BibleSnapshotV2,
  EpisodeRewardDensity,
  EpisodeStoryboardV2,
  PagePlanV2,
  RewardTagType,
  StoryboardPageV2,
} from "../schemas-v2";

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const EDITORIAL_CARDS_DIR = path.join(REPO_ROOT, "data/manga/editorial-cards");

// ===== 型定義 =====

export type PageEngagementScore = {
  page_no: number;
  page_role: string;
  /** 読者離脱リスク (0-100、高いほど離脱しやすい) */
  drop_off_risk: number;
  /** boring 判定: ページに展開がない/会話だけ/既出情報の繰り返し */
  boring_flagged: boolean;
  boring_reason?: string;
  /** 主人公への好感度 (1-10、各 page で評価) */
  protagonist_likability: number;
  /** 「面白さ」一言コメント (人間レビュアー向け) */
  comment: string;
};

export type CharacterArcCheck = {
  character_id: string;
  /** episode 開始 (page 1-3 の平均) */
  likability_at_start: number;
  /** 中盤 (中央付近の page) */
  likability_at_mid: number;
  /** 終了 (last page-2 の平均) */
  likability_at_end: number;
  /** 急落判定 (>= 3 ポイント減なら true) */
  has_significant_drop: boolean;
  drop_reason?: string;
};

export type RewardInterval = {
  /** 「主人公が報われた瞬間」または「相棒との温度ある会話」を検出した page_no 一覧 */
  reward_page_nos: number[];
  /** 最大空隙 (連続して報酬が無いページ数) */
  max_gap_pages: number;
  /** 20p 以上空いたら flag */
  gap_warning: boolean;
};

export type EngagementAuditResult = {
  schema_version: 1 | 2;
  generated_at: string;
  slug: string;
  episode_id: string;
  total_pages: number;

  // 主指標
  overall_drop_off_risk: number; // 全 page の平均
  boring_pages: number[]; // boring_flagged=true な page_no 一覧
  worst_page: { page_no: number; drop_off_risk: number; reason: string } | null;

  // 副指標
  per_page_scores: PageEngagementScore[];
  character_arcs: CharacterArcCheck[];
  /** @deprecated Phase 11-3 以降は reward_density を優先。後方互換のため維持 */
  reward_interval: RewardInterval;
  reward_density?: EpisodeRewardDensity;

  // メタ
  human_review_required: boolean;
  llm_model: string;
  rationale_summary: string;
};

type RewardSource = "explicit" | "deterministic" | "llm";

const REWARD_TAG_TYPES: RewardTagType[] = [
  "achievement",
  "secret_revealed",
  "relationship_advance",
  "power_growth",
  "justice_payoff",
  "spectacle",
  "comic_relief",
  "comfort_recovery",
  "status_gain",
  "mystery_progress",
];

const REWARD_TAG_TYPE_SET = new Set<string>(REWARD_TAG_TYPES);

function isRewardTagType(v: unknown): v is RewardTagType {
  return typeof v === "string" && REWARD_TAG_TYPE_SET.has(v);
}

function uniqueRewardTagTypes(types: RewardTagType[]): RewardTagType[] {
  return REWARD_TAG_TYPES.filter((type) => types.includes(type));
}

function uniqueRewardSources(sources: RewardSource[]): RewardSource[] {
  return ["explicit", "deterministic", "llm"].filter((source): source is RewardSource =>
    sources.includes(source as RewardSource),
  );
}

function getPageRewardState(page: StoryboardPageV2): {
  rewardTypes: RewardTagType[];
  sources: RewardSource[];
  hasExplicit: boolean;
} {
  const rewardTypes: RewardTagType[] = [];
  const sources: RewardSource[] = [];
  let hasExplicit = false;

  for (const panel of page.panels) {
    for (const tag of panel.reward_tags ?? []) {
      if (!isRewardTagType(tag.type)) {
        console.warn(
          `[engagement-audit] unknown explicit reward tag dropped: page=${page.page_no} panel=${panel.panel_id} type=${String(tag.type)}`,
        );
        continue;
      }
      rewardTypes.push(tag.type);
      sources.push("explicit");
      hasExplicit = true;
    }
  }

  return {
    rewardTypes: uniqueRewardTagTypes(rewardTypes),
    sources: uniqueRewardSources(sources),
    hasExplicit,
  };
}

function panelRewardText(panel: StoryboardPageV2["panels"][number]): string {
  return [
    panel.action,
    panel.key_visual,
    ...panel.dialogue.map((d) => d.text),
    ...panel.monologue.map((m) => m.text),
    ...panel.narration,
    ...panel.sfx,
  ].join("\n");
}

function deterministicRewardForPanel(
  page: StoryboardPageV2,
  panel: StoryboardPageV2["panels"][number],
): RewardTagType | null {
  const text = panelRewardText(panel);

  if (/達成|成功|勝った|勝利|やった|やった！/.test(text)) return "achievement";
  if (/見つけた|気づいた|わかった|判明|正体/.test(text)) return "secret_revealed";
  if (/ありがとう|大好き|信じて|守る|二人で/.test(text)) return "relationship_advance";
  if (/成長|レベルアップ|覚醒|進化|新スキル/.test(text)) return "power_growth";
  if (/ざまあ|当然の報い|因果応報|罰/.test(text)) return "justice_payoff";

  if (page.page_role === "reveal") return "mystery_progress";
  if (page.page_role === "cliffhanger") {
    return panel.importance >= 4 ? "spectacle" : "mystery_progress";
  }
  if (page.page_role === "aftermath") return "comfort_recovery";
  if (panel.importance >= 4) {
    return page.page_role === "action" ? "achievement" : "spectacle";
  }

  return null;
}

function summarizePagesForRewardJudge(pages: StoryboardPageV2[]): string {
  return pages
    .map((page) => {
      const panels = page.panels
        .map((panel) => {
          const speech = [
            ...panel.dialogue.map((d) => `${d.character_id}: 「${d.text}」`),
            ...panel.monologue.map((m) => `${m.character_id} (心): 「${m.text}」`),
            ...panel.narration.map((n) => `[ナレ] ${n}`),
            ...panel.sfx.map((s) => `[SFX] ${s}`),
          ].join(" / ");
          return `  panel#${panel.panel_no} imp=${panel.importance}: ${panel.action.slice(0, 100)}${speech ? " | " + speech : ""}`;
        })
        .join("\n");
      return `## page ${page.page_no} (page_role=${page.page_role})\n${panels}`;
    })
    .join("\n\n");
}

const REWARD_DENSITY_LLM_SCHEMA = `
type RewardDensityJudgeOutput = {
  page_rewards: Array<{
    page_no: number;
    reward_detected: boolean;
    type?: "achievement" | "secret_revealed" | "relationship_advance" | "power_growth" | "justice_payoff" | "spectacle" | "comic_relief" | "comfort_recovery" | "status_gain" | "mystery_progress";
    note?: string;
  }>;
};
`;

async function judgeMissingRewardPagesWithLLM(args: {
  pages: StoryboardPageV2[];
  cwd?: string;
  timeoutMs?: number;
}): Promise<Map<number, RewardTagType>> {
  if (args.pages.length === 0) return new Map();

  const result = await extractStructuredJson<{
    page_rewards?: Array<{
      page_no?: number;
      reward_detected?: boolean;
      type?: string;
      note?: string;
    }>;
  }>({
    systemContext: [
      "あなたは商業漫画の engagement audit 補助エージェントです。",
      "明示タグと機械ヒューリスティックで報酬が検出されなかった page だけを読み、",
      "読者が小さな満足・進展・息抜きを感じる page かを補助判定します。",
      "過検出を避け、弱い雰囲気だけなら reward_detected=false にしてください。",
    ].join("\n"),
    materials: {
      unresolved_pages: summarizePagesForRewardJudge(args.pages),
    },
    instruction: [
      "各 page について reward_detected を判定してください。",
      "reward_detected=true の場合、type は必ず指定の10種 enum から1つだけ選んでください。",
      "enum 外の type は無効になります。",
    ].join("\n"),
    outputSchema: REWARD_DENSITY_LLM_SCHEMA,
    cwd: args.cwd,
    timeoutMs: args.timeoutMs ?? 8 * 60 * 1000,
    maxRetries: 2,
  });

  const byPage = new Map<number, RewardTagType>();
  for (const item of result.page_rewards ?? []) {
    if (!item.reward_detected || item.page_no === undefined) continue;
    if (!isRewardTagType(item.type)) {
      console.warn(
        `[engagement-audit] unknown llm reward tag dropped: page=${item.page_no} type=${String(item.type)}`,
      );
      continue;
    }
    byPage.set(item.page_no, item.type);
  }
  return byPage;
}

function buildEpisodeRewardDensity(args: {
  storyboard: EpisodeStoryboardV2;
  pageRewards: Array<{
    page_no: number;
    reward_types: RewardTagType[];
    sources: RewardSource[];
  }>;
}): EpisodeRewardDensity {
  const totalPages = args.storyboard.total_pages || args.storyboard.pages.length;
  const rewardPages = args.pageRewards.filter((p) => p.reward_types.length > 0);
  const rewardTypes = uniqueRewardTagTypes(rewardPages.flatMap((p) => p.reward_types));

  let maxGapPages = 0;
  let currentGap = 0;
  for (const page of args.pageRewards) {
    if (page.reward_types.length > 0) {
      maxGapPages = Math.max(maxGapPages, currentGap);
      currentGap = 0;
    } else {
      currentGap++;
    }
  }
  maxGapPages = Math.max(maxGapPages, currentGap);

  const density: EpisodeRewardDensity = {
    episode_no: parseEpisodeNo(args.storyboard.episode_id),
    total_pages: totalPages,
    reward_count: rewardPages.length,
    reward_density: totalPages > 0 ? rewardPages.length / totalPages : 0,
    max_gap_pages: maxGapPages,
    variety_score: rewardTypes.length,
    reward_types: rewardTypes,
    per_page_rewards: args.pageRewards.map((p) => ({
      page_no: p.page_no,
      reward_types: uniqueRewardTagTypes(p.reward_types),
      sources: uniqueRewardSources(p.sources),
    })),
    warnings: [],
  };
  density.warnings = deriveRewardDensityWarnings(density);
  return density;
}

function parseEpisodeNo(episodeId: string): number {
  const match = episodeId.match(/(\d+)$/);
  return match ? Number(match[1]) : 0;
}

export function deriveRewardDensityWarnings(d: EpisodeRewardDensity): string[] {
  const w: string[] = [];
  if (d.reward_density < 0.05) w.push("density_critical");
  else if (d.reward_density < 0.08) w.push("density_warn");
  if (d.max_gap_pages > 12) w.push("gap_critical");
  else if (d.max_gap_pages > 8) w.push("gap_warn");
  if (d.variety_score < 2) w.push("variety_warn");
  return w;
}

export async function auditEpisodeRewardDensity(
  storyboard: EpisodeStoryboardV2,
  args: { cwd?: string; timeoutMs?: number } = {},
): Promise<EpisodeRewardDensity> {
  const pageRewards = storyboard.pages.map((page) => {
    const explicit = getPageRewardState(page);
    if (explicit.hasExplicit) {
      return {
        page_no: page.page_no,
        reward_types: explicit.rewardTypes,
        sources: explicit.sources,
      };
    }

    const deterministicTypes: RewardTagType[] = [];
    for (const panel of page.panels) {
      const type = deterministicRewardForPanel(page, panel);
      if (type) deterministicTypes.push(type);
    }
    return {
      page_no: page.page_no,
      reward_types: uniqueRewardTagTypes(deterministicTypes),
      sources: deterministicTypes.length > 0 ? (["deterministic"] as RewardSource[]) : [],
    };
  });

  const unresolvedPages = storyboard.pages.filter((page) => {
    const current = pageRewards.find((p) => p.page_no === page.page_no);
    return !current || current.reward_types.length === 0;
  });

  const llmRewards = await judgeMissingRewardPagesWithLLM({
    pages: unresolvedPages,
    cwd: args.cwd,
    timeoutMs: args.timeoutMs,
  });

  for (const pageReward of pageRewards) {
    if (pageReward.reward_types.length > 0) continue;
    const type = llmRewards.get(pageReward.page_no);
    if (!type) continue;
    pageReward.reward_types = [type];
    pageReward.sources = ["llm"];
  }

  return buildEpisodeRewardDensity({ storyboard, pageRewards });
}

// ===== 編集判断カード few-shot 注入 =====

async function loadEditorialCardSummaries(): Promise<string> {
  try {
    const files = await fs.readdir(EDITORIAL_CARDS_DIR);
    const ecFiles = files.filter((f) => f.startsWith("EC-") && f.endsWith(".json"));
    const summaries: string[] = [];
    for (const f of ecFiles.slice(0, 12)) {
      try {
        const buf = await fs.readFile(path.join(EDITORIAL_CARDS_DIR, f), "utf-8");
        const card = JSON.parse(buf) as {
          card_id: string;
          title: string;
          trigger?: { flag?: string };
          diagnosis: string;
          target_axis?: string[];
        };
        summaries.push(
          `- ${card.card_id} (${card.title}): trigger=${card.trigger?.flag ?? "—"} / diagnosis=${card.diagnosis} / axes=[${(card.target_axis ?? []).join(",")}]`,
        );
      } catch {
        // skip
      }
    }
    return summaries.join("\n");
  } catch {
    return "";
  }
}

// ===== LLM 出力 schema =====

const ENGAGEMENT_OUTPUT_SCHEMA = `
type EngagementAuditOutput = {
  per_page_scores: Array<{
    page_no: number;                 // 1-indexed
    page_role: string;                // opening_hook / buildup / reveal / cliffhanger 等
    drop_off_risk: number;            // 0-100、高いほど離脱しやすい
    boring_flagged: boolean;
    boring_reason?: string;           // boring_flagged=true のときのみ
    protagonist_likability: number;   // 1-10
    comment: string;                  // 人間レビュアー向け 1-2文
  }>;
  character_arcs: Array<{
    character_id: string;
    likability_at_start: number;       // 1-10
    likability_at_mid: number;         // 1-10
    likability_at_end: number;         // 1-10
    has_significant_drop: boolean;     // start-end >= 3
    drop_reason?: string;
  }>;
  reward_interval: {
    reward_page_nos: number[];         // 報酬検出ページ番号
    max_gap_pages: number;
    gap_warning: boolean;              // max_gap_pages >= 20 で true
  };
  overall_drop_off_risk: number;       // 全 page の平均
  worst_page: {
    page_no: number;
    drop_off_risk: number;
    reason: string;
  } | null;
  rationale_summary: string;           // 全体所感 200字以内
};
`;

// ===== 本体 =====

function summarizeStoryboardForLLM(
  storyboard: EpisodeStoryboardV2,
  bible: BibleSnapshotV2,
): string {
  // characters block (上限 5キャラ)
  const charsBlock = bible.characters
    .slice(0, 5)
    .map((c) => `${c.id}: ${c.name} (${c.role})`)
    .join(", ");

  const pages = storyboard.pages.map((page) => {
    const panelLines = page.panels.map((panel) => {
      const speech = [
        ...panel.dialogue.map((d) => `${d.character_id}: 「${d.text}」`),
        ...panel.monologue.map((m) => `${m.character_id} (心): 「${m.text}」`),
        ...panel.narration.map((n) => `[ナレ] ${n}`),
      ].join(" / ");
      return `  panel#${panel.panel_no} (${panel.shot_type}, imp=${panel.importance}): ${panel.action.slice(0, 80)}${speech ? " | " + speech : ""}`;
    });
    return `## page ${page.page_no} (page_role=${page.page_role})\n${panelLines.join("\n")}`;
  });

  return `# bible
- title: ${bible.meta.title}
- genre: ${bible.meta.genre}
- tone_profile: ${JSON.stringify(bible.meta.tone_profile ?? "unset")}
- characters: ${charsBlock}

# storyboard (${storyboard.pages.length} pages, total ${storyboard.pages.reduce((s, p) => s + p.panels.length, 0)} panels)
${pages.join("\n\n")}`;
}

export async function generateEngagementAudit(args: {
  bible: BibleSnapshotV2;
  storyboard: EpisodeStoryboardV2;
  pagePlan?: PagePlanV2;
  cwd?: string;
  timeoutMs?: number;
}): Promise<EngagementAuditResult> {
  const { bible, storyboard } = args;

  const editorialCardsBlock = await loadEditorialCardSummaries();
  const rewardDensity = await auditEpisodeRewardDensity(storyboard, {
    cwd: args.cwd,
    timeoutMs: args.timeoutMs,
  });

  const result = await extractStructuredJson<{
    per_page_scores: Array<{
      page_no: number;
      page_role: string;
      drop_off_risk: number;
      boring_flagged: boolean;
      boring_reason?: string;
      protagonist_likability: number;
      comment: string;
    }>;
    character_arcs: Array<{
      character_id: string;
      likability_at_start: number;
      likability_at_mid: number;
      likability_at_end: number;
      has_significant_drop: boolean;
      drop_reason?: string;
    }>;
    reward_interval: {
      reward_page_nos: number[];
      max_gap_pages: number;
      gap_warning: boolean;
    };
    overall_drop_off_risk: number;
    worst_page: {
      page_no: number;
      drop_off_risk: number;
      reason: string;
    } | null;
    rationale_summary: string;
  }>({
    systemContext: [
      "あなたは商業漫画 (なろう系コミカライズ、KDP+KU 1巻10万円目標) の熱心な読者です。",
      "1話の storyboard (ページ毎の panels + dialogue / monologue / narration) を読み、",
      "**KU 読者がどこで離脱しそうか** を採点します。",
      "",
      "目的:",
      "- 各 page の「読者離脱リスク」(0-100) を採点 (高いほど離脱しやすい)",
      "- boring page (展開なし/会話だけ/既出情報の繰り返し) を検出",
      "- 主人公への好感度推移 (start/mid/end の 1-10 採点) で急落 (3 ポイント以上) を検出",
      "- 小報酬間隔 (主人公の達成/相棒との温度/感謝の言葉等) の最大空隙を計測",
      "",
      "重要ルール:",
      "- kill 判定はしない。あくまで人間レビュアーへの参考情報",
      "- 「面白い」「退屈」の判断は同型ヒット作 (世界最速のレベルアップ / 本好きの下剋上 / 薬屋のひとりごと等) を基準に",
      "- drop_off_risk: 0-30=安全 / 30-60=要注意 / 60-100=危険",
      "- protagonist_likability: 1-3=共感困難 / 4-6=普通 / 7-10=共感容易",
      "- 編集判断カードDB を参考に、修正方向性も rationale_summary に含める",
    ].join("\n"),
    materials: {
      storyboard_summary: summarizeStoryboardForLLM(storyboard, bible),
      editorial_cards_reference: editorialCardsBlock || "(no editorial cards available)",
      page_plan_summary: args.pagePlan
        ? `total_pages: ${args.pagePlan.pages?.length ?? "unknown"}`
        : "(page_plan not provided)",
    },
    instruction: [
      `第${storyboard.episode_id} の engagement audit を実施してください。`,
      "- per_page_scores: 全 page を採点 (page_no 昇順)",
      "- character_arcs: 主要キャラ (主人公 + ヒロイン格) について start/mid/end の好感度推移",
      "- reward_interval: 報酬 panel の page_no 一覧 + 最大空隙",
      "- worst_page: 最も離脱リスクが高い1 page",
      "- rationale_summary: 全体所感 200字以内、修正方向性を含む",
    ].join("\n"),
    outputSchema: ENGAGEMENT_OUTPUT_SCHEMA,
    cwd: args.cwd,
    timeoutMs: args.timeoutMs ?? 12 * 60 * 1000,
    maxRetries: 2,
  });

  const boringPages = result.per_page_scores
    .filter((p) => p.boring_flagged)
    .map((p) => p.page_no);

  // human_review_required: drop_off_risk >= 50 の page が 3つ以上、または overall >= 50
  const highRiskPages = result.per_page_scores.filter((p) => p.drop_off_risk >= 50).length;
  const hasRewardDensityCritical = rewardDensity.warnings.some(
    (w) => w === "density_critical" || w === "gap_critical",
  );
  const humanReviewRequired =
    highRiskPages >= 3 || result.overall_drop_off_risk >= 50 || hasRewardDensityCritical;

  return {
    schema_version: 2,
    generated_at: new Date().toISOString(),
    slug: bible.meta.slug,
    episode_id: storyboard.episode_id,
    total_pages: storyboard.pages.length,
    overall_drop_off_risk: result.overall_drop_off_risk,
    boring_pages: boringPages,
    worst_page: result.worst_page,
    per_page_scores: result.per_page_scores,
    character_arcs: result.character_arcs,
    reward_interval: result.reward_interval,
    reward_density: rewardDensity,
    human_review_required: humanReviewRequired,
    llm_model: "claude-opus (Codex CLI 経由)",
    rationale_summary: result.rationale_summary,
  };
}

export function normalizeEngagementAuditResult(v: unknown): EngagementAuditResult {
  if (typeof v !== "object" || v === null) {
    throw new Error("engagement audit must be an object");
  }
  const result = v as EngagementAuditResult;
  if (result.schema_version !== 1 && result.schema_version !== 2) {
    throw new Error(`unsupported engagement audit schema_version: ${String(result.schema_version)}`);
  }
  return result;
}

export async function loadEngagementAudit(filePath: string): Promise<EngagementAuditResult> {
  return normalizeEngagementAuditResult(
    JSON.parse(await fs.readFile(filePath, "utf-8")) as unknown,
  );
}

/**
 * engagement_audit.json として書き出す。
 */
export async function saveEngagementAudit(args: {
  slug: string;
  episode: number;
  result: EngagementAuditResult;
  outRoot?: string;
}): Promise<string> {
  const epStr = String(args.episode).padStart(2, "0");
  const outRoot = args.outRoot ?? "data/manga/works";
  const dir = path.join(outRoot, args.slug, "episodes", `ep${epStr}`);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, "engagement_audit.json");
  await fs.writeFile(filePath, JSON.stringify(args.result, null, 2), "utf-8");
  return filePath;
}
