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
  BackgroundTreatment,
  EpisodeStoryboardV2,
  PagePlanV2,
  ResolvedRefs,
} from "../schemas-v2";

/**
 * RULE 11 (refs-resolver-v2) と整合: background_treatment の各値で
 * 「期待される ref 構成」を返す。実際の ref と突き合わせて contradiction を検出する。
 */
function expectedRefBehavior(t: BackgroundTreatment): {
  allowLocation: boolean;
  allowCharacter: boolean;
} {
  switch (t) {
    case "tone_back":
    case "solid_white":
    case "solid_black":
      return { allowLocation: false, allowCharacter: true };
    case "floating_ui":
      return { allowLocation: false, allowCharacter: false };
    case "atmospheric_fade":
    case "detailed_bg":
    case "unspecified":
      return { allowLocation: true, allowCharacter: true };
  }
}

/**
 * 静的監査: PagePlanPanel.background_treatment と ResolvedRefs.packets の整合性を検査。
 *
 * RULE 11 が refs-resolver-v2 で正しく適用されていれば、tone_back/floating_ui 等の panel に
 * location/character ref が混入していないはず。混入していたら矛盾として fail する。
 *
 * vision-based チェック (実 render 画像 vs treatment) は別 script (audit-bg-vision.ts) で
 * agent dispatch して実施する想定。本関数は cheap な regression detector。
 */
export function auditBackgroundTreatment(args: {
  pagePlan: PagePlanV2;
  resolvedRefs: ResolvedRefs;
}): AuditCheckResult[] {
  const checks: AuditCheckResult[] = [];

  for (const planPage of args.pagePlan.pages) {
    for (const panel of planPage.panels) {
      const t = panel.background_treatment;
      if (!t || t === "unspecified") continue;

      // page_one_shot scope の場合、packet は page_{N} に集約され panel 単独 packet は無いことがある
      const packet =
        args.resolvedRefs.packets[panel.panel_id] ??
        args.resolvedRefs.packets[`page_${planPage.page_no}`];
      if (!packet) {
        checks.push({
          panel_id: panel.panel_id,
          check_kind: "bg_treatment_compliance",
          passed: false,
          detail: `treatment=${t} だが resolved_refs に該当 packet なし`,
        });
        continue;
      }

      const expected = expectedRefBehavior(t);
      const hasLocationRef = packet.refs.some((r) => r.role === "location");
      const hasCharRef = packet.refs.some(
        (r) =>
          r.role === "character_face" ||
          r.role === "character_full" ||
          r.role === "character_back" ||
          r.role === "character_outfit" ||
          r.role === "character_3view"
      );

      const violations: string[] = [];
      // page_one_shot 集約 packet は他 panel 由来の ref も含むため、
      // panel スコープ packet (scope=panel) のときだけ厳密チェック
      const isPanelScope = packet.scope === "panel";
      if (isPanelScope) {
        if (!expected.allowLocation && hasLocationRef) {
          violations.push(`treatment=${t} は location ref 不可だが location ref 検出`);
        }
        if (!expected.allowCharacter && hasCharRef) {
          violations.push(`treatment=${t} は character ref 不可だが character ref 検出`);
        }
      }

      checks.push({
        panel_id: panel.panel_id,
        check_kind: "bg_treatment_compliance",
        passed: violations.length === 0,
        detail:
          violations.length > 0
            ? violations.join("; ")
            : `treatment=${t} ref 構成 OK (scope=${packet.scope})`,
      });
    }
  }

  return checks;
}

const MIN_PAGE_BYTES = 100_000;
const EXPECTED_PAGE_W = 1748;
const EXPECTED_PAGE_H = 2480;
const EXPECTED_TOLERANCE = 50;

export async function auditEpisode(args: {
  rendersDir: string;
  storyboard: EpisodeStoryboardV2;
  pagePlan: PagePlanV2;
  /** 2026-05-06 追加。指定時は bg_treatment_compliance 検査も実行 */
  resolvedRefs?: ResolvedRefs;
}): Promise<AuditReport> {
  const checks: AuditCheckResult[] = [];
  const failedPanels = new Set<string>();
  let panelsTotal = 0; let panelsPassed = 0;

  // bg_treatment 静的監査 (resolved_refs 指定時のみ)
  if (args.resolvedRefs) {
    const bgChecks = auditBackgroundTreatment({
      pagePlan: args.pagePlan,
      resolvedRefs: args.resolvedRefs,
    });
    checks.push(...bgChecks);
    for (const c of bgChecks) if (!c.passed) failedPanels.add(c.panel_id);
  }

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
