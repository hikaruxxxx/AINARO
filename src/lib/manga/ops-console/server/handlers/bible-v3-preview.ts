/**
 * GET /api/works/{slug}/bible/v3-preview
 *
 * Phase 7 Console UI 用の最小 preview endpoint。
 * snapshot.v3.json が存在する場合は facts/ 分割ロードから V3 を復元し、
 * 未置換作品では v3-classified-preview.json の既存経路に fallback する。
 */
import type http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { bibleSnapshotPath } from "../../../../../../scripts/manga/layers/_paths";
import { loadBibleSnapshotV3FromDir } from "../../../bible/v3-loader";
import type { LlmRefineFactResult, RoleEnumViolation } from "../../../bible/migrate-classify";
import type { UndefinedReference } from "../../../qa-v2/undefined-reference-detector";
import { isBibleSnapshotV3, type BibleSnapshotV3, type FactNode } from "../../../schemas-v2";

export type BibleV3LlmRefine = {
  rounds: number;
  fact_results: LlmRefineFactResult[];
  summary: {
    total_facts: number;
    stable_facts: number;
    unstable_facts: number;
    avg_confidence: number;
    median_confidence: number;
  };
  generated_at?: string;
};

export type BibleV3PreviewResponse = {
  slug: string;
  v3: BibleSnapshotV3;
  source: "snapshot.v3.json" | "v3-classified-preview.json";
  unresolvedReferences: UndefinedReference[];
  roleEnumViolations: RoleEnumViolation[];
  needsReview: FactNode[];
  factSourcePathIndex: Record<string, string>;
  generated_at?: string;
  llmRefine?: BibleV3LlmRefine;
};

function send(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readJson<T>(fp: string): Promise<T> {
  return JSON.parse(await fs.readFile(fp, "utf-8")) as T;
}

async function readJsonOr<T>(fp: string, fallback: T): Promise<T> {
  try {
    return await readJson<T>(fp);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

async function statOrNull(fp: string): Promise<Awaited<ReturnType<typeof fs.stat>> | null> {
  try {
    return await fs.stat(fp);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

type PreviewPayload = {
  v3?: BibleSnapshotV3;
  unresolvedReferences?: UndefinedReference[];
  roleEnumViolations?: RoleEnumViolation[];
  needsReview?: FactNode[];
  factSourcePathIndex?: Record<string, string>;
};

function asPreviewPayload(data: unknown): PreviewPayload {
  if (isBibleSnapshotV3(data)) return { v3: data };
  if (typeof data !== "object" || data === null) return {};
  const payload = data as PreviewPayload;
  return {
    ...payload,
    v3: payload.v3 && isBibleSnapshotV3(payload.v3) ? payload.v3 : undefined,
  };
}

async function readPreviewPayloadOrNull(fp: string): Promise<PreviewPayload | null> {
  try {
    return asPreviewPayload(await readJson<unknown>(fp));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function handleBibleV3Preview(slug: string, res: http.ServerResponse): Promise<void> {
  const bibleDir = path.dirname(bibleSnapshotPath(slug));
  const snapshotV3Path = path.join(bibleDir, "snapshot.v3.json");
  const previewPath = path.join(bibleDir, "v3-classified-preview.json");
  const llmRefinePath = path.join(bibleDir, "v3-classified-llm-refine.json");

  let v3: BibleSnapshotV3 | undefined;
  let source: BibleV3PreviewResponse["source"] | undefined;
  let generatedAt: string | undefined;
  let previewPayload: PreviewPayload | null = null;

  try {
    const snapshotStat = await statOrNull(snapshotV3Path);
    if (snapshotStat) {
      try {
        v3 = await loadBibleSnapshotV3FromDir({ bibleDir });
        source = "snapshot.v3.json";
        generatedAt = snapshotStat.mtime.toISOString();
        previewPayload = await readPreviewPayloadOrNull(previewPath);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[bible-v3-preview] snapshot.v3.json load failed, falling back: ${message}`);
      }
    }

    if (!v3) {
      const [payload, previewStat] = await Promise.all([
        readPreviewPayloadOrNull(previewPath),
        statOrNull(previewPath),
      ]);
      previewPayload = payload;
      if (payload?.v3) {
        v3 = payload.v3;
        source = "v3-classified-preview.json";
        generatedAt = previewStat?.mtime.toISOString();
      }
    }

    if (!v3 || !source) {
      return send(res, 404, {
        error: "no V3 snapshot found. Run scripts/manga/migrate/v2-to-v3-classify.ts",
      });
    }

    const [
      unresolvedReferences,
      roleEnumViolations,
      needsReview,
      factSourcePathIndex,
      llmRefine,
    ] = await Promise.all([
      previewPayload?.unresolvedReferences
        ?? readJsonOr<UndefinedReference[]>(path.join(bibleDir, "unresolved_references.json"), []),
      previewPayload?.roleEnumViolations
        ?? readJsonOr<RoleEnumViolation[]>(path.join(bibleDir, "role_enum_violations.json"), []),
      previewPayload?.needsReview
        ?? readJsonOr<FactNode[]>(path.join(bibleDir, "v3-classified-needs-review.json"), []),
      previewPayload?.factSourcePathIndex
        ?? readJsonOr<Record<string, string>>(path.join(bibleDir, "fact_source_path_index.json"), {}),
      readLlmRefine(llmRefinePath),
    ]);

    const body: BibleV3PreviewResponse = {
      slug,
      v3,
      source,
      unresolvedReferences,
      roleEnumViolations,
      needsReview,
      factSourcePathIndex,
      generated_at: generatedAt,
      ...(llmRefine ? { llmRefine } : {}),
    };
    return send(res, 200, body);
  } catch (error) {
    return send(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}

async function readLlmRefine(fp: string): Promise<BibleV3LlmRefine | undefined> {
  try {
    const [data, stat] = await Promise.all([
      readJson<{ llm_refine: Omit<BibleV3LlmRefine, "generated_at"> }>(fp),
      fs.stat(fp),
    ]);
    return { ...data.llm_refine, generated_at: stat.mtime.toISOString() };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
