/**
 * L9 Render
 *
 * page_plan.json + storyboard.json + resolved_refs.json + bible →
 *   episodes/epNN/renders/p{NN}.png
 *
 * page_one_shot: 1ページ = 1 codex 呼び出し
 * panel_composite: 1パネル = 1 codex 呼び出し → ページ単位で合成は L9.5 (本実装は MVP のため省略、page_one_shot のみ)
 *
 * Phase A 検証段階では page_one_shot を全ページに適用し、panel_composite は後段で追加。
 */
import "../_env";
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  bibleSnapshotPath,
  storyboardPath,
  pagePlanPath,
  sceneGraphPath,
  resolvedRefsPath,
  rendersDir,
  nameApprovalPath,
  revisionQueuePath,
} from "./_paths";
import { generateMangaImage, MANGA_SIZE_PRESETS, type MangaImageSize } from "../../../src/lib/manga/generate/codex-image";

/**
 * panel rect の aspect ratio に応じて、最適な生成サイズを選ぶ。
 * 横長 (>1.3) は landscape、縦長 (<0.77) は portrait、それ以外は square。
 * 全パネルを 1024x1536 ハードコードで生成すると、ページ合成時に rect に
 * fit: cover で押し込まれて構図が壊れるため。
 */
function pickPanelSize(rect: { w: number; h: number }): MangaImageSize {
  const ratio = rect.w / rect.h;
  if (ratio > 1.3) return MANGA_SIZE_PRESETS.panel_landscape;
  if (ratio < 0.77) return MANGA_SIZE_PRESETS.panel_portrait;
  return MANGA_SIZE_PRESETS.panel_square;
}
import { composePagePrompt, composePanelPrompt, validatePromptAgainstCompliance } from "../../../src/lib/manga/render-v2/prompt-composer-v2";
import { loadBlocklist, loadFalsePositives } from "../../../src/lib/manga/compliance/scanner";
import { composePanelsIntoPage } from "../../../src/lib/manga/render-v2/page-composer";
import { overlayEffectLinesOntoPage } from "../../../src/lib/manga/render/page-with-effect-lines";
import { overlayBubblesOntoPage } from "../../../src/lib/manga/render/page-with-bubbles";
import { overlayPolygonFramesOntoPage } from "../../../src/lib/manga/render/page-with-polygon-frames";
import type {
  BibleSnapshotV2,
  EpisodeStoryboardV2,
  PagePlanV2,
  ResolvedRefs,
} from "../../../src/lib/manga/schemas-v2";
import type { SceneGraphV1, Scene } from "../../../src/lib/manga/scene-graph/schema";
import { isSceneGraphV1 } from "../../../src/lib/manga/scene-graph/schema";
import type { NameApproval } from "../../../src/lib/manga/name-preview/types";
import { appendRenderManifest, readJsonl } from "../../../src/lib/manga/revision-ui/manifest";
import type { RevisionEntry } from "../../../src/lib/manga/revision-ui/types";

/**
 * workdir 起点の相対パスを返す (manifest に格納する用)。
 * 例: "/Users/.../works/a07/episodes/ep01/renders/p01.png" → "episodes/ep01/renders/p01.png"
 */
function workdirRelative(slug: string, absPath: string): string {
  const root = path.resolve("data/manga/works", slug);
  const abs = path.resolve(absPath);
  if (abs.startsWith(root + path.sep)) return abs.slice(root.length + 1);
  return abs;
}

type Args = {
  slug: string;
  episode: number;
  pages?: number[];
  concurrency: number;
  skipNameGate: boolean;
  autoVersion: boolean;
  /** Phase C: 出力 version。"v1" は既存命名 (p{NN}.png)、v2+ は p{NN}_vN.png */
  version: string;
  /**
   * Phase C: revision queue から userInstructions を引くための panel_id (or page_${N})。
   * 単一 panel 再走モード。--revision-id とどちらか一方を使う。
   */
  panelId?: string;
  /** Phase C: revision_queue.jsonl から id 一致 entry の userInstructions を使う */
  revisionId?: string;
};

function parseArgs(): Args {
  const a: Partial<Args> = { concurrency: 2, skipNameGate: false, autoVersion: false, version: "v1" };
  const argv = process.argv.slice(2);
  const BOOLEAN_FLAGS = new Set(["skip-name-gate", "auto-version"]);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = arg.match(/^--([^=]+)=(.*)$/);
    let key: string | null = null;
    let val: string | null = null;
    if (eq) {
      [, key, val] = eq;
    } else {
      const flag = arg.match(/^--(.+)$/);
      if (!flag) continue;
      key = flag[1];
      if (BOOLEAN_FLAGS.has(key)) {
        if (key === "skip-name-gate") a.skipNameGate = true;
        else if (key === "auto-version") a.autoVersion = true;
        continue;
      }
      const nextToken = argv[i + 1];
      if (i + 1 >= argv.length || (nextToken && nextToken.startsWith("--"))) continue;
      val = nextToken;
      i++;
    }
    if (val === null) continue;
    if (key === "slug") a.slug = val;
    else if (key === "episode") a.episode = Number(val);
    else if (key === "pages") a.pages = val.split(",").map((s) => Number(s));
    else if (key === "concurrency") a.concurrency = Number(val);
    else if (key === "version") a.version = val;
    else if (key === "panel-id") a.panelId = val;
    else if (key === "revision-id") a.revisionId = val;
  }
  if (!a.slug || !a.episode) throw new Error("--slug and --episode required");
  if (a.version && !/^v\d+$/.test(a.version)) throw new Error(`--version must be vN (got ${a.version})`);
  return a as Args;
}

async function computeNextVersion(slug: string, episode: number): Promise<string> {
  const dir = rendersDir(slug, episode);
  let max = 0;
  try {
    const files = await fs.readdir(dir);
    for (const f of files) {
      const m = f.match(/^p\d+_v(\d+)\.png$/);
      if (m) {
        max = Math.max(max, Number(m[1]));
        continue;
      }
      if (/^p\d+\.png$/.test(f)) max = Math.max(max, 1);
    }
  } catch {
    // renders dir が空/未作成でも v2 から始める。
  }
  return `v${Math.max(max, 1) + 1}`;
}

/** v1 → p{NN}.png、v2+ → p{NN}_vN.png */
function renderOutPath(slug: string, episode: number, pageNo: number, version: string): string {
  const pn = String(pageNo).padStart(2, "0");
  if (version === "v1") return path.join(rendersDir(slug, episode), `p${pn}.png`);
  return path.join(rendersDir(slug, episode), `p${pn}_${version}.png`);
}

function panelOutPath(slug: string, episode: number, pageNo: number, readingOrder: number, version: string): string {
  const pn = String(pageNo).padStart(2, "0");
  const ro = String(readingOrder).padStart(2, "0");
  if (version === "v1") return path.join(rendersDir(slug, episode), `p${pn}_panel_${ro}.png`);
  return path.join(rendersDir(slug, episode), `p${pn}_panel_${ro}_${version}.png`);
}

/** revision_queue から指示文を組み立てる (tag を文字列化して prepend) */
function buildUserInstructions(entry: RevisionEntry): string {
  const tagStr = entry.checked_tags.length > 0 ? `[tags: ${entry.checked_tags.join(", ")}] ` : "";
  return `${tagStr}${entry.instruction}`.trim();
}

/**
 * Name gate: name_approval.json を読み、approved 以外を render 対象から外す。
 * - ファイル不存在: hard fail (--skip-name-gate で回避可)
 * - approved 以外のページ: 警告して skip
 *
 * SSoT: ~/.claude/plans/manga-pipeline-v2.md
 */
async function loadNameApproval(slug: string, episode: number): Promise<NameApproval | null> {
  try {
    const buf = await fs.readFile(nameApprovalPath(slug, episode), "utf-8");
    return JSON.parse(buf) as NameApproval;
  } catch {
    return null;
  }
}

function applyNameGate(
  pageNos: number[],
  approval: NameApproval | null,
  skipNameGate: boolean
): { renderable: number[]; gatedOut: Array<{ no: number; reason: string }> } {
  if (skipNameGate) return { renderable: pageNos, gatedOut: [] };
  const gatedOut: Array<{ no: number; reason: string }> = [];
  const renderable: number[] = [];
  for (const no of pageNos) {
    const dec = approval?.pages[String(no)];
    if (!dec) {
      gatedOut.push({ no, reason: "missing decision" });
      continue;
    }
    if (dec.status !== "approved") {
      gatedOut.push({ no, reason: dec.status });
      continue;
    }
    renderable.push(no);
  }
  return { renderable, gatedOut };
}

async function existsAndNonEmpty(p: string, minBytes = 50_000): Promise<boolean> {
  try { const st = await fs.stat(p); return st.size >= minBytes; } catch { return false; }
}

async function runWithConcurrency<T>(items: T[], n: number, worker: (it: T) => Promise<void>) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.max(1, n) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      await worker(items[idx]);
    }
  }));
}

async function main() {
  const args = parseArgs();
  const bible = JSON.parse(await fs.readFile(bibleSnapshotPath(args.slug), "utf-8")) as BibleSnapshotV2;
  const storyboard = JSON.parse(await fs.readFile(storyboardPath(args.slug, args.episode), "utf-8")) as EpisodeStoryboardV2;
  // Compliance 辞書を 1 度だけ読み込み (panel/page 単位で使い回す)
  const complianceBlocklist = await loadBlocklist();
  const complianceFp = await loadFalsePositives();
  const compliance = { blocklist: complianceBlocklist, fp: complianceFp };
  const pagePlan = JSON.parse(await fs.readFile(pagePlanPath(args.slug, args.episode), "utf-8")) as PagePlanV2;
  const resolved = JSON.parse(await fs.readFile(resolvedRefsPath(args.slug, args.episode), "utf-8")) as ResolvedRefs;
  let sceneByPage = new Map<number, Scene>();
  try {
    const sgRaw = JSON.parse(await fs.readFile(sceneGraphPath(args.slug, args.episode), "utf-8")) as unknown;
    if (isSceneGraphV1(sgRaw)) {
      const sceneGraph: SceneGraphV1 = sgRaw;
      for (const scene of sceneGraph.scenes) {
        for (let p = scene.page_range.start; p <= scene.page_range.end; p++) {
          if (!sceneByPage.has(p)) sceneByPage.set(p, scene);
        }
      }
      console.log(`[L09] scene_graph loaded: ${sceneGraph.scenes.length} scenes`);
    }
  } catch {
    console.warn(`[L09] scene_graph not found, prompts will lack D-axis context`);
  }

  await fs.mkdir(rendersDir(args.slug, args.episode), { recursive: true });
  if (args.autoVersion) {
    args.version = await computeNextVersion(args.slug, args.episode);
    console.log(`[L09] auto-version: using ${args.version}`);
  }

  // Phase C: revision-id 指定時は queue から userInstructions を取得して single-panel 経路へ
  let revisionEntry: RevisionEntry | null = null;
  if (args.revisionId) {
    const queue = await readJsonl<RevisionEntry>(revisionQueuePath(args.slug, args.episode));
    revisionEntry = queue.find((e) => e.id === args.revisionId) ?? null;
    if (!revisionEntry) {
      console.error(`[L09] --revision-id ${args.revisionId} not found in queue`);
      process.exit(5);
    }
    console.log(`[L09] revision ${args.revisionId.slice(0, 8)}: panel=${revisionEntry.panel_id} version=${args.version}`);
  }

  // Name gate: name_approval.json を読み、approved 以外は除外
  // ただし revisionId 指定時は人間判定済みの再走なので gate skip 扱い (UI 側の judgement を信頼)
  const skipGate = args.skipNameGate || !!revisionEntry;
  const approval = await loadNameApproval(args.slug, args.episode);
  if (!approval && !skipGate) {
    console.error(`[L09] name_approval.json not found at ${nameApprovalPath(args.slug, args.episode)}`);
    console.error(`[L09] Run L8.5 + serve-ops name-gate to approve, or pass --skip-name-gate to bypass.`);
    process.exit(3);
  }

  const targetPages = args.pages ? new Set(args.pages) : null;
  const candidatePages = pagePlan.pages.filter((p) => !targetPages || targetPages.has(p.page_no));
  const { renderable, gatedOut } = applyNameGate(
    candidatePages.map((p) => p.page_no),
    approval,
    skipGate
  );
  if (args.skipNameGate) {
    console.warn(`[L09] WARNING: --skip-name-gate active, name_approval.json bypassed`);
  }
  for (const g of gatedOut) {
    console.warn(`[L09] SKIP page ${g.no}: status=${g.reason}`);
  }
  const renderableSet = new Set(renderable);
  const pagesToRender = candidatePages.filter((p) => renderableSet.has(p.page_no));
  console.log(`[L09] slug=${args.slug} ep=${args.episode} pages=${pagesToRender.length}/${pagePlan.pages.length} (gated_out=${gatedOut.length})`);
  if (pagesToRender.length === 0 && !args.skipNameGate) {
    console.error(`[L09] No approved pages. Approve pages via Novelis Console name-gate or pass --skip-name-gate.`);
    process.exit(4);
  }

  const sbPagesByNo = new Map(storyboard.pages.map((p) => [p.page_no, p]));

  let done = 0; let failed = 0; let skipped = 0;

  await runWithConcurrency(pagesToRender, args.concurrency, async (page) => {
    const sbPage = sbPagesByNo.get(page.page_no);
    if (!sbPage) { failed++; return; }

    const outPath = renderOutPath(args.slug, args.episode, page.page_no, args.version);
    if (await existsAndNonEmpty(outPath)) { console.log(`[L09] SKIP p${page.page_no} (${args.version})`); skipped++; return; }

    // 修正指示 UI から渡された userInstructions (panel/page スコープ問わず prompt に inject)
    const userInstructions = revisionEntry ? buildUserInstructions(revisionEntry) : undefined;
    // revisionEntry が page_one_shot 単位 (panel_id="page_N") か panel 単位かでスコープを分岐
    const revisionTargetsThisPage = !revisionEntry || revisionEntry.page_no === page.page_no;
    if (!revisionTargetsThisPage) { skipped++; return; }

    if (page.render_strategy === "page_one_shot") {
      const packet = resolved.packets[`page_${page.page_no}`];
      if (!packet) { console.warn(`[L09] missing packet for page_${page.page_no}`); failed++; return; }
      const pageBgMap = new Map(page.panels.map((pp) => [pp.panel_id, pp.background_treatment]).filter(([, v]) => v !== undefined) as [string, NonNullable<typeof page.panels[0]["background_treatment"]>][]);
      const { prompt, refImagePaths } = composePagePrompt({
        page: sbPage, packet, bible, pageDimensions: { width: 1748, height: 2480 },
        userInstructions,
        pageBackgroundTreatments: pageBgMap.size > 0 ? pageBgMap : undefined,
        pagePlanPage: page,
        compliance,
        scene: sceneByPage.get(page.page_no),
      });
      // 最終 prompt に対する compliance gate (実在企業名/商標が prompt に残っていたら fatal stop)
      const promptCompliance = validatePromptAgainstCompliance(prompt, complianceBlocklist, complianceFp, { treatAsFatal: true });
      if (!promptCompliance.ok && promptCompliance.severity === "fatal") {
        console.error(`[L09] COMPLIANCE FATAL on p${page.page_no}: ${promptCompliance.reason}`);
        if (promptCompliance.findings) {
          for (const f of promptCompliance.findings.slice(0, 5)) {
            console.error(`  - [${f.category}] '${f.matched_term}' @ ${f.field_path}: ${f.text_excerpt.slice(0, 80)}`);
          }
        }
        failed++;
        return;
      }
      try {
        console.log(`[L09] gen p${page.page_no} (page_one_shot, refs=${refImagePaths.length})`);
        // gpt-image-2 は 1748x2480 を受け付けず fall back するため、
        // 1024x1536 (標準 portrait) で生成 → sharp で B6 1748x2480 にアップスケール
        const tmpPath = outPath + ".raw.png";
        await generateMangaImage({
          prompt, outputPath: tmpPath,
          size: { width: 1024, height: 1536 },
          referenceImagePaths: refImagePaths,
          timeoutMs: 15 * 60 * 1000,
          maxRetries: 1,
        });
        await sharp(tmpPath)
          .resize({ width: 1748, height: 2480, fit: "fill" })
          .png()
          .toFile(outPath);
        try { await fs.unlink(tmpPath); } catch {}
        const polygonResult = await overlayPolygonFramesOntoPage({
          pagePngPath: outPath,
          outputPath: outPath,
          pagePlanPage: page,
          pageWidth: 1748,
          pageHeight: 2480,
        });
        if (polygonResult.framedCount > 0) console.log(`[L09] polygon frames p${page.page_no}: ${polygonResult.framedCount}`);
        const effectResult = await overlayEffectLinesOntoPage({
          pageOutputPath: outPath,
          pagePlanPage: page,
          storyboardPage: sbPage,
          pageWidth: 1748,
          pageHeight: 2480,
        });
        if (effectResult.effectCount > 0) console.log(`[L09] effects p${page.page_no}: ${effectResult.effectCount}`);
        const bubbleResult = await overlayBubblesOntoPage({
          pagePngPath: outPath,
          outputPath: outPath,
          pageBubbleInput: { pagePlanPage: page, storyboardPage: sbPage, pageWidth: 1748, pageHeight: 2480 },
        });
        if (bubbleResult.bubbleCount > 0) console.log(`[L09] bubbles p${page.page_no}: ${bubbleResult.bubbleCount}`);
        await appendRenderManifest({
          schema_version: 1,
          ts: new Date().toISOString(),
          slug: args.slug,
          episode: args.episode,
          page_no: page.page_no,
          panel_id: `page_${page.page_no}`,
          version: args.version,
          layer: "render",
          image_path: workdirRelative(args.slug, outPath),
          render_strategy: "page_one_shot",
          origin: revisionEntry ? "revision_queue" : "initial",
          triggered_by_revision_id: revisionEntry?.id,
        });
        done++;
        console.log(`[L09] DONE p${page.page_no} (${args.version})`);
      } catch (e) {
        console.warn(`[L09] FAIL p${page.page_no}: ${(e as Error).message}`);
        failed++;
      }
    } else {
      // panel_composite: 各パネルを生成 → 後で合成 (capability override 時の fallback)
      // 2026-05-07: 既定は page_one_shot。panel_composite 経路は @deprecated 扱い。
      console.warn(`[L09] DEPRECATED: panel_composite branch hit for page ${page.page_no}. Default render_strategy is page_one_shot. Check capability.recommended_strategy override or page_plan migration.`);
      // revisionEntry が特定 panel を狙う場合、その panel のみ生成
      const targetPanels = revisionEntry && revisionEntry.panel_id !== `page_${page.page_no}`
        ? page.panels.filter((pp) => pp.panel_id === revisionEntry!.panel_id)
        : page.panels;
      for (const pp of targetPanels) {
        const panelOut = panelOutPath(args.slug, args.episode, page.page_no, pp.reading_order, args.version);
        if (await existsAndNonEmpty(panelOut)) { skipped++; continue; }
        const sbPanel = sbPage.panels.find((x) => x.panel_id === pp.panel_id);
        if (!sbPanel) { failed++; continue; }
        const packet = resolved.packets[pp.panel_id];
        if (!packet) { failed++; continue; }
        const { prompt, refImagePaths } = composePanelPrompt({
          panel: sbPanel, packet, bible, pageDimensions: { width: pp.rect.w, height: pp.rect.h },
          userInstructions,
          backgroundTreatment: pp.background_treatment,
          compliance,
          scene: sceneByPage.get(page.page_no),
        });
        // 最終 prompt の compliance gate
        const panelPromptCompliance = validatePromptAgainstCompliance(prompt, complianceBlocklist, complianceFp, { treatAsFatal: true });
        if (!panelPromptCompliance.ok && panelPromptCompliance.severity === "fatal") {
          console.error(`[L09] COMPLIANCE FATAL on p${page.page_no}/panel#${pp.reading_order}: ${panelPromptCompliance.reason}`);
          failed++;
          continue;
        }
        try {
          console.log(`[L09] gen p${page.page_no}/panel#${pp.reading_order} (${args.version})`);
          await generateMangaImage({
            prompt, outputPath: panelOut,
            size: pickPanelSize(pp.rect),
            referenceImagePaths: refImagePaths,
            timeoutMs: 15 * 60 * 1000, maxRetries: 1,
          });
          await appendRenderManifest({
            schema_version: 1,
            ts: new Date().toISOString(),
            slug: args.slug,
            episode: args.episode,
            page_no: page.page_no,
            panel_id: pp.panel_id,
            version: args.version,
            layer: "render",
            image_path: workdirRelative(args.slug, panelOut),
            render_strategy: "panel_composite",
            origin: revisionEntry ? "revision_queue" : "initial",
            triggered_by_revision_id: revisionEntry?.id,
          });
          done++;
        } catch (e) { console.warn(`[L09] FAIL panel ${pp.panel_id}: ${(e as Error).message}`); failed++; }
      }
      const composed = await composePanelsIntoPage({
        pageNo: page.page_no,
        rendersDir: rendersDir(args.slug, args.episode),
        pagePlanPage: page,
        outputPath: outPath,
      });
      if (composed.missingPanels.length === 0) {
        const effectResult = await overlayEffectLinesOntoPage({
          pageOutputPath: outPath,
          pagePlanPage: page,
          storyboardPage: sbPage,
          pageWidth: 1748,
          pageHeight: 2480,
        });
        if (effectResult.effectCount > 0) console.log(`[L09] effects p${page.page_no}: ${effectResult.effectCount}`);
        const bubbleResult = await overlayBubblesOntoPage({
          pagePngPath: outPath,
          outputPath: outPath,
          pageBubbleInput: { pagePlanPage: page, storyboardPage: sbPage, pageWidth: 1748, pageHeight: 2480 },
        });
        if (bubbleResult.bubbleCount > 0) console.log(`[L09] bubbles p${page.page_no}: ${bubbleResult.bubbleCount}`);
      }
    }
  });

  console.log(`[L09] DONE: gen=${done} skip=${skipped} fail=${failed}`);
  if (failed > 0) process.exit(2);
}

main().catch((e) => { console.error("[L09] FAILED:", e); process.exit(1); });
