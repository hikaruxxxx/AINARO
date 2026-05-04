/**
 * L12 Repair
 *
 * audit.json の failed_panel_ids について、refs を強化して L9 → L10 を再実行。
 *
 * MVP: 失敗パネルが属するページの render を削除して L9 (page_one_shot) を再走させる。
 * 完全な repair-policy (顔崩れ→stronger refs / 衣装崩れ→outfit ref / etc) は将来。
 */
import "../_env";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  auditPath,
  rendersDir,
  bubblesDir,
  pagePlanPath,
  repairLogPath,
} from "./_paths";
import type { AuditReport, PagePlanV2, RepairLog, RepairAttempt } from "../../../src/lib/manga/schemas-v2";

type Args = { slug: string; episode: number; maxAttempts: number };

function parseArgs(): Args {
  const a: Partial<Args> = { maxAttempts: 3 };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    let key: string | null = null; let val: string | null = null;
    const eq = arg.match(/^--([^=]+)=(.*)$/);
    if (eq) [, key, val] = eq;
    else { const flag = arg.match(/^--(.+)$/); if (flag && i + 1 < argv.length) { key = flag[1]; val = argv[++i]; } }
    if (!key || val === null) continue;
    if (key === "slug") a.slug = val;
    else if (key === "episode") a.episode = Number(val);
    else if (key === "max-attempts") a.maxAttempts = Number(val);
  }
  if (!a.slug || !a.episode) throw new Error("--slug and --episode required");
  return a as Args;
}

async function main() {
  const args = parseArgs();
  const audit = JSON.parse(await fs.readFile(auditPath(args.slug, args.episode), "utf-8")) as AuditReport;
  if (audit.failed_panel_ids.length === 0) { console.log("[L12] no failed panels"); return; }

  const plan = JSON.parse(await fs.readFile(pagePlanPath(args.slug, args.episode), "utf-8")) as PagePlanV2;

  // failed panel ids → 該当ページ
  const pagesToRepair = new Set<number>();
  for (const fpid of audit.failed_panel_ids) {
    const page = plan.pages.find((p) => p.panels.some((pp) => pp.panel_id === fpid));
    if (page) pagesToRepair.add(page.page_no);
  }

  console.log(`[L12] repairing ${pagesToRepair.size} pages: ${[...pagesToRepair].join(", ")}`);

  const attempts: RepairAttempt[] = [];

  for (const pageNo of pagesToRepair) {
    // render と bubble の出力を削除して L9 → L10 を再走 (orchestrator が拾う)
    const rPath = path.join(rendersDir(args.slug, args.episode), `p${String(pageNo).padStart(2, "0")}.png`);
    const bPath = path.join(bubblesDir(args.slug, args.episode), `p${String(pageNo).padStart(2, "0")}.png`);
    try { await fs.unlink(rPath); } catch {}
    try { await fs.unlink(bPath); } catch {}

    attempts.push({
      panel_id: `page_${pageNo}`,
      attempt_no: 1,
      triggered_by_check: "audit_failed",
      action: "regenerate_with_stronger_refs",
      rationale: "L11 audit で page 単位失敗 → render+bubble削除、orchestrator に再生成を委ねる",
      succeeded: false,
    });
  }

  const log: RepairLog = {
    schema_version: 1,
    episode_id: audit.episode_id,
    attempts,
  };
  await fs.writeFile(repairLogPath(args.slug, args.episode), JSON.stringify(log, null, 2));
  console.log(`[L12] DONE: ${repairLogPath(args.slug, args.episode)}`);
  console.log(`[L12] → re-run L09 → L10 → L11 (pipeline orchestrator では --layer-from L09 で再投入可)`);
}

main().catch((e) => { console.error("[L12] FAILED:", e); process.exit(1); });
