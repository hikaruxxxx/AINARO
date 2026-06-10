import type http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  WORKS_DIR,
  adoptedVersionsPath,
  auditPath,
  episodeDir,
  renderManifestPath,
  revisionQueuePath,
  workDir,
  workMetaPath,
} from "../../../../../../scripts/manga/layers/_paths";
import { readJsonl } from "../../../revision-ui/manifest";
import type { AdoptedVersions, RenderManifestEntry, RevisionEntry } from "../../../revision-ui/types";
import { isValidSlug } from "../lib/path-guards";

type EpisodeQualityOverview = {
  episode: number;
  audit_failed_count: number;
  audit_status: "ready" | "missing" | "stale";
  revision_unresolved_count: number;
  adopted_pending_count: number;
  last_audit_at?: string;
};

type WorkQualityOverview = {
  slug: string;
  title?: string;
  episodes: EpisodeQualityOverview[];
  totals: {
    audit_failed: number;
    revision_unresolved: number;
    adopted_pending: number;
  };
};

type ResolvedRecord = {
  revision_id: string;
  resolved_version: string;
  ts: string;
  succeeded: boolean;
};

async function readJsonOpt<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

async function readTitle(slug: string): Promise<string | undefined> {
  const meta = await readJsonOpt<{ title?: unknown }>(workMetaPath(slug));
  return typeof meta?.title === "string" && meta.title ? meta.title : undefined;
}

async function listSlugs(): Promise<string[]> {
  const entries = await fs.readdir(WORKS_DIR, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith(".") && !name.startsWith("_") && name !== "archive" && isValidSlug(name))
    .sort();
}

async function listEpisodes(slug: string): Promise<number[]> {
  const entries = await fs.readdir(path.join(workDir(slug), "episodes"), { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name.match(/^ep(\d+)$/)?.[1])
    .filter((value): value is string => Boolean(value))
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => a - b);
}

async function auditSummary(slug: string, episode: number): Promise<{
  audit_failed_count: number;
  audit_status: "ready" | "missing" | "stale";
  last_audit_at?: string;
}> {
  const file = auditPath(slug, episode);
  try {
    const [raw, stat] = await Promise.all([fs.readFile(file, "utf-8"), fs.stat(file)]);
    const audit = JSON.parse(raw) as { failed_panel_ids?: unknown };
    const failed = Array.isArray(audit.failed_panel_ids) ? audit.failed_panel_ids.length : 0;
    return { audit_failed_count: failed, audit_status: "ready", last_audit_at: stat.mtime.toISOString() };
  } catch {
    return { audit_failed_count: 0, audit_status: "missing" };
  }
}

async function revisionUnresolvedCount(slug: string, episode: number): Promise<number> {
  const [queue, resolved] = await Promise.all([
    readJsonl<RevisionEntry>(revisionQueuePath(slug, episode)).catch(() => []),
    readJsonl<ResolvedRecord>(path.join(episodeDir(slug, episode), "_revision_resolved.jsonl")).catch(() => []),
  ]);
  const resolvedIds = new Set(resolved.filter((entry) => entry.succeeded).map((entry) => entry.revision_id));
  return queue.filter((entry) => !entry.resolved_version && !resolvedIds.has(entry.id)).length;
}

async function adoptedPendingCount(slug: string, episode: number): Promise<number> {
  const [renderManifest, adopted] = await Promise.all([
    readJsonl<RenderManifestEntry>(renderManifestPath(slug, episode)).catch(() => []),
    readJsonOpt<AdoptedVersions>(adoptedVersionsPath(slug, episode)),
  ]);
  const versionsByPanel = new Map<string, Set<string>>();
  for (const entry of renderManifest) {
    const set = versionsByPanel.get(entry.panel_id) ?? new Set<string>();
    set.add(entry.version);
    versionsByPanel.set(entry.panel_id, set);
  }
  let count = 0;
  for (const [panelId, versions] of versionsByPanel.entries()) {
    if (versions.size > 1 && !adopted?.panels?.[panelId]) count++;
  }
  return count;
}

async function episodeOverview(slug: string, episode: number): Promise<EpisodeQualityOverview> {
  try {
    const [audit, revision_unresolved_count, adopted_pending_count] = await Promise.all([
      auditSummary(slug, episode),
      revisionUnresolvedCount(slug, episode),
      adoptedPendingCount(slug, episode),
    ]);
    return { episode, ...audit, revision_unresolved_count, adopted_pending_count };
  } catch {
    return {
      episode,
      audit_failed_count: 0,
      audit_status: "missing",
      revision_unresolved_count: 0,
      adopted_pending_count: 0,
    };
  }
}

async function workOverview(slug: string): Promise<WorkQualityOverview> {
  const [title, episodes] = await Promise.all([readTitle(slug), listEpisodes(slug)]);
  const rows = await Promise.all(episodes.map((episode) => episodeOverview(slug, episode)));
  const totals = rows.reduce(
    (acc, row) => {
      acc.audit_failed += row.audit_failed_count;
      acc.revision_unresolved += row.revision_unresolved_count;
      acc.adopted_pending += row.adopted_pending_count;
      return acc;
    },
    { audit_failed: 0, revision_unresolved: 0, adopted_pending: 0 }
  );
  rows.sort((a, b) =>
    (b.audit_failed_count + b.revision_unresolved_count + b.adopted_pending_count) -
    (a.audit_failed_count + a.revision_unresolved_count + a.adopted_pending_count)
  );
  return { slug, title, episodes: rows, totals };
}

export async function handleQualityOverview(res: http.ServerResponse): Promise<void> {
  const slugs = await listSlugs();
  const works = await Promise.all(slugs.map((slug) => workOverview(slug)));
  works.sort((a, b) => a.slug.localeCompare(b.slug));
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ works, generated_at: new Date().toISOString() }));
}
