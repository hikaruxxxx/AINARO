import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDefaultDictVersion, resolveDictPath } from "./pattern-loader";

const ORIGINAL_MANGA_LAYOUT_DICT = process.env.MANGA_LAYOUT_DICT;
const tempDirs: string[] = [];

function makeTempRepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ainaro-pattern-loader-"));
  tempDirs.push(dir);
  return dir;
}

function writeDictPlaceholder(repoRoot: string, version: "v1" | "v2"): string {
  const dictDir = path.join(repoRoot, "data/manga/layout_patterns");
  mkdirSync(dictDir, { recursive: true });
  const dictPath = path.join(dictDir, `${version}.json`);
  writeFileSync(dictPath, "{}");
  return dictPath;
}

beforeEach(() => {
  if (ORIGINAL_MANGA_LAYOUT_DICT === undefined) {
    delete process.env.MANGA_LAYOUT_DICT;
  } else {
    process.env.MANGA_LAYOUT_DICT = ORIGINAL_MANGA_LAYOUT_DICT;
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  if (ORIGINAL_MANGA_LAYOUT_DICT === undefined) {
    delete process.env.MANGA_LAYOUT_DICT;
  } else {
    process.env.MANGA_LAYOUT_DICT = ORIGINAL_MANGA_LAYOUT_DICT;
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("getDefaultDictVersion", () => {
  it("MANGA_LAYOUT_DICT=v1 で v1 を返す", () => {
    process.env.MANGA_LAYOUT_DICT = "v1";

    expect(getDefaultDictVersion()).toBe("v1");
  });

  it("MANGA_LAYOUT_DICT 未設定で v1 を返す (2026-05-09 default 逆転)", () => {
    delete process.env.MANGA_LAYOUT_DICT;

    expect(getDefaultDictVersion()).toBe("v1");
  });

  it("MANGA_LAYOUT_DICT=invalid で v1 を返し console.warn を呼ぶ", () => {
    process.env.MANGA_LAYOUT_DICT = "invalid";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(getDefaultDictVersion()).toBe("v1");
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("resolveDictPath", () => {
  it("repoRoot/data/manga/layout_patterns/v2.json が存在すれば v2 を返す", () => {
    const result = resolveDictPath({ repoRoot: process.cwd(), version: "v2" });

    expect(result).toEqual({
      path: path.join(process.cwd(), "data/manga/layout_patterns/v2.json"),
      version: "v2",
      fallback: false,
    });
  });

  it("v2 不在のとき v1 にフォールバックして fallback=true", () => {
    const repoRoot = makeTempRepo();
    const v1Path = writeDictPlaceholder(repoRoot, "v1");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const result = resolveDictPath({ repoRoot, version: "v2" });

    expect(result).toEqual({ path: v1Path, version: "v1", fallback: true });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("v1 も不在なら Error を throw", () => {
    const repoRoot = makeTempRepo();

    expect(() => resolveDictPath({ repoRoot, version: "v2" })).toThrow("[pattern-loader] layout dict not found");
  });
});
