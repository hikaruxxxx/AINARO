import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BibleSnapshotV3, FactNode } from "../schemas-v2";
import { validateSnapshotConsistency, writeSnapshotV3Atomic } from "./atomic-write";

describe("writeSnapshotV3Atomic", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("splitFacts=true で facts/ ディレクトリ分割書き込み", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ainaro-atomic-"));
    const v3 = createMinimalV3WithFacts();

    const result = await writeSnapshotV3Atomic(v3, {
      bibleDir: tmpDir,
      stageLabel: "test-1",
      splitFacts: true,
    });

    expect(result.ok).toBe(true);
    expect(await pathExists(path.join(tmpDir, "snapshot.v3.json"))).toBe(true);
    expect(await pathExists(path.join(tmpDir, "facts", "characters", "char_a.json"))).toBe(true);
    expect(await pathExists(path.join(tmpDir, "facts", "locations", "loc_a.json"))).toBe(true);
    expect(await pathExists(path.join(tmpDir, "facts", "world", "world_rule.json"))).toBe(true);

    const snapshot = JSON.parse(await fs.readFile(path.join(tmpDir, "snapshot.v3.json"), "utf8")) as BibleSnapshotV3;
    expect(snapshot.facts).toEqual([]);

    const index = JSON.parse(await fs.readFile(path.join(tmpDir, "fact_index.json"), "utf8")) as Array<{ id: string }>;
    expect(index.map((entry) => entry.id)).toEqual(["fact_char_a", "fact_loc_a", "fact_world"]);
  });

  it("splitFacts=false で snapshot.v3.json 単一ファイル", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ainaro-atomic-"));
    const v3 = createMinimalV3WithFacts();

    const result = await writeSnapshotV3Atomic(v3, {
      bibleDir: tmpDir,
      stageLabel: "test-2",
      splitFacts: false,
    });

    expect(result.ok).toBe(true);
    expect(await pathExists(path.join(tmpDir, "snapshot.v3.json"))).toBe(true);
    expect(await pathExists(path.join(tmpDir, "facts"))).toBe(false);
    expect(await pathExists(path.join(tmpDir, "fact_index.json"))).toBe(false);

    const snapshot = JSON.parse(await fs.readFile(path.join(tmpDir, "snapshot.v3.json"), "utf8")) as BibleSnapshotV3;
    expect(snapshot.facts).toHaveLength(3);
  });

  it("write 失敗時に rollback が効く", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ainaro-atomic-"));
    const original = createMinimalV3();
    await fs.writeFile(path.join(tmpDir, "snapshot.v3.json"), `${JSON.stringify(original, null, 2)}\n`, "utf8");

    const originalRename = fs.rename.bind(fs);
    const rename = vi.spyOn(fs, "rename");
    rename.mockImplementation(async (from, to) => {
      if (String(from).includes(".tmp-write") && String(from).endsWith("snapshot.v3.json")) {
        throw new Error("injected stage 5 failure");
      }
      return originalRename(from, to);
    });

    const result = await writeSnapshotV3Atomic(createMinimalV3WithFacts(), {
      bibleDir: tmpDir,
      stageLabel: "test-rollback",
      splitFacts: true,
    });

    expect(result.ok).toBe(false);
    expect(result.rollback_used).toBe(true);
    expect(result.error).toContain("injected stage 5 failure");

    const restored = JSON.parse(await fs.readFile(path.join(tmpDir, "snapshot.v3.json"), "utf8")) as BibleSnapshotV3;
    expect(restored.generated_at).toBe(original.generated_at);
    expect(await pathExists(path.join(tmpDir, "facts"))).toBe(false);
  });

  it("checksum 不一致なら rollback", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ainaro-atomic-"));
    const original = createMinimalV3();
    await fs.writeFile(path.join(tmpDir, "snapshot.v3.json"), `${JSON.stringify(original, null, 2)}\n`, "utf8");

    let corrupted = false;
    const originalReadFile = fs.readFile.bind(fs);
    const readFile = vi.spyOn(fs, "readFile");
    readFile.mockImplementation(async (filePath, options) => {
      if (!corrupted && String(filePath).includes(".tmp-write") && String(filePath).endsWith("snapshot.v3.json")) {
        corrupted = true;
        return Buffer.from("corrupted");
      }
      return originalReadFile(filePath, options);
    });

    const result = await writeSnapshotV3Atomic(createMinimalV3WithFacts(), {
      bibleDir: tmpDir,
      stageLabel: "test-checksum",
      splitFacts: true,
    });

    expect(result.ok).toBe(false);
    expect(result.rollback_used).toBe(true);
    expect(result.error).toContain("Checksum mismatch");

    const restored = JSON.parse(await fs.readFile(path.join(tmpDir, "snapshot.v3.json"), "utf8")) as BibleSnapshotV3;
    expect(restored.generated_at).toBe(original.generated_at);
  });

  it("default では既存 snapshot.json を touch しない", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ainaro-atomic-"));
    const originalV2 = { schema_version: 2, characters: [], locations: [], props: [], world: {} };
    await fs.writeFile(path.join(tmpDir, "snapshot.json"), `${JSON.stringify(originalV2, null, 2)}\n`, "utf8");

    const result = await writeSnapshotV3Atomic(createMinimalV3WithFacts(), {
      bibleDir: tmpDir,
      stageLabel: "test-v2-protect",
      splitFacts: true,
    });

    expect(result.ok).toBe(true);
    expect(JSON.parse(await fs.readFile(path.join(tmpDir, "snapshot.json"), "utf8"))).toEqual(originalV2);
    expect(JSON.parse(await fs.readFile(path.join(tmpDir, "snapshot.v3.json"), "utf8"))).toMatchObject({ schema_version: 3 });
  });

  it("validateSnapshotConsistency が entity.fact_ids 不整合を検出", () => {
    const v3 = createMinimalV3();
    v3.entities[0].fact_ids.push("nonexistent_fact");

    const result = validateSnapshotConsistency(v3);

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("nonexistent_fact");
  });
});

function createMinimalV3WithFacts(): BibleSnapshotV3 {
  const v3 = createMinimalV3();
  v3.entities.push({ id: "loc_a", kind: "location", name: "Base", fact_ids: ["fact_loc_a"], appears_in_volumes: [1] });
  v3.entities[0].fact_ids.push("fact_char_a");
  v3.facts.push(
    fact("fact_char_a", "char_a", "identity", "in_world_belief", "A is the lead", 1),
    fact("fact_loc_a", "loc_a", "location_layout", "in_world_belief", "A small command room", 1),
    fact("fact_world", null, "world_rule", "system_specification", "Signals decay under rain", 1),
  );
  return v3;
}

function createMinimalV3(): BibleSnapshotV3 {
  return {
    schema_version: 3,
    meta: {
      slug: "atomic-test",
      title: "Atomic Test",
      art_style: "manga_bw_shounen",
      genre: "sci-fi",
      target_pages_per_volume: 180,
      target_episodes_per_volume: 10,
      target_pages_per_episode: 18,
      target_audience: "teen",
    },
    style_directives: { global: "", scene_overrides: {}, overlay_rules: [] },
    entities: [{ id: "char_a", kind: "character", name: "A", fact_ids: [], appears_in_volumes: [1] }],
    relations: [],
    facts: [],
    volumes: {},
    continuity_seeds: [],
    generated_at: "2026-05-10T00:00:00.000Z",
  };
}

function fact(
  fact_id: string,
  entity_id: string | null,
  aspect: FactNode["aspect"],
  layer: FactNode["layer"],
  body: string,
  confidence: number,
): FactNode {
  return {
    fact_id,
    entity_id,
    aspect,
    layer,
    body,
    evidence: { source_path: fact_id, confidence },
  };
}

async function pathExists(filePath: string): Promise<boolean> {
  return fs.access(filePath).then(
    () => true,
    () => false,
  );
}
