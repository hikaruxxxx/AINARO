/**
 * L4.1 Opening Hook 編集パス (Phase Y WY-1)
 *
 * 設計根拠:
 *   - Plan: /Users/hikarumori/.claude/plans/groovy-wishing-castle.md WY-1
 *   - Codex 全体クオリティ診断指摘 (a07): 「無料試し読み離脱を考えると ナビ登場 p08 / 戦闘 p15 は遅い」
 *   - manga_craft_guide.md v2 章構成 (各話 1-3p で establishing + 主人公 + 期待形成)
 *
 * 役割:
 *   - 既存の L4 storyboard 出力を入力に、pages[0..2] のみを **掴みパターン辞書** に従って再生成
 *   - 全話再生成より低コストで「KU 棚で開いた最初の3p」の品質を底上げ
 *   - 不採用 patterns は data/manga/works/{slug}/episodes/ep{NN}/_opening_alts/ に保管
 *
 * 入出力:
 *   - 入力: bible (tone_profile/genre/characters) + storyboard (既存) + volume_plot (cliffhanger_hook 等)
 *   - 出力: hook_proposals[] (各 patternID ごとの patches) + recommendation (採用推奨1案)
 *
 * Phase Y 後半で:
 *   - 編集判断カードDB の learning_from に各パターンの best/worst を紐付け
 *   - Console から3案並行表示 + 人間判定 UI (WY-7 商品ページOS と統合予定)
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { extractStructuredJson } from "../llm/codex-text";
import type {
  BibleSnapshotV2,
  EpisodeStoryboardV2,
  PanelV2,
  StoryboardPageV2,
  ToneProfile,
} from "../schemas-v2";

// ===== 掴みパターン辞書 (data/generation/opening-hook-patterns.json から読込) =====

export type OpeningHookPattern = {
  id: string;
  name: string;
  description: string;
  best_for_genres: string[];
  best_for_tone: string[];
  structure: Array<{
    page: number;
    panels: Array<{
      panel_no: number;
      shot_type: string;
      importance: number;
      purpose: string;
    }>;
  }>;
  speech_distribution: Record<string, { dialogue: number; monologue: number; narration: number }>;
  narration_quota_total: number;
  first_speech_panel: number;
  examples: { best: string; worst: string };
  expected_effect: string;
};

export type OpeningHookPatternBank = {
  schema_version: 1;
  patterns: OpeningHookPattern[];
  selection_guide: {
    by_tone_profile: Record<string, string[]>;
    by_genre: Record<string, string[]>;
  };
};

let cachedPatterns: OpeningHookPatternBank | null = null;

export async function loadOpeningHookPatterns(
  patternsJsonPath = "data/generation/opening-hook-patterns.json",
): Promise<OpeningHookPatternBank> {
  if (cachedPatterns) return cachedPatterns;
  const buf = await fs.readFile(patternsJsonPath, "utf-8");
  cachedPatterns = JSON.parse(buf) as OpeningHookPatternBank;
  return cachedPatterns;
}

/**
 * tone_profile + genre から候補パターンを抽出。
 * tone と genre の両方で推奨されるパターンを優先 (and)、いずれかで推奨されるものも含める (or fallback)
 */
export function selectCandidatePatterns(
  bank: OpeningHookPatternBank,
  toneProfile: ToneProfile | undefined,
  genre: string | undefined,
): OpeningHookPattern[] {
  const darkness = toneProfile?.darkness ?? 0.5;
  let toneKey: string;
  if (darkness < 0.3) toneKey = "darkness_lt_0_3";
  else if (darkness < 0.5) toneKey = "darkness_0_3_to_0_5";
  else if (darkness < 0.7) toneKey = "darkness_0_5_to_0_7";
  else toneKey = "darkness_gte_0_7";

  const toneIds = new Set(bank.selection_guide.by_tone_profile[toneKey] ?? []);
  const genreIds = new Set(genre ? (bank.selection_guide.by_genre[genre] ?? []) : []);

  // intersection 優先、空なら union
  const intersection = bank.patterns.filter(
    (p) => toneIds.has(p.id) && genreIds.has(p.id),
  );
  if (intersection.length > 0) return intersection;
  return bank.patterns.filter((p) => toneIds.has(p.id) || genreIds.has(p.id));
}

// ===== Hook 編集パス本体 =====

export type HookProposalPanel = {
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

export type HookProposalPage = {
  page_no: number;
  page_role: "opening_hook" | "buildup";
  panels: HookProposalPanel[];
};

export type HookProposal = {
  pattern_id: string;
  pattern_name: string;
  pages: HookProposalPage[];
  rationale: string;
  expected_effect: string;
  warnings?: string[];
};

export type OpeningHookOutput = {
  schema_version: 1;
  generated_at: string;
  slug: string;
  episode: number;
  source_storyboard_pages_0_2: StoryboardPageV2[];
  candidate_patterns: string[];
  proposals: HookProposal[];
  recommendation: {
    pattern_id: string;
    rationale: string;
  };
};

/**
 * Codex に「掴みパターンに従って pages[0..2] を再生成」させる。
 * 全候補パターンに対して提案を1つずつ作る (3案並行生成、ユーザー判定 or audit で 1案採用)
 */
export async function generateOpeningHookProposals(args: {
  bible: BibleSnapshotV2;
  storyboard: EpisodeStoryboardV2;
  cliffhangerHook?: string;
  patternsBank: OpeningHookPatternBank;
  cwd?: string;
  timeoutMs?: number;
  maxProposals?: number;
}): Promise<OpeningHookOutput> {
  const { bible, storyboard, patternsBank } = args;
  const maxProposals = args.maxProposals ?? 3;

  const candidates = selectCandidatePatterns(
    patternsBank,
    bible.meta.tone_profile,
    bible.meta.genre,
  );
  const selected = candidates.slice(0, maxProposals);
  if (selected.length === 0) {
    // フォールバック: 全パターンから先頭3件
    selected.push(...patternsBank.patterns.slice(0, maxProposals));
  }

  // 既存 pages[0..2] のスナップショット (差し替え対象)
  const sourcePages = storyboard.pages.slice(0, 3);

  const proposals: HookProposal[] = [];
  for (const pattern of selected) {
    const proposal = await generateSingleHookProposal({
      bible,
      storyboard,
      cliffhangerHook: args.cliffhangerHook,
      pattern,
      sourcePages,
      cwd: args.cwd,
      timeoutMs: args.timeoutMs,
    });
    proposals.push(proposal);
  }

  // recommendation: 候補1番目 (selection_guide で優先度が高い) を推奨
  const recommendation = {
    pattern_id: selected[0].id,
    rationale: `tone_profile.darkness=${bible.meta.tone_profile?.darkness ?? "unset"} / genre=${bible.meta.genre ?? "unset"} の組み合わせで selection_guide が最初に推奨するパターン`,
  };

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    slug: bible.meta.slug,
    episode: storyboard.episode_id ? parseInt(storyboard.episode_id.split("ep")[1] ?? "1", 10) : 1,
    source_storyboard_pages_0_2: sourcePages,
    candidate_patterns: selected.map((p) => p.id),
    proposals,
    recommendation,
  };
}

const HOOK_OUTPUT_SCHEMA = `
type HookProposalOutput = {
  pattern_id: string;
  pattern_name: string;
  rationale: string;            // この提案を採用すべき理由 100字
  expected_effect: string;       // 期待効果 (hook_strength +0.X / character_depth +0.X 等)
  pages: Array<{
    page_no: number;             // 1, 2, 3
    page_role: "opening_hook" | "buildup";
    panels: Array<{
      panel_no: number;
      shot_type: string;          // establishing / wide / medium / close_up / over_the_shoulder
      importance: number;         // 1-5
      silence: boolean;
      action: string;             // 1-2文の panel 内アクション
      key_visual: string;         // 1文の視覚的フォーカス
      dialogue: Array<{ character_id: string; text: string }>;
      monologue: Array<{ character_id: string; text: string }>;
      narration: string[];        // 雲型でない地のナレ
      sfx: string[];
    }>;
  }>;
  warnings?: string[];           // 採用時のリスクメモ
};
`;

async function generateSingleHookProposal(args: {
  bible: BibleSnapshotV2;
  storyboard: EpisodeStoryboardV2;
  cliffhangerHook?: string;
  pattern: OpeningHookPattern;
  sourcePages: StoryboardPageV2[];
  cwd?: string;
  timeoutMs?: number;
}): Promise<HookProposal> {
  const { bible, storyboard, pattern, sourcePages } = args;

  // 既存 pages[0..2] の本文を抜き出す (Codex に「これを書き直す」と指示するため)
  const existingPagesSummary = sourcePages
    .map((page) => {
      const panelLines = page.panels.map((panel) => {
        const speech = [
          ...panel.dialogue.map((d) => `dialogue [${d.character_id}]: ${d.text}`),
          ...panel.monologue.map((m) => `monologue [${m.character_id}]: ${m.text}`),
          ...panel.narration.map((n) => `narration: ${n}`),
        ].join(" / ");
        return `  panel#${panel.panel_no} (${panel.shot_type}, importance=${panel.importance}): ${panel.action} ${speech ? "| " + speech : ""}`;
      });
      return `page ${page.page_no} (${page.page_role}):\n${panelLines.join("\n")}`;
    })
    .join("\n\n");

  // 主要キャラを bible から抽出 (主人公 + ヒロイン格)
  const charsBlock = bible.characters
    .slice(0, 10)
    .map((c) => `- ${c.id} :: ${c.name} (${c.role})`)
    .join("\n");

  // 構造ガイド (パターンの structure を文字列化)
  const structureGuide = pattern.structure
    .map((p) => {
      const panelLines = p.panels.map(
        (panel) =>
          `    panel#${panel.panel_no}: shot_type=${panel.shot_type}, importance=${panel.importance}, purpose=${panel.purpose}`,
      );
      return `  page ${p.page}:\n${panelLines.join("\n")}`;
    })
    .join("\n");

  const speechDistGuide = Object.entries(pattern.speech_distribution)
    .map(([page, dist]) => `  ${page}: dialogue=${dist.dialogue}, monologue=${dist.monologue}, narration=${dist.narration}`)
    .join("\n");

  const result = await extractStructuredJson<{
    pattern_id: string;
    pattern_name: string;
    rationale: string;
    expected_effect: string;
    pages: Array<{
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
    }>;
    warnings?: string[];
  }>({
    systemContext: [
      "あなたは商業漫画 (なろう系コミカライズ、KDP+KU 1巻10万円目標) の編集者として、",
      "**1話の最初の3ページ (pages[0..2])** を再構築する責務を担います。",
      "",
      "目的:",
      "- KU 棚で開いた最初の3ページで読者を確実に引き込む",
      "- 既存の物語の流れ (世界観/主人公/関係性) は壊さない、最小侵襲リライト",
      "- 与えられた **掴みパターン** の構造に従って再構成 (structure / speech_distribution を厳守)",
      "",
      "重要ルール:",
      "- character_id は必ず bible 内の既存IDを使う。新規キャラ・自由文字列は禁止",
      "- 1コマあたり吹き出し合計 0-2 個、合計文字数 80字以内",
      "- silence panel は dialogue/monologue/narration/sfx 全空",
      "- ナレーション禁則: 各 page の narration 数は speech_distribution の上限を超えない",
      "- 主人公の独白(雲型)は monologue として明示、地のナレと混ぜない",
      "- パターンの structure に書かれた shot_type / importance / purpose を尊重",
    ].join("\n"),
    materials: {
      bible_meta: JSON.stringify(
        {
          slug: bible.meta.slug,
          title: bible.meta.title,
          genre: bible.meta.genre,
          art_style: bible.meta.art_style,
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
      pattern_structure: structureGuide,
      pattern_speech_distribution: speechDistGuide,
      pattern_narration_quota: String(pattern.narration_quota_total),
      pattern_first_speech_panel: String(pattern.first_speech_panel),
      pattern_examples_best: pattern.examples.best,
      pattern_examples_worst: pattern.examples.worst,
      pattern_expected_effect: pattern.expected_effect,
      cliffhanger_hook: args.cliffhangerHook ?? "(cliffhanger_hook 未指定)",
      existing_pages_0_2: existingPagesSummary,
      total_pages_in_episode: String(storyboard.pages.length),
    },
    instruction: [
      `第${storyboard.episode_id}の pages[0..2] を、掴みパターン「${pattern.name}」に従って再構成してください。`,
      `- pattern.structure の panel 配置を骨格に、bible の主人公・世界観・visual_motifs を肉付け`,
      `- 既存の物語流れを参考にしつつ、より KU 読者を引き込む構成に最適化`,
      `- speech_distribution / narration_quota / first_speech_panel を厳守`,
      `- 1パターン分の提案 (HookProposalOutput 1件) を返却`,
    ].join("\n"),
    outputSchema: HOOK_OUTPUT_SCHEMA,
    cwd: args.cwd,
    timeoutMs: args.timeoutMs ?? 8 * 60 * 1000,
    maxRetries: 2,
  });

  return {
    pattern_id: pattern.id,
    pattern_name: pattern.name,
    rationale: result.rationale,
    expected_effect: result.expected_effect,
    pages: result.pages.map((page) => ({
      page_no: page.page_no,
      page_role: page.page_role as "opening_hook" | "buildup",
      panels: page.panels.map((panel) => ({
        panel_no: panel.panel_no,
        shot_type: panel.shot_type,
        importance: panel.importance,
        silence: panel.silence,
        action: panel.action,
        key_visual: panel.key_visual,
        dialogue: panel.dialogue,
        monologue: panel.monologue,
        narration: panel.narration,
        sfx: panel.sfx,
      })),
    })),
    warnings: result.warnings,
  };
}

/**
 * HookProposal を既存 storyboard.pages[0..2] にマージするヘルパー。
 * panel_id / reading_order / entities (location_id など) は既存 panel から継承する保守的方針。
 *
 * 注: panel 数が変わる場合 (パターン structure が pages 1=5/2=5/3=5 を強制している場合)、
 * 既存 panel を削減する操作になる。物語整合のため別途人間判定が必要。
 */
export function mergeHookProposalIntoStoryboard(
  storyboard: EpisodeStoryboardV2,
  proposal: HookProposal,
): EpisodeStoryboardV2 {
  const updated: EpisodeStoryboardV2 = {
    ...storyboard,
    pages: storyboard.pages.map((page) => {
      const proposed = proposal.pages.find((p) => p.page_no === page.page_no);
      if (!proposed) return page;

      // 既存 panel を panel_no で索引化
      const existingPanelByNo = new Map(page.panels.map((p) => [p.panel_no, p]));

      // proposed.panels を既存 panel と merge (新規 panel_no は新 panel として追加)
      const mergedPanels: PanelV2[] = proposed.panels.map((pp) => {
        const existing = existingPanelByNo.get(pp.panel_no);
        if (existing) {
          // 既存 panel のフィールドを上書き
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
        // 新規 panel
        return {
          panel_id: `p${String(pp.panel_no).padStart(2, "0")}_hook_${proposal.pattern_id}`,
          panel_no: pp.panel_no,
          reading_order: pp.panel_no,
          shot_type: pp.shot_type as PanelV2["shot_type"],
          camera: "eye_level" as PanelV2["camera"],
          bleed: false,
          silence: pp.silence,
          importance: pp.importance as PanelV2["importance"],
          entities: {
            characters: [],
            // 簡略化: 同 page 既存 panel から継承
            location_id: page.panels[0]?.entities.location_id ?? "",
            props: [],
            focus_entity_id: page.panels[0]?.entities.focus_entity_id ?? "",
          },
          action: pp.action,
          key_visual: pp.key_visual,
          dialogue: pp.dialogue,
          monologue: pp.monologue,
          narration: pp.narration,
          sfx: pp.sfx,
        };
      });

      return {
        ...page,
        page_role: proposed.page_role as StoryboardPageV2["page_role"],
        panels: mergedPanels,
      };
    }),
  };

  return updated;
}

/**
 * 不採用 patterns を保管 (data/manga/works/{slug}/episodes/ep{NN}/_opening_alts/)
 * Phase Y 後半 + Phase Z で編集判断カードDBの learning_from に紐付ける学習資産化用。
 */
export async function saveOpeningHookAlts(args: {
  slug: string;
  episode: number;
  output: OpeningHookOutput;
  outRoot?: string;
}): Promise<string> {
  const epStr = String(args.episode).padStart(2, "0");
  const outRoot = args.outRoot ?? "data/manga/works";
  const dir = path.join(
    outRoot,
    args.slug,
    "episodes",
    `ep${epStr}`,
    "_opening_alts",
  );
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `proposals-${new Date().toISOString().slice(0, 10)}.json`);
  await fs.writeFile(filePath, JSON.stringify(args.output, null, 2), "utf-8");
  return filePath;
}
