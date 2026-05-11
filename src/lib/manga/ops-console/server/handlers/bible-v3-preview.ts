/**
 * GET /api/works/{slug}/bible/v3-preview
 *
 * Phase 7 Console UI 用の最小 preview endpoint。
 * Phase 8 の facts/ 分割ロードまでは v3-classified-preview.json をそのまま返す。
 */
import type http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { bibleSnapshotPath } from "../../../../../../scripts/manga/layers/_paths";
import type { LlmRefineFactResult, RoleEnumViolation } from "../../../bible/migrate-classify";
import type { UndefinedReference } from "../../../qa-v2/undefined-reference-detector";
import type { BibleSnapshotV3, FactNode } from "../../../schemas-v2";

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

export async function handleBibleV3Preview(slug: string, res: http.ServerResponse): Promise<void> {
  const bibleDir = path.dirname(bibleSnapshotPath(slug));
  const previewPath = path.join(bibleDir, "v3-classified-preview.json");
  const llmRefinePath = path.join(bibleDir, "v3-classified-llm-refine.json");

  let v3: BibleSnapshotV3;
  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    [v3, stat] = await Promise.all([
      readJson<BibleSnapshotV3>(previewPath),
      fs.stat(previewPath),
    ]);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return send(res, 404, {
        error: "v3 preview not generated. Run scripts/manga/migrate/v2-to-v3-classify.ts",
      });
    }
    return send(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }

  try {
    const [
      unresolvedReferences,
      roleEnumViolations,
      needsReview,
      factSourcePathIndex,
      llmRefine,
    ] = await Promise.all([
      readJsonOr<UndefinedReference[]>(path.join(bibleDir, "unresolved_references.json"), []),
      readJsonOr<RoleEnumViolation[]>(path.join(bibleDir, "role_enum_violations.json"), []),
      readJsonOr<FactNode[]>(path.join(bibleDir, "v3-classified-needs-review.json"), []),
      readJsonOr<Record<string, string>>(path.join(bibleDir, "fact_source_path_index.json"), {}),
      readLlmRefine(llmRefinePath),
    ]);

    const body: BibleV3PreviewResponse = {
      slug,
      v3,
      unresolvedReferences,
      roleEnumViolations,
      needsReview,
      factSourcePathIndex,
      generated_at: stat.mtime.toISOString(),
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
