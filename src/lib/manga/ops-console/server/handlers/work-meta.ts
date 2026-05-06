/**
 * work meta.json と KDP metadata 編集用 endpoint。
 *
 * Console から企画/出版メタを触るため、server 境界で slug・schema・KDP keyword を検証する。
 */
import type http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  DEFAULT_NG_WORDS,
  validateKdpKeywords,
  type KeywordValidationResult,
} from "../../../publish-v2/kdp/keyword-validator";
import {
  bibleDir,
  volumeDir,
  workDir,
  workMetaPath,
} from "../../../../../../scripts/manga/layers/_paths";
import { WorkMetaJsonSchema, parseOrThrow } from "../../../schemas-v2.zod";
import { isValidSlug } from "../lib/path-guards";

export type WorkKdpMetadataBlock = {
  title_candidates?: string[];
  series_name_canonical?: string;
  keyword_picks_7?: string[];
  categories_validated?: string[];
  description_seed?: unknown;
};

type WorkMeta = {
  schema_version: number;
  slug: string;
  title: string;
  genre?: string;
  art_style?: string;
  target_audience?: string;
  kdp_metadata?: WorkKdpMetadataBlock;
  [key: string]: unknown;
};

function send(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readMeta(slug: string): Promise<WorkMeta | null> {
  try {
    const meta = JSON.parse(await fs.readFile(workMetaPath(slug), "utf-8")) as WorkMeta;
    return parseOrThrow(WorkMetaJsonSchema, meta, `meta.json (${slug})`) as WorkMeta;
  } catch {
    return null;
  }
}

async function writeMetaAtomic(slug: string, meta: WorkMeta): Promise<void> {
  parseOrThrow(WorkMetaJsonSchema, meta, `meta.json (${slug})`);
  const target = workMetaPath(slug);
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(meta, null, 2) + "\n", "utf-8");
  await fs.rename(tmp, target);
}

function stringArray(value: unknown, max?: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return max ? out.slice(0, max) : out;
}

function sanitizeKdpMetadataPatch(body: any): WorkKdpMetadataBlock {
  const patch: WorkKdpMetadataBlock = {};
  const titleCandidates = stringArray(body?.title_candidates);
  if (titleCandidates) patch.title_candidates = titleCandidates;
  if (typeof body?.series_name_canonical === "string") {
    patch.series_name_canonical = body.series_name_canonical.trim();
  }
  const keywords = stringArray(body?.keyword_picks_7, 7);
  if (keywords) patch.keyword_picks_7 = keywords;
  const categories = stringArray(body?.categories_validated, 3);
  if (categories) patch.categories_validated = categories;
  if (Object.prototype.hasOwnProperty.call(body ?? {}, "description_seed")) {
    patch.description_seed = body.description_seed;
  }
  return patch;
}

export async function handleWorkMetaGet(slug: string, res: http.ServerResponse): Promise<void> {
  if (!isValidSlug(slug)) return send(res, 400, { error: "invalid slug" });
  const meta = await readMeta(slug);
  if (!meta) return send(res, 404, { error: "meta not found" });
  return send(res, 200, meta);
}

export async function handleWorkKdpMetadataPut(
  slug: string,
  body: any,
  res: http.ServerResponse
): Promise<void> {
  if (!isValidSlug(slug)) return send(res, 400, { error: "invalid slug" });
  const meta = await readMeta(slug);
  if (!meta) return send(res, 404, { error: "meta not found" });

  const patch = sanitizeKdpMetadataPatch(body);
  const kdpMetadata = { ...(meta.kdp_metadata ?? {}), ...patch };
  const nextMeta: WorkMeta = { ...meta, kdp_metadata: kdpMetadata };
  const validation: { keywords?: KeywordValidationResult } = {};
  if (patch.keyword_picks_7) {
    validation.keywords = validateKdpKeywords({
      picks: patch.keyword_picks_7,
      ngWords: DEFAULT_NG_WORDS,
    });
  }

  try {
    await writeMetaAtomic(slug, nextMeta);
  } catch (e) {
    return send(res, 500, { error: e instanceof Error ? e.message : String(e) });
  }

  return send(res, 200, { ok: true, kdp_metadata: kdpMetadata, validation });
}

function scaffoldMeta(body: any): WorkMeta | { error: string } {
  const slug = String(body?.slug ?? "").trim();
  const title = String(body?.title ?? "").trim();
  if (!isValidSlug(slug)) return { error: "invalid slug" };
  if (!title || title.length > 200) return { error: "title must be 1..200 chars" };
  const genre = typeof body?.genre === "string" ? body.genre.trim() : "";
  const artStyle = typeof body?.art_style === "string" ? body.art_style.trim() : "";
  const targetAudience = typeof body?.target_audience === "string" ? body.target_audience.trim() : "";
  return {
    schema_version: 1,
    slug,
    title,
    genre: genre || undefined,
    art_style: artStyle || undefined,
    target_audience: targetAudience || undefined,
    phase: "phase_a_pilot",
    volume_plan: {
      estimated_volumes: 1,
      target_pages_per_volume: 200,
      target_episodes_per_volume: 10,
      target_episodes_per_subscription_unit: 4,
      target_pages_per_episode: 22,
    },
    kdp_metadata: {},
    kdp_target: {
      format: "B6_350dpi",
      page_dimensions_px: [1748, 2480],
      bleed_dimensions_px: [1843, 2587],
      channel: "amazon_kdp_select_ku_exclusive",
    },
    ai_disclosure: {
      text: false,
      images: true,
      cover: true,
      interior: true,
      translation: false,
    },
    rights: {
      ai_use_allowed: true,
      commercial_allowed: true,
      ai_disclosure_required: true,
    },
  };
}

export async function handleWorkCreate(body: any, res: http.ServerResponse): Promise<void> {
  const meta = scaffoldMeta(body);
  if ("error" in meta) return send(res, 400, { error: meta.error });
  const root = workDir(meta.slug);
  try {
    await fs.mkdir(root, { recursive: false });
  } catch (e: any) {
    if (e?.code === "EEXIST") return send(res, 409, { error: "work already exists" });
    return send(res, 500, { error: e instanceof Error ? e.message : String(e) });
  }

  try {
    parseOrThrow(WorkMetaJsonSchema, meta, `meta.json (${meta.slug})`);
    await fs.mkdir(bibleDir(meta.slug), { recursive: true });
    await fs.mkdir(path.join(workDir(meta.slug), "episodes"), { recursive: true });
    await fs.mkdir(volumeDir(meta.slug, 1), { recursive: true });
    await fs.writeFile(workMetaPath(meta.slug), JSON.stringify(meta, null, 2) + "\n", "utf-8");
  } catch (e) {
    return send(res, 500, { error: e instanceof Error ? e.message : String(e) });
  }

  return send(res, 201, { ok: true, slug: meta.slug, meta });
}
