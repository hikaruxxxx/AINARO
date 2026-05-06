/**
 * Effect Lines (MVP-4 Phase A) smoketest
 *
 * 目的:
 *  1. a07 ep01 全 22 page で detectEffectLines のヒット率を測定
 *  2. p01 (page_one_shot) の既存 render PNG に effect_lines を焼き込み (目視用)
 *  3. p02 / p03 (panel_composite) の panel PNG から page を組み立て, effect_lines を焼き込み (LLM コール 0)
 *
 * 実行:
 *   npx tsx scripts/manga/effect-lines-smoketest.ts
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { composePageEffects } from "../../src/lib/manga/effect-lines/page-effect-composer";
import { detectEffectLines } from "../../src/lib/manga/effect-lines/detector";
import { overlayEffectLinesOntoPage } from "../../src/lib/manga/render/page-with-effect-lines";
import { composePanelsIntoPage } from "../../src/lib/manga/render-v2/page-composer";
import type { EpisodeStoryboardV2, PagePlanV2 } from "../../src/lib/manga/schemas-v2";

async function main() {
  const slug = "a07-modern-dungeon";
  const episode = 1;
  const base = `data/manga/works/${slug}/episodes/ep${String(episode).padStart(2, "0")}`;
  const pagePlan = JSON.parse(await fs.readFile(`${base}/page_plan.json`, "utf-8")) as PagePlanV2;
  const storyboard = JSON.parse(await fs.readFile(`${base}/storyboard.json`, "utf-8")) as EpisodeStoryboardV2;

  const typeCounts: Record<string, number> = { speed: 0, focus: 0, radial: 0, vibration: 0 };
  const perPage: { page_no: number; effectCount: number; types: string[] }[] = [];
  let pagesWithEffect = 0;

  for (const planPage of pagePlan.pages) {
    const sbPage = storyboard.pages.find((p) => p.page_no === planPage.page_no);
    if (!sbPage) continue;

    const types: string[] = [];
    for (let i = 0; i < planPage.panels.length; i++) {
      const pp = planPage.panels[i];
      const sbPanel = sbPage.panels.find((p) => p.panel_id === pp.panel_id) ?? sbPage.panels[i];
      if (!sbPanel) continue;
      const spec = detectEffectLines(sbPanel);
      if (spec) {
        types.push(spec.type);
        typeCounts[spec.type]++;
      }
    }

    if (types.length > 0) pagesWithEffect++;
    perPage.push({ page_no: planPage.page_no, effectCount: types.length, types });
  }

  console.log("=== Effect Lines smoketest (a07 ep01) ===");
  console.log(`pages with effect: ${pagesWithEffect}/${pagePlan.pages.length} (${((pagesWithEffect / pagePlan.pages.length) * 100).toFixed(0)}%)`);
  console.log(`Plan 成功基準: 80-90% カバレッジ`);
  console.log(`catalog 観察: 165/193 page = 85%`);
  console.log("");
  console.log("type distribution:", typeCounts);
  console.log("");
  console.log("per-page:");
  for (const p of perPage) {
    if (p.effectCount > 0) {
      console.log(`  p${String(p.page_no).padStart(2, "0")}: ${p.effectCount} effects [${p.types.join(", ")}]`);
    } else {
      console.log(`  p${String(p.page_no).padStart(2, "0")}: -`);
    }
  }

  // p01 で実焼き込みテスト (page_one_shot で render 済み page のみ)
  const p01Page = pagePlan.pages.find((p) => p.page_no === 1);
  const p01Sb = storyboard.pages.find((p) => p.page_no === 1);
  if (!p01Page || !p01Sb) {
    console.log("\n[skip burn-in] p01 not found in plan/storyboard");
    return;
  }

  const candidates = [
    `${base}/renders/p01_v5.png`,
    `${base}/renders/p01_v4.png`,
    `${base}/renders/p01_v3.png`,
    `${base}/renders/p01_v2.png`,
    `${base}/renders/p01.png`,
  ];
  let sourcePng: string | null = null;
  for (const p of candidates) {
    try {
      await fs.access(p);
      sourcePng = p;
      break;
    } catch {
      /* skip */
    }
  }
  if (!sourcePng) {
    console.log("\n[skip burn-in] no source png found in renders/");
    return;
  }

  const outDir = "/tmp/effect-lines-smoketest";
  await fs.mkdir(outDir, { recursive: true });
  const burnInPath = `${outDir}/p01-with-effects.png`;
  await fs.copyFile(sourcePng, burnInPath);

  const burnResult = await overlayEffectLinesOntoPage({
    pageOutputPath: burnInPath,
    pagePlanPage: p01Page,
    storyboardPage: p01Sb,
    pageWidth: 1748,
    pageHeight: 2480,
  });

  const svgResult = composePageEffects({
    pagePlanPage: p01Page,
    storyboardPage: p01Sb,
    pageWidth: 1748,
    pageHeight: 2480,
  });
  const svgPath = `${outDir}/p01-effects-only.svg`;
  await fs.writeFile(svgPath, svgResult.svg, "utf-8");

  console.log("");
  console.log("=== p01 burn-in test (page_one_shot) ===");
  console.log(`source PNG:  ${sourcePng}`);
  console.log(`burned PNG:  ${burnInPath}`);
  console.log(`SVG only:    ${svgPath}`);
  console.log(`effectCount: ${burnResult.effectCount}`);
  console.log(`warnings:    ${svgResult.warnings.length}`);
  if (svgResult.warnings.length > 0) {
    for (const w of svgResult.warnings) console.log(`  - ${w}`);
  }

  // p02 / p03 burn-in: panel_composite ルートの真の検証
  for (const targetPageNo of [2, 3]) {
    await composePagePanels(targetPageNo, base, pagePlan, storyboard, outDir);
  }
}

async function composePagePanels(
  pageNo: number,
  base: string,
  pagePlan: PagePlanV2,
  storyboard: EpisodeStoryboardV2,
  outDir: string
) {
  const planPage = pagePlan.pages.find((p) => p.page_no === pageNo);
  const sbPage = storyboard.pages.find((p) => p.page_no === pageNo);
  if (!planPage || !sbPage) {
    console.log(`\n[skip p${String(pageNo).padStart(2, "0")}] page not found`);
    return;
  }

  const sourceRenders = `${base}/renders`;
  const stagedRenders = `${outDir}/p${String(pageNo).padStart(2, "0")}-renders`;
  await fs.mkdir(stagedRenders, { recursive: true });

  // panel ごとに最新 version の PNG を suffix なしファイル名で staged dir にコピー
  const allFiles = await fs.readdir(sourceRenders);
  const pagePrefix = `p${String(pageNo).padStart(2, "0")}_panel_`;
  const versionPattern = new RegExp(`^${pagePrefix}(\\d+)(?:_v(\\d+))?\\.png$`);
  const latestByPanel = new Map<string, { file: string; version: number }>();
  for (const f of allFiles) {
    const m = f.match(versionPattern);
    if (!m) continue;
    const panelNo = m[1];
    const version = m[2] ? Number(m[2]) : 0;
    const cur = latestByPanel.get(panelNo);
    if (!cur || cur.version < version) {
      latestByPanel.set(panelNo, { file: f, version });
    }
  }

  for (const [panelNo, info] of latestByPanel) {
    const dest = path.join(stagedRenders, `${pagePrefix}${panelNo}.png`);
    await fs.copyFile(path.join(sourceRenders, info.file), dest);
  }

  const pageOutPath = `${outDir}/p${String(pageNo).padStart(2, "0")}-with-effects.png`;
  const composed = await composePanelsIntoPage({
    pageNo,
    rendersDir: stagedRenders,
    pagePlanPage: planPage,
    outputPath: pageOutPath,
  });

  if (composed.missingPanels.length > 0) {
    console.log(`\n[p${String(pageNo).padStart(2, "0")}] missing panels:`, composed.missingPanels);
    return;
  }

  const effectResult = await overlayEffectLinesOntoPage({
    pageOutputPath: pageOutPath,
    pagePlanPage: planPage,
    storyboardPage: sbPage,
    pageWidth: 1748,
    pageHeight: 2480,
  });

  const svgResult = composePageEffects({
    pagePlanPage: planPage,
    storyboardPage: sbPage,
    pageWidth: 1748,
    pageHeight: 2480,
  });
  const svgOnlyPath = `${outDir}/p${String(pageNo).padStart(2, "0")}-effects-only.svg`;
  await fs.writeFile(svgOnlyPath, svgResult.svg, "utf-8");

  console.log("");
  console.log(`=== p${String(pageNo).padStart(2, "0")} burn-in test (panel_composite) ===`);
  console.log(`panels composed: ${composed.panelsComposed}/${planPage.panels.length}`);
  console.log(`burned PNG:      ${pageOutPath}`);
  console.log(`SVG only:        ${svgOnlyPath}`);
  console.log(`effectCount:     ${effectResult.effectCount}`);
  console.log(`warnings:        ${svgResult.warnings.length}`);
  if (svgResult.warnings.length > 0) {
    for (const w of svgResult.warnings) console.log(`  - ${w}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
