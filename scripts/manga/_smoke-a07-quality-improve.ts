/**
 * a07-modern-dungeon ep01 品質改善ピンポイント監査
 *
 * 設計根拠:
 *   - ユーザー指示 (2026-05-06): 現代ダンジョンもの (a07) の品質を商業水準まで上げる
 *   - Phase X 効果検証で出た findings 6件の修正対象を panel 内容と紐付ける
 *
 * 目的:
 *   - 各 finding を「どの panel/page」「panel の本文(dialogue/monologue/narration)」と紐付け
 *   - Codex に修正提案を作らせるための材料データ (input pack) を生成
 *   - 結果は data/eval/a07-quality-improve/ に保存
 *
 * 出力:
 *   - findings-detailed.json (各 finding に panel 内容を貼り付けた詳細レポート)
 *   - codex-input-pack.md (Codex に渡す修正依頼プロンプト)
 *
 * 使い方: npx tsx scripts/manga/_smoke-a07-quality-improve.ts
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import {
  auditPage,
  auditVolume,
  type AuditFinding,
} from "../../src/lib/manga/name-preview/audit-rules";
import type {
  EpisodeStoryboardV2,
  PanelV2,
  StoryboardPageV2,
  ToneProfile,
} from "../../src/lib/manga/schemas-v2";

const ROOT = path.resolve(__dirname, "../..");
const SLUG = "a07-modern-dungeon";
const EP = 1;
const OUT_DIR = path.join(ROOT, "data/eval/a07-quality-improve");

// light_recovery 想定の tone_profile (a07 を「商業ラノベの軽快な読み心地」に寄せる)
const TARGET_TONE: ToneProfile = {
  darkness: 0.3,
  comedic_density: 0.8,
  recovery_cadence: 0.9,
  sidekick_presence: 0.9,
};

function ensureDir(p: string): void {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function readJson<T>(p: string): T {
  return JSON.parse(readFileSync(p, "utf-8")) as T;
}

function panelText(panel: PanelV2): string {
  const lines: string[] = [];
  if (panel.dialogue.length > 0) {
    for (const d of panel.dialogue) {
      lines.push(`  dialogue [${d.character_id}]: 「${d.text}」`);
    }
  }
  if (panel.monologue.length > 0) {
    for (const m of panel.monologue) {
      lines.push(`  monologue [${m.character_id}]: (${m.text})`);
    }
  }
  if (panel.narration.length > 0) {
    for (const n of panel.narration) {
      lines.push(`  narration: 〔${n}〕`);
    }
  }
  if (panel.sfx.length > 0) {
    lines.push(`  sfx: ${panel.sfx.join(" / ")}`);
  }
  return lines.length > 0 ? lines.join("\n") : "  (silence panel)";
}

function findPanelByNo(
  storyboard: EpisodeStoryboardV2,
  pageNo: number,
  panelNo: number,
): { page: StoryboardPageV2; panel: PanelV2 } | null {
  for (const page of storyboard.pages) {
    if (page.page_no !== pageNo) continue;
    for (const panel of page.panels) {
      if (panel.panel_no === panelNo) return { page, panel };
    }
  }
  return null;
}

async function main(): Promise<void> {
  ensureDir(OUT_DIR);

  const storyboardPath = path.join(
    ROOT,
    `data/manga/works/${SLUG}/episodes/ep${String(EP).padStart(2, "0")}/storyboard.json`,
  );
  const storyboard = readJson<EpisodeStoryboardV2>(storyboardPath);

  // panel + volume 監査
  const allPageFindings: AuditFinding[] = [];
  for (const page of storyboard.pages) {
    const findings = auditPage({ page, refsExists: () => true });
    allPageFindings.push(...findings);
  }
  const volumeFindings = auditVolume({
    episodes: [storyboard],
    toneProfile: TARGET_TONE,
  });
  const allFindings = [...allPageFindings, ...volumeFindings];

  // 各 finding に panel 内容を紐付ける
  const detailed = allFindings.map((f) => {
    const ctx: Record<string, unknown> = {
      rule: f.rule,
      severity: f.severity,
      message: f.message,
      page_no: f.page_no,
      panel_no: f.panel_no ?? null,
    };
    if (f.panel_no && f.page_no) {
      const found = findPanelByNo(storyboard, f.page_no, f.panel_no);
      if (found) {
        ctx.page_role = found.page.page_role;
        ctx.panel_shot_type = found.panel.shot_type;
        ctx.panel_importance = found.panel.importance;
        ctx.panel_silence = found.panel.silence;
        ctx.panel_action = found.panel.action;
        ctx.panel_dialogue_chars = found.panel.dialogue.reduce(
          (s, d) => s + d.text.length,
          0,
        );
        ctx.panel_monologue_chars = found.panel.monologue.reduce(
          (s, m) => s + m.text.length,
          0,
        );
        ctx.panel_narration_chars = found.panel.narration.reduce(
          (s, n) => s + n.length,
          0,
        );
        ctx.panel_text = panelText(found.panel);
      }
    }
    return ctx;
  });

  // ページごとの全 panel テキスト (Codex がコンテキスト取れるよう全文入れる)
  const pagesFull = storyboard.pages.map((page) => ({
    page_no: page.page_no,
    page_role: page.page_role,
    panels: page.panels.map((p) => ({
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
      text: panelText(p),
    })),
  }));

  // findings-detailed.json
  const findingsDetailedPath = path.join(OUT_DIR, "findings-detailed.json");
  writeFileSync(
    findingsDetailedPath,
    JSON.stringify(
      {
        schema_version: 1,
        generated_at: new Date().toISOString(),
        slug: SLUG,
        episode: EP,
        target_tone: TARGET_TONE,
        target_tone_rationale:
          "Phase A 標準 light_recovery (現代ダンジョンの「軽快な読み心地」を狙う)",
        total_findings: detailed.length,
        findings_detailed: detailed,
      },
      null,
      2,
    ),
    "utf-8",
  );

  // codex-input-pack.md (Codex に渡す依頼書)
  const findingsByRule: Record<string, typeof detailed> = {};
  for (const d of detailed) {
    const rule = d.rule as string;
    findingsByRule[rule] = findingsByRule[rule] ?? [];
    findingsByRule[rule].push(d);
  }

  const codexPrompt = [
    `# a07-modern-dungeon ep01 品質改善依頼`,
    ``,
    `## 背景`,
    `- 作品: 「Fランク探索者の俺にだけ聞こえるんだけど…〜システム音声【ナビ】が現代ダンジョンの隠しルール全部教えてくれるから、世界最速でレベルアップした件〜」`,
    `- ジャンル: 主人公最強無双 (現代ダンジョン)`,
    `- art_style: manga_bw_seinen_urban`,
    `- 目標: KDP+KU で 1巻10万円/月を安定的に量産できる「軽快に読める商業ラノベ品質」`,
    `- 目標 tone_profile: darkness=${TARGET_TONE.darkness} / comedic_density=${TARGET_TONE.comedic_density} / recovery_cadence=${TARGET_TONE.recovery_cadence} / sidekick_presence=${TARGET_TONE.sidekick_presence}`,
    ``,
    `## 構造`,
    `- 22ページ × 5 panel/page = 110 panels`,
    `- page_role 分布: opening_hook(1-2) / buildup(3-7,13-14) / reveal(8-10) / action(11,15-18) / establishing(12) / aftermath(19-20) / cliffhanger(21-22)`,
    ``,
    `## Phase X audit 検出問題 ${detailed.length}件`,
    ``,
    ...Object.entries(findingsByRule).flatMap(([rule, items]) => [
      `### ${rule} (${items.length}件)`,
      ``,
      ...items.flatMap((it) => {
        const lines = [
          `**page ${it.page_no}${it.panel_no ? ` panel#${it.panel_no}` : " (巻スコープ)"}** (${it.severity}): ${it.message}`,
        ];
        if (it.page_role) lines.push(`- page_role: ${it.page_role}`);
        if (it.panel_shot_type) lines.push(`- shot_type: ${it.panel_shot_type}, importance: ${it.panel_importance}, silence: ${it.panel_silence}`);
        if (it.panel_action) lines.push(`- action: ${it.panel_action}`);
        if (it.panel_text) {
          lines.push(``, "```", it.panel_text as string, "```");
        }
        lines.push(``);
        return lines;
      }),
    ]),
    `## 修正依頼`,
    ``,
    `各 finding に対して **具体的な修正案** を作成してください。`,
    ``,
    `### 修正方針 (Phase X craft 準拠)`,
    ``,
    `1. **narration_dominant**: ナレーションを3割削り、削った分を顔以外の部位ショット + 短いSFX or 主人公モノローグ(雲型) に置換`,
    `2. **recovery_beat_missing**: aftermath / buildup ページのいずれかに、「相棒との何気ない一言」「街の生活感」「小さな達成感」beat を 1-2 panel 追加 (既存 panel の置換でなく差し込み)`,
    `3. **expectation_reality_gap_absent**: opening_hook (page 1-2) または buildup (page 3-7) のいずれかで「期待 → 現実」のギャップ panel を作る (例: 主人公が「最強の俺なら…」と期待 → 次 panel で「時給100円」現実)`,
    `4. **importance_imbalance**: 該当ページの panel importance を 1-5 で凸凹をつける (例: 5 / 2 / 4 / 2 / 5)`,
    `5. **shot_repetition**: 同じ shot_type が3連続している箇所を、別の shot_type に1つ差し替え`,
    ``,
    `### 出力形式`,
    ``,
    `各 finding に対して以下を返してください:`,
    ``,
    "```json",
    `{`,
    `  "patches": [`,
    `    {`,
    `      "finding_rule": "narration_dominant",`,
    `      "page_no": 22,`,
    `      "panel_no": 110,`,
    `      "current": { "narration": [...], "monologue": [...], "dialogue": [...] },`,
    `      "proposed": { "narration": [...], "monologue": [...], "dialogue": [...], "shot_type_change": null, "importance_change": null },`,
    `      "rationale": "ナレが冗長で読み心地を損なう。主人公の心象に置き換え軽快感を出す",`,
    `      "expected_effect": "narration_chars -10字, recovery_cadence +0.1"`,
    `    },`,
    `    ...`,
    `  ]`,
    `}`,
    "```",
    ``,
    `### 巻スコープの提案 (recovery_beat_missing / expectation_reality_gap_absent)`,
    ``,
    `これらは既存 panel の修正ではなく、**新規 panel の差し込み案** を出してください。差し込み位置 (page_no + 既存 panel の後/前) と、新 panel の dialogue/monologue/narration を提示。`,
    ``,
    `### 重要`,
    ``,
    `- 既存の物語の流れ (主人公の探索者活動 + 「ナビ」音声 + ダンジョンレベルアップ) を壊さない`,
    `- 修正提案は最小侵襲。1 panel あたり 1-3 行の変更に留める`,
    `- 「商業品質」(B-→A-) を意識: 主人公への共感の摩擦を減らし、相棒/街の人との温度を入れる`,
    `- 全 panel 全文は別添 ${path.basename(findingsDetailedPath)} の findings_detailed[].panel_text を参照`,
    `- 全ページ全文 (110 panels) は別添 pages-full.json を参照`,
  ].join("\n");

  const codexInputPath = path.join(OUT_DIR, "codex-input-pack.md");
  writeFileSync(codexInputPath, codexPrompt, "utf-8");

  // pages-full.json (Codex のコンテキスト用)
  const pagesFullPath = path.join(OUT_DIR, "pages-full.json");
  writeFileSync(
    pagesFullPath,
    JSON.stringify(
      {
        schema_version: 1,
        slug: SLUG,
        episode: EP,
        total_pages: storyboard.pages.length,
        pages: pagesFull,
      },
      null,
      2,
    ),
    "utf-8",
  );

  console.log(`=== a07 ep01 品質改善材料生成完了 ===`);
  console.log(`  findings 総数: ${detailed.length}`);
  console.log(`  findings 詳細:    ${findingsDetailedPath}`);
  console.log(`  Codex 依頼書:     ${codexInputPath}`);
  console.log(`  全ページ本文:    ${pagesFullPath}`);
  console.log(``);
  console.log(`次ステップ: Codex MCP にこの依頼書を投げて修正案を生成`);
  console.log(`  → mcp__codex__codex prompt = readFile("${codexInputPath}") + readFile("${pagesFullPath}")`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
