/**
 * L8.5 Name Preview
 *
 * storyboard.json + page_plan.json + bible/snapshot.json + bible/refs →
 *   episodes/ep{NN}/name/p{NN}.svg
 *   episodes/ep{NN}/name/name_manifest.json
 *
 * 加えて、name_approval.json が無ければ全ページ pending で初期化する。
 *
 * Usage:
 *   npx tsx scripts/manga/layers/L08-5-name-preview.ts --slug a07-modern-dungeon --episode 1
 */
import "../_env";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  bibleSnapshotPath,
  storyboardPath,
  pagePlanPath,
  bibleRefsDir,
  nameDir,
  nameManifestPath,
  nameIndexHtmlPath,
  nameApprovalPath,
  nameAuditPath,
} from "./_paths";
import { renderPageSvg } from "../../../src/lib/manga/name-preview/svg-renderer";
import { auditPage, auditVolume, type AuditFinding } from "../../../src/lib/manga/name-preview/audit-rules";
import { loadNarrationBudgets } from "../../../src/lib/manga/storyboard-v2/narration-budget";
import {
  pendingApproval,
  type NameManifest,
  type NameManifestPage,
} from "../../../src/lib/manga/name-preview/types";
import type {
  BibleSnapshotV2,
  EpisodeStoryboardV2,
  PagePlanV2,
} from "../../../src/lib/manga/schemas-v2";

type Args = { slug: string; episode: number };

function parseArgs(): Args {
  const a: Partial<Args> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    let key: string | null = null;
    let val: string | null = null;
    const eq = arg.match(/^--([^=]+)=(.*)$/);
    if (eq) [, key, val] = eq;
    else { const flag = arg.match(/^--(.+)$/); if (flag && i + 1 < argv.length) { key = flag[1]; val = argv[++i]; } }
    if (!key || val === null) continue;
    if (key === "slug") a.slug = val;
    else if (key === "episode") a.episode = Number(val);
  }
  if (!a.slug || !a.episode) throw new Error("--slug and --episode required");
  return a as Args;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * bible/refs/{...} の存在確認を高速化するための prefetch。
 * fs.access を毎パネル呼ぶと O(panels * refs) になるので、refs ディレクトリ配下を
 * 一回 walk して Set に持つ。
 */
async function buildRefsExistsPredicate(slug: string): Promise<(rel: string) => boolean> {
  const refsRoot = bibleRefsDir(slug);
  const set = new Set<string>();
  async function walk(dir: string, prefix: string): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try { entries = await fs.readdir(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      const sub = path.join(dir, e.name);
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(sub, rel);
      else if (e.isFile()) set.add(`bible/refs/${rel}`);
    }
  }
  await walk(refsRoot, "");
  return (rel) => set.has(rel);
}

async function main() {
  const args = parseArgs();
  console.log(`[L08.5] slug=${args.slug} ep=${args.episode}`);

  const bible = JSON.parse(await fs.readFile(bibleSnapshotPath(args.slug), "utf-8")) as BibleSnapshotV2;
  const storyboard = JSON.parse(await fs.readFile(storyboardPath(args.slug, args.episode), "utf-8")) as EpisodeStoryboardV2;
  const pagePlan = JSON.parse(await fs.readFile(pagePlanPath(args.slug, args.episode), "utf-8")) as PagePlanV2;

  const refsExists = await buildRefsExistsPredicate(args.slug);

  const outDir = nameDir(args.slug, args.episode);
  await fs.mkdir(outDir, { recursive: true });

  const sbPagesByNo = new Map(storyboard.pages.map((p) => [p.page_no, p]));
  const manifestPages: NameManifestPage[] = [];
  const allFindings: AuditFinding[] = [];

  for (const planPage of pagePlan.pages) {
    const sbPage = sbPagesByNo.get(planPage.page_no);
    if (!sbPage) {
      console.warn(`[L08.5] storyboard page ${planPage.page_no} missing, skipping`);
      continue;
    }
    // L8.6 audit (rule-based) を一度だけ計算し、SVG renderer に渡す
    const findings = auditPage({
      page: sbPage,
      pagePlanPage: planPage,
      refsExists,
    });
    allFindings.push(...findings);

    const { svg, warnings } = renderPageSvg({
      slug: args.slug,
      episode: args.episode,
      pagePlanPage: planPage,
      storyboardPage: sbPage,
      bible,
      refsExists,
      findings,
    });
    const filename = `p${String(planPage.page_no).padStart(2, "0")}.svg`;
    await fs.writeFile(path.join(outDir, filename), svg, "utf-8");
    manifestPages.push({
      page_no: planPage.page_no,
      page_role: planPage.page_role,
      panel_count: planPage.panels.length,
      svg_filename: filename,
      warnings,
      audit_findings: findings.map((f) => ({
        page_no: f.page_no,
        panel_id: f.panel_id,
        panel_no: f.panel_no,
        rule: f.rule,
        severity: f.severity,
        message: f.message,
        character_id: f.character_id,
      })),
    });
  }

  // Phase X WX-4: 巻スコープ audit (auditVolume) を呼ぶ
  // L8.5 は1 episode 単位なので、当該 episode を VolumeAuditInput として渡し
  // recovery_beat_missing / expectation_reality_gap_absent の signal を episode-level で取得する。
  // bible.meta.tone_profile を渡せば light_recovery 帯のみで判定がかかる (hellmode は skip)。
  //
  // Phase Y WY-2 追加: narration_budgets.json をロードして渡し、
  // narration_panel_chars_exceeded / narration_page_count_exceeded /
  // narration_episode_omniscient_exceeded を全 tone で検査する。
  const narrationBudgets = await loadNarrationBudgets().catch(() => undefined);
  const volumeFindings = auditVolume({
    episodes: [storyboard],
    toneProfile: bible.meta.tone_profile,
    genre: bible.meta.genre,
    narrationBudgets,
  });
  allFindings.push(...volumeFindings);

  // L8.6 audit 結果を name_audit.json に書き出す (manifest.warnings は subset)
  const auditReport = {
    schema_version: 1 as const,
    slug: args.slug,
    episode: args.episode,
    episode_id: storyboard.episode_id,
    audited_at: new Date().toISOString(),
    pages_total: pagePlan.pages.length,
    findings: allFindings,
    counts_by_rule: countByRule(allFindings),
    counts_by_severity: countBySeverity(allFindings),
  };
  await fs.writeFile(nameAuditPath(args.slug, args.episode), JSON.stringify(auditReport, null, 2), "utf-8");

  const manifest: NameManifest = {
    schema_version: 1,
    slug: args.slug,
    episode: args.episode,
    episode_id: storyboard.episode_id,
    generated_at: new Date().toISOString(),
    pages: manifestPages,
  };
  await fs.writeFile(nameManifestPath(args.slug, args.episode), JSON.stringify(manifest, null, 2), "utf-8");

  // Phase 2C: 操作 UI は Novelis Console (SPA) に統合済み。旧 index.html は redirect stub のみ残す。
  await fs.writeFile(
    nameIndexHtmlPath(args.slug, args.episode),
    renderSpaRedirectStub(args.slug, args.episode),
    "utf-8"
  );

  // name_approval.json が無ければ全ページ pending で初期化
  const approvalP = nameApprovalPath(args.slug, args.episode);
  if (!(await fileExists(approvalP))) {
    const approval = pendingApproval(
      storyboard.episode_id,
      pagePlan.pages.map((p) => p.page_no)
    );
    await fs.writeFile(approvalP, JSON.stringify(approval, null, 2), "utf-8");
    console.log(`[L08.5] name_approval.json initialized (all pending)`);
  } else {
    console.log(`[L08.5] name_approval.json already exists, kept`);
  }

  const totalWarnings = manifestPages.reduce((s, p) => s + p.warnings.length, 0);
  const sev = auditReport.counts_by_severity;
  console.log(`[L08.5] DONE: pages=${manifestPages.length} manifest_warnings=${totalWarnings} audit=info:${sev.info ?? 0}/warn:${sev.warn ?? 0}/error:${sev.error ?? 0}`);
  console.log(`[L08.5] outputs: ${outDir}`);
  console.log(`[L08.5] audit:   ${nameAuditPath(args.slug, args.episode)}`);
  console.log(`[L08.5] UI:      /works/${args.slug}/episodes/ep${String(args.episode).padStart(2, "0")}/#name-gate`);
}

function renderSpaRedirectStub(slug: string, episode: number): string {
  const ep = String(episode).padStart(2, "0");
  const url = `/works/${slug}/episodes/ep${ep}/#name-gate`;
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0; url=${escapeHtml(url)}">
  <title>name gate moved</title>
</head>
<body>
  <p>name gate は Novelis Console に移動しました。<a href="${escapeHtml(url)}">Novelis Console を開く</a></p>
</body>
</html>
`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function countByRule(findings: AuditFinding[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of findings) out[f.rule] = (out[f.rule] ?? 0) + 1;
  return out;
}

function countBySeverity(findings: AuditFinding[]): Record<string, number> {
  const out: Record<string, number> = { info: 0, warn: 0, error: 0 };
  for (const f of findings) out[f.severity] = (out[f.severity] ?? 0) + 1;
  return out;
}

main().catch((e) => { console.error("[L08.5] FAILED:", e); process.exit(1); });
