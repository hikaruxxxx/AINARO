import type http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  auditPath,
  bibleDir,
  bibleRefsDir,
  bibleSnapshotPath,
  episodeDir,
  incrementalRefsDir,
  nameApprovalPath,
  nameManifestPath,
  pagePlanPath,
  resolvedRefsPath,
  storyboardPath,
  workDir,
  volumePlotPath,
} from "../../../../../../scripts/manga/layers/_paths";
import { isValidEpisode, isValidSlug } from "../lib/path-guards";

type PipelineLayerId =
  | "L01"
  | "L01b"
  | "L01c"
  | "L02"
  | "L02b"
  | "L03"
  | "L04"
  | "L04_1"
  | "L04_9"
  | "L05"
  | "L06"
  | "L07"
  | "L08"
  | "L08.5"
  | "L08.7"
  | "L09"
  | "L11"
  | "L12"
  | "L13";

type RunnableLayerId =
  | "L01"
  | "L01b"
  | "L01c"
  | "L02"
  | "L02b"
  | "L04_1"
  | "L04_9"
  | "L09"
  | "L11"
  | "L12"
  | "L13";

type PipelineStatusLayer = {
  id: PipelineLayerId;
  label: string;
  status: "missing" | "ready" | "stale";
  artifacts: string[];
  last_modified?: string;
  next_view?: string;
  next_layer_id?: RunnableLayerId | null;
};

type ArtifactSpec = {
  path: string;
  relative: string;
  kind: "file" | "dir" | "png-in-dir" | "image-in-dir";
};

type LayerSpec = {
  id: PipelineLayerId;
  label: string;
  artifacts: ArtifactSpec[];
  next_view?: string;
  next_layer_id?: RunnableLayerId | null;
};

function send(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function rel(slug: string, absPath: string): string {
  return path.relative(workDir(slug), absPath).replaceAll(path.sep, "/");
}

async function newestFileMtimeInDir(
  dir: string,
  predicate: (name: string) => boolean,
  recursive = false
): Promise<Date | null> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    let newest: Date | null = null;
    for (const entry of entries) {
      const child = path.join(dir, entry.name);
      if (recursive && entry.isDirectory()) {
        const nested = await newestFileMtimeInDir(child, predicate, true);
        if (nested && (!newest || nested > newest)) newest = nested;
        continue;
      }
      if (!entry.isFile() || !predicate(entry.name)) continue;
      const stat = await fs.stat(child);
      if (!newest || stat.mtime > newest) newest = stat.mtime;
    }
    return newest;
  } catch {
    return null;
  }
}

async function artifactMtime(spec: ArtifactSpec): Promise<Date | null> {
  try {
    if (spec.kind === "file") {
      const stat = await fs.stat(spec.path);
      return stat.isFile() ? stat.mtime : null;
    }
    if (spec.kind === "dir") {
      const stat = await fs.stat(spec.path);
      return stat.isDirectory() ? stat.mtime : null;
    }
    if (spec.kind === "png-in-dir") {
      return newestFileMtimeInDir(spec.path, (name) => name.toLowerCase().endsWith(".png"));
    }
    return newestFileMtimeInDir(
      spec.path,
      (name) => /\.(png|jpe?g|webp|gif)$/i.test(name),
      true
    );
  } catch {
    return null;
  }
}

async function toLayerStatus(spec: LayerSpec): Promise<PipelineStatusLayer> {
  const mtimes = await Promise.all(spec.artifacts.map((artifact) => artifactMtime(artifact)));
  const newest = mtimes.reduce<Date | null>((acc, mtime) => {
    if (!mtime) return acc;
    return !acc || mtime > acc ? mtime : acc;
  }, null);
  return {
    id: spec.id,
    label: spec.label,
    status: newest ? "ready" : "missing",
    artifacts: spec.artifacts.map((artifact) => artifact.relative),
    last_modified: newest?.toISOString(),
    next_view: spec.next_view,
    next_layer_id: spec.next_layer_id,
  };
}

function specs(slug: string, episode: number): LayerSpec[] {
  const epDir = episodeDir(slug, episode);
  const bibleRefs = bibleRefsDir(slug);
  const renders = path.join(epDir, "renders");
  const revisionResolved = path.join(epDir, "_revision_resolved.jsonl");
  const kdpPdf = path.join(workDir(slug), "volumes", "v01", "kdp", "manuscript.pdf");
  const shotlist = path.join(epDir, "shotlist.json");

  const artifact = (absPath: string, kind: ArtifactSpec["kind"]): ArtifactSpec => ({
    path: absPath,
    relative: rel(slug, absPath),
    kind,
  });

  return [
    {
      id: "L01",
      label: "L01 Bible Snapshot",
      artifacts: [artifact(bibleSnapshotPath(slug), "file")],
      next_view: "bible",
      next_layer_id: "L01",
    },
    {
      id: "L01b",
      label: "L01b Bible Lint",
      artifacts: [artifact(path.join(bibleDir(slug), "lint_report.json"), "file")],
      next_view: "bible",
      next_layer_id: "L01b",
    },
    {
      id: "L01c",
      label: "L01c Bible Deepen",
      artifacts: [artifact(bibleSnapshotPath(slug), "file")],
      next_view: "bible",
      next_layer_id: "L01c",
    },
    {
      id: "L02",
      label: "L02 Bible Images",
      artifacts: [artifact(bibleRefs, "image-in-dir")],
      next_view: "bible",
      next_layer_id: "L02",
    },
    {
      id: "L02b",
      label: "L02b Volume Plot",
      artifacts: [artifact(volumePlotPath(slug, 1), "file")],
      next_view: "volume-plot",
      next_layer_id: "L02b",
    },
    { id: "L03", label: "L03 Shotlist", artifacts: [artifact(shotlist, "file")], next_view: "storyboard", next_layer_id: null },
    { id: "L04", label: "L04 Storyboard", artifacts: [artifact(storyboardPath(slug, episode), "file")], next_view: "storyboard", next_layer_id: null },
    {
      id: "L04_1",
      label: "L04.1 Opening Hook",
      artifacts: [artifact(path.join(epDir, "_opening_alts"), "dir")],
      next_view: "storyboard",
      next_layer_id: "L04_1",
    },
    {
      id: "L04_9",
      label: "L04.9 Cliffhanger",
      artifacts: [artifact(path.join(epDir, "_cliffhanger_alts"), "dir")],
      next_view: "storyboard",
      next_layer_id: "L04_9",
    },
    { id: "L05", label: "L05 Page Director", artifacts: [artifact(pagePlanPath(slug, episode), "file")], next_view: "storyboard", next_layer_id: null },
    { id: "L06", label: "L06 Continuity", artifacts: [artifact(pagePlanPath(slug, episode), "file")], next_view: "storyboard", next_layer_id: null },
    { id: "L07", label: "L07 Refs Resolution", artifacts: [artifact(resolvedRefsPath(slug, episode), "file")], next_view: "storyboard", next_layer_id: null },
    { id: "L08", label: "L08 Incremental Refs", artifacts: [artifact(incrementalRefsDir(slug, episode), "dir")], next_view: "storyboard", next_layer_id: null },
    // L08.5 は内部 audit を含む。pipeline 上は warning 表示のみで独立 row にしない。
    { id: "L08.5", label: "L08.5 Name Preview + Audit", artifacts: [artifact(nameManifestPath(slug, episode), "file")], next_view: "name-gate", next_layer_id: null },
    { id: "L08.7", label: "L08.7 Name Approval", artifacts: [artifact(nameApprovalPath(slug, episode), "file")], next_view: "name-gate", next_layer_id: null },
    { id: "L09", label: "L09 Render", artifacts: [artifact(renders, "png-in-dir")], next_view: "revision", next_layer_id: "L09" },
    { id: "L11", label: "L11 Audit", artifacts: [artifact(auditPath(slug, episode), "file")], next_view: "quality", next_layer_id: "L11" },
    { id: "L12", label: "L12 Repair", artifacts: [artifact(revisionResolved, "file")], next_view: "revision", next_layer_id: "L12" },
    { id: "L13", label: "L13 KDP", artifacts: [artifact(kdpPdf, "file")], next_view: "volumes", next_layer_id: "L13" },
  ];
}

export async function handlePipelineStatus(
  slug: string,
  episode: number,
  res: http.ServerResponse
): Promise<void> {
  if (!isValidSlug(slug) || !isValidEpisode(episode)) {
    return send(res, 400, { error: "作品 ID または episode 番号が不正です" });
  }
  const layers = await Promise.all(specs(slug, episode).map((spec) => toLayerStatus(spec)));
  return send(res, 200, {
    slug,
    episode,
    layers,
    generated_at: new Date().toISOString(),
  });
}
