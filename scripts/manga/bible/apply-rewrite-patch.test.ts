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
});
