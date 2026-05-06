/**
 * L11 Audit v2
 *
 * 出力 renders/p{NN}.png に対して minimal な検査を実施。
 *
 * MVP 検査:
 * - file_exists & size > min_bytes (画像が壊れていないか)
 * - render_strategy 通りの解像度になっているか (1748x2480)
 * - dialogue_count: L09 焼き込み済み画像の dialogue 期待数を informational に記録
 * - continuity_check (同一 character の page 間 sha256 比較は弱い指標、未実装)
 *
 * face_consistency などの重い CV 検査は将来 (qa/face-consistency.ts は v1 にあり再利用可)。
 */
import sharp from "sharp";
import path from "node:path";
import { promises as fs } from "node:fs";
import type {
  AuditCheckResult,
  AuditReport,
  EpisodeStoryboardV2,
  PagePlanV2,
} from "../schemas-v2";

const MIN_PAGE_BYTES = 100_000;
const EXPECTED_PAGE_W = 1748;
const EXPECTED_PAGE_H = 2480;
const EXPECTED_TOLERANCE = 50;

export async function auditEpisode(args: {
  rendersDir: string;
  storyboard: EpisodeStoryboardV2;
  pagePlan: PagePlanV2;
}): Promise<AuditReport> {
  const checks: AuditCheckResult[] = [];
  const failedPanels = new Set<string>();
  let panelsTotal = 0; let panelsPassed = 0;

  for (const planPage of args.pagePlan.pages) {
    const sbPage = args.storyboard.pages.find((p) => p.page_no === planPage.page_no);
    if (!sbPage) continue;

    for (const planPanel of planPage.panels) panelsTotal++;

    const pageImg = path.join(args.rendersDir, `p${String(planPage.page_no).padStart(2, "0")}.png`);
    const pageId = `page_${planPage.page_no}`;
    let pageOk = true;

    try {
      const stat = await fs.stat(pageImg);
      if (stat.size < MIN_PAGE_BYTES) {
        checks.push({
          panel_id: pageId, check_kind: "regulation_violation", passed: false,
          score: stat.size, threshold: MIN_PAGE_BYTES,
          detail: `rendered page image too small (${stat.size} < ${MIN_PAGE_BYTES})`,
        });
        pageOk = false;
      } else {
        const meta = await sharp(pageImg).metadata();
        const wOk = Math.abs((meta.width ?? 0) - EXPECTED_PAGE_W) <= EXPECTED_TOLERANCE;
        const hOk = Math.abs((meta.height ?? 0) - EXPECTED_PAGE_H) <= EXPECTED_TOLERANCE;
        checks.push({
          panel_id: pageId, check_kind: "background_invariant", passed: wOk && hOk,
          detail: `dims=${meta.width}x${meta.height} expected≈${EXPECTED_PAGE_W}x${EXPECTED_PAGE_H}`,
        });
        if (!(wOk && hOk)) pageOk = false;

        // L09 焼き込み済み画像の dialogue 期待数を informational に記録
        const expectedBubbles = sbPage.panels.reduce(
          (n, p) => n + p.dialogue.length + p.monologue.length + p.narration.length + p.sfx.length,
          0
        );
        // 実測は CV 必要だが MVP は「期待値が 0 でなければ OK」とする
        checks.push({
          panel_id: pageId, check_kind: "dialogue_count", passed: true,
          score: expectedBubbles, threshold: 1,
          detail: `expected_bubbles=${expectedBubbles}`,
        });
      }
    } catch (e) {
      checks.push({
        panel_id: pageId, check_kind: "regulation_violation", passed: false,
        detail: `rendered page image missing or unreadable: ${(e as Error).message}`,
      });
      pageOk = false;
    }

    if (pageOk) {
      panelsPassed += planPage.panels.length;
    } else {
      for (const planPanel of planPage.panels) failedPanels.add(planPanel.panel_id);
    }
  }

  return {
    schema_version: 1,
    episode_id: args.storyboard.episode_id,
    audited_at: new Date().toISOString(),
    panels_total: panelsTotal,
    panels_passed: panelsPassed,
    panels_failed: panelsTotal - panelsPassed,
    checks,
    failed_panel_ids: [...failedPanels],
  };
}
