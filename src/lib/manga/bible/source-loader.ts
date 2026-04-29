/**
 * 既存 content/works/<slug>/ から漫画用素材をロードする
 */

import { readFile, access } from "fs/promises";
import path from "path";

export type WorkSourceMaterial = {
  slug: string;
  rootDir: string;
  synopsis: string | null;
  settings: string | null;
  style: string | null;
  plot: string | null;
  characters: string | null;
  /** 直下 ep001.md, ep002.md, ... または episodes/001.md 配下の本文 */
  episodes: Array<{ ep_num: number; body: string; sourcePath: string }>;
};

const REPO_ROOT = process.env.AINARO_REPO_ROOT ?? process.cwd();

async function readIfExists(filePath: string): Promise<string | null> {
  try {
    await access(filePath);
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

/**
 * 1作品の素材を一括ロード。
 * episodes は最初の `take` 件のみ取得（Phase 1 は3話）。
 */
export async function loadWorkSource(
  slug: string,
  take: number = 3
): Promise<WorkSourceMaterial> {
  const rootDir = path.join(REPO_ROOT, "content/works", slug);

  const synopsis = await readIfExists(path.join(rootDir, "synopsis.md"));
  const settings = await readIfExists(path.join(rootDir, "_settings.md"));
  const style = await readIfExists(path.join(rootDir, "_style.md"));
  const plot = await readIfExists(path.join(rootDir, "_plot.md"));
  const characters = await readIfExists(path.join(rootDir, "_characters.md"));

  // エピソード本文: 直下 ep001.md 形式と episodes/001.md 形式の両方をサポート
  const episodes: WorkSourceMaterial["episodes"] = [];
  for (let i = 1; i <= take; i++) {
    const padded = String(i).padStart(3, "0");
    const tryPaths = [
      path.join(rootDir, `ep${padded}.md`),
      path.join(rootDir, "episodes", `${padded}.md`),
    ];
    for (const p of tryPaths) {
      const body = await readIfExists(p);
      if (body !== null) {
        episodes.push({ ep_num: i, body, sourcePath: p });
        break;
      }
    }
  }

  return {
    slug,
    rootDir,
    synopsis,
    settings,
    style,
    plot,
    characters,
    episodes,
  };
}

/**
 * 素材を Codex に渡しやすい単一テキストに整形
 */
export function formatMaterialsForLlm(src: WorkSourceMaterial): {
  synopsis: string;
  settings: string;
  style: string;
  plot: string;
  characters: string;
  episodes_combined: string;
} {
  return {
    synopsis: src.synopsis ?? "(synopsis なし)",
    settings: src.settings ?? "(settings なし)",
    style: src.style ?? "(style なし)",
    plot: src.plot ?? "(plot なし)",
    characters: src.characters ?? "(characters なし)",
    episodes_combined: src.episodes
      .map((e) => `=== Episode ${e.ep_num} ===\n\n${e.body}`)
      .join("\n\n"),
  };
}
