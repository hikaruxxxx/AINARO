/**
 * GET /api/manifest ハンドラ (旧 serve-revision.ts:handleManifest)
 *
 * 統合 manifest を返す: page_plan / storyboard / audit / render_manifest /
 * revision_queue (resolved 情報マージ) / adopted / bible_characters の view。
 *
 * scope 確定は呼び出し側の責務。
 */
import type http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  bibleSnapshotPath,
  storyboardPath,
  pagePlanPath,
  auditPath,
  engagementAuditPath,
  nameDir,
  renderManifestPath,
  revisionQueuePath,
  adoptedVersionsPath,
  episodeDir,
} from "../../../../../../scripts/manga/layers/_paths";
import { readJsonl } from "../../../revision-ui/manifest";
import {
  emptyAdoptedVersions,
  type AdoptedVersions,
  type EngagementAudit,
  type RenderManifestEntry,
  type RevisionEntry,
} from "../../../revision-ui/types";
import type {
  AuditReport,
  BibleSnapshotV2,
  EpisodeStoryboardV2,
  PagePlanV2,
} from "../../../schemas-v2";
import type { NameLintReport } from "../../../qa-v2/name-lint";

async function loadJsonOpt<T>(p: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(p, "utf-8")) as T;
  } catch {
    return null;
  }
}

async function loadAdopted(
  slug: string,
  episode: number,
  episodeId: string
): Promise<AdoptedVersions> {
  const x = await loadJsonOpt<AdoptedVersions>(adoptedVersionsPath(slug, episode));
  return x ?? emptyAdoptedVersions(slug, episode, episodeId);
}

type ResolvedRecord = {
  revision_id: string;
  resolved_version: string;
  ts: string;
  succeeded: boolean;
};

async function loadRevisionResolvedMap(
  slug: string,
  episode: number
): Promise<Map<string, ResolvedRecord>> {
  const fp = path.join(episodeDir(slug, episode), "_revision_resolved.jsonl");
  const records = await readJsonl<ResolvedRecord>(fp);
  const m = new Map<string, ResolvedRecord>();
  for (const r of records) m.set(r.revision_id, r);
  return m;
}

export async function handleManifest(
  slug: string,
  episode: number,
  res: http.ServerResponse
): Promise<void> {
  const [
    bible,
    storyboard,
    pagePlan,
    audit,
    nameLintReport,
    engagementAudit,
    renderManifest,
    revisionQueueRaw,
    resolvedMap,
  ] = await Promise.all([
    loadJsonOpt<BibleSnapshotV2>(bibleSnapshotPath(slug)),
    loadJsonOpt<EpisodeStoryboardV2>(storyboardPath(slug, episode)),
    loadJsonOpt<PagePlanV2>(pagePlanPath(slug, episode)),
    loadJsonOpt<AuditReport>(auditPath(slug, episode)),
    loadJsonOpt<NameLintReport>(path.join(nameDir(slug, episode), "lint_report.json")),
    loadJsonOpt<EngagementAudit>(engagementAuditPath(slug, episode)),
    readJsonl<RenderManifestEntry>(renderManifestPath(slug, episode)),
    readJsonl<RevisionEntry>(revisionQueuePath(slug, episode)),
    loadRevisionResolvedMap(slug, episode),
  ]);
  if (!storyboard || !pagePlan) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "storyboard or page_plan missing" }));
    return;
  }
  const revisionQueue = revisionQueueRaw.map((entry) => {
    const r = resolvedMap.get(entry.id);
    if (!r || !r.succeeded) return entry;
    return { ...entry, resolved_version: r.resolved_version, resolved_at: r.ts };
  });
  const adopted = await loadAdopted(slug, episode, storyboard.episode_id);
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(
    JSON.stringify({
      schema_version: 1,
      slug,
      episode,
      episode_id: storyboard.episode_id,
      generated_at: new Date().toISOString(),
      page_plan: pagePlan,
      storyboard,
      audit,
      name_lint_report: nameLintReport,
      engagement_audit: engagementAudit,
      render_manifest: renderManifest,
      revision_queue: revisionQueue,
      adopted,
      bible_characters: (bible?.characters ?? []).map((c) => ({ id: c.id, name: c.name })),
    })
  );
}
