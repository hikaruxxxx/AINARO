/**
 * KDP manuscript の bubble 画像を解決する (Phase D: adopted_versions 反映)
 *
 * SSoT: ~/.claude/plans/codex-logical-waterfall.md (Phase D)
 *
 * 既存挙動:
 *   bubbles/p{NN}.png を sort 順に取って一覧化
 *
 * Phase D 拡張:
 *   adopted_versions.json があれば panel_id=`page_${N}` の chosen.image_path を採用、
 *   なければ default (p{NN}.png) を使う
 *
 * panel 単位の adopted (panel_composite 由来) は本実装では扱わず、page 単位のみ。
 * panel_composite を本格 page 合成する L9.5 が出来てから panel-level resolver を追加。
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { adoptedVersionsPath } from "../../../../../scripts/manga/layers/_paths";
import type { AdoptedVersions } from "../../../manga/revision-ui/types";

export type ResolvedPage = {
  page_no: number;
  image_path: string;
  source: "default" | "adopted";
  chosen_version?: string;
};

async function loadAdopted(slug: string, episode: number): Promise<AdoptedVersions | null> {
  try {
    return JSON.parse(await fs.readFile(adoptedVersionsPath(slug, episode), "utf-8")) as AdoptedVersions;
  } catch { return null; }
}

/**
 * episode の bubble dir 内の p{NN}.png を一覧化し、adopted があれば差し替える。
 *
 * @param bubblesDir 絶対パス (bubbles/ 配下)
 * @param workRoot data/manga/works/{slug} 絶対パス (adopted.image_path の起点)
 * @returns RTL 並び順の解決済みページリスト
 */
export async function resolveBubblePagesForEpisode(args: {
  slug: string;
  episode: number;
  bubblesDir: string;
  workRoot: string;
}): Promise<ResolvedPage[]> {
  const { slug, episode, bubblesDir, workRoot } = args;
  const adopted = await loadAdopted(slug, episode);

  let entries: string[] = [];
  try { entries = await fs.readdir(bubblesDir); } catch { return []; }

  // p{NN}.png のみを抽出 (versioned p{NN}_v2.png は default 一覧から除外)
  const defaults = entries
    .filter((f) => /^p\d{2}\.png$/.test(f))
    .sort()
    .map((f) => {
      const m = f.match(/^p(\d{2})\.png$/)!;
      return { page_no: Number(m[1]), filename: f };
    });

  return defaults.map(({ page_no, filename }): ResolvedPage => {
    const defaultAbs = path.join(bubblesDir, filename);
    const choice = adopted?.panels[`page_${page_no}`];
    if (choice && choice.chosen && choice.chosen !== "v1" && choice.image_path) {
      return {
        page_no,
        image_path: path.resolve(workRoot, choice.image_path),
        source: "adopted",
        chosen_version: choice.chosen,
      };
    }
    return {
      page_no,
      image_path: defaultAbs,
      source: "default",
      chosen_version: choice?.chosen ?? "v1",
    };
  });
}
