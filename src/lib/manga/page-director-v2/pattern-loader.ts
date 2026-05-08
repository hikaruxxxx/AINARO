import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { BackgroundTreatment } from "../schemas-v2";

export type DictVersion = "v1" | "v2";
export type PatternFrequency = "high" | "medium-high" | "medium" | "rare-medium" | "low" | "rare";
export type PatternSizeClass = "small" | "medium" | "large" | "extra_large" | "xx_large";

export type PatternSlot = {
  slot_id: string;
  reading_order: number;
  role_hint: string;
  size_class: PatternSizeClass;
  polygon: [number, number][];
  is_borderless?: boolean;
  bleed?: boolean;
  internal_diagonal_split?: [[number, number], [number, number]];
  /** 2026-05-06 追加。reference pool 分離用の背景表現種別 */
  background_treatment?: BackgroundTreatment;
};

export type Pattern = {
  id: string;
  name: string;
  panel_count: number;
  page_role_hints: string[];
  subtype_hints: string[];
  purpose_summary: string;
  trigger_conditions: string;
  frequency: PatternFrequency;
  example_pages: number[];
  features: string[];
  slots: PatternSlot[];
};

export type PatternDict = {
  schema_version: 1;
  page_dimensions: { width: number; height: number };
  page_margin: number;
  page_gutter: number;
  patterns: Pattern[];
};

const PointSchema = z.tuple([z.number(), z.number()]);

const BackgroundTreatmentSchema = z.enum([
  "detailed_bg",
  "atmospheric_fade",
  "tone_back",
  "solid_white",
  "solid_black",
  "floating_ui",
  "unspecified",
]);

const PatternSlotSchema = z.object({
  slot_id: z.string().min(1),
  reading_order: z.number().int().positive(),
  role_hint: z.string().min(1),
  size_class: z.enum(["small", "medium", "large", "extra_large", "xx_large"]),
  polygon: z.array(PointSchema).min(3),
  is_borderless: z.boolean().optional(),
  bleed: z.boolean().optional(),
  internal_diagonal_split: z.tuple([PointSchema, PointSchema]).optional(),
  background_treatment: BackgroundTreatmentSchema.optional(),
});

const PatternSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  panel_count: z.number().int().positive(),
  page_role_hints: z.array(z.string().min(1)),
  subtype_hints: z.array(z.string().min(1)),
  purpose_summary: z.string(),
  trigger_conditions: z.string(),
  frequency: z.enum(["high", "medium-high", "medium", "rare-medium", "low", "rare"]),
  example_pages: z.array(z.number().int().positive()),
  features: z.array(z.string()),
  slots: z.array(PatternSlotSchema).min(1),
});

const PatternDictSchema = z.object({
  schema_version: z.literal(1),
  page_dimensions: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  page_margin: z.number().nonnegative(),
  page_gutter: z.number().nonnegative(),
  patterns: z.array(PatternSchema).min(1),
}).passthrough();

export function getDefaultDictVersion(): DictVersion {
  const env = process.env.MANGA_LAYOUT_DICT;
  if (env === "v1" || env === "v2") return env;
  if (env !== undefined && env !== "") {
    console.warn(`[pattern-loader] invalid MANGA_LAYOUT_DICT=${env}; defaulting to v2`);
  }
  return "v2";
}

export function resolveDictPath(args: { repoRoot: string; version?: DictVersion }): {
  path: string;
  version: DictVersion;
  fallback: boolean;
} {
  const requestedVersion = args.version ?? getDefaultDictVersion();
  const requestedPath = path.join(args.repoRoot, "data/manga/layout_patterns", `${requestedVersion}.json`);
  if (existsSync(requestedPath)) {
    return { path: requestedPath, version: requestedVersion, fallback: false };
  }

  const v1Path = path.join(args.repoRoot, "data/manga/layout_patterns/v1.json");
  if (requestedVersion !== "v1" && existsSync(v1Path)) {
    console.warn(`[pattern-loader] layout dict ${requestedVersion} not found at ${requestedPath}; fallback to v1`);
    return { path: v1Path, version: "v1", fallback: true };
  }

  throw new Error(`[pattern-loader] layout dict not found: ${requestedPath}`);
}

export async function loadDefaultPatternDict(args: {
  repoRoot: string;
  version?: DictVersion;
}): Promise<{ dict: PatternDict; version: DictVersion; fallback: boolean }> {
  const resolved = resolveDictPath(args);
  const dict = await loadPatternDict(resolved.path);
  return { dict, version: resolved.version, fallback: resolved.fallback };
}

export async function loadPatternDict(path: string): Promise<PatternDict> {
  let raw: string;
  try {
    raw = await fs.readFile(path, "utf-8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[pattern-loader] failed to read ${path}: ${message}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[pattern-loader] invalid JSON at ${path}: ${message}`);
  }

  const result = PatternDictSchema.safeParse(json);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`[pattern-loader] schema validation failed for ${path}:\n${issues}`);
  }
  return result.data;
}
