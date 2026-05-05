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
import { adoptedVersionsPath, pagePlanPath } from "../../../../../scripts/manga/layers/_paths";
import type { AdoptedVersions } from "../../../manga/revision-ui/types";
import type { PagePlanV2 } from "../../schemas-v2";

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

async function loadPagePlanPageNos(slug: string, episode: number): Promise<number[]> {
  try {
    const plan = JSON.parse(await fs.readFile(pagePlanPath(slug, episode), "utf-8")) as PagePlanV2;
    return plan.pages.map((p) => p.page_no).sort((a, b) => a - b);
  } catch { return []; }
}

async function fileExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

/**
 * episode の bubble dir / adopted_versions / page_plan を統合してページを解決する。
 *
 * 走査順:
 *   1. page_plan.json から期待 page_no 集合を取る (一次基準)
 *   2. 各 page_no で:
 *      - adopted_versions に page_${N} が chosen=v2+ で登録されてれば adopted を採用
 *      - そうでなければ bubbles/p{NN}.png を default として採用
 *      - 両方欠落なら warning ログ + skip
 *   3. page_plan が無ければ legacy: bubbles/p{NN}.png のみを走査 (v1 のみで完結する旧運用)
 *
 * @returns RTL 並び順の解決済みページリスト
 */
export async function resolveBubblePagesForEpisode(args: {
  slug: string;
  episode: number;
  bubblesDir: string;
  workRoot: string;
}): Promise<ResolvedPage[]> {
  const { slug, episode, bubblesDir, workRoot } = args;
  const [adopted, planPageNos] = await Promise.all([
    loadAdopted(slug, episode),
    loadPagePlanPageNos(slug, episode),
  ]);

  // page_no 集合を決定
  let pageNos: number[];
  if (planPageNos.length > 0) {
    pageNos = planPageNos;
  } else {
    let entries: string[] = [];
    try { entries = await fs.readdir(bubblesDir); } catch { return []; }
    pageNos = entries
      .filter((f) => /^p\d{2}\.png$/.test(f))
      .map((f) => Number(f.match(/^p(\d{2})\.png$/)![1]))
      .sort((a, b) => a - b);
  }

  const results: ResolvedPage[] = [];
  for (const page_no of pageNos) {
    const choice = adopted?.panels[`page_${page_no}`];
    if (choice && choice.chosen && choice.chosen !== "v1" && choice.image_path) {
      const adoptedAbs = path.resolve(workRoot, choice.image_path);
      if (await fileExists(adoptedAbs)) {
        results.push({
          page_no,
          image_path: adoptedAbs,
          source: "adopted",
          chosen_version: choice.chosen,
        });
        continue;
      }
      console.warn(`[adopted-resolver] page ${page_no}: adopted image missing (${adoptedAbs}), falling back to default`);
    }
    // default
    const defaultAbs = path.join(bubblesDir, `p${String(page_no).padStart(2, "0")}.png`);
    if (await fileExists(defaultAbs)) {
      results.push({
        page_no,
        image_path: defaultAbs,
        source: "default",
        chosen_version: choice?.chosen ?? "v1",
      });
    } else {
      console.warn(`[adopted-resolver] page ${page_no}: no v1 default and no adopted image, skipping`);
    }
  }
  return results;
}
