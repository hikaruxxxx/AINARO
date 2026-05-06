import { promises as fs } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "../../../../../../scripts/manga/layers/_paths";
import type { JobEvent } from "./runner";

export type StoredJob = {
  id: string;
  key: string;
  layer: string;
  scope: { slug: string; episode?: number; volume?: number };
  state: "succeeded" | "failed" | "aborted";
  startedAt: string;
  finishedAt?: string;
  exitCode?: number;
  events: JobEvent[];
  revision_id?: string;
  panel_ids?: string[];
};

const JOBS_ROOT = path.join(REPO_ROOT, "data/manga/_ops_console/jobs");

function dateKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function dayKeys(days: number): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setUTCDate(now.getUTCDate() - i);
    result.push(d.toISOString().slice(0, 10));
  }
  return result;
}

function isStoredJob(value: unknown): value is StoredJob {
  if (!value || typeof value !== "object") return false;
  const obj = value as Partial<StoredJob>;
  return (
    typeof obj.id === "string" &&
    typeof obj.key === "string" &&
    typeof obj.layer === "string" &&
    typeof obj.startedAt === "string" &&
    (obj.state === "succeeded" || obj.state === "failed" || obj.state === "aborted") &&
    Array.isArray(obj.events)
  );
}

export async function persistJob(job: StoredJob): Promise<void> {
  const dir = path.join(JOBS_ROOT, dateKey(job.startedAt));
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${job.id}.json`);
  await fs.writeFile(file, `${JSON.stringify(job, null, 2)}\n`, "utf-8");
}

export async function loadRecentJobs(days: number): Promise<StoredJob[]> {
  const jobs: StoredJob[] = [];
  for (const day of dayKeys(days)) {
    const dir = path.join(JOBS_ROOT, day);
    let files: string[];
    try {
      files = await fs.readdir(dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(path.join(dir, file), "utf-8");
        const parsed = JSON.parse(raw) as unknown;
        if (isStoredJob(parsed)) jobs.push(parsed);
      } catch (error) {
        console.warn(`[ops-console] failed to load stored job ${day}/${file}:`, error);
      }
    }
  }
  return jobs.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}
