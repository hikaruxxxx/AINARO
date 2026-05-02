/**
 * Repair Panels Driver (snapshot 経路)
 *
 * 流れ:
 *   1. snapshot + storyboard.json + manifest.json + face-consistency-report.json を読む
 *   2. 各 panel について PagePlan / shotlist を引き、RepairPlan を計算
 *   3. action != accept の panel について:
 *      - retry_stronger_ref / retry_silhouette: 再生成プロンプトに escalation hint を追加
 *        + 参照画像を全 expression まで拡張して再生成、face_consistency 再計測
 *      - manual_review: スキップして manual_review_log.json に記録
 *   4. manifest.json と face-consistency-report.json を更新
 *
 * 使い方:
 *   # dry-run: plan のみ表示
 *   npx tsx scripts/manga/repair-panels-from-snapshot.ts \
 *     --snapshot=data/manga/bible/work-1-dungeon-explorer/snapshot.json \
 *     --manifest=data/manga/output/work-1-dungeon-explorer/ep001/manifest.json \
 *     --dry-run=true
 *
 *   # 本実行
 *   npx tsx scripts/manga/repair-panels-from-snapshot.ts \
 *     --snapshot=... --manifest=...
 *
 *   # 再試行ラウンド数 (デフォルト 1)。複数指定すると判定→再生成→再判定をループ
 *   npx tsx scripts/manga/repair-panels-from-snapshot.ts \
 *     --snapshot=... --manifest=... --max-rounds=2
 */

import "./_env";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { loadBibleSnapshot } from "./load-bible-snapshot";
import { snapshotToBibleRows } from "../../src/lib/manga/bible/snapshot-adapter";
import {
  mapStoryboardToPages,
  resolveContinuityGroupIds,
  buildGroupRefRegistry,
  buildCharacterRefPathsFromRegistry,
  resolveRefsForGroupIds,
  type RenderConstraints,
} from "../../src/lib/manga/page-director";
import { composePanelPrompt } from "../../src/lib/manga/generate/prompt-composer";
import { generateMangaImage } from "../../src/lib/manga/generate/codex-image";
import {
  measureFaceConsistency,
  aggregateFaceConsistency,
  type FaceConsistencyReport,
} from "../../src/lib/manga/qa/face-consistency";
import {
  buildRepairPlan,
  buildFirstAppearanceMap,
  planEscalation,
  summarizeRepairPlans,
  type PanelRepairPlan,
} from "../../src/lib/manga/repair/policy";
import type {
  ShotlistData,
  ShotlistPanelEntry,
  CostumeStateRow,
} from "../../src/lib/manga/schemas";

// ============================================================
// CLI args
// ============================================================

type CliArgs = {
  snapshotPath: string;
  manifestPath: string;
  storyboardJsonPath?: string;
  consistencyReportPath?: string;
  refsRoot: string;
  dryRun: boolean;
  maxRounds: number;
  imageTimeoutMs: number;
  maxRetries: number;
};

function parseArgs(): CliArgs {
  const args: Partial<CliArgs> = {};
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (!m) continue;
    const [, key, value] = m;
    switch (key) {
      case "snapshot":
        args.snapshotPath = value;
        break;
      case "manifest":
        args.manifestPath = value;
        break;
      case "storyboard":
        args.storyboardJsonPath = value;
        break;
      case "consistency-report":
        args.consistencyReportPath = value;
        break;
      case "refs-root":
        args.refsRoot = value;
        break;
      case "dry-run":
        args.dryRun = value === "true" || value === "1";
        break;
      case "max-rounds":
        args.maxRounds = Number.parseInt(value, 10);
        break;
      case "timeout-ms":
        args.imageTimeoutMs = Number.parseInt(value, 10);
        break;
      case "max-retries":
        args.maxRetries = Number.parseInt(value, 10);
        break;
    }
  }
  if (!args.snapshotPath) throw new Error("--snapshot=<path> が必要です");
  if (!args.manifestPath) throw new Error("--manifest=<path> が必要です");
  return {
    snapshotPath: args.snapshotPath,
    manifestPath: args.manifestPath,
    storyboardJsonPath: args.storyboardJsonPath,
    consistencyReportPath: args.consistencyReportPath,
    refsRoot: args.refsRoot ?? "data/manga/bible",
    dryRun: args.dryRun ?? false,
    maxRounds: args.maxRounds ?? 1,
    imageTimeoutMs: args.imageTimeoutMs ?? 6 * 60 * 1000,
    maxRetries: args.maxRetries ?? 1,
  };
}

const DEFAULT_CONSTRAINTS: RenderConstraints = {
  max_panels_per_page: 7,
  avg_panels_per_page: 5,
  max_dialogue_bubbles_per_panel: 2,
  max_closeups_per_page: 2,
  allow_action_pages: true,
  forbidden_panel_types: [],
  allowed_size_classes: ["small", "medium", "large", "extra_large", "splash"],
};

// ============================================================
// Manifest 拡張: 各 panel に retry_count を持たせる
// ============================================================

type ManifestPanel = {
  panel_idx: number;
  prompt: string;
  referenceImagePaths: string[];
  durationMs: number;
  outputPath: string;
  error?: string;
  /** repair の累計再試行回数 (新規追加。初回 manifest には無い) */
  retry_count?: number;
  /** 直近の repair action (新規追加) */
  last_repair_action?: string;
};

type Manifest = {
  slug: string;
  ep: number;
  generated_at: string;
  dry_run?: boolean;
  panels: ManifestPanel[];
};

// ============================================================
// Main
// ============================================================

async function main() {
  const args = parseArgs();
  const { snapshot } = loadBibleSnapshot(args.snapshotPath);
  const manifest = JSON.parse(
    await readFile(args.manifestPath, "utf-8")
  ) as Manifest;

  console.log(
    `[repair] slug=${manifest.slug} ep=${manifest.ep} panels=${manifest.panels.length} dry_run=${args.dryRun} max_rounds=${args.maxRounds}`
  );

  const epPad = String(manifest.ep).padStart(3, "0");

  // storyboard
  const sbJsonPath =
    args.storyboardJsonPath ??
    path.resolve(
      "content",
      "manga",
      manifest.slug,
      `ep${epPad}`,
      "storyboard.json"
    );
  const sbJson = JSON.parse(await readFile(sbJsonPath, "utf-8")) as {
    plot: unknown;
    shotlist: ShotlistData;
  };
  const shotlist = sbJson.shotlist;

  // face-consistency-report
  const reportPath =
    args.consistencyReportPath ??
    path.join(
      path.dirname(args.manifestPath),
      "face-consistency-report.json"
    );
  if (!existsSync(reportPath)) {
    throw new Error(
      `face-consistency-report.json が見つかりません: ${reportPath}\n` +
        `先に measure-face-consistency.ts を実行してください`
    );
  }
  const consistencyReports = JSON.parse(
    await readFile(reportPath, "utf-8")
  ) as FaceConsistencyReport[];

  // PagePlan を再構築
  const { characters, locations } = snapshotToBibleRows(snapshot);
  const characterIdToName = new Map(
    characters.map((c) => [c.id, c.character_name])
  );
  const locationIdToName = new Map(
    locations.map((l) => [l.id, l.location_name])
  );

  const pages = mapStoryboardToPages(shotlist.panels, {
    constraints: DEFAULT_CONSTRAINTS,
    targetPagePanels: DEFAULT_CONSTRAINTS.avg_panels_per_page,
    readingDirection: "rtl",
    recommendedStrategy: "panel_composite",
  });
  const resolvedPages = resolveContinuityGroupIds({
    pages,
    shotlistPanels: shotlist.panels,
    targetPagePanels: DEFAULT_CONSTRAINTS.avg_panels_per_page,
    maxPanelsPerPage: DEFAULT_CONSTRAINTS.max_panels_per_page,
    characterIdToName,
    locationIdToName,
    snapshot,
  });

  // panel_idx (shotlist) → { page, pagePanel, shotlistPanel }
  // page-mapper の splitIntoPages を信頼し、ShotlistPanelEntry の連番で対応
  const sbByIdx = new Map(shotlist.panels.map((p) => [p.idx, p]));
  // 各 ShotlistPanelEntry がどの (pageIdx, inPageIdx) に行くかを再現
  // resolveContinuityGroupIds と同じ splitIntoPages 仕様で再分割しているので、
  // pages[i].panels[j] の panel_idx (page 内 0-indexed) が
  // groups[i].panels[j] (= shotlist の対応する Entry) と紐づく
  // ただし PagePanel は shotlist Entry の id を持たないので、
  // page i の j 番目に登場する shotlist entry を groups から取り直す必要がある
  // → 簡易再現: shotlist を順に走査し、page-mapper のグルーピングを再現
  const pageOf = new Map<number, { page: typeof resolvedPages[0]; pagePanel: typeof resolvedPages[0]["panels"][0] }>();
  {
    // page-mapper.splitIntoPages の挙動を再現するために再呼び出し
    const { splitIntoPages } = await import(
      "../../src/lib/manga/page-director/page-mapper"
    );
    const groups = splitIntoPages(shotlist.panels, {
      targetPagePanels: DEFAULT_CONSTRAINTS.avg_panels_per_page,
      maxPanelsPerPage: DEFAULT_CONSTRAINTS.max_panels_per_page,
    });
    for (let pi = 0; pi < groups.length && pi < resolvedPages.length; pi++) {
      const g = groups[pi];
      const page = resolvedPages[pi];
      for (let j = 0; j < g.panels.length && j < page.panels.length; j++) {
        const sb = g.panels[j];
        const pp = page.panels[j];
        pageOf.set(sb.idx, { page, pagePanel: pp });
      }
    }
  }

  const firstAppearanceByIdx = buildFirstAppearanceMap(shotlist.panels);

  // panel_idx → 直近 verdict
  const verdictByIdx = new Map<
    number,
    FaceConsistencyReport["per_panel"][number]["verdict"]
  >();
  for (const r of consistencyReports) {
    for (const p of r.per_panel) {
      // 同じ panel_idx に複数 character の verdict がある場合は最低スコアを採用
      const existing = verdictByIdx.get(p.panel_idx);
      if (!existing || p.verdict.score < existing.score) {
        verdictByIdx.set(p.panel_idx, p.verdict);
      }
    }
  }

  // RepairPlan 集計
  const plans: PanelRepairPlan[] = [];
  for (const p of manifest.panels) {
    const verdict = verdictByIdx.get(p.panel_idx);
    if (!verdict) continue; // 計測されてない panel はスキップ
    const ctx = pageOf.get(p.panel_idx);
    if (!ctx) continue;
    const sbPanel = sbByIdx.get(p.panel_idx);
    const plan = buildRepairPlan({
      panelIdx: p.panel_idx,
      verdict,
      attempts: p.retry_count ?? 0,
      panel: ctx.pagePanel,
      page: ctx.page,
      shotlistPanel: sbPanel,
      shotlistPanels: shotlist.panels,
      firstAppearanceByIdx,
    });
    plans.push(plan);
  }

  const summary = summarizeRepairPlans(plans);
  console.log("");
  console.log(`[repair] plan summary:`);
  console.log(`  total=${summary.total} important=${summary.important_panels}`);
  for (const [k, v] of Object.entries(summary.by_action)) {
    console.log(`  ${k}: ${v}`);
  }

  if (args.dryRun) {
    console.log("");
    console.log("[repair] dry-run: 詳細");
    for (const p of plans) {
      console.log(
        `  panel ${p.panel_idx}: ${p.judgement.action} — ${p.judgement.reason}` +
          (p.important_check.important
            ? ` [important: ${p.important_check.reasons.join(",")}]`
            : "")
      );
    }
    // dry-run でも plan を JSON で書き出す (デバッグ用)
    const planPath = path.join(
      path.dirname(args.manifestPath),
      "repair-plan.json"
    );
    await writeFile(planPath, JSON.stringify({ summary, plans }, null, 2), "utf-8");
    console.log("");
    console.log(`  plan json: ${planPath}`);
    return;
  }

  // 再生成対象の panel
  const retryablePlans = plans.filter(
    (p) =>
      p.judgement.action === "retry_stronger_ref" ||
      p.judgement.action === "retry_silhouette"
  );
  const manualReviewPlans = plans.filter(
    (p) => p.judgement.action === "manual_review"
  );

  // manual_review log
  if (manualReviewPlans.length > 0) {
    const manualPath = path.join(
      path.dirname(args.manifestPath),
      "manual-review-log.json"
    );
    await writeFile(
      manualPath,
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          panels: manualReviewPlans.map((p) => ({
            panel_idx: p.panel_idx,
            reason: p.judgement.reason,
            important_check: p.important_check,
          })),
        },
        null,
        2
      ),
      "utf-8"
    );
    console.log(`  manual_review_log: ${manualPath}`);
  }

  if (retryablePlans.length === 0) {
    console.log("");
    console.log(`[repair] 再試行対象なし。終了。`);
    return;
  }

  // 再生成準備
  const registry = buildGroupRefRegistry({
    snapshot,
    refsRoot: args.refsRoot,
    ext: "png",
    warnMissing: false,
  });
  const characterRefPaths = buildCharacterRefPathsFromRegistry({
    snapshot,
    registry,
    characterIdToName,
  });
  const charById = new Map(characters.map((c) => [c.id, c]));
  const locById = new Map(locations.map((l) => [l.id, l]));
  const costumesByCharacterId = new Map<string, CostumeStateRow[]>();

  // 再生成 ループ
  let round = 0;
  let currentPlans = retryablePlans;
  while (round < args.maxRounds && currentPlans.length > 0) {
    round++;
    console.log("");
    console.log(`========== round ${round}/${args.maxRounds} ==========`);
    console.log(`  retry 対象: ${currentPlans.length} panels`);

    for (const plan of currentPlans) {
      const mPanel = manifest.panels.find(
        (mp) => mp.panel_idx === plan.panel_idx
      );
      const sbPanel = sbByIdx.get(plan.panel_idx);
      if (!mPanel || !sbPanel) continue;

      const charsInPanel = sbPanel.characters
        .map((id) => charById.get(id))
        .filter((c): c is NonNullable<typeof c> => Boolean(c));
      const location = sbPanel.location
        ? locById.get(sbPanel.location) ?? null
        : null;

      const composed = composePanelPrompt({
        panel: sbPanel,
        characters: charsInPanel,
        costumesByCharacterId,
        location,
        artStyle: snapshot.meta.art_style,
        characterRefPaths,
      });

      // refs に group 経由のパスもマージ
      const ctx = pageOf.get(plan.panel_idx);
      const groupIds = ctx?.pagePanel.continuity_group_ids ?? [];
      const groupRefs = resolveRefsForGroupIds(groupIds, registry);
      const seenRefs = new Set(composed.referenceImagePaths);
      const mergedRefs = [...composed.referenceImagePaths];
      for (const p of groupRefs) {
        if (!seenRefs.has(p)) {
          seenRefs.add(p);
          mergedRefs.push(p);
        }
      }

      // Escalation
      const escalation = planEscalation(plan.judgement.action);
      const finalPrompt = escalation
        ? `${composed.prompt}\n\n## REPAIR ESCALATION\n${escalation.promptAddition}`
        : composed.prompt;

      console.log(
        `  [retry] panel ${plan.panel_idx} action=${plan.judgement.action} (attempt ${plan.judgement.retryAttempt + 1}/${plan.judgement.maxRetries})`
      );

      const startedAt = Date.now();
      try {
        await generateMangaImage({
          prompt: finalPrompt,
          outputPath: mPanel.outputPath,
          size: composed.size,
          referenceImagePaths: mergedRefs,
          timeoutMs: args.imageTimeoutMs,
          maxRetries: args.maxRetries,
        });
        const durationMs = Date.now() - startedAt;
        mPanel.prompt = finalPrompt;
        mPanel.referenceImagePaths = mergedRefs;
        mPanel.durationMs = durationMs;
        mPanel.retry_count = (mPanel.retry_count ?? 0) + 1;
        mPanel.last_repair_action = plan.judgement.action;
        delete mPanel.error;
        console.log(
          `    -> 再生成完了 (${(durationMs / 1000).toFixed(1)}s, refs=${mergedRefs.length})`
        );
      } catch (e) {
        mPanel.error = (e as Error).message;
        console.warn(`    -> 失敗: ${mPanel.error}`);
        continue;
      }

      // 再計測
      const targetReport = consistencyReports.find((r) =>
        r.per_panel.some((pp) => pp.panel_idx === plan.panel_idx)
      );
      if (!targetReport) continue;

      const c = snapshot.characters.find(
        (c) => c.character_name === targetReport.character_name
      );
      if (!c) continue;

      try {
        const verdict = await measureFaceConsistency({
          referenceImagePath: targetReport.reference_image_path,
          candidateImagePath: mPanel.outputPath,
          characterName: c.character_name,
          spec: c.spec,
          timeoutMs: args.imageTimeoutMs,
          maxRetries: args.maxRetries,
        });
        const ppRow = targetReport.per_panel.find(
          (pp) => pp.panel_idx === plan.panel_idx
        );
        if (ppRow) {
          ppRow.verdict = verdict;
        }
        verdictByIdx.set(plan.panel_idx, verdict);
        console.log(
          `    [judge] ${verdict.decision} score=${verdict.score.toFixed(2)} ${verdict.comment.slice(0, 60)}`
        );
      } catch (e) {
        console.warn(
          `    [judge-fail] ${(e as Error).message}`
        );
      }
    }

    // 集計を更新
    for (const r of consistencyReports) {
      r.aggregate = aggregateFaceConsistency(r.per_panel);
    }

    // 次ラウンドの対象を再計算
    const nextPlans: PanelRepairPlan[] = [];
    for (const p of manifest.panels) {
      const verdict = verdictByIdx.get(p.panel_idx);
      if (!verdict) continue;
      const ctx = pageOf.get(p.panel_idx);
      if (!ctx) continue;
      const sbPanel = sbByIdx.get(p.panel_idx);
      const plan = buildRepairPlan({
        panelIdx: p.panel_idx,
        verdict,
        attempts: p.retry_count ?? 0,
        panel: ctx.pagePanel,
        page: ctx.page,
        shotlistPanel: sbPanel,
        shotlistPanels: shotlist.panels,
        firstAppearanceByIdx,
      });
      if (
        plan.judgement.action === "retry_stronger_ref" ||
        plan.judgement.action === "retry_silhouette"
      ) {
        nextPlans.push(plan);
      }
    }
    currentPlans = nextPlans;
  }

  // 永続化
  const outDir = path.dirname(args.manifestPath);
  await mkdir(outDir, { recursive: true });
  await writeFile(args.manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  await writeFile(
    reportPath,
    JSON.stringify(consistencyReports, null, 2),
    "utf-8"
  );

  console.log("");
  console.log("=========================================");
  console.log(`[repair] DONE`);
  console.log(`  manifest 更新: ${args.manifestPath}`);
  console.log(`  consistency report 更新: ${reportPath}`);
  console.log("=========================================");
}

main().catch((err) => {
  console.error("[repair] FAILED:", err);
  process.exit(1);
});
