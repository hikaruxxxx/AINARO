/**
 * Dialogue Density Floor Audit CLI
 *
 * 2026-05-18 Sprint 18 で新設。
 *
 * storyboard.json の各 page で dialogue/monologue/narration/sfx 行数が
 * page_role 別の下限を満たすか検査する。a07 ep01 で dialogue page なのに
 * dialogue 0 行という致命的な「会話していない会話シーン」を検出した経験から、
 * render 前段で構造課題を早期発見する目的。
 *
 * 使い方:
 *   node --import tsx scripts/manga/audit-dialogue-density.ts --slug a07-modern-dungeon --episode 1
 */
import "./_env";
import { promises as fs } from "node:fs";
import { storyboardPath } from "./layers/_paths";
import { auditStoryboardDensity } from "../../src/lib/manga/qa-v2/dialogue-density-floor";
import type { EpisodeStoryboardV2 } from "../../src/lib/manga/schemas-v2";

type Args = {
  slug: string;
  episode: number;
};

function parseArgs(): Args {
  const a: Partial<Args> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (key === "slug") {
      a.slug = next;
      i++;
    } else if (key === "episode") {
      a.episode = Number(next);
      i++;
    }
  }
  if (!a.slug) throw new Error("--slug required");
  if (a.episode === undefined) throw new Error("--episode required");
  return a as Args;
}

async function main() {
  const args = parseArgs();
  const storyboard = JSON.parse(
    await fs.readFile(storyboardPath(args.slug, args.episode), "utf-8"),
  ) as EpisodeStoryboardV2;

  const { totalPages, findings, pageCounts } = auditStoryboardDensity(storyboard);

  console.log(`[density-audit] slug=${args.slug} ep=${args.episode} pages=${totalPages}`);
  console.log("");
  console.log("Per-page text counts:");
  for (const p of pageCounts) {
    const c = p.counts;
    console.log(
      `  p${String(p.page_no).padStart(2, "0")} role=${p.page_role.padEnd(12)} dlg=${c.dialogue} mono=${c.monologue} narr=${c.narration} sfx=${c.sfx} total_text=${p.total_text}`,
    );
  }
  console.log("");

  if (findings.length === 0) {
    console.log(`[density-audit] OK (0 findings)`);
    return;
  }

  console.log(`[density-audit] ${findings.length} finding(s):`);

  // page_no で集約
  const byPage = new Map<number, typeof findings>();
  for (const f of findings) {
    if (!byPage.has(f.page_no)) byPage.set(f.page_no, []);
    byPage.get(f.page_no)!.push(f);
  }

  for (const [page_no, fs_] of Array.from(byPage.entries()).sort((a, b) => a[0] - b[0])) {
    const role = fs_[0].page_role;
    const severity = `[${fs_.length} warning${fs_.length > 1 ? "s" : ""}]`;
    console.log(`  page ${page_no} (role=${role}) ${severity}`);
    for (const f of fs_) {
      // mono_narration_over_cap は上限違反なので expected_min 表記だと逆向きで紛らわしい
      const bound = f.kind === "mono_narration_over_cap" ? `max=${f.expected_min}` : `expected_min=${f.expected_min}`;
      console.log(`    - ${f.kind}: found=${f.found} ${bound}`);
      console.log(`      ${f.message}`);
    }
  }

  process.exit(1);
}

main().catch((e) => {
  console.error("[density-audit] FAILED:", e);
  process.exit(2);
});
