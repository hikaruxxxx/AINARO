import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { BibleSnapshotV2 } from "../../../src/lib/manga/schemas-v2";
import {
  adaptNovelToBrief,
  extractCastFromNovels,
  loadArchetype,
} from "./L00-novel-adapter";

const NOVEL_PATHS = [
  "data/generation/works/a07-novel/longform/episodes/ep0001.md",
  "data/generation/works/a07-novel/longform/episodes/ep0002.md",
];
const BIBLE_PATH = "data/manga/works/a07-modern-dungeon/bible/snapshot.json";

async function loadFixture() {
  const novels = await Promise.all(NOVEL_PATHS.map((p) => fs.readFile(p, "utf-8")));
  const bible = JSON.parse(await fs.readFile(BIBLE_PATH, "utf-8")) as BibleSnapshotV2;
  return { novels, bible };
}

describe("L00 novel adapter", () => {
  it("a07-novel ep0001+ep0002 から主要 cast top-2 を抽出できる", async () => {
    const { novels, bible } = await loadFixture();

    const cast = extractCastFromNovels(novels, bible);

    expect(cast.slice(0, 2).map((c) => c.id)).toEqual(
      expect.arrayContaining(["char_桐生_レン_v1", "char_白瀬_灯里_v1"]),
    );
  });

  it("M1_series_opener を archetype として解決できる", async () => {
    const archetype = await loadArchetype();

    expect(archetype).toEqual(
      expect.objectContaining({
        id: "M1_series_opener",
        name: "シリーズ開幕",
      }),
    );
  });

  it("mock generator で NovelAdapterOutput の必須フィールドを返す", async () => {
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "ainaro-l00-"));
    const outputPath = path.join(outDir, "_brief.v2.md");
    const generateBrief = vi.fn(async () =>
      [
        "第1段落。レンの夜勤とFランクの停滞を描く。",
        "第2段落。灯里のニュースと制度の距離を描く。",
        "第3段落。ナビの声が異変として割り込む。",
        "第4段落。北東通路で条件を踏む。",
        "第5段落。未分類加算が表示される。",
        "第6段落。次の開示へ向けて引く。",
      ].join("\n\n") + "\n",
    );

    const result = await adaptNovelToBrief(
      {
        slug: "a07-novel",
        episode: 1,
        novelMdPaths: NOVEL_PATHS,
        bibleSnapshotPath: BIBLE_PATH,
        outputPath,
      },
      {
        generateBrief,
        now: () => new Date("2026-05-17T00:00:00.000Z"),
      },
    );

    expect(result.briefPath).toBe(outputPath);
    expect(result.metadata).toEqual(
      expect.objectContaining({
        cast: expect.arrayContaining(["char_桐生_レン_v1", "char_白瀬_灯里_v1"]),
        archetype: "M1_series_opener",
        generatedAt: "2026-05-17T00:00:00.000Z",
      }),
    );
    expect(result.metadata.sourcePathsHash).toMatch(/^[a-f0-9]{64}$/);
    expect(generateBrief).toHaveBeenCalledOnce();
    await expect(fs.readFile(outputPath, "utf-8")).resolves.toContain("第1段落");
  });
});
