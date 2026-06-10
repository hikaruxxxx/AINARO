/**
 * ネーム reject 理由集計レポート
 *
 * 全作品 (or 単一 slug) の name_approval.json と name_audit.json を走査し、
 * - rejection 理由の分布
 * - rerun_from の分布
 * - audit rule の発生頻度
 * - approval_source 内訳 (human / migration)
 * を集計する。
 *
 * このレポートは v2 で得られる「実データから L4/L5 改善優先度を決める」根拠に使う。
 *
 * Usage:
 *   npx tsx scripts/manga/name-reject-report.ts             # 全作品
 *   npx tsx scripts/manga/name-reject-report.ts --slug X    # 単一作品
 *   npx tsx scripts/manga/name-reject-report.ts --json      # JSON 出力
 */
import "./_env";
import { promises as fs } from "node:fs";
import path from "node:path";
import { WORKS_DIR } from "./layers/_paths";
import type { NameApproval, NamePageDecision, NameRejectReason } from "../../src/lib/manga/name-preview/types";

type Args = { slug?: string; json: boolean };

function parseArgs(): Args {
  const a: Args = { json: false };
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
      if (bool && bool[1] === "json") a.json = true;
      continue;
    }
    if (val === null) continue;
    if (key === "slug") a.slug = val;
  }
  return a;
}

type Aggregate = {
  total_works: number;
  total_episodes: number;
  total_pages: number;
  status_counts: Record<string, number>;
  approval_source_counts: Record<string, number>;
  reasons: Record<string, number>;
  rerun_from: Record<string, number>;
  audit_rule_counts: Record<string, number>;
  audit_severity_counts: Record<string, number>;
  worst_episodes: Array<{ slug: string; episode: number; rejected: number; pending: number }>;
};

async function dirExists(p: string): Promise<boolean> {
  try { const st = await fs.stat(p); return st.isDirectory(); } catch { return false; }
}

async function listSlugs(): Promise<string[]> {
  if (!(await dirExists(WORKS_DIR))) return [];
  const entries = await fs.readdir(WORKS_DIR, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory() && !e.name.startsWith("_")).map((e) => e.name);
}

async function listEpisodes(slug: string): Promise<number[]> {
  const epDir = path.join(WORKS_DIR, slug, "episodes");
  if (!(await dirExists(epDir))) return [];
  const entries = await fs.readdir(epDir, { withFileTypes: true });
  const eps: number[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const m = e.name.match(/^ep(\d+)$/);
    if (m) eps.push(Number(m[1]));
  }
  return eps.sort((a, b) => a - b);
}

async function loadJsonOpt<T>(p: string): Promise<T | null> {
  try { return JSON.parse(await fs.readFile(p, "utf-8")) as T; } catch { return null; }
}

async function main() {
  const args = parseArgs();
  const slugs = args.slug ? [args.slug] : await listSlugs();

  const agg: Aggregate = {
    total_works: 0,
    total_episodes: 0,
    total_pages: 0,
    status_counts: {},
    approval_source_counts: {},
    reasons: {},
    rerun_from: {},
    audit_rule_counts: {},
    audit_severity_counts: {},
    worst_episodes: [],
  };

  for (const slug of slugs) {
    const eps = await listEpisodes(slug);
    if (eps.length === 0) continue;
    let workCounted = false;
    for (const ep of eps) {
      const approvalP = path.join(WORKS_DIR, slug, "episodes", `ep${String(ep).padStart(2, "0")}`, "name_approval.json");
      const auditP = path.join(WORKS_DIR, slug, "episodes", `ep${String(ep).padStart(2, "0")}`, "name", "name_audit.json");
      const approval = await loadJsonOpt<NameApproval>(approvalP);
      const auditReport = await loadJsonOpt<{ findings: Array<{ rule: string; severity: string; page_no: number; panel_id?: string; panel_no?: number; character_id?: string }> }>(auditP);

      // approval / audit の少なくとも一方があれば episode としてカウント
      if (!approval && !auditReport) continue;
      if (!workCounted) { agg.total_works++; workCounted = true; }
      agg.total_episodes++;

      // approval 集計 (status / reasons / rerun_from)
      let rejected = 0, pending = 0;
      if (approval) {
        for (const [, dec] of Object.entries(approval.pages)) {
          agg.total_pages++;
          agg.status_counts[dec.status] = (agg.status_counts[dec.status] ?? 0) + 1;
          agg.approval_source_counts[dec.approval_source] = (agg.approval_source_counts[dec.approval_source] ?? 0) + 1;
          if (dec.status === "rejected") rejected++;
          if (dec.status === "pending") pending++;
          for (const r of dec.reasons) {
            agg.reasons[r] = (agg.reasons[r] ?? 0) + 1;
          }
          const rf = dec.rerun_from ?? "(none)";
          agg.rerun_from[rf] = (agg.rerun_from[rf] ?? 0) + 1;
        }
      }
      agg.worst_episodes.push({ slug, episode: ep, rejected, pending });

      // audit 集計 (approval の有無に関わらず独立に)
      // ref_thumbnail_missing は character_id 単位で de-dupe する
      // (panel ごとに出すと同じキャラ不在で件数が膨らむ)
      // 構造化 character_id field が無い古い audit JSON は dedupe せずカウント (互換)
      if (auditReport) {
        const seenRefMissing = new Set<string>();
        for (const f of auditReport.findings) {
          if (f.rule === "ref_thumbnail_missing" && f.character_id) {
            const key = `${slug}#ep${ep}#${f.character_id}`;
            if (seenRefMissing.has(key)) continue;
            seenRefMissing.add(key);
          }
          agg.audit_rule_counts[f.rule] = (agg.audit_rule_counts[f.rule] ?? 0) + 1;
          agg.audit_severity_counts[f.severity] = (agg.audit_severity_counts[f.severity] ?? 0) + 1;
        }
      }
    }
  }

  agg.worst_episodes.sort((a, b) => b.rejected - a.rejected || b.pending - a.pending);
  agg.worst_episodes = agg.worst_episodes.slice(0, 10);

  if (args.json) {
    console.log(JSON.stringify(agg, null, 2));
    return;
  }

  console.log("=".repeat(60));
  console.log(`Name Reject Report (slug filter: ${args.slug ?? "ALL"})`);
  console.log("=".repeat(60));
  console.log(`works:     ${agg.total_works}`);
  console.log(`episodes:  ${agg.total_episodes}`);
  console.log(`pages:     ${agg.total_pages}`);
  console.log("");
  console.log("--- status ---");
  for (const [k, v] of Object.entries(agg.status_counts)) {
    console.log(`  ${k.padEnd(12)} ${String(v).padStart(5)}  (${pct(v, agg.total_pages)})`);
  }
  console.log("");
  console.log("--- approval_source ---");
  for (const [k, v] of Object.entries(agg.approval_source_counts)) {
    console.log(`  ${k.padEnd(12)} ${String(v).padStart(5)}  (${pct(v, agg.total_pages)})`);
  }
  console.log("");
  console.log("--- reject reasons (multi-pick allowed) ---");
  if (Object.keys(agg.reasons).length === 0) {
    console.log("  (no reasons recorded)");
  } else {
    const totalReasons = Object.values(agg.reasons).reduce((s, n) => s + n, 0);
    for (const [k, v] of Object.entries(agg.reasons).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${k.padEnd(22)} ${String(v).padStart(5)}  (${pct(v, totalReasons)})`);
    }
  }
  console.log("");
  console.log("--- rerun_from distribution ---");
  for (const [k, v] of Object.entries(agg.rerun_from).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(12)} ${String(v).padStart(5)}  (${pct(v, agg.total_pages)})`);
  }
  console.log("");
  console.log("--- audit rule frequency ---");
  if (Object.keys(agg.audit_rule_counts).length === 0) {
    console.log("  (no audit findings)");
  } else {
    for (const [k, v] of Object.entries(agg.audit_rule_counts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${k.padEnd(28)} ${String(v).padStart(5)}`);
    }
  }
  console.log("");
  console.log("--- audit severity ---");
  for (const [k, v] of Object.entries(agg.audit_severity_counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(8)} ${String(v).padStart(5)}`);
  }
  console.log("");
  console.log("--- worst episodes (top 10 by rejected) ---");
  for (const e of agg.worst_episodes) {
    if (e.rejected === 0 && e.pending === 0) continue;
    console.log(`  ${e.slug.padEnd(28)} ep${String(e.episode).padStart(2, "0")}: rejected=${e.rejected} pending=${e.pending}`);
  }
}

function pct(n: number, total: number): string {
  if (!total) return "0%";
  return `${((n / total) * 100).toFixed(1)}%`;
}

main().catch((e) => { console.error("[reject-report] FAILED:", e); process.exit(1); });
