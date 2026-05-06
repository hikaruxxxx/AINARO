import path from "node:path";
import { MANGA_DATA_ROOT, REPO_ROOT } from "../../../../../../scripts/manga/layers/_paths";
import { isValidEpisode, isValidSlug } from "../lib/path-guards";
import { LAYER_REGISTRY, isLayerId, type LayerId } from "./registry";

export type JobRequest = {
  layer: LayerId;
  slug: string;
  episode?: number;
  volume?: number;
  args?: Record<string, string>;
};

export type ValidatedJob = {
  cwd: string;
  argv: string[];
  key: string;
};

export class ValidationError extends Error {}

function isValidVolume(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n > 0;
}

function assertDataPath(value: string): void {
  const resolved = path.resolve(REPO_ROOT, value);
  const root = MANGA_DATA_ROOT.endsWith(path.sep) ? MANGA_DATA_ROOT : MANGA_DATA_ROOT + path.sep;
  if (resolved !== MANGA_DATA_ROOT && !resolved.startsWith(root)) {
    throw new Error(`path must be under data/manga: ${value}`);
  }
}

export function validateJobRequest(req: JobRequest): ValidatedJob {
  if (!isLayerId(req.layer)) throw new ValidationError("invalid layer");
  if (!isValidSlug(req.slug)) throw new ValidationError("invalid slug");

  const entry = LAYER_REGISTRY[req.layer];
  if (entry.scope === "episode" && !isValidEpisode(req.episode)) {
    throw new ValidationError("episode is required");
  }
  if (entry.scope === "volume" && !isValidVolume(req.volume)) {
    throw new ValidationError("volume is required");
  }

  const argv = [entry.script, "--slug", req.slug];
  if (entry.scope === "episode") argv.push("--episode", String(req.episode));
  if (entry.scope === "volume") argv.push("--volume", String(req.volume));

  const allowed = new Map(entry.allowedFlags.map((flag) => [flag.name, flag]));
  const args = req.args ?? {};
  for (const [flagName, rawValue] of Object.entries(args)) {
    const flag = allowed.get(flagName);
    if (!flag) throw new ValidationError(`flag is not allowed: ${flagName}`);
    if (typeof rawValue !== "string") {
      throw new ValidationError(`flag ${flagName}: value must be string (got ${typeof rawValue})`);
    }
    const value = rawValue;
    flag.pattern.lastIndex = 0;
    if (!flag.pattern.test(value)) throw new ValidationError(`invalid value for ${flagName}`);
    if (flag.isPath) assertDataPath(value);
    argv.push(flagName);
    if (value !== "") argv.push(value);
  }

  const scopePart =
    entry.scope === "episode" ? String(req.episode) : entry.scope === "volume" ? String(req.volume) : "*";
  return {
    cwd: REPO_ROOT,
    argv,
    key: `${req.slug}#${scopePart}#${req.layer}`,
  };
}
