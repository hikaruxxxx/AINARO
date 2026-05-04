/**
 * L1.5 Bible Lint
 *
 * bible/snapshot.json を 2 段 (static + LLM) でレビュー
 * → bible/lint_report.json + 標準出力にサマリ
 *
 * Usage:
 *   npx tsx scripts/manga/layers/L01b-bible-lint.ts --slug a07-modern-dungeon
 *   --skip-llm で LLM judge を省略 (静的のみ)
 *   --fail-on-fatal で fatal が 1 件でもあれば exit 2
 */
import "../_env";
import { promises as fs } from "node:fs";
import path from "node:path";
import { bibleSnapshotPath, bibleDir } from "./_paths";
import { lintBible } from "../../../src/lib/manga/qa-v2/bible-lint";
import type { BibleSnapshotV2 } from "../../../src/lib/manga/schemas-v2";

type Args = { slug: string; skipLlm: boolean; failOnFatal: boolean };

function parseArgs(): Args {
  const a: Partial<Args> = { skipLlm: false, failOnFatal: false };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    let key: string | null = null; let val: string | null = null;
    const eq = arg.match(/^--([^=]+)=(.*)$/);
    if (eq) [, key, val] = eq;
    else { const flag = arg.match(/^--(.+)$/); if (flag) {
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) { key = flag[1]; val = next; i++; }
      else { key = flag[1]; val = "true"; }
    } }
    if (!key || val === null) continue;
    if (key === "slug") a.slug = val;
    else if (key === "skip-llm") a.skipLlm = val === "true";
    else if (key === "fail-on-fatal") a.failOnFatal = val === "true";
  }
  if (!a.slug) throw new Error("--slug required");
  return a as Args;
}

function colorize(sev: string): string {
  if (sev === "fatal") return `\x1b[31m[fatal]\x1b[0m`;
  if (sev === "warn") return `\x1b[33m[warn ]\x1b[0m`;
  return `\x1b[36m[info ]\x1b[0m`;
}

async function main() {
  const args = parseArgs();
  const bible = JSON.parse(await fs.readFile(bibleSnapshotPath(args.slug), "utf-8")) as BibleSnapshotV2;
  console.log(`[L01b-lint] slug=${args.slug} characters=${bible.characters.length} locations=${bible.locations.length} props=${bible.props.length}`);
  console.log(`[L01b-lint] running ${args.skipLlm ? "static-only" : "static + LLM judge"} ...`);

  const report = await lintBible({ bible, skipLlm: args.skipLlm });
  const outPath = path.join(bibleDir(args.slug), "lint_report.json");
  await fs.writeFile(outPath, JSON.stringify(report, null, 2));

  console.log("");
  console.log("=== findings ===");
  for (const f of report.findings) {
    const target = f.target_id ? ` (${f.target_id})` : "";
    console.log(`${colorize(f.severity)} ${f.scope}${target} :: ${f.rule}`);
    console.log(`        ${f.message}`);
    if (f.hint) console.log(`        hint: ${f.hint}`);
  }
  console.log("");
  console.log(`[L01b-lint] DONE: ${outPath}`);
  console.log(`[L01b-lint] summary: ${report.summary}`);

  if (args.failOnFatal && report.fatal_count > 0) {
    console.error("[L01b-lint] FAIL: fatal findings present");
    process.exit(2);
  }
}

main().catch((e) => { console.error("[L01b-lint] FAILED:", e); process.exit(1); });
