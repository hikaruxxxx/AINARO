/**
 * 既存エピソードを all-approved (`approval_source: "migration"`) で初期化する。
 *
 * Usage:
 *   npx tsx scripts/manga/migrate-name-approval.ts --slug a07-modern-dungeon --episodes 1-10
 *   npx tsx scripts/manga/migrate-name-approval.ts --slug a07-modern-dungeon --episodes 1,3,5
 *
 * - 既に name_approval.json があれば skip (上書きしない)
 * - storyboard.json または page_plan.json が無いエピソードはエラー
 */
import "./_env";
import { promises as fs } from "node:fs";
import {
  storyboardPath,
  pagePlanPath,
  nameApprovalPath,
} from "./layers/_paths";
import type { NameApproval, NamePageDecision } from "../../src/lib/manga/name-preview/types";
import type { EpisodeStoryboardV2, PagePlanV2 } from "../../src/lib/manga/schemas-v2";

type Args = { slug: string; episodes: number[]; force: boolean };

function parseRange(s: string): number[] {
  const out = new Set<number>();
  for (const part of s.split(",")) {
    const m = part.match(/^(\d+)-(\d+)$/);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      const lo = Math.min(a, b), hi = Math.max(a, b);
      for (let i = lo; i <= hi; i++) out.add(i);
    } else {
      const n = Number(part);
      if (Number.isFinite(n)) out.add(n);
    }
  }
  return [...out].sort((a, b) => a - b);
}

function parseArgs(): Args {
  const a: Partial<Args> = { force: false };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    let key: string | null = null;
    let val: string | null = null;
    const eq = arg.match(/^--([^=]+)=(.*)$/);
    if (eq) [, key, val] = eq;
    else { const flag = arg.match(/^--(.+)$/); if (flag && i + 1 < argv.length) { key = flag[1]; val = argv[++i]; } }
    if (!key) {
      const bool = arg.match(/^--(.+)$/);
      if (bool && bool[1] === "force") a.force = true;
      continue;
    }
    if (val === null) continue;
    if (key === "slug") a.slug = val;
    else if (key === "episodes") a.episodes = parseRange(val);
  }
  if (!a.slug || !a.episodes) throw new Error("--slug and --episodes required (e.g. --episodes 1-10)");
  return a as Args;
}

async function fileExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

async function migrateOne(slug: string, episode: number, force: boolean): Promise<{ status: "skipped" | "created"; reason?: string }> {
  const approvalP = nameApprovalPath(slug, episode);
  if (!force && (await fileExists(approvalP))) {
    return { status: "skipped", reason: "approval already exists" };
  }
  const sbPath = storyboardPath(slug, episode);
  const ppPath = pagePlanPath(slug, episode);
  if (!(await fileExists(sbPath))) return { status: "skipped", reason: `${sbPath} not found` };
  if (!(await fileExists(ppPath))) return { status: "skipped", reason: `${ppPath} not found` };

  const storyboard = JSON.parse(await fs.readFile(sbPath, "utf-8")) as EpisodeStoryboardV2;
  const pagePlan = JSON.parse(await fs.readFile(ppPath, "utf-8")) as PagePlanV2;

  const now = new Date().toISOString();
  const pages: Record<string, NamePageDecision> = {};
  for (const p of pagePlan.pages) {
    pages[String(p.page_no)] = {
      status: "approved",
      approval_source: "migration",
      reasons: [],
      rerun_from: null,
      note: "Initialized from pre-gate episode",
      decided_at: now,
    };
  }
  const approval: NameApproval = {
    schema_version: 1,
    episode_id: storyboard.episode_id,
    updated_at: now,
    pages,
  };
  await fs.writeFile(approvalP, JSON.stringify(approval, null, 2), "utf-8");
  return { status: "created" };
}

async function main() {
  const args = parseArgs();
  console.log(`[migrate] slug=${args.slug} episodes=${args.episodes.join(",")} force=${args.force}`);
  let created = 0, skipped = 0;
  for (const ep of args.episodes) {
    const r = await migrateOne(args.slug, ep, args.force);
    if (r.status === "created") {
      console.log(`[migrate] ep${String(ep).padStart(2, "0")}: created`);
      created++;
    } else {
      console.log(`[migrate] ep${String(ep).padStart(2, "0")}: skipped (${r.reason})`);
      skipped++;
    }
  }
  console.log(`[migrate] DONE: created=${created} skipped=${skipped}`);
}

main().catch((e) => { console.error("[migrate] FAILED:", e); process.exit(1); });
