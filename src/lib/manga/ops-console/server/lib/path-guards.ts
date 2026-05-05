/**
 * 漫画 ops console の入力 sanitize / 正規化ヘルパー
 *
 * 旧 serve-revision.ts の isSafeImagePath / isPageLevelPanelId / normalizePanelId を集約。
 * これらは「UI の判定ロジックを薄く保つ」原則のため server 境界で必ず通す。
 */
import type { PagePlanV2 } from "../../../schemas-v2";

/**
 * adopted_versions / revision_queue が参照する image_path を厳格チェック。
 * 期待形: episodes/epNN/(renders|bubbles)/p{N}[_panel_M][_vK].png
 *  - workdir 起点の相対パス (絶対や `..` は禁止)
 *  - 長さ 500 字以下
 *  - バックスラッシュ禁止 (Windows パス対策)
 */
export function isSafeImagePath(p: string): boolean {
  if (typeof p !== "string" || p.length === 0 || p.length > 500) return false;
  if (p.includes("..") || p.startsWith("/") || p.includes("\\")) return false;
  return /^episodes\/ep\d+\/(renders|bubbles)\/p\d+(_panel_\d+)?(_v\d+)?\.png$/.test(p);
}

export function isPageLevelPanelId(panelId: string): boolean {
  return /^page_\d+$/.test(panelId);
}

/**
 * page_one_shot 戦略のページに対して storyboard panel_id を
 * そのまま queue に入れると L09 manifest (panel_id="page_${N}") と不整合になり、
 * nextVersion が既存 v1 を見つけられなくなる。
 * server 境界で panel_id を正規化することで UI/CLI の不一致を防ぐ。
 */
export function normalizePanelId(
  pagePlan: PagePlanV2 | null,
  panelId: string,
  pageNo: number
): string {
  if (!pagePlan) return panelId;
  const page = pagePlan.pages.find((p) => p.page_no === pageNo);
  if (!page) return panelId;
  if (page.render_strategy === "page_one_shot") {
    return `page_${pageNo}`;
  }
  return panelId;
}

/** slug は path-safe な英数字 + `-` `_` のみ許可。先頭は英数字。 */
export const SLUG_REGEX = /^[a-z0-9][a-z0-9_-]*$/;

export function isValidSlug(s: unknown): s is string {
  return typeof s === "string" && SLUG_REGEX.test(s);
}

export function isValidEpisode(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n > 0;
}
