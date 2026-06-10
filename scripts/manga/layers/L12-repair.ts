/**
 * L12 Repair (戦略 §6 / §8 準拠の薄い接続層)
 *
 * 2 モード:
 * 1. --audit (default): audit.failed_panel_ids → 該当ページの render を削除して
 *    L9 を pipeline 側で再走させる (既存挙動)。判定ロジックを持たない。
 * 2. --revision-queue (Phase C): _revision_queue.jsonl の未消化 entry を順次消化。
 *    panel_id ごとに既存 render_manifest から nextVersion を計算し、L9 を spawn。
 *    完了したら _revision_resolved.jsonl に append (queue 自体は append-only)。
 *
 * 戦略制約: L12 に判定ロジックを入れない (戦略 §8)。version 計算は manifest.ts の純関数。
 */
import "../_env";
import { promises as fs, openSync, closeSync, unlinkSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  auditPath,
  rendersDir,
  pagePlanPath,
  repairLogPath,
  revisionQueuePath,
  episodeDir,
} from "./_paths";
import { readJsonl, nextVersion } from "../../../src/lib/manga/revision-ui/manifest";
import type {
  AuditReport,
  PagePlanV2,
  RepairLog,
  RepairAttempt,
} from "../../../src/lib/manga/schemas-v2";
import type {
  RenderManifestEntry,
  RevisionEntry,
} from "../../../src/lib/manga/revision-ui/types";
import { renderManifestPath } from "./_paths";

type Mode = "audit" | "revision-queue";

type Args = {
  slug: string;
  episode: number;
  maxAttempts: number;
  mode: Mode;
};

function parseArgs(): Args {
  const a: Partial<Args> = { maxAttempts: 3, mode: "audit" };
  const argv = process.argv.slice(2);
  const BOOLEAN_FLAGS = new Set(["revision-queue", "audit"]);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = arg.match(/^--([^=]+)=(.*)$/);
    let key: string | null = null;
    let val: string | null = null;
    if (eq) {
      [, key, val] = eq;
    } else {
      const flag = arg.match(/^--(.+)$/);
      if (!flag) continue;
      key = flag[1];
      if (BOOLEAN_FLAGS.has(key)) {
        if (key === "revision-queue") a.mode = "revision-queue";
        else if (key === "audit") a.mode = "audit";
        continue;
      }
      const nextToken = argv[i + 1];
      if (i + 1 >= argv.length || (nextToken && nextToken.startsWith("--"))) continue;
      val = nextToken;
      i++;
    }
    if (val === null) continue;
    if (key === "slug") a.slug = val;
    else if (key === "episode") a.episode = Number(val);
    else if (key === "max-attempts") a.maxAttempts = Number(val);
  }
  if (!a.slug || !a.episode) throw new Error("--slug and --episode required");
  return a as Args;
}

function spawnLayer(script: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("npx", ["tsx", script, ...args], {
      stdio: "inherit",
      env: process.env,
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

// ===== Mode 1: audit =====

async function runAuditMode(args: Args): Promise<void> {
  const audit = JSON.parse(await fs.readFile(auditPath(args.slug, args.episode), "utf-8")) as AuditReport;
  if (audit.failed_panel_ids.length === 0) { console.log("[L12] no failed panels"); return; }

  const plan = JSON.parse(await fs.readFile(pagePlanPath(args.slug, args.episode), "utf-8")) as PagePlanV2;
  const pagesToRepair = new Set<number>();
  for (const fpid of audit.failed_panel_ids) {
    const page = plan.pages.find((p) => p.panels.some((pp) => pp.panel_id === fpid));
    if (page) pagesToRepair.add(page.page_no);
  }

  console.log(`[L12 audit] repairing ${pagesToRepair.size} pages: ${[...pagesToRepair].join(", ")}`);

  const attempts: RepairAttempt[] = [];
  for (const pageNo of pagesToRepair) {
    const rPath = path.join(rendersDir(args.slug, args.episode), `p${String(pageNo).padStart(2, "0")}.png`);
    try { await fs.unlink(rPath); } catch {}
    attempts.push({
      panel_id: `page_${pageNo}`,
      attempt_no: 1,
      triggered_by_check: "audit_failed",
      action: "regenerate_with_stronger_refs",
      rationale: "L11 audit page-level fail → render削除、orchestrator に再生成委ねる",
      succeeded: false,
    });
  }

  const log: RepairLog = {
    schema_version: 1,
    episode_id: audit.episode_id,
    attempts,
  };
  await fs.writeFile(repairLogPath(args.slug, args.episode), JSON.stringify(log, null, 2));
  console.log(`[L12 audit] DONE: ${repairLogPath(args.slug, args.episode)}`);
  console.log(`[L12 audit] → re-run L09 → L11 (pipeline で --from L09)`);
}

// ===== Mode 2: revision-queue =====

const RESOLVED_FILENAME = "_revision_resolved.jsonl";

type ResolvedEntry = {
  schema_version: 1;
  ts: string;
  revision_id: string;
  panel_id: string;
  resolved_version: string;
  l09_exit_code: number;
  succeeded: boolean;
};

async function appendResolved(args: Args, entry: ResolvedEntry): Promise<void> {
  const fp = path.join(episodeDir(args.slug, args.episode), RESOLVED_FILENAME);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.appendFile(fp, JSON.stringify(entry) + "\n", "utf-8");
}

async function loadResolvedIds(args: Args): Promise<Set<string>> {
  const fp = path.join(episodeDir(args.slug, args.episode), RESOLVED_FILENAME);
  const arr = await readJsonl<ResolvedEntry>(fp);
  return new Set(arr.map((e) => e.revision_id));
}

/**
 * Codex review: episode-level lock で複数 process 同時起動を防ぐ。
 * O_EXCL で lock ファイルを作成し、process exit 時に確実に削除する。
 *
 * lock file path: episodes/ep{NN}/_revision_queue.lock
 * 既存ロックがあれば「他 process が処理中」エラーで exit 6。
 */
function acquireLock(slug: string, episode: number): { release: () => void } {
  const lockPath = path.join(episodeDir(slug, episode), "_revision_queue.lock");
  let fd: number;
  try {
    // wx = O_CREAT | O_EXCL — 既存なら fail
    fd = openSync(lockPath, "wx");
  } catch (e: any) {
    if (e?.code === "EEXIST") {
      throw new Error(
        `[L12 revision-queue] lock exists at ${lockPath}. ` +
        `他 process が処理中の可能性。手動削除前に process が動いていないことを確認。`
      );
    }
    throw e;
  }
  closeSync(fd);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    try { unlinkSync(lockPath); } catch {}
  };
  // 異常終了時にも release
  process.on("exit", release);
  process.on("SIGINT", () => { release(); process.exit(130); });
  process.on("SIGTERM", () => { release(); process.exit(143); });
  return { release };
}

async function runRevisionQueueMode(args: Args): Promise<void> {
  const lock = acquireLock(args.slug, args.episode);
  try {
    await runRevisionQueueModeInner(args);
  } finally {
    lock.release();
  }
}

async function runRevisionQueueModeInner(args: Args): Promise<void> {
  const queue = await readJsonl<RevisionEntry>(revisionQueuePath(args.slug, args.episode));
  if (queue.length === 0) {
    console.log("[L12 revision-queue] queue is empty");
    return;
  }
  const resolved = await loadResolvedIds(args);
  const pending = queue.filter((e) => !resolved.has(e.id));
  if (pending.length === 0) {
    console.log(`[L12 revision-queue] all ${queue.length} entries already resolved`);
    return;
  }

  console.log(`[L12 revision-queue] processing ${pending.length}/${queue.length} pending entries`);
  let succeeded = 0;
  let failed = 0;

  for (const entry of pending) {
    // version 計算 (純関数。L12 は判定しない)
    const manifest = await readJsonl<RenderManifestEntry>(renderManifestPath(args.slug, args.episode));
    const renderVersion = nextVersion(manifest, entry.panel_id, "render");
    console.log(`\n[L12 revision-queue] entry ${entry.id.slice(0, 8)}: panel=${entry.panel_id} → ${renderVersion}`);

    // L09 spawn
    const l09Args = [
      "--slug", args.slug,
      "--episode", String(args.episode),
      "--pages", String(entry.page_no),
      "--version", renderVersion,
      "--revision-id", entry.id,
    ];
    const l09Code = await spawnLayer("scripts/manga/layers/L09-render.ts", l09Args);
    if (l09Code !== 0) {
      console.warn(`[L12 revision-queue] L09 exit=${l09Code} for ${entry.id.slice(0, 8)}`);
      await appendResolved(args, {
        schema_version: 1,
        ts: new Date().toISOString(),
        revision_id: entry.id,
        panel_id: entry.panel_id,
        resolved_version: renderVersion,
        l09_exit_code: l09Code,
        succeeded: false,
      });
      failed++;
      continue;
    }

    await appendResolved(args, {
      schema_version: 1,
      ts: new Date().toISOString(),
      revision_id: entry.id,
      panel_id: entry.panel_id,
      resolved_version: renderVersion,
      l09_exit_code: l09Code,
      succeeded: l09Code === 0,
    });
    if (l09Code === 0) succeeded++;
    else failed++;
  }
  console.log(`\n[L12 revision-queue] DONE: succeeded=${succeeded} failed=${failed}`);
}

async function main() {
  const args = parseArgs();
  if (args.mode === "revision-queue") {
    await runRevisionQueueMode(args);
  } else {
    await runAuditMode(args);
  }
}

main().catch((e) => { console.error("[L12] FAILED:", e); process.exit(1); });
