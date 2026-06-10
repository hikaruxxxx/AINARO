/**
 * dump-prompts.ts の出力を読んで、各 page の prompt 内行を 4 カテゴリに分類:
 *  - panel_specific: ### panel#N 配下、panel#N CONTINUITY 配下
 *  - global: # PAGE / ## STYLE / ## LAYOUT (構造制約) / ## CONSTRAINTS / ## SCENE 全般
 *  - decorative: CRITICAL / MANDATORY / DO NOT / "→ REJECT" 等の強調語が支配的な行、罫線
 *  - duplicate: 同一 page 内で 40字以上が再出現する行
 *
 * 使い方:
 *   npx tsx scripts/manga/analysis/classify-density.ts --slug a07-modern-dungeon --episode 1
 */
import "../_env";
import { promises as fs } from "node:fs";
import path from "node:path";

type Category = "panel_specific" | "global" | "decorative" | "duplicate";

function parseArgs(): { slug: string; episode: number } {
  const argv = process.argv.slice(2);
  const get = (k: string) => {
    const i = argv.indexOf(k);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const slug = get("--slug");
  const ep = get("--episode");
  if (!slug || !ep) {
    console.error("Usage: classify-density.ts --slug <slug> --episode <N>");
    process.exit(1);
  }
  return { slug, episode: Number(ep) };
}

const DECORATIVE_KEYWORDS = [
  "CRITICAL", "MANDATORY", "STRICT", "NON-NEGOTIABLE",
  "ABSOLUTELY", "MUST", "DO NOT", "→ REJECT", "REJECT",
  "FAILURE EXAMPLES", "ALLOWED IN BACKGROUND", "POSITIVE INSTRUCTION",
];

function isDecorative(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === "" || trimmed === "---") return false; // 空行は無分類
  // 強調キーワードを 2 個以上含む or 1 個でも行全体の 40% を占める
  const upper = trimmed;
  const hits = DECORATIVE_KEYWORDS.filter((k) => upper.includes(k));
  if (hits.length === 0) return false;
  const hitChars = hits.reduce((s, k) => s + k.length, 0);
  return hits.length >= 2 || hitChars / Math.max(1, trimmed.length) > 0.4;
}

function classifyLine(
  line: string,
  context: { currentSection: string; insidePanel: boolean; insideContinuity: boolean },
  seenLines: Map<string, number>,
): Category | null {
  const trimmed = line.trim();
  if (trimmed === "") return null;

  // duplicate: 40字以上で同 page 内 2 回目以降
  if (trimmed.length >= 40) {
    const n = (seenLines.get(trimmed) ?? 0) + 1;
    seenLines.set(trimmed, n);
    if (n >= 2) return "duplicate";
  }

  if (isDecorative(line)) return "decorative";

  // panel-specific: panel#N 配下 (PANELS 内 ### panel#N or CONTINUITY 内 panel#N CONTINUITY:)
  if (context.insidePanel || context.insideContinuity) return "panel_specific";

  // 残りは global
  return "global";
}

function categorize(prompt: string): {
  totalLines: number;
  totalChars: number;
  byCat: Record<Category, { lines: number; chars: number }>;
} {
  const lines = prompt.split("\n");
  const byCat: Record<Category, { lines: number; chars: number }> = {
    panel_specific: { lines: 0, chars: 0 },
    global: { lines: 0, chars: 0 },
    decorative: { lines: 0, chars: 0 },
    duplicate: { lines: 0, chars: 0 },
  };
  let currentSection = "";
  let insidePanel = false;
  let insideContinuity = false;
  const seenLines = new Map<string, number>();
  let totalLines = 0;
  let totalChars = 0;
  for (const line of lines) {
    // セクション/コンテキストの切り替え
    if (line === "# PAGE") { currentSection = "PAGE"; insidePanel = false; insideContinuity = false; }
    else if (line === "## STYLE") { currentSection = "STYLE"; insidePanel = false; insideContinuity = false; }
    else if (line === "## REFERENCES") { currentSection = "REFERENCES"; insidePanel = false; insideContinuity = false; }
    else if (line === "## LAYOUT") { currentSection = "LAYOUT"; insidePanel = false; insideContinuity = false; }
    // v57 semifree は "## SCENE (what happens on this page)" 形式 → 前方一致
    else if (line === "## SCENE" || line.startsWith("## SCENE (")) { currentSection = "SCENE"; insidePanel = false; insideContinuity = false; }
    else if (line === "## CONTINUITY") { currentSection = "CONTINUITY"; insidePanel = false; insideContinuity = true; }
    else if (line === "## PANELS") { currentSection = "PANELS"; insidePanel = false; insideContinuity = false; }
    // v57 semifree: LINES (セリフ列挙) はコンテンツ行なので panel_specific 相当に分類
    else if (line.startsWith("## LINES")) { currentSection = "LINES"; insidePanel = true; insideContinuity = false; }
    // v57 semifree: DIRECTION / BIBLE FACTS は global 扱い
    else if (line.startsWith("## DIRECTION")) { currentSection = "DIRECTION"; insidePanel = false; insideContinuity = false; }
    else if (line.startsWith("## BIBLE FACTS")) { currentSection = "BIBLE_FACTS"; insidePanel = false; insideContinuity = false; }
    else if (line === "## EDITOR") { currentSection = "EDITOR"; insidePanel = false; insideContinuity = false; }
    else if (line === "## CONSTRAINTS") { currentSection = "CONSTRAINTS"; insidePanel = false; insideContinuity = false; }
    else if (line.startsWith("### panel#")) { insidePanel = true; }

    // CONTINUITY 内は最初の panel#N CONTINUITY: 行から次の panel# 系まで insideContinuity
    if (currentSection === "CONTINUITY" && /^panel#\d+ CONTINUITY:/.test(line)) {
      insideContinuity = true;
    }

    if (line === "") continue;
    totalLines += 1;
    totalChars += line.length;
    const cat = classifyLine(line, { currentSection, insidePanel, insideContinuity }, seenLines);
    if (cat) {
      byCat[cat].lines += 1;
      byCat[cat].chars += line.length;
    }
  }
  return { totalLines, totalChars, byCat };
}

async function main() {
  const args = parseArgs();
  const epPad = String(args.episode).padStart(2, "0");
  const baseDir = path.join(
    "data", "manga", "works", args.slug, "episodes", `ep${epPad}`, "_analysis", "prompts",
  );
  const summary = JSON.parse(await fs.readFile(path.join(baseDir, "summary.json"), "utf-8")) as {
    pages: Array<{ page_no: number; total_chars: number; panel_count: number }>;
  };

  const perPage: Array<{
    page_no: number;
    total_chars: number;
    panel_count: number;
    panel_specific: { lines: number; chars: number; ratio: number };
    global: { lines: number; chars: number; ratio: number };
    decorative: { lines: number; chars: number; ratio: number };
    duplicate: { lines: number; chars: number; ratio: number };
    warning?: string;
  }> = [];

  for (const p of summary.pages) {
    const prompt = await fs.readFile(
      path.join(baseDir, `page_${String(p.page_no).padStart(2, "0")}.prompt.txt`), "utf-8",
    );
    const { totalChars, byCat } = categorize(prompt);
    const ratio = (n: number) => totalChars === 0 ? 0 : Number((n / totalChars).toFixed(3));
    const row = {
      page_no: p.page_no,
      total_chars: p.total_chars,
      panel_count: p.panel_count,
      panel_specific: { ...byCat.panel_specific, ratio: ratio(byCat.panel_specific.chars) },
      global: { ...byCat.global, ratio: ratio(byCat.global.chars) },
      decorative: { ...byCat.decorative, ratio: ratio(byCat.decorative.chars) },
      duplicate: { ...byCat.duplicate, ratio: ratio(byCat.duplicate.chars) },
    } as typeof perPage[number];
    const warnings: string[] = [];
    if (row.decorative.ratio > 0.15) warnings.push(`decorative > 15% (${(row.decorative.ratio * 100).toFixed(1)}%)`);
    if (row.duplicate.ratio > 0.10) warnings.push(`duplicate > 10% (${(row.duplicate.ratio * 100).toFixed(1)}%)`);
    if (warnings.length > 0) row.warning = warnings.join("; ");
    perPage.push(row);
  }

  // 全 page 平均
  const mean = (fn: (r: typeof perPage[number]) => number) =>
    Number((perPage.reduce((s, r) => s + fn(r), 0) / perPage.length).toFixed(3));
  const overall = {
    panel_specific_mean_ratio: mean((r) => r.panel_specific.ratio),
    global_mean_ratio: mean((r) => r.global.ratio),
    decorative_mean_ratio: mean((r) => r.decorative.ratio),
    duplicate_mean_ratio: mean((r) => r.duplicate.ratio),
  };

  const json = {
    schema_version: 1,
    slug: args.slug,
    episode: args.episode,
    generated_at: new Date().toISOString(),
    overall,
    pages: perPage,
  };
  await fs.writeFile(path.join(baseDir, "density_map.json"), JSON.stringify(json, null, 2), "utf-8");

  // Markdown
  const mdLines: string[] = [];
  mdLines.push(`# Prompt Density Map — ${args.slug} ep${epPad}`);
  mdLines.push("");
  mdLines.push(`Generated: ${json.generated_at}`);
  mdLines.push("");
  mdLines.push("## Overall (mean ratio across all pages)");
  mdLines.push("");
  mdLines.push("| Category | Mean ratio |");
  mdLines.push("|---|---|");
  mdLines.push(`| panel_specific | ${(overall.panel_specific_mean_ratio * 100).toFixed(1)}% |`);
  mdLines.push(`| global | ${(overall.global_mean_ratio * 100).toFixed(1)}% |`);
  mdLines.push(`| decorative | ${(overall.decorative_mean_ratio * 100).toFixed(1)}% |`);
  mdLines.push(`| duplicate | ${(overall.duplicate_mean_ratio * 100).toFixed(1)}% |`);
  mdLines.push("");
  mdLines.push("## Per-page breakdown");
  mdLines.push("");
  mdLines.push("| page | panels | chars | panel-specific | global | decorative | duplicate | warning |");
  mdLines.push("|---|---|---|---|---|---|---|---|");
  for (const r of perPage) {
    mdLines.push(
      `| ${r.page_no} | ${r.panel_count} | ${r.total_chars} `
      + `| ${(r.panel_specific.ratio * 100).toFixed(1)}% (${r.panel_specific.chars}c) `
      + `| ${(r.global.ratio * 100).toFixed(1)}% (${r.global.chars}c) `
      + `| ${(r.decorative.ratio * 100).toFixed(1)}% (${r.decorative.chars}c) `
      + `| ${(r.duplicate.ratio * 100).toFixed(1)}% (${r.duplicate.chars}c) `
      + `| ${r.warning ?? ""} |`,
    );
  }
  mdLines.push("");

  const warnings = perPage.filter((r) => r.warning);
  if (warnings.length > 0) {
    mdLines.push("## Warnings");
    mdLines.push("");
    for (const w of warnings) mdLines.push(`- page ${w.page_no}: ${w.warning}`);
    mdLines.push("");
  }

  await fs.writeFile(path.join(baseDir, "density_map.md"), mdLines.join("\n"), "utf-8");
  console.log(`[classify-density] wrote density_map.json + density_map.md`);
  console.log(`[classify-density] overall: panel=${(overall.panel_specific_mean_ratio*100).toFixed(1)}% global=${(overall.global_mean_ratio*100).toFixed(1)}% decorative=${(overall.decorative_mean_ratio*100).toFixed(1)}% duplicate=${(overall.duplicate_mean_ratio*100).toFixed(1)}%`);
  if (warnings.length > 0) {
    console.log(`[classify-density] warnings on ${warnings.length} pages`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
