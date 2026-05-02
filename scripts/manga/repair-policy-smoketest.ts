/**
 * Repair Policy 純関数 スモークテスト
 *
 * judgePanelRepair / isImportantPanel / buildRepairPlan / summarizeRepairPlans を
 * 合成 PagePlan + verdict で網羅的に検証する。
 *
 * 実行: npx tsx scripts/manga/repair-policy-smoketest.ts
 */

import {
  judgePanelRepair,
  isImportantPanel,
  buildRepairPlan,
  buildFirstAppearanceMap,
  planEscalation,
  summarizeRepairPlans,
  type PanelRepairPlan,
} from "@/lib/manga/repair/policy";
import type {
  MangaPagePlan,
  PagePanel,
} from "@/lib/manga/page-director/types";
import type { ShotlistPanelEntry } from "@/lib/manga/schemas";
import type { FaceConsistencyVerdict } from "@/lib/manga/qa/face-consistency";

let assertions = 0;
let failures = 0;

function eq<T>(actual: T, expected: T, label: string) {
  assertions++;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures++;
    console.error(
      `  ❌ ${label}: expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`
    );
  } else {
    console.log(`  ✓ ${label}`);
  }
}

function makeVerdict(
  decision: FaceConsistencyVerdict["decision"],
  score: number,
  overrides: Partial<FaceConsistencyVerdict> = {}
): FaceConsistencyVerdict {
  return {
    same_person: decision !== "hard_fail",
    hair_match: true,
    eye_match: true,
    outfit_match: true,
    score,
    comment: "",
    decision,
    ...overrides,
  };
}

function makePagePanel(
  idx: number,
  importance: PagePanel["importance"],
  reading_order: number,
  size_class: PagePanel["render_size_class"] = "medium"
): PagePanel {
  return {
    panel_idx: idx,
    slot_id: `s${idx}`,
    rect: { x: 0, y: 0, w: 100, h: 100 },
    render_size_class: size_class,
    reading_order,
    importance,
    balloon_zones: [],
  };
}

function makePage(
  page_idx: number,
  panels: PagePanel[],
  page_role: MangaPagePlan["page_role"] = "dialogue"
): MangaPagePlan {
  return {
    page_idx,
    reading_direction: "rtl",
    layout_template_id: "test",
    page_role,
    actual_panel_count: panels.length,
    visual_density: "normal",
    dialogue_density: "normal",
    turn_strength: 2,
    render_strategy: "panel_composite",
    panels,
  };
}

function makeShotlistPanel(
  idx: number,
  characters: string[] = [],
  role: ShotlistPanelEntry["role"] = "dialogue"
): ShotlistPanelEntry {
  return {
    idx,
    role,
    aspect: "panel_square",
    scene_id: "s1",
    camera: "medium",
    tempo: "slow",
    characters,
    location: null,
  } as ShotlistPanelEntry;
}

console.log("[smoketest] === judgePanelRepair ===");

{
  // pass はそのまま accept
  const v = makeVerdict("pass", 0.85);
  const j = judgePanelRepair({ verdict: v, attempts: 0, important: false });
  eq(j.action, "accept", "pass → accept");
  eq(j.maxRetries, 2, "通常コマの maxRetries=2");
}

{
  // warn (0.6) attempts=0 → retry_stronger_ref
  const v = makeVerdict("warn", 0.6);
  const j = judgePanelRepair({ verdict: v, attempts: 0, important: false });
  eq(j.action, "retry_stronger_ref", "warn attempts=0 → stronger_ref");
}

{
  // warn attempts=1 → retry_silhouette
  const v = makeVerdict("warn", 0.6);
  const j = judgePanelRepair({ verdict: v, attempts: 1, important: false });
  eq(j.action, "retry_silhouette", "warn attempts=1 → silhouette");
}

{
  // warn attempts=2 (上限到達) → manual_review
  const v = makeVerdict("warn", 0.6);
  const j = judgePanelRepair({ verdict: v, attempts: 2, important: false });
  eq(j.action, "manual_review", "warn attempts=2 (通常上限) → manual_review");
}

{
  // 重要コマで attempts=2 → まだ retry_silhouette
  const v = makeVerdict("warn", 0.6);
  const j = judgePanelRepair({ verdict: v, attempts: 2, important: true });
  eq(j.action, "retry_silhouette", "重要コマ attempts=2 → silhouette");
  eq(j.maxRetries, 3, "重要コマの maxRetries=3");
}

{
  // 重要コマ attempts=3 → manual_review
  const v = makeVerdict("warn", 0.6);
  const j = judgePanelRepair({ verdict: v, attempts: 3, important: true });
  eq(j.action, "manual_review", "重要コマ attempts=3 → manual_review");
}

{
  // hard_fail は重要扱いに昇格 (上限 3)
  const v = makeVerdict("hard_fail", 0.1);
  const j = judgePanelRepair({ verdict: v, attempts: 0, important: false });
  eq(j.maxRetries, 3, "hard_fail で重要扱い昇格 → maxRetries=3");
  eq(j.action, "retry_stronger_ref", "hard_fail attempts=0 → stronger_ref");
}

{
  // reroll
  const v = makeVerdict("reroll", 0.4);
  const j = judgePanelRepair({ verdict: v, attempts: 0, important: false });
  eq(j.action, "retry_stronger_ref", "reroll attempts=0 → stronger_ref");
}

console.log("");
console.log("[smoketest] === isImportantPanel ===");

{
  // ページ最大コマ (importance=5)
  const panels = [
    makePagePanel(0, 2, 1),
    makePagePanel(1, 5, 2), // importance 最大
    makePagePanel(2, 3, 3),
  ];
  const page = makePage(0, panels);
  const r = isImportantPanel({ panel: panels[1], page });
  eq(
    r.reasons.includes("page_largest_panel"),
    true,
    "importance=5 → page_largest_panel"
  );
}

{
  // splash size_class
  const panels = [makePagePanel(0, 2, 1, "splash")];
  const page = makePage(0, panels);
  const r = isImportantPanel({ panel: panels[0], page });
  eq(
    r.reasons.includes("page_largest_panel"),
    true,
    "splash → page_largest_panel"
  );
}

{
  // ページ末コマ
  const panels = [
    makePagePanel(0, 3, 1),
    makePagePanel(1, 3, 2),
    makePagePanel(2, 3, 3), // 最後
  ];
  const page = makePage(0, panels);
  const r0 = isImportantPanel({ panel: panels[0], page });
  const r2 = isImportantPanel({ panel: panels[2], page });
  eq(r0.reasons.includes("page_last_panel"), false, "panels[0] は末でない");
  eq(r2.reasons.includes("page_last_panel"), true, "panels[2] は末コマ");
}

{
  // cliffhanger (page_role)
  const panels = [makePagePanel(0, 3, 1), makePagePanel(1, 4, 2)];
  const page = makePage(0, panels, "cliffhanger");
  const r = isImportantPanel({ panel: panels[1], page });
  eq(
    r.reasons.includes("cliffhanger"),
    true,
    "page.page_role=cliffhanger かつ末 → cliffhanger 理由"
  );
}

{
  // 初登場
  const sb = [
    makeShotlistPanel(0, ["charA"]),
    makeShotlistPanel(1, ["charA", "charB"]), // charB 初登場
    makeShotlistPanel(2, ["charA"]),
  ];
  const map = buildFirstAppearanceMap(sb);
  eq(map.get(0), ["charA"], "panel 0 charA 初登場");
  eq(map.get(1), ["charB"], "panel 1 charB 初登場");
  eq(map.get(2), undefined, "panel 2 は初登場なし");

  const panels = [makePagePanel(1, 3, 1)];
  const page = makePage(0, panels);
  const r = isImportantPanel({
    panel: panels[0],
    page,
    shotlistPanel: sb[1],
    shotlistPanels: sb,
    firstAppearanceByIdx: map,
  });
  eq(
    r.reasons.includes("first_appearance"),
    true,
    "shotlist panel 1 で charB 初登場 → first_appearance"
  );
}

{
  // hard_fail verdict
  const panels = [makePagePanel(0, 3, 1)];
  const page = makePage(0, panels);
  const v = makeVerdict("hard_fail", 0.1);
  const r = isImportantPanel({ panel: panels[0], page, lastVerdict: v });
  eq(r.reasons.includes("hard_fail"), true, "hard_fail verdict → 重要");
}

console.log("");
console.log("[smoketest] === buildRepairPlan + summarizeRepairPlans ===");

{
  const sb = [
    makeShotlistPanel(0, ["charA"]),
    makeShotlistPanel(1, ["charA"]),
    makeShotlistPanel(2, ["charA"], "cliffhanger"),
  ];
  const pps = [
    makePagePanel(0, 3, 1),
    makePagePanel(1, 3, 2),
    makePagePanel(2, 5, 3, "extra_large"), // ページ最大 + 末 + cliffhanger
  ];
  const page = makePage(0, pps, "cliffhanger");
  const map = buildFirstAppearanceMap(sb);

  const plans: PanelRepairPlan[] = [
    buildRepairPlan({
      panelIdx: 0,
      verdict: makeVerdict("pass", 0.85),
      attempts: 0,
      panel: pps[0],
      page,
      shotlistPanel: sb[0],
      shotlistPanels: sb,
      firstAppearanceByIdx: map,
    }),
    buildRepairPlan({
      panelIdx: 1,
      verdict: makeVerdict("warn", 0.6),
      attempts: 0,
      panel: pps[1],
      page,
      shotlistPanel: sb[1],
      shotlistPanels: sb,
      firstAppearanceByIdx: map,
    }),
    buildRepairPlan({
      panelIdx: 2,
      verdict: makeVerdict("hard_fail", 0.1),
      attempts: 0,
      panel: pps[2],
      page,
      shotlistPanel: sb[2],
      shotlistPanels: sb,
      firstAppearanceByIdx: map,
    }),
  ];

  eq(plans[0].judgement.action, "accept", "panel0 verdict=pass → accept");
  eq(
    plans[1].judgement.action,
    "retry_stronger_ref",
    "panel1 verdict=warn → stronger_ref"
  );
  eq(
    plans[2].judgement.action,
    "retry_stronger_ref",
    "panel2 verdict=hard_fail attempts=0 → stronger_ref (上限 3 内)"
  );
  eq(plans[2].important_check.important, true, "panel2 重要コマ判定");

  const summary = summarizeRepairPlans(plans);
  eq(summary.total, 3, "summary.total=3");
  eq(summary.by_action.accept, 1, "by_action.accept=1");
  eq(summary.by_action.retry_stronger_ref, 2, "by_action.retry_stronger_ref=2");
  eq(summary.important_panels >= 1, true, "重要コマ >= 1");
}

console.log("");
console.log("[smoketest] === planEscalation ===");

{
  const e1 = planEscalation("retry_stronger_ref");
  eq(e1?.addExtraReferences, true, "stronger_ref で参照画像追加");
  eq(
    e1?.forceSilhouetteOrFar,
    false,
    "stronger_ref では silhouette 強制しない"
  );

  const e2 = planEscalation("retry_silhouette");
  eq(e2?.forceSilhouetteOrFar, true, "silhouette で silhouette 強制");

  const e3 = planEscalation("accept");
  eq(e3, null, "accept では escalation なし");
}

console.log("");
console.log(
  `[smoketest] ${assertions - failures}/${assertions} アサーション PASS`
);
if (failures > 0) {
  console.error(`[smoketest] FAILED (${failures} 件)`);
  process.exit(1);
}
console.log("[smoketest] ✅ PASS");
