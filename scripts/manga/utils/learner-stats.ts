#!/usr/bin/env tsx
/**
 * L05c learner の出力 (data/manga/reference_pool/_learner_runs/{source}-{date}.json)
 * から統計情報と representative panel リストを markdown として書き出す。
 *
 * 用途:
 *   - L02 codex-image プロンプト改善のための「商業漫画はこういう比率で背景を描いている」観察
 *   - L05 page-director の bg_treatment 流通比率参照
 *   - 人間 reviewer のための panel 一覧 (rationale 付き)
 *
 * 使い方:
 *   npx tsx scripts/manga/utils/learner-stats.ts --source level-gacha-vol1
 *   npx tsx scripts/manga/utils/learner-stats.ts --source level-gacha-vol1 --out custom.md
 */
import path from "node:path";
import { promises as fs } from "node:fs";

type BgTreatment =
  | "detailed_bg" | "atmospheric_fade" | "tone_back"
  | "solid_white" | "solid_black" | "floating_ui" | "skip";

type LearnerPanel = {
  panel_no: number;
  bg_treatment: BgTreatment;
  rationale: string;
  bbox_normalized?: { x: number; y: number; w: number; h: number };
};

type LearnerPage = {
  page_no: number;
  image_path: string;
  spread: boolean;
  panels: LearnerPanel[];
};

type LearnerRun = {
  schema_version: 1;
  source: string;
  generated_at: string;
  method: string;
  page_count: number;
  pages: LearnerPage[];
};

type Args = { source: string; learnerRun?: string; out?: string };

function parseArgs(argv: string[]): Args {
  let source: string | undefined;
  let learnerRun: string | undefined;
  let out: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--source") source = argv[++i];
    else if (a === "--learner-run") learnerRun = argv[++i];
    else if (a === "--out") out = argv[++i];
  }
  if (!source) {
    console.error("--source required");
    process.exit(1);
  }
  return { source, learnerRun, out };
}

async function findLatestRun(source: string): Promise<string> {
  const dir = path.resolve("data/manga/reference_pool/_learner_runs");
  const items = await fs.readdir(dir);
  const matches = items.filter((f) => f.startsWith(`${source}-`) && f.endsWith(".json")).sort();
  if (matches.length === 0) throw new Error(`no learner run for ${source}`);
  return path.join(dir, matches[matches.length - 1]);
}

function pct(n: number, total: number): string {
  if (total === 0) return "0.0";
  return ((n / total) * 100).toFixed(1);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const runPath = args.learnerRun ?? (await findLatestRun(args.source));
  const run = JSON.parse(await fs.readFile(runPath, "utf-8")) as LearnerRun;

  // 集計
  const treatmentCount: Record<string, number> = {};
  const panelsByTreatment: Record<string, { page_no: number; panel_no: number; rationale: string }[]> = {};
  let totalPanels = 0;
  let pagesWithPanels = 0;
  let skipPages = 0;
  let totalSpreads = 0;
  let totalSingle = 0;

  for (const page of run.pages) {
    if (page.spread) totalSpreads++;
    else totalSingle++;
    if (page.panels.length === 0) {
      skipPages++;
      continue;
    }
    pagesWithPanels++;
    for (const panel of page.panels) {
      treatmentCount[panel.bg_treatment] = (treatmentCount[panel.bg_treatment] ?? 0) + 1;
      totalPanels++;
      if (!panelsByTreatment[panel.bg_treatment]) panelsByTreatment[panel.bg_treatment] = [];
      panelsByTreatment[panel.bg_treatment].push({
        page_no: page.page_no,
        panel_no: panel.panel_no,
        rationale: panel.rationale,
      });
    }
  }

  // page-level dominant treatment
  const pageDominant: { page_no: number; dominant: string; count: number; total: number }[] = [];
  for (const page of run.pages) {
    if (page.panels.length === 0) continue;
    const counts: Record<string, number> = {};
    for (const p of page.panels) counts[p.bg_treatment] = (counts[p.bg_treatment] ?? 0) + 1;
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    pageDominant.push({
      page_no: page.page_no,
      dominant: sorted[0][0],
      count: sorted[0][1],
      total: page.panels.length,
    });
  }

  // detailed_bg dominant pages (>= 50%)
  const bgDominantPages = pageDominant.filter((p) => p.dominant === "detailed_bg" && p.count / p.total >= 0.5);

  const lines: string[] = [];
  lines.push(`# Learner Stats: ${run.source}`);
  lines.push("");
  lines.push(`- generated_at: ${run.generated_at}`);
  lines.push(`- method: ${run.method}`);
  lines.push(`- learner_run: \`${path.relative(process.cwd(), runPath)}\``);
  lines.push("");
  lines.push("## ページ概要");
  lines.push("");
  lines.push(`- total pages analyzed: ${run.pages.length}`);
  lines.push(`- pages with panels: ${pagesWithPanels}`);
  lines.push(`- skip pages (cover/扉/目次/奥付): ${skipPages}`);
  lines.push(`- spreads: ${totalSpreads} / single: ${totalSingle}`);
  lines.push(`- total panels: ${totalPanels} (avg ${(totalPanels / Math.max(1, pagesWithPanels)).toFixed(1)} per page)`);
  lines.push("");
  lines.push("## bg_treatment 分布");
  lines.push("");
  lines.push("| treatment | count | pct | L02 bg ref 候補 |");
  lines.push("|---|---:|---:|:---:|");
  const order: BgTreatment[] = [
    "detailed_bg", "atmospheric_fade", "tone_back",
    "solid_white", "solid_black", "floating_ui", "skip",
  ];
  for (const t of order) {
    const n = treatmentCount[t] ?? 0;
    const isCandidate = t === "detailed_bg" ? "✓" : "";
    lines.push(`| ${t} | ${n} | ${pct(n, totalPanels)}% | ${isCandidate} |`);
  }
  lines.push("");

  lines.push("## detailed_bg 主体ページ (>=50%)");
  lines.push("");
  if (bgDominantPages.length === 0) {
    lines.push("_該当なし_");
  } else {
    lines.push("| page | dominant | count/total |");
    lines.push("|---:|---|---:|");
    for (const p of bgDominantPages.sort((a, b) => b.count / b.total - a.count / a.total)) {
      lines.push(`| ${p.page_no} | ${p.dominant} | ${p.count}/${p.total} |`);
    }
  }
  lines.push("");

  lines.push("## representative panels (each treatment, top 5 by detail rationale)");
  for (const t of order) {
    if (t === "skip") continue;
    const list = panelsByTreatment[t] ?? [];
    if (list.length === 0) continue;
    lines.push("");
    lines.push(`### ${t}`);
    lines.push("");
    const sample = list.slice(0, 5);
    for (const p of sample) {
      lines.push(`- p${p.page_no}#${p.panel_no}: ${p.rationale}`);
    }
    if (list.length > 5) lines.push(`- ... +${list.length - 5} more`);
  }
  lines.push("");

  lines.push("## L02 プロンプト改善ヒント (人間レビュー用)");
  lines.push("");
  const detailedRatio = (treatmentCount.detailed_bg ?? 0) / Math.max(1, totalPanels);
  const atmosRatio = (treatmentCount.atmospheric_fade ?? 0) / Math.max(1, totalPanels);
  if (atmosRatio > 0.5) {
    lines.push(`- atmospheric_fade が ${pct(treatmentCount.atmospheric_fade ?? 0, totalPanels)}% と大半を占めている → 商業漫画はキャラ周辺だけ描く運用が主流。L02 location refs に「全画面描き込み」を強要しすぎない。`);
  }
  if (detailedRatio < 0.2) {
    lines.push(`- detailed_bg が ${pct(treatmentCount.detailed_bg ?? 0, totalPanels)}% と少なめ → 背景 reference として使える例は限定的。establishing/intro page を選んで集めるのが効率的。`);
  } else if (detailedRatio >= 0.2) {
    lines.push(`- detailed_bg ${pct(treatmentCount.detailed_bg ?? 0, totalPanels)}% → bg ref 候補として十分なボリュームあり。\`_internal_crops/${run.source}/\` を curation のスタート地点に。`);
  }
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("**rights**: kindle_archive 由来。crop は internal review のみ。production reference に流さないこと。");

  const outPath = args.out
    ? path.resolve(args.out)
    : path.resolve("data/manga/reference_pool", `${run.source}-stats.md`);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, lines.join("\n") + "\n", "utf-8");
  console.log(`[stats] wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
