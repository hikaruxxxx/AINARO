import type http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { volumeDir, volumePlotPath, workDir } from "../../../../../../scripts/manga/layers/_paths";

type FileStatus = { exists: boolean; mtime?: string; size?: number };

type VolumeInfo = {
  volume: number;
  episodes: number[];
  kdp_status: {
    manuscript_pdf: FileStatus;
    cover_pdf: FileStatus;
    metadata_json: FileStatus;
    kdp_input_md: FileStatus;
  };
};

async function fileStatus(file: string, includeSize: boolean): Promise<FileStatus> {
  try {
    const stat = await fs.stat(file);
    return {
      exists: true,
      mtime: stat.mtime.toISOString(),
      ...(includeSize ? { size: stat.size } : {}),
    };
  } catch {
    return { exists: false };
  }
}

async function volumeEpisodes(slug: string, volume: number): Promise<number[]> {
  try {
    const raw = await fs.readFile(volumePlotPath(slug, volume), "utf-8");
    const plot = JSON.parse(raw) as { episodes?: Array<{ episode_no?: unknown }> };
    return (plot.episodes ?? [])
      .map((episode) => Number(episode.episode_no))
      .filter((n) => Number.isInteger(n) && n > 0);
  } catch {
    return [];
  }
}

async function volumeInfo(slug: string, volume: number): Promise<VolumeInfo> {
  const kdp = path.join(volumeDir(slug, volume), "kdp");
  const [episodes, manuscript_pdf, cover_pdf, metadata_json, kdp_input_md] = await Promise.all([
    volumeEpisodes(slug, volume),
    fileStatus(path.join(kdp, "manuscript.pdf"), true),
    fileStatus(path.join(kdp, "cover.pdf"), true),
    fileStatus(path.join(kdp, "metadata.json"), false),
    fileStatus(path.join(kdp, "kdp-input.md"), false),
  ]);
  return {
    volume,
    episodes,
    kdp_status: { manuscript_pdf, cover_pdf, metadata_json, kdp_input_md },
  };
}

export async function handleVolumesList(slug: string, res: http.ServerResponse): Promise<void> {
  const dir = path.join(workDir(slug), "volumes");
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const volumes = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name.match(/^v(\d+)$/)?.[1])
    .filter((value): value is string => Boolean(value))
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => a - b);
  const infos = await Promise.all(volumes.map((volume) => volumeInfo(slug, volume)));
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ slug, volumes: infos }));
}
