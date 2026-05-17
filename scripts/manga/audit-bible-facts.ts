/**
 * Bible Facts Audit CLI
 *
 * storyboard.json の narration / dialogue / monologue / sfx 内の数値 (年代・年齢) が
 * bible.world.timeline / system と一致するかを検証する。
 *
 * 2026-05-17 Sprint 10 案1 で新設。a07 ep01 の「三年前/十五歳」二重逸脱の再発を
 * 防ぐためのオフライン検出ツール。
 *
 * 使い方:
 *   node --import tsx scripts/manga/audit-bible-facts.ts --slug a07-modern-dungeon --episode 1
 *   node --import tsx scripts/manga/audit-bible-facts.ts --slug a07-modern-dungeon --all
 */
import "./_env";
import { promises as fs } from "node:fs";
import path from "node:path";
import { bibleSnapshotPath, storyboardPath, episodeDir } from "./layers/_paths";
import { auditBibleFacts } from "../../src/lib/manga/qa-v2/bible-facts-audit";
import type { BibleSnapshotV2, EpisodeStoryboardV2 } from "../../src/lib/manga/schemas-v2";

type Args = {
  slug: string;
  episode?: number;
  all: boolean;
};

function parseArgs(): Args {
  const a: Partial<Args> = { all: false };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--all") {
      a.all = true;
      continue;
    }
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
  if (!a.all && a.episode === undefined) throw new Error("--episode or --all required");
  return a as Args;
}

async function listEpisodes(slug: string): Promise<number[]> {
  const epRoot = path.join(path.dirname(path.dirname(episodeDir(slug, 1))), "episodes");
  const entries = await fs.readdir(epRoot, { withFileTypes: true });
  const eps: number[] = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const m = ent.name.match(/^ep0*(\d+)$/);
    if (!m) continue;
    eps.push(Number(m[1]));
  }
  return eps.sort((a, b) => a - b);
}

async function auditOneEpisode(slug: string, episode: number, bible: BibleSnapshotV2): Promise<number> {
  const sbPath = storyboardPath(slug, episode);
  let storyboard: EpisodeStoryboardV2;
  try {
    storyboard = JSON.parse(await fs.readFile(sbPath, "utf-8")) as EpisodeStoryboardV2;
  } catch (e) {
    console.warn(`[audit] ep${String(episode).padStart(2, "0")}: storyboard.json not found, skip`);
    return 0;
  }

  const { findings } = auditBibleFacts(bible, storyboard);
  if (findings.length === 0) {
    console.log(`[audit] ep${String(episode).padStart(2, "0")}: OK (0 findings)`);
    return 0;
  }

  console.log(`[audit] ep${String(episode).padStart(2, "0")}: ${findings.length} finding(s)`);
  for (const f of findings) {
    const head = `  - page ${f.page_no} ${f.panel_id} ${f.field}[${f.kind}] severity=${f.severity}`;
    console.log(head);
    console.log(`    text: ${f.text}`);
    console.log(`    found=${f.found} expected=[${f.expected.join(",")}]`);
    console.log(`    ${f.message}`);
  }
  return findings.length;
}

async function main() {
  const args = parseArgs();
  const bible = JSON.parse(await fs.readFile(bibleSnapshotPath(args.slug), "utf-8")) as BibleSnapshotV2;
  console.log(`[audit] slug=${args.slug} bible.world.timeline=${(bible.world.timeline ?? "").length} chars / system=${(bible.world.system ?? "").length} chars`);

  const episodes = args.all ? await listEpisodes(args.slug) : [args.episode!];
  let total = 0;
  for (const ep of episodes) {
    total += await auditOneEpisode(args.slug, ep, bible);
  }
  console.log(`[audit] TOTAL findings: ${total}`);
  if (total > 0) process.exit(1);
}

main().catch((e) => {
  console.error("[audit] FAILED:", e);
  process.exit(2);
});
