/**
 * L02b Bible Images Audit
 *
 * L02 で生成した bible/refs/{locations|characters|props}/<id>/<variant>.png を
 * vision で監査する。監査エンジンは claude CLI を `--print --output-format json
 * --model haiku` で起動する子プロセス。ANTHROPIC_API_KEY を別途消費せず Pro
 * plan 内で動く。
 *
 * Usage:
 *   # 既存 (locations のみ、後方互換)
 *   npx tsx scripts/manga/layers/L02b-bible-images-audit.ts --slug a07-modern-dungeon
 *
 *   # 全 kind
 *   npx tsx scripts/manga/layers/L02b-bible-images-audit.ts --slug a07-modern-dungeon \
 *     --kinds=locations,characters,props
 *
 *   # 単 character smoke test
 *   npx tsx scripts/manga/layers/L02b-bible-images-audit.ts --slug a07-modern-dungeon \
 *     --kinds=characters --targets=char_桐生_レン_v1 --concurrency=1 --model=haiku
 */
import "../_env";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  bibleSnapshotPath,
  bibleRefsDir,
  bibleRefsCharactersDir,
  bibleRefsLocationsDir,
  bibleRefsPropsDir,
} from "./_paths";
import {
  auditLocation,
  auditCharacter,
  auditProp,
  aggregateReport,
  writeAuditReport,
  type AuditKind,
  type LocationAuditResult,
  type CharacterAuditResult,
  type PropAuditResult,
} from "../../../src/lib/manga/qa-v2/bible-image-audit";

type Args = {
  slug: string;
  kinds: AuditKind[];
  targets?: Set<string>; // entity id の集合 (kind 横断、id プレフィクスで自然に分離される)
  concurrency: number;
  model: string;
  timeoutMs: number;
};

const VALID_KINDS: ReadonlyArray<AuditKind> = ["locations", "characters", "props"];

function parseArgs(): Args {
  const a: Partial<Args> = {
    kinds: ["locations"],
    concurrency: 2,
    model: process.env.AINARO_AUDIT_MODEL || "haiku",
    timeoutMs: 5 * 60 * 1000,
  };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    let key: string | null = null;
    let val: string | null = null;
    const eq = arg.match(/^--([^=]+)=(.*)$/);
    if (eq) {
      [, key, val] = eq;
    } else {
      const flag = arg.match(/^--(.+)$/);
      if (flag && i + 1 < argv.length) {
        key = flag[1];
        val = argv[++i];
      }
    }
    if (!key || val === null) continue;
    if (key === "slug") a.slug = val;
    else if (key === "targets")
      a.targets = new Set(val.split(",").map((s) => s.trim()).filter(Boolean));
    else if (key === "concurrency") a.concurrency = Math.max(1, Number(val));
    else if (key === "model") a.model = val;
    else if (key === "timeout-ms") a.timeoutMs = Number(val);
    else if (key === "kinds") {
      const parsed = val
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean) as AuditKind[];
      for (const k of parsed) {
        if (!VALID_KINDS.includes(k)) {
          throw new Error(`unknown kind: ${k} (valid: ${VALID_KINDS.join(",")})`);
        }
      }
      if (parsed.length === 0) throw new Error("--kinds requires at least one of locations|characters|props");
      a.kinds = parsed;
    }
  }
  if (!a.slug) throw new Error("--slug=<slug> required");
  return a as Args;
}

// ============================================================
// snapshot 読み取り
// ============================================================

type SnapshotLocation = {
  id: string;
  name: string;
  location_type?: string;
  spec?: Record<string, unknown>;
  continuity_anchors?: string[];
};

type SnapshotCharacter = {
  id: string;
  name: string;
  role?: string;
  age_visual?: string;
  spec?: Record<string, unknown>;
  continuity_anchors?: string[];
  appearance_notes?: string;
};

type SnapshotProp = {
  id: string;
  name: string;
  owner_character_id?: string;
  spec?: Record<string, unknown>;
  continuity_anchors?: string[];
};

type Snapshot = {
  characters?: SnapshotCharacter[];
  locations?: SnapshotLocation[];
  props?: SnapshotProp[];
};

async function loadSnapshot(slug: string): Promise<Snapshot> {
  const txt = await fs.readFile(bibleSnapshotPath(slug), "utf-8");
  return JSON.parse(txt) as Snapshot;
}

async function listVariantPngs(dir: string): Promise<Array<{ variant: string; abs_path: string }>> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.toLowerCase().endsWith(".png"))
    .sort()
    .map((e) => ({
      variant: e.replace(/\.png$/i, ""),
      abs_path: path.join(dir, e),
    }));
}

async function pmap<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const my = cursor++;
      if (my >= items.length) return;
      results[my] = await worker(items[my], my);
    }
  });
  await Promise.all(runners);
  return results;
}

// ============================================================
// kind 別の処理
// ============================================================

type KindStats = {
  kind: AuditKind;
  total_entities: number;
  total_images: number;
  by_severity: Record<string, number>;
  critical: number;
  out_path: string;
};

async function runLocations(args: Args): Promise<KindStats> {
  const snapshot = await loadSnapshot(args.slug);
  const all = snapshot.locations ?? [];
  const targets = args.targets ? all.filter((l) => args.targets!.has(l.id)) : all;
  if (targets.length === 0) {
    console.warn("[L02b/locations] no target locations");
    return makeEmptyStats("locations");
  }
  const refsDir = bibleRefsDir(args.slug);

  type Job = { loc: SnapshotLocation; variantFiles: Array<{ variant: string; abs_path: string }> };
  const jobs: Job[] = [];
  for (const loc of targets) {
    const dir = bibleRefsLocationsDir(args.slug, loc.id);
    const variants = await listVariantPngs(dir);
    if (variants.length === 0) {
      console.warn(`[L02b/locations] skip ${loc.id}: no png in ${dir}`);
      continue;
    }
    jobs.push({ loc, variantFiles: variants });
  }
  console.log(
    `[L02b/locations] queued ${jobs.length} entities / ${jobs.reduce((s, j) => s + j.variantFiles.length, 0)} images`
  );

  const t0 = Date.now();
  const results: LocationAuditResult[] = await pmap(jobs, args.concurrency, async (job, idx) => {
    const tag = `[L02b/locations ${idx + 1}/${jobs.length}] ${job.loc.id}`;
    console.log(`${tag} START variants=${job.variantFiles.map((v) => v.variant).join(",")}`);
    const t = Date.now();
    const r = await auditLocation({
      refsRoot: refsDir,
      location: {
        id: job.loc.id,
        name: job.loc.name,
        location_type: job.loc.location_type,
        spec: job.loc.spec as Parameters<typeof auditLocation>[0]["location"]["spec"],
        continuity_anchors: job.loc.continuity_anchors,
      },
      variantFiles: job.variantFiles,
      model: args.model,
      timeoutMs: args.timeoutMs,
    });
    const elapsed = ((Date.now() - t) / 1000).toFixed(1);
    if (r.error) console.warn(`${tag} ERROR (${elapsed}s): ${r.error}`);
    else {
      const sevs = r.variants.map((v) => `${v.variant}=${v.severity}`).join(" ");
      console.log(`${tag} DONE (${elapsed}s) ${sevs}`);
    }
    return r;
  });

  const report = aggregateReport({ slug: args.slug, results, model: args.model, kind: "locations" });
  const outPath = await writeAuditReport({ slug: args.slug, refsDir, report, kind: "locations" });
  const totalElapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `[L02b/locations] DONE in ${totalElapsed}s -> ${outPath} (ok=${report.summary.by_severity.ok} minor=${report.summary.by_severity.minor} major=${report.summary.by_severity.major} critical=${report.summary.by_severity.critical}, total=${report.summary.total_images})`
  );
  printRegens("locations", report.summary.regen_priority);
  return {
    kind: "locations",
    total_entities: report.summary.total_locations,
    total_images: report.summary.total_images,
    by_severity: report.summary.by_severity,
    critical: report.summary.by_severity.critical,
    out_path: outPath,
  };
}

async function runCharacters(args: Args): Promise<KindStats> {
  const snapshot = await loadSnapshot(args.slug);
  const all = snapshot.characters ?? [];
  const targets = args.targets ? all.filter((c) => args.targets!.has(c.id)) : all;
  if (targets.length === 0) {
    console.warn("[L02b/characters] no target characters");
    return makeEmptyStats("characters");
  }
  const refsDir = bibleRefsDir(args.slug);

  type Job = { c: SnapshotCharacter; variantFiles: Array<{ variant: string; abs_path: string }> };
  const jobs: Job[] = [];
  for (const c of targets) {
    const dir = bibleRefsCharactersDir(args.slug, c.id);
    const variants = await listVariantPngs(dir);
    if (variants.length === 0) {
      console.warn(`[L02b/characters] skip ${c.id}: no png in ${dir}`);
      continue;
    }
    jobs.push({ c, variantFiles: variants });
  }
  console.log(
    `[L02b/characters] queued ${jobs.length} entities / ${jobs.reduce((s, j) => s + j.variantFiles.length, 0)} images`
  );

  const t0 = Date.now();
  const results: CharacterAuditResult[] = await pmap(jobs, args.concurrency, async (job, idx) => {
    const tag = `[L02b/characters ${idx + 1}/${jobs.length}] ${job.c.id}`;
    console.log(`${tag} START variants=${job.variantFiles.length}枚`);
    const t = Date.now();
    const r = await auditCharacter({
      refsRoot: refsDir,
      character: {
        id: job.c.id,
        name: job.c.name,
        role: job.c.role,
        age_visual: job.c.age_visual,
        spec: job.c.spec as Parameters<typeof auditCharacter>[0]["character"]["spec"],
        continuity_anchors: job.c.continuity_anchors,
        appearance_notes: job.c.appearance_notes,
      },
      variantFiles: job.variantFiles,
      model: args.model,
      timeoutMs: args.timeoutMs,
    });
    const elapsed = ((Date.now() - t) / 1000).toFixed(1);
    if (r.error) console.warn(`${tag} PARTIAL/ERROR (${elapsed}s): ${r.error}`);
    const sevs = r.variants.map((v) => `${v.variant}=${v.severity}`).join(" ");
    console.log(`${tag} DONE (${elapsed}s) ${sevs}`);
    return r;
  });

  const report = aggregateReport({ slug: args.slug, results, model: args.model, kind: "characters" });
  const outPath = await writeAuditReport({ slug: args.slug, refsDir, report, kind: "characters" });
  const totalElapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `[L02b/characters] DONE in ${totalElapsed}s -> ${outPath} (ok=${report.summary.by_severity.ok} minor=${report.summary.by_severity.minor} major=${report.summary.by_severity.major} critical=${report.summary.by_severity.critical}, total=${report.summary.total_images})`
  );
  printRegens("characters", report.summary.regen_priority);
  return {
    kind: "characters",
    total_entities: report.summary.total_characters,
    total_images: report.summary.total_images,
    by_severity: report.summary.by_severity,
    critical: report.summary.by_severity.critical,
    out_path: outPath,
  };
}

async function runProps(args: Args): Promise<KindStats> {
  const snapshot = await loadSnapshot(args.slug);
  const all = snapshot.props ?? [];
  const targets = args.targets ? all.filter((p) => args.targets!.has(p.id)) : all;
  if (targets.length === 0) {
    console.warn("[L02b/props] no target props");
    return makeEmptyStats("props");
  }
  const refsDir = bibleRefsDir(args.slug);

  type Job = { p: SnapshotProp; variantFiles: Array<{ variant: string; abs_path: string }> };
  const jobs: Job[] = [];
  for (const p of targets) {
    const dir = bibleRefsPropsDir(args.slug, p.id);
    const variants = await listVariantPngs(dir);
    if (variants.length === 0) {
      console.warn(`[L02b/props] skip ${p.id}: no png in ${dir}`);
      continue;
    }
    jobs.push({ p, variantFiles: variants });
  }
  console.log(
    `[L02b/props] queued ${jobs.length} entities / ${jobs.reduce((s, j) => s + j.variantFiles.length, 0)} images`
  );

  const t0 = Date.now();
  const results: PropAuditResult[] = await pmap(jobs, args.concurrency, async (job, idx) => {
    const tag = `[L02b/props ${idx + 1}/${jobs.length}] ${job.p.id}`;
    console.log(`${tag} START variants=${job.variantFiles.map((v) => v.variant).join(",")}`);
    const t = Date.now();
    const r = await auditProp({
      refsRoot: refsDir,
      prop: {
        id: job.p.id,
        name: job.p.name,
        owner_character_id: job.p.owner_character_id,
        spec: job.p.spec as Parameters<typeof auditProp>[0]["prop"]["spec"],
        continuity_anchors: job.p.continuity_anchors,
      },
      variantFiles: job.variantFiles,
      model: args.model,
      timeoutMs: args.timeoutMs,
    });
    const elapsed = ((Date.now() - t) / 1000).toFixed(1);
    if (r.error) console.warn(`${tag} ERROR (${elapsed}s): ${r.error}`);
    else {
      const sevs = r.variants.map((v) => `${v.variant}=${v.severity}`).join(" ");
      console.log(`${tag} DONE (${elapsed}s) ${sevs}`);
    }
    return r;
  });

  const report = aggregateReport({ slug: args.slug, results, model: args.model, kind: "props" });
  const outPath = await writeAuditReport({ slug: args.slug, refsDir, report, kind: "props" });
  const totalElapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `[L02b/props] DONE in ${totalElapsed}s -> ${outPath} (ok=${report.summary.by_severity.ok} minor=${report.summary.by_severity.minor} major=${report.summary.by_severity.major} critical=${report.summary.by_severity.critical}, total=${report.summary.total_images})`
  );
  printRegens("props", report.summary.regen_priority);
  return {
    kind: "props",
    total_entities: report.summary.total_props,
    total_images: report.summary.total_images,
    by_severity: report.summary.by_severity,
    critical: report.summary.by_severity.critical,
    out_path: outPath,
  };
}

function makeEmptyStats(kind: AuditKind): KindStats {
  return {
    kind,
    total_entities: 0,
    total_images: 0,
    by_severity: { ok: 0, minor: 0, major: 0, critical: 0 },
    critical: 0,
    out_path: "(skipped)",
  };
}

function printRegens(
  kind: AuditKind,
  regens: Array<{ variant: string; severity: string; reason: string } & Record<string, unknown>>
): void {
  if (regens.length === 0) return;
  console.log(`[L02b/${kind}] regen priority (top 10):`);
  const idKey = kind === "locations" ? "location_id" : kind === "characters" ? "character_id" : "prop_id";
  for (const p of regens.slice(0, 10)) {
    const id = (p as Record<string, unknown>)[idKey] as string;
    console.log(`  - [${p.severity}] ${id}/${p.variant} -- ${String(p.reason).slice(0, 120)}`);
  }
}

// ============================================================
// main
// ============================================================

async function main() {
  const args = parseArgs();
  console.log(
    `[L02b] slug=${args.slug} kinds=${args.kinds.join(",")} model=${args.model} concurrency=${args.concurrency}`
  );

  const stats: KindStats[] = [];
  for (const kind of args.kinds) {
    if (kind === "locations") stats.push(await runLocations(args));
    else if (kind === "characters") stats.push(await runCharacters(args));
    else if (kind === "props") stats.push(await runProps(args));
  }

  console.log("");
  console.log("[L02b] === summary ===");
  let totalCritical = 0;
  for (const s of stats) {
    console.log(
      `  ${s.kind}: entities=${s.total_entities} images=${s.total_images} ok=${s.by_severity.ok ?? 0} minor=${s.by_severity.minor ?? 0} major=${s.by_severity.major ?? 0} critical=${s.by_severity.critical ?? 0} -> ${s.out_path}`
    );
    totalCritical += s.critical;
  }
  if (totalCritical > 0) {
    console.warn(`[L02b] total critical=${totalCritical} -> exit 2`);
    process.exit(2);
  }
}

main().catch((e) => {
  console.error("[L02b] FAILED:", e);
  process.exit(1);
});
