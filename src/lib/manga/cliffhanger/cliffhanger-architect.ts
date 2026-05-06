/**
 * L4.9 Cliffhanger Architect (Phase Y WY-3)
 *
 * 設計根拠:
 *   - Plan: /Users/hikarumori/.claude/plans/groovy-wishing-castle.md WY-3
 *   - Codex 全体クオリティ診断 (a07): 「ep10 末『第2巻で』のメタ台詞は商業本文では避けるべき」
 *   - manga_craft_guide.md v2: 章構成 (各話末 cliffhanger 強化、巻末は次巻 buy 誘発)
 *
 * 役割:
 *   - 既存 storyboard の last_page を引きパターンに従って再設計
 *   - PullLink (current_episode_cliff + next_opening_hook_hint) を episode に注入
 *   - 巻末の場合は next_volume_foreshadow と組み合わせて next_volume_teaser も生成
 *
 * WY-1 (Opening Hook) との連携:
 *   - ep_N の pull_link.next_opening_hook_hint を ep_N+1 の Opening Hook 編集パスに渡す
 *   - 引き ↔ 開きが2話間で一貫する設計を保証
 *
 * Phase Y 後半で:
 *   - Console UI から3案並行表示 + 人間判定 (WY-7 商品ページOS と統合)
 *   - 編集判断カードDB の learning_from に各パターンの best/worst を紐付け
 *   - Phase Z WZ-2 で実 KENP 取得後、パターン別の次話 read-through を計測
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { extractStructuredJson } from "../llm/codex-text";
import type {
  BibleSnapshotV2,
  CliffhangerPatternId,
  EpisodeStoryboardV2,
  PanelV2,
  PullLink,
  StoryboardPageV2,
  ToneProfile,
} from "../schemas-v2";

// ===== 引きパターン辞書 (data/generation/cliffhanger-patterns.json から読込) =====

export type CliffhangerPattern = {
  id: CliffhangerPatternId;
  name: string;
  description: string;
  best_for_genres: string[];
  best_for_volume_position: string[];
  best_for_tone: string[];
  structure: {
    last_page_panel_count: number;
    last_page_importance_pattern: number[];
    last_panel_design: {
      shot_type: string;
      key_visual: string;
      speech: string;
      sfx: string;
    };
  };
  next_opening_hook_examples: string[];
  examples: { best: string; worst: string };
  expected_effect: string;
};

export type CliffhangerPatternBank = {
  schema_version: 1;
  patterns: CliffhangerPattern[];
  selection_guide: {
    by_volume_position: Record<string, string[]>;
    by_tone_profile: Record<string, string[]>;
    by_genre: Record<string, string[]>;
  };
};

let cachedPatterns: CliffhangerPatternBank | null = null;

export async function loadCliffhangerPatterns(
  patternsJsonPath = "data/generation/cliffhanger-patterns.json",
): Promise<CliffhangerPatternBank> {
  if (cachedPatterns) return cachedPatterns;
  const buf = await fs.readFile(patternsJsonPath, "utf-8");
  cachedPatterns = JSON.parse(buf) as CliffhangerPatternBank;
  return cachedPatterns;
}

/**
 * tone + genre + volume_position から候補パターンを抽出。
 * 3軸の intersection を最優先 → 2軸 → 1軸の順で fallback。
 */
export function selectCliffhangerCandidates(
  bank: CliffhangerPatternBank,
  toneProfile: ToneProfile | undefined,
  genre: string | undefined,
  volumePosition: "early" | "mid" | "late" | "volume_end",
): CliffhangerPattern[] {
  const darkness = toneProfile?.darkness ?? 0.5;
  let toneKey: string;
  if (darkness < 0.3) toneKey = "darkness_lt_0_3";
  else if (darkness < 0.5) toneKey = "darkness_0_3_to_0_5";
  else if (darkness < 0.7) toneKey = "darkness_0_5_to_0_7";
  else toneKey = "darkness_gte_0_7";

  const toneIds = new Set(bank.selection_guide.by_tone_profile[toneKey] ?? []);
  const genreIds = new Set(genre ? (bank.selection_guide.by_genre[genre] ?? []) : []);
  const positionIds = new Set(
    bank.selection_guide.by_volume_position[volumePosition] ?? [],
  );

  // 3軸 intersection
  const triple = bank.patterns.filter(
    (p) => toneIds.has(p.id) && genreIds.has(p.id) && positionIds.has(p.id),
  );
  if (triple.length > 0) return triple;

  // 2軸 intersection (genre + position 優先、tone は弱め)
  const genrePosition = bank.patterns.filter(
    (p) => genreIds.has(p.id) && positionIds.has(p.id),
  );
  if (genrePosition.length > 0) return genrePosition;

  const tonePosition = bank.patterns.filter(
    (p) => toneIds.has(p.id) && positionIds.has(p.id),
  );
  if (tonePosition.length > 0) return tonePosition;

  // 1軸 (volume_position 優先)
  return bank.patterns.filter((p) => positionIds.has(p.id));
}

// ===== Cliffhanger 編集パス本体 =====

export type CliffhangerProposalPanel = {
  panel_no: number;
  shot_type: string;
  importance: number;
  silence: boolean;
  action: string;
  key_visual: string;
  dialogue: Array<{ character_id: string; text: string }>;
  monologue: Array<{ character_id: string; text: string }>;
  narration: string[];
  sfx: string[];
};

export type CliffhangerProposal = {
  pattern_id: CliffhangerPatternId;
  pattern_name: string;
  rationale: string;
  expected_effect: string;
  /** 再設計された last_page (last_page_no と panels) */
  last_page: {
    page_no: number;
    page_role: "cliffhanger";
    panels: CliffhangerProposalPanel[];
  };
  /** 次話/次巻への接続情報 */
  pull_link: PullLink;
  warnings?: string[];
};

export type CliffhangerOutput = {
  schema_version: 1;
  generated_at: string;
  slug: string;
  episode: number;
  source_last_page: StoryboardPageV2;
  volume_position: "early" | "mid" | "late" | "volume_end";
  candidate_patterns: CliffhangerPatternId[];
  proposals: CliffhangerProposal[];
  recommendation: {
    pattern_id: CliffhangerPatternId;
    rationale: string;
  };
};

/**
 * 引きパターンに従って last_page を再設計する Codex 依頼。
 * 全候補パターンに対して提案を1つずつ作る (3案並行生成想定)。
 */
export async function generateCliffhangerProposals(args: {
  bible: BibleSnapshotV2;
  storyboard: EpisodeStoryboardV2;
  volumePosition: "early" | "mid" | "late" | "volume_end";
  patternsBank: CliffhangerPatternBank;
  cwd?: string;
  timeoutMs?: number;
  maxProposals?: number;
}): Promise<CliffhangerOutput> {
  const { bible, storyboard, patternsBank, volumePosition } = args;
  const maxProposals = args.maxProposals ?? 3;

  const candidates = selectCliffhangerCandidates(
    patternsBank,
    bible.meta.tone_profile,
    bible.meta.genre,
    volumePosition,
  );
  const selected = candidates.slice(0, maxProposals);
  if (selected.length === 0) {
    selected.push(...patternsBank.patterns.slice(0, maxProposals));
  }

  // last_page を取得
  const lastPage = storyboard.pages[storyboard.pages.length - 1];
  if (!lastPage) {
    throw new Error("storyboard.pages が空です");
  }

  const proposals: CliffhangerProposal[] = [];
  for (const pattern of selected) {
    const proposal = await generateSingleCliffhangerProposal({
      bible,
      storyboard,
      lastPage,
      pattern,
      volumePosition,
      cwd: args.cwd,
      timeoutMs: args.timeoutMs,
    });
    proposals.push(proposal);
  }

  const recommendation = {
    pattern_id: selected[0].id,
    rationale: `tone=${bible.meta.tone_profile?.darkness ?? "unset"} / genre=${bible.meta.genre ?? "unset"} / volume_position=${volumePosition} の組み合わせで selection_guide が最初に推奨するパターン`,
  };

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    slug: bible.meta.slug,
    episode: storyboard.episode_id
      ? parseInt(storyboard.episode_id.split("ep")[1] ?? "1", 10)
      : 1,
    source_last_page: lastPage,
    volume_position: volumePosition,
    candidate_patterns: selected.map((p) => p.id),
    proposals,
    recommendation,
  };
}

const CLIFF_OUTPUT_SCHEMA = `
type CliffhangerProposalOutput = {
  pattern_id: string;
  pattern_name: string;
  rationale: string;             // 採用理由 100字以内
  expected_effect: string;        // 期待効果
  last_page: {
    page_no: number;
    page_role: "cliffhanger";
    panels: Array<{
      panel_no: number;
      shot_type: string;
      importance: number;          // 1-5
      silence: boolean;
      action: string;
      key_visual: string;
      dialogue: Array<{ character_id: string; text: string }>;
      monologue: Array<{ character_id: string; text: string }>;
      narration: string[];
      sfx: string[];
    }>;
  };
  pull_link: {
    current_episode_cliff: string;       // pattern_id と同じ
    next_opening_hook_hint: string;      // 次話 opening の予告 30字以上
    is_volume_end: boolean;
    next_volume_teaser?: string;          // 巻末の場合のみ
  };
  warnings?: string[];
};
`;

async function generateSingleCliffhangerProposal(args: {
  bible: BibleSnapshotV2;
  storyboard: EpisodeStoryboardV2;
  lastPage: StoryboardPageV2;
  pattern: CliffhangerPattern;
  volumePosition: "early" | "mid" | "late" | "volume_end";
  cwd?: string;
  timeoutMs?: number;
}): Promise<CliffhangerProposal> {
  const { bible, storyboard, lastPage, pattern, volumePosition } = args;

  // 既存 last_page の本文を抜き出す
  const existingPageSummary = (() => {
    const panelLines = lastPage.panels.map((panel) => {
      const speech = [
        ...panel.dialogue.map((d) => `dialogue [${d.character_id}]: ${d.text}`),
        ...panel.monologue.map((m) => `monologue [${m.character_id}]: ${m.text}`),
        ...panel.narration.map((n) => `narration: ${n}`),
      ].join(" / ");
      return `  panel#${panel.panel_no} (${panel.shot_type}, importance=${panel.importance}): ${panel.action} ${speech ? "| " + speech : ""}`;
    });
    return `page ${lastPage.page_no} (${lastPage.page_role}):\n${panelLines.join("\n")}`;
  })();

  const charsBlock = bible.characters
    .slice(0, 10)
    .map((c) => `- ${c.id} :: ${c.name} (${c.role})`)
    .join("\n");

  const importancePatternStr = pattern.structure.last_page_importance_pattern.join(" / ");

  const result = await extractStructuredJson<{
    pattern_id: string;
    pattern_name: string;
    rationale: string;
    expected_effect: string;
    last_page: {
      page_no: number;
      page_role: string;
      panels: Array<{
        panel_no: number;
        shot_type: string;
        importance: number;
        silence: boolean;
        action: string;
        key_visual: string;
        dialogue: Array<{ character_id: string; text: string }>;
        monologue: Array<{ character_id: string; text: string }>;
        narration: string[];
        sfx: string[];
      }>;
    };
    pull_link: {
      current_episode_cliff: string;
      next_opening_hook_hint: string;
      is_volume_end: boolean;
      next_volume_teaser?: string;
    };
    warnings?: string[];
  }>({
    systemContext: [
      "あなたは商業漫画 (なろう系コミカライズ、KDP+KU 1巻10万円目標) の編集者として、",
      "**1話の最終ページ (last_page、page_role=cliffhanger)** を引きパターンに従って再設計します。",
      "",
      "目的:",
      "- 次話/次巻の購読率を最大化する「引き」を作る",
      "- 既存の物語の流れを壊さず、最終 panel に視線の山を作る",
      "- パターンの structure (last_page_importance_pattern / last_panel_design) を厳守",
      "",
      "重要ルール:",
      "- character_id は bible 内の既存IDのみ使用",
      "- 1コマあたり吹き出し合計 0-2 個、合計文字数 80字以内",
      "- silence panel は dialogue/monologue/narration/sfx 全空",
      "- 最終 panel は importance=5 必須 (manga_craft_guide v2)",
      "- next_opening_hook_hint は最低30字 (次話 opening の設計に使うので具体的に)",
      "- 巻末でない場合 (volume_position !== volume_end) は next_volume_teaser を返さない",
      "- メタ台詞 (「次巻で」「To be continued」など作中キャラが言わない言葉) は避ける",
    ].join("\n"),
    materials: {
      bible_meta: JSON.stringify(
        {
          slug: bible.meta.slug,
          title: bible.meta.title,
          genre: bible.meta.genre,
          tone_profile: bible.meta.tone_profile,
          profile_id: bible.meta.profile_id,
        },
        null,
        2,
      ),
      characters: charsBlock,
      visual_motifs: JSON.stringify(bible.visual_motifs ?? [], null, 2),
      pattern_id: pattern.id,
      pattern_name: pattern.name,
      pattern_description: pattern.description,
      pattern_importance_pattern: importancePatternStr,
      pattern_panel_design: JSON.stringify(pattern.structure.last_panel_design, null, 2),
      pattern_next_opening_examples: pattern.next_opening_hook_examples.join(" / "),
      pattern_examples_best: pattern.examples.best,
      pattern_examples_worst: pattern.examples.worst,
      pattern_expected_effect: pattern.expected_effect,
      volume_position: volumePosition,
      existing_last_page: existingPageSummary,
      total_pages: String(storyboard.pages.length),
    },
    instruction: [
      `第${storyboard.episode_id} の最終ページ (page ${lastPage.page_no}) を、`,
      `引きパターン「${pattern.name}」に従って再設計してください。`,
      `- last_page_importance_pattern: ${importancePatternStr} を尊重 (5 panel 想定)`,
      `- 最終 panel に視線の山 (importance=5) を作る`,
      `- pull_link.next_opening_hook_hint は次話 opening_hook の設計者が読んでも分かる具体的な予告 (30字以上)`,
      `- volume_position=${volumePosition}: ${volumePosition === "volume_end" ? "巻末。next_volume_teaser も生成し、is_volume_end=true" : "話末 (巻内連続)。is_volume_end=false、next_volume_teaser 不要"}`,
      `- メタ台詞禁則を厳守`,
    ].join("\n"),
    outputSchema: CLIFF_OUTPUT_SCHEMA,
    cwd: args.cwd,
    timeoutMs: args.timeoutMs ?? 8 * 60 * 1000,
    maxRetries: 2,
  });

  return {
    pattern_id: pattern.id,
    pattern_name: pattern.name,
    rationale: result.rationale,
    expected_effect: result.expected_effect,
    last_page: {
      page_no: result.last_page.page_no,
      page_role: "cliffhanger",
      panels: result.last_page.panels.map((p) => ({
        panel_no: p.panel_no,
        shot_type: p.shot_type,
        importance: p.importance,
        silence: p.silence,
        action: p.action,
        key_visual: p.key_visual,
        dialogue: p.dialogue,
        monologue: p.monologue,
        narration: p.narration,
        sfx: p.sfx,
      })),
    },
    pull_link: {
      current_episode_cliff: result.pull_link.current_episode_cliff as CliffhangerPatternId,
      next_opening_hook_hint: result.pull_link.next_opening_hook_hint,
      is_volume_end: result.pull_link.is_volume_end,
      next_volume_teaser: result.pull_link.next_volume_teaser,
    },
    warnings: result.warnings,
  };
}

/**
 * CliffhangerProposal を既存 storyboard の last_page にマージ。
 * pull_link は EpisodeStoryboardV2.pull_link に書き込む。
 */
export function mergeCliffhangerProposalIntoStoryboard(
  storyboard: EpisodeStoryboardV2,
  proposal: CliffhangerProposal,
): EpisodeStoryboardV2 {
  const lastIdx = storyboard.pages.length - 1;
  const lastPage = storyboard.pages[lastIdx];
  if (!lastPage) return storyboard;

  // 既存 panel を panel_no で索引化
  const existingPanelByNo = new Map(lastPage.panels.map((p) => [p.panel_no, p]));

  const mergedPanels: PanelV2[] = proposal.last_page.panels.map((pp) => {
    const existing = existingPanelByNo.get(pp.panel_no);
    if (existing) {
      return {
        ...existing,
        shot_type: pp.shot_type as PanelV2["shot_type"],
        importance: pp.importance as PanelV2["importance"],
        silence: pp.silence,
        action: pp.action,
        key_visual: pp.key_visual,
        dialogue: pp.dialogue,
        monologue: pp.monologue,
        narration: pp.narration,
        sfx: pp.sfx,
      };
    }
    return {
      panel_id: `p${String(pp.panel_no).padStart(2, "0")}_cliff_${proposal.pattern_id}`,
      panel_no: pp.panel_no,
      reading_order: pp.panel_no,
      shot_type: pp.shot_type as PanelV2["shot_type"],
      camera: "eye_level" as PanelV2["camera"],
      bleed: false,
      silence: pp.silence,
      importance: pp.importance as PanelV2["importance"],
      entities: {
        characters: [],
        location_id: lastPage.panels[0]?.entities.location_id ?? "",
        props: [],
        focus_entity_id: lastPage.panels[0]?.entities.focus_entity_id ?? "",
      },
      action: pp.action,
      key_visual: pp.key_visual,
      dialogue: pp.dialogue,
      monologue: pp.monologue,
      narration: pp.narration,
      sfx: pp.sfx,
    };
  });

  const updatedPages = storyboard.pages.map((page, idx) => {
    if (idx !== lastIdx) return page;
    return {
      ...page,
      page_role: "cliffhanger" as StoryboardPageV2["page_role"],
      panels: mergedPanels,
    };
  });

  return {
    ...storyboard,
    pages: updatedPages,
    pull_link: proposal.pull_link,
  };
}

/**
 * 不採用 patterns を保管 (data/manga/works/{slug}/episodes/ep{NN}/_cliffhanger_alts/)
 */
export async function saveCliffhangerAlts(args: {
  slug: string;
  episode: number;
  output: CliffhangerOutput;
  outRoot?: string;
}): Promise<string> {
  const epStr = String(args.episode).padStart(2, "0");
  const outRoot = args.outRoot ?? "data/manga/works";
  const dir = path.join(
    outRoot,
    args.slug,
    "episodes",
    `ep${epStr}`,
    "_cliffhanger_alts",
  );
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(
    dir,
    `proposals-${new Date().toISOString().slice(0, 10)}.json`,
  );
  await fs.writeFile(filePath, JSON.stringify(args.output, null, 2), "utf-8");
  return filePath;
}
