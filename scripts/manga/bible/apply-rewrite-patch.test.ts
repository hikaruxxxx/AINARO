import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyRewritePatch } from "./apply-rewrite-patch";

describe("apply-rewrite-patch", () => {
  it("rewritten_text で field を上書きし、rewrite backup を作成する", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ainaro-rewrite-"));
    const snapshotPath = path.join(dir, "snapshot.json");
    const resultFile = path.join(dir, "result.json");
    await fs.writeFile(snapshotPath, JSON.stringify({ characters: [{ id: "c1", psychology_deep: "before" }] }));
    await fs.writeFile(
      resultFile,
      JSON.stringify({
        evaluation_summary: "書き直しが必要",
        issues: [{ category: "too_short", description: "短い", location_hint: "全体" }],
        needs_rewrite: true,
        rewritten_text: "after rewritten",
        rewrite_rationale: "密度を上げる",
      }),
    );

    const result = await applyRewritePatch({
      snapshotPath,
      targetId: "c1",
      scope: "character",
      field: "psychology_deep",
      resultFile,
      diffCheck: false,
      forceApply: false,
      dryRun: false,
    });

    const snapshot = JSON.parse(await fs.readFile(snapshotPath, "utf-8")) as { characters: Array<{ psychology_deep: string }> };
    const backups = (await fs.readdir(dir)).filter((name) => name.startsWith("snapshot.bak-rewrite-"));

    expect(result.applied).toBe(true);
    expect(result.beforeLen).toBe("before".length);
    expect(result.afterLen).toBe("after rewritten".length);
    expect(snapshot.characters[0].psychology_deep).toBe("after rewritten");
    expect(backups).toHaveLength(1);
    expect(await fs.readFile(path.join(dir, backups[0]), "utf-8")).toContain("before");
  });

  it("needs_rewrite=false は force なしでは snapshot を変更しない", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ainaro-rewrite-skip-"));
    const snapshotPath = path.join(dir, "snapshot.json");
    const resultFile = path.join(dir, "result.json");
    await fs.writeFile(snapshotPath, JSON.stringify({ characters: [{ id: "c1", psychology_deep: "before" }] }));
    await fs.writeFile(
      resultFile,
      JSON.stringify({
        evaluation_summary: "修正不要",
        issues: [],
        needs_rewrite: false,
        rewritten_text: "after rewritten",
      }),
    );

    const result = await applyRewritePatch({
      snapshotPath,
      targetId: "c1",
      scope: "character",
      field: "psychology_deep",
      resultFile,
      diffCheck: false,
      forceApply: false,
      dryRun: false,
    });

    const snapshot = JSON.parse(await fs.readFile(snapshotPath, "utf-8")) as { characters: Array<{ psychology_deep: string }> };
    const backups = (await fs.readdir(dir)).filter((name) => name.startsWith("snapshot.bak-rewrite-"));

    expect(result.applied).toBe(false);
    expect(result.skippedReason).toBe("no rewrite needed");
    expect(snapshot.characters[0].psychology_deep).toBe("before");
    expect(backups).toHaveLength(0);
  });

  it("--diff-check 無しなら未登録固有名詞を含む rewritten_text でも apply する", async () => {
    const { dir, snapshotPath, resultFile } = await writeRewriteFixture("天野レンは偶然許可リストを見た。");

    const result = await applyRewritePatch({
      snapshotPath,
      targetId: "char_ren",
      scope: "character",
      field: "psychology_deep",
      resultFile,
      diffCheck: false,
      forceApply: false,
      dryRun: false,
    });

    const snapshot = JSON.parse(await fs.readFile(snapshotPath, "utf-8")) as { characters: Array<{ psychology_deep: string }> };
    const backups = (await fs.readdir(dir)).filter((name) => name.startsWith("snapshot.bak-rewrite-"));

    expect(result.applied).toBe(true);
    expect(result.gate).toBeUndefined();
    expect(snapshot.characters[0].psychology_deep).toBe("天野レンは偶然許可リストを見た。");
    expect(backups).toHaveLength(1);
  });

  it("--diff-check ありで未登録固有名詞が含まれると apply を拒否する", async () => {
    const { dir, snapshotPath, resultFile } = await writeRewriteFixture("天野レンは偶然許可リストを見た。");

    const result = await applyRewritePatch({
      snapshotPath,
      targetId: "char_ren",
      scope: "character",
      field: "psychology_deep",
      resultFile,
      diffCheck: true,
      forceApply: false,
      dryRun: false,
    });

    const snapshot = JSON.parse(await fs.readFile(snapshotPath, "utf-8")) as { characters: Array<{ psychology_deep: string }> };
    const backups = (await fs.readdir(dir)).filter((name) => name.startsWith("snapshot.bak-rewrite-"));

    expect(result.applied).toBe(false);
    expect(result.skippedReason).toBe("quality gate failed");
    expect(result.gate?.passed).toBe(false);
    expect(result.gate?.references.map((ref) => ref.matched_text)).toEqual(["天野レン", "偶然許可リスト"]);
    expect(snapshot.characters[0].psychology_deep).toBe("before");
    expect(backups).toHaveLength(0);
  });

  it("--diff-check + --force-apply なら gate 警告対象でも apply する", async () => {
    const { dir, snapshotPath, resultFile } = await writeRewriteFixture("天野レンは偶然許可リストを見た。");

    const result = await applyRewritePatch({
      snapshotPath,
      targetId: "char_ren",
      scope: "character",
      field: "psychology_deep",
      resultFile,
      diffCheck: true,
      forceApply: true,
      dryRun: false,
    });

    const snapshot = JSON.parse(await fs.readFile(snapshotPath, "utf-8")) as { characters: Array<{ psychology_deep: string }> };
    const backups = (await fs.readdir(dir)).filter((name) => name.startsWith("snapshot.bak-rewrite-"));

    expect(result.applied).toBe(true);
    expect(result.gate?.passed).toBe(false);
    expect(result.gate?.forced).toBe(true);
    expect(snapshot.characters[0].psychology_deep).toBe("天野レンは偶然許可リストを見た。");
    expect(backups).toHaveLength(1);
  });

  it("--diff-check で既知語のみなら通常 apply する", async () => {
    const { dir, snapshotPath, resultFile } = await writeRewriteFixture("桐生レンは鑑定石プロトコルを確認した。");
    await fs.writeFile(path.join(dir, "known_terms.json"), JSON.stringify({ terms: [{ term: "鑑定石プロトコル" }] }));

    const result = await applyRewritePatch({
      snapshotPath,
      targetId: "char_ren",
      scope: "character",
      field: "psychology_deep",
      resultFile,
      diffCheck: true,
      forceApply: false,
      dryRun: false,
    });

    const snapshot = JSON.parse(await fs.readFile(snapshotPath, "utf-8")) as { characters: Array<{ psychology_deep: string }> };

    expect(result.applied).toBe(true);
    expect(result.gate?.passed).toBe(true);
    expect(result.gate?.references).toHaveLength(0);
    expect(snapshot.characters[0].psychology_deep).toBe("桐生レンは鑑定石プロトコルを確認した。");
  });
});

async function writeRewriteFixture(rewrittenText: string): Promise<{ dir: string; snapshotPath: string; resultFile: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ainaro-rewrite-gate-"));
  const snapshotPath = path.join(dir, "snapshot.json");
  const resultFile = path.join(dir, "result.json");
  await fs.writeFile(snapshotPath, JSON.stringify(createBibleFixture()));
  await fs.writeFile(
    resultFile,
    JSON.stringify({
      evaluation_summary: "書き直しが必要",
      issues: [],
      needs_rewrite: true,
      rewritten_text: rewrittenText,
    }),
  );
  return { dir, snapshotPath, resultFile };
}

function createBibleFixture(): unknown {
  return {
    schema_version: 2,
    generated_at: "2026-05-11T00:00:00.000Z",
    generated_from: { source_type: "test", source_path: "fixture.json" },
    meta: {
      slug: "apply-rewrite-gate-test",
      title: "Apply Rewrite Gate Test",
      art_style: "manga_bw_seinen_urban",
      genre: "modern_dungeon",
      target_pages_per_volume: 180,
      target_episodes_per_volume: 10,
      target_pages_per_episode: 18,
    },
    world: {
      premise: "都市の地下にダンジョンがある。",
      rules: [],
      system: "",
      timeline: "",
      factions: [],
      history: {},
      power_system_logic: "",
      cosmology: "",
      economic_system: "",
      social_strata: "",
      daily_life_textures: "",
      language_and_naming: "",
      forbidden_lore: [],
    },
    characters: [
      {
        id: "char_ren",
        name: "桐生 レン",
        role: "protagonist",
        psychology_deep: "before",
        spec: {},
        attribute_classifier: {},
        continuity_anchors: [],
        appears_in_volumes: [1],
      },
    ],
    locations: [],
    props: [],
    costumes: [],
    relations: [],
    style_directives: {
      global: "",
      scene_overrides: {},
      overlay_rules: [],
    },
    visual_motifs: [],
    continuity_seeds: [],
    volume_synopsis: {
      theme: "",
      summary: "",
      cliffhanger: "",
    },
  };
}
