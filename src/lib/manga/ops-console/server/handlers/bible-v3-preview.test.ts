import type http from "node:http";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import type { BibleSnapshotV3, FactNode } from "../../../schemas-v2";
import type { BibleV3PreviewResponse } from "./bible-v3-preview";

describe("handleBibleV3Preview", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("snapshot.v3.json があれば facts/ 分割ロードの V3 を返す", async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ainaro-v3-preview-"));
    try {
      const bibleDir = await prepareBibleDir(repoRoot, "split-work");
      const splitFact = fact("fact_from_facts", "char_a", "facts/ の body");
      const snapshot = snapshotV3({
        facts: [fact("fact_stale_snapshot", "char_a", "snapshot body")],
        factIds: [splitFact.fact_id],
      });

      await writeJson(path.join(bibleDir, "snapshot.v3.json"), snapshot);
      await writeJson(path.join(bibleDir, "fact_index.json"), [{ id: splitFact.fact_id }]);
      await writeJson(path.join(bibleDir, "facts", "characters", "char_a.json"), [splitFact]);
      await writeJson(path.join(bibleDir, "v3-classified-preview.json"), {
        v3: snapshotV3({ facts: [] }),
        needsReview: [splitFact],
        factSourcePathIndex: { [splitFact.fact_id]: "facts/characters/char_a.json" },
      });

      const body = await callHandler(repoRoot, "split-work");

      expect(body.source).toBe("snapshot.v3.json");
      expect(body.v3.facts).toHaveLength(1);
      expect(body.v3.facts[0]?.fact_id).toBe("fact_from_facts");
      expect(body.needsReview).toHaveLength(1);
      expect(body.factSourcePathIndex[splitFact.fact_id]).toBe("facts/characters/char_a.json");
    } finally {
      await fs.rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("snapshot.v3.json が無ければ既存 preview 単一ファイルに fallback する", async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ainaro-v3-preview-"));
    try {
      const bibleDir = await prepareBibleDir(repoRoot, "preview-work");
      await writeJson(path.join(bibleDir, "v3-classified-preview.json"), snapshotV3({
        facts: [fact("fact_preview", "char_a", "preview body")],
        factIds: ["fact_preview"],
      }));

      const body = await callHandler(repoRoot, "preview-work");

      expect(body.source).toBe("v3-classified-preview.json");
      expect(body.v3.facts[0]?.fact_id).toBe("fact_preview");
    } finally {
      await fs.rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("snapshot.v3.json の復元に失敗したら preview に fallback する", async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ainaro-v3-preview-"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const bibleDir = await prepareBibleDir(repoRoot, "broken-split-work");
      await writeJson(path.join(bibleDir, "snapshot.v3.json"), snapshotV3({
        facts: [],
        factIds: ["missing_fact"],
      }));
      await writeJson(path.join(bibleDir, "fact_index.json"), [{ id: "missing_fact" }]);
      await writeJson(path.join(bibleDir, "v3-classified-preview.json"), snapshotV3({
        facts: [fact("fact_preview_fallback", "char_a", "preview fallback")],
        factIds: ["fact_preview_fallback"],
      }));

      const body = await callHandler(repoRoot, "broken-split-work");

      expect(body.source).toBe("v3-classified-preview.json");
      expect(body.v3.facts[0]?.fact_id).toBe("fact_preview_fallback");
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("snapshot.v3.json load failed"));
    } finally {
      warn.mockRestore();
      await fs.rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("snapshot.v3.json も preview も無ければ 404 を返す", async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ainaro-v3-preview-"));
    try {
      await prepareBibleDir(repoRoot, "empty-work");
      const response = await callRawHandler(repoRoot, "empty-work");

      expect(response.status).toBe(404);
      expect((response.body as { error: string }).error).toContain("no V3 snapshot found");
    } finally {
      await fs.rm(repoRoot, { recursive: true, force: true });
    }
  });
});

async function callHandler(repoRoot: string, slug: string): Promise<BibleV3PreviewResponse> {
  const response = await callRawHandler(repoRoot, slug);
  expect(response.status).toBe(200);
  return response.body as BibleV3PreviewResponse;
}

async function callRawHandler(repoRoot: string, slug: string): Promise<{ status: number; body: unknown }> {
  vi.resetModules();
  vi.stubEnv("AINARO_REPO_ROOT", repoRoot);
  const { handleBibleV3Preview } = await import("./bible-v3-preview");
  const response = mockResponse();

  await handleBibleV3Preview(slug, response.res);
  return { status: response.status, body: JSON.parse(response.text) as unknown };
}

function mockResponse(): { res: http.ServerResponse; status: number; text: string } {
  const state = {
    status: 0,
    text: "",
    res: {
      writeHead(status: number) {
        state.status = status;
      },
      end(chunk: string) {
        state.text += chunk;
      },
    } as http.ServerResponse,
  };
  return state;
}

async function prepareBibleDir(repoRoot: string, slug: string): Promise<string> {
  const bibleDir = path.join(repoRoot, "data", "manga", "works", slug, "bible");
  await fs.mkdir(path.join(bibleDir, "facts", "characters"), { recursive: true });
  await writeJson(path.join(bibleDir, "snapshot.json"), {});
  return bibleDir;
}

async function writeJson(fp: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

function snapshotV3(options: { facts: FactNode[]; factIds?: string[] }): BibleSnapshotV3 {
  return {
    schema_version: 3,
    meta: {
      title: "test",
      logline: "test",
      genre: "test",
      target_rating: "general",
      volumes_planned: 1,
    } as unknown as BibleSnapshotV3["meta"],
    style_directives: { global: "", scene_overrides: {}, overlay_rules: [] },
    entities: [{
      id: "char_a",
      kind: "character",
      name: "アオ",
      fact_ids: options.factIds ?? options.facts.map((item) => item.fact_id),
      appears_in_volumes: [1],
    }],
    relations: [],
    facts: options.facts,
    volumes: {},
    continuity_seeds: [],
    generated_at: "2026-05-10T00:00:00.000Z",
  };
}

function fact(fact_id: string, entity_id: string | null, body: string): FactNode {
  return {
    fact_id,
    entity_id,
    aspect: "identity",
    layer: "in_world_belief",
    body,
    evidence: { source_path: fact_id, confidence: 1 },
  };
}
