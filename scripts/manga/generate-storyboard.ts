/**
 * 漫画パイプライン Phase 1 (再設計): 3 層ストーリーボード生成 CLI
 *
 * 新しい流れ:
 *   1. scene-splitter (既存) でシーン分割
 *   2. plot-extractor (新) でビート列・引き・モチーフ抽出
 *   3. storyboard-builder (新) で「コマの存在意義」を埋めたコマ列構築
 *   4. validateStoryboard で連続 face_close / silence 不在 / 多キャラ違反を補正
 *   5. shotlists / episode_plots へ upsert
 *
 * 旧 generate-shotlist.ts は scene+shot だけだった。本スクリプトはそれを置き換える。
 *
 * 使い方:
 *   npx tsx scripts/manga/generate-storyboard.ts --slug=isek-mnx0hjph-1cen --ep=1
 *   npx tsx scripts/manga/generate-storyboard.ts --slug=<slug> --ep=2 --target-panels=42 --dry-run=true
 */

import "./_env";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadWorkSource } from "@/lib/manga/bible/source-loader";
import { splitScenes } from "@/lib/manga/shotlist/scene-splitter";
import { computeRhythmCurve } from "@/lib/manga/shotlist/rhythm-curve";
import { extractEpisodePlot } from "@/lib/manga/storyboard/plot-extractor";
import {
  buildStoryboard,
  convertStoryboardToShotlistEntries,
  validateStoryboard,
  type StoryboardWarning,
} from "@/lib/manga/storyboard/storyboard-builder";
import { renderStoryboardMarkdown } from "@/lib/manga/storyboard/storyboard-renderer";
import {
  GENRE_PRESETS_BY_ID,
  type MangaGenreId,
} from "@/lib/manga/storyboard/genre-presets";
import {
  getMangaWorkByNovelId,
  listMangaEpisodes,
  listCharacterBibles,
  listLocationBibles,
  upsertShotlist,
  upsertEpisodePlot,
  updateMangaEpisodeStatus,
  getEpisodePlot,
} from "@/lib/manga/db/dao";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ShotlistData } from "@/lib/manga/schemas";
import { loadBibleSnapshot } from "./load-bible-snapshot";
import { snapshotToBibleRows } from "@/lib/manga/bible/snapshot-adapter";
import type {
  CharacterBibleRow,
  LocationBibleRow,
} from "@/lib/manga/types";
import { readFile } from "node:fs/promises";

type CliArgs = {
  slug: string;
  ep: number;
  targetPages: number;
  targetPanels: number;
  dryRun: boolean;
  genreId?: MangaGenreId;
  /** snapshot 経由実行 (DB 不要、必ず dry-run 相当の出力のみ) */
  snapshotPath?: string;
  /** snapshot 経由時の本文ファイル直指定 (省略時は content/manga/<slug>/ep001/body.md or content/works/<slug>/ep001.md) */
  episodeBodyPath?: string;
};

function parseArgs(): CliArgs {
  const args: Partial<CliArgs> = {};
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (!m) continue;
    const [, key, value] = m;
    switch (key) {
      case "slug":
        args.slug = value;
        break;
      case "ep":
        args.ep = Number.parseInt(value, 10);
        break;
      case "target-pages":
        args.targetPages = Number.parseInt(value, 10);
        break;
      case "target-panels":
        args.targetPanels = Number.parseInt(value, 10);
        break;
      case "dry-run":
        args.dryRun = value === "true" || value === "1";
        break;
      case "genre":
        if (!GENRE_PRESETS_BY_ID.has(value as MangaGenreId)) {
          throw new Error(
            `不明な --genre=${value}。許容値: ${Array.from(GENRE_PRESETS_BY_ID.keys()).join(" | ")}`
          );
        }
        args.genreId = value as MangaGenreId;
        break;
      case "snapshot":
        args.snapshotPath = value;
        break;
      case "episode-body":
        args.episodeBodyPath = value;
        break;
    }
  }
  // --snapshot が無ければ slug 必須。--snapshot 経由なら slug は snapshot 内から取得
  if (!args.snapshotPath && !args.slug) {
    throw new Error("--slug=<slug> または --snapshot=<path> が必要です");
  }
  if (!args.ep) throw new Error("--ep=<n> が必要です");
  // 横読み Phase A の主入力は target_pages。panel数は派生値として算出
  const targetPages = args.targetPages ?? 22;
  const targetPanels = args.targetPanels ?? Math.round(targetPages * 6); // 平均6コマ/p
  return {
    slug: args.slug ?? "",
    ep: args.ep,
    targetPages,
    targetPanels,
    // snapshot 経由は強制 dry-run (DB 書き込みなし)
    dryRun: args.snapshotPath ? true : (args.dryRun ?? false),
    genreId: args.genreId,
    snapshotPath: args.snapshotPath,
    episodeBodyPath: args.episodeBodyPath,
  };
}

async function findNovelBySlug(
  slug: string
): Promise<{ id: string; title: string } | null> {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("novels")
    .select("id, title")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`novels query failed: ${error.message}`);
  return data as { id: string; title: string } | null;
}

function summarizeWarnings(warnings: StoryboardWarning[]): string {
  if (warnings.length === 0) return "  warnings: なし";
  const byKind = new Map<string, number>();
  for (const w of warnings) byKind.set(w.kind, (byKind.get(w.kind) ?? 0) + 1);
  const lines = ["  warnings:"];
  for (const [k, n] of byKind) lines.push(`    - ${k}: ${n}件`);
  for (const w of warnings.slice(0, 8)) {
    lines.push(`    [panel ${w.panel_idx}/${w.scene_id}] ${w.kind}: ${w.detail}`);
  }
  if (warnings.length > 8) lines.push(`    ... 他 ${warnings.length - 8}件`);
  return lines.join("\n");
}

/** snapshot 経由でワーク情報・bibles・本文を構築 */
async function loadFromSnapshot(args: CliArgs): Promise<{
  slug: string;
  workId: string;
  workTitle: string;
  episodeId: string;
  episodeBody: string;
  characters: CharacterBibleRow[];
  locations: LocationBibleRow[];
  prevHook?: string;
}> {
  const { snapshot, todos } = loadBibleSnapshot(args.snapshotPath!);
  console.log(
    `[generate-storyboard] snapshot: slug=${snapshot.meta.slug} title=${snapshot.meta.title}`
  );
  if (todos.length > 0) {
    console.log(`  ⚠️ TODO 残: ${todos.length} 件`);
  }

  const { workId, characters, locations } = snapshotToBibleRows(snapshot);

  // 本文の探索順: --episode-body > content/manga/<slug>/ep001/body.md > content/works/<slug>/ep001.md
  const epPad = String(args.ep).padStart(3, "0");
  const candidates = [
    args.episodeBodyPath,
    path.resolve("content", "manga", snapshot.meta.slug, `ep${epPad}`, "body.md"),
    path.resolve("content", "works", snapshot.meta.slug, `ep${epPad}.md`),
  ].filter((p): p is string => Boolean(p));

  let episodeBody: string | null = null;
  let foundPath: string | null = null;
  for (const cand of candidates) {
    try {
      episodeBody = await readFile(cand, "utf-8");
      foundPath = cand;
      break;
    } catch {
      // 次候補
    }
  }
  if (!episodeBody || !foundPath) {
    throw new Error(
      `本文が見つかりません。試行: ${candidates.join(" | ")}\n` +
        `--episode-body=<path> で直接指定するか、content/manga/<slug>/ep${epPad}/body.md を用意してください`
    );
  }
  console.log(`  episode body: ${foundPath} (${episodeBody.length} chars)`);

  const episodeId = `snap-ep-${args.ep}-${snapshot.meta.slug}`;

  return {
    slug: snapshot.meta.slug,
    workId,
    workTitle: snapshot.meta.title,
    episodeId,
    episodeBody,
    characters,
    locations,
    prevHook: undefined,
  };
}

async function main() {
  const args = parseArgs();
  console.log(
    `[generate-storyboard] slug=${args.slug} ep=${args.ep} target_pages=${args.targetPages} target_panels=${args.targetPanels} dry_run=${args.dryRun}` +
      (args.snapshotPath ? ` (snapshot=${args.snapshotPath})` : "")
  );

  // 共通変数
  let slug: string;
  let workId: string;
  let workTitle: string;
  let episodeId: string;
  let episodeBody: string;
  let characters: CharacterBibleRow[];
  let locations: LocationBibleRow[];
  let prevHook: string | undefined;

  if (args.snapshotPath) {
    // ============ snapshot 経路 (DB 不要) ============
    const ld = await loadFromSnapshot(args);
    slug = ld.slug;
    workId = ld.workId;
    workTitle = ld.workTitle;
    episodeId = ld.episodeId;
    episodeBody = ld.episodeBody;
    characters = ld.characters;
    locations = ld.locations;
    prevHook = ld.prevHook;
  } else {
    // ============ DB 経路 (従来) ============
    const src = await loadWorkSource(args.slug, args.ep);
    const epSrc = src.episodes.find((e) => e.ep_num === args.ep);
    if (!epSrc) {
      throw new Error(
        `本文が content/works/${args.slug}/ep${String(args.ep).padStart(3, "0")}.md に見つかりません`
      );
    }

    const novel = await findNovelBySlug(args.slug);
    if (!novel) throw new Error(`novels に slug='${args.slug}' が見つかりません`);
    const work = await getMangaWorkByNovelId(novel.id);
    if (!work)
      throw new Error(
        `manga_works が無い。先に build-bible.ts を完了してください`
      );
    console.log(
      `[generate-storyboard] manga_work id=${work.id} title=${work.title}`
    );

    const dbChars = await listCharacterBibles(work.id);
    const dbLocs = await listLocationBibles(work.id);
    if (dbChars.length === 0)
      throw new Error("character_bibles が空。build-bible.ts を完了してください");
    console.log(
      `[generate-storyboard] bibles: characters=${dbChars.length} locations=${dbLocs.length}`
    );

    const episodes = await listMangaEpisodes(work.id);
    const ep = episodes.find((e) => e.ep_num === args.ep);
    if (!ep) throw new Error(`Episode ep_num=${args.ep} が見つかりません`);

    // 直前話の cliffhanger 引き継ぎ
    let _prevHook: string | undefined;
    if (args.ep > 1) {
      const prevEp = episodes.find((e) => e.ep_num === args.ep - 1);
      if (prevEp) {
        const prevPlot = await getEpisodePlot(prevEp.id);
        _prevHook = prevPlot?.data.cliffhanger_hook;
      }
    }

    slug = args.slug;
    workId = work.id;
    workTitle = work.title;
    episodeId = ep.id;
    episodeBody = epSrc.body;
    characters = dbChars;
    locations = dbLocs;
    prevHook = _prevHook;
  }

  const characterNameToId = new Map(
    characters.map((c) => [c.character_name, c.id])
  );
  const locationNameToId = new Map(locations.map((l) => [l.location_name, l.id]));

  console.log("");
  console.log(`========== Episode ${args.ep} (id=${episodeId}) ==========`);
  console.log(`  body length: ${episodeBody.length} chars`);

  // 2. シーン分割
  console.log(`[generate-storyboard] step1 scene-splitter 実行中...`);
  const scenes = await splitScenes({
    episodeNum: args.ep,
    episodeBody: episodeBody,
    knownCharacterNames: characters.map((c) => c.character_name),
    knownLocationNames: locations.map((l) => l.location_name),
    targetPanelCount: args.targetPanels,
  });
  console.log(`  scenes: ${scenes.length} 件`);

  // 3. プロット抽出
  console.log(`[generate-storyboard] step2 plot-extractor 実行中...`);
  const plot = await extractEpisodePlot({
    episodeNum: args.ep,
    episodeBody: episodeBody,
    scenes,
    knownCharacterNames: characters.map((c) => c.character_name),
    targetPages: args.targetPages,
    targetPanels: args.targetPanels,
    prevEpisodeHook: prevHook,
    // mustIncludeEvents は Volume Planner 完成後に入る
  });
  console.log(`  beats: ${plot.beats.length}`);
  console.log(`  theme: ${plot.theme}`);
  console.log(
    `  arc: ${plot.protagonist_arc.start} → ${plot.protagonist_arc.turn} → ${plot.protagonist_arc.end}`
  );
  console.log(`  cliffhanger: ${plot.cliffhanger_hook}`);
  let budgetSum = 0;
  for (const b of plot.beats) {
    const bg = b.page_budget
      ? ` budget=${b.page_budget.target_pages}p`
      : "";
    if (b.page_budget) budgetSum += b.page_budget.target_pages;
    console.log(
      `    [beat ${b.beat_idx}] ${b.label} (i=${b.emotional_intensity.toFixed(2)})${bg} — ${b.summary.slice(0, 60)}`
    );
  }
  if (budgetSum > 0 && Math.abs(budgetSum - args.targetPages) > 1) {
    console.warn(
      `  [WARN] beat page_budget 合計=${budgetSum}p 目標=${args.targetPages}p`
    );
  }

  // 4. リズム曲線（rhythm_curve はシーン単位）
  const rhythmCurve = computeRhythmCurve(scenes);

  // 5. ネーム構築 (pages[] > panels[] 階層)
  console.log(`[generate-storyboard] step3 storyboard-builder 実行中...`);
  if (args.genreId) {
    console.log(`[generate-storyboard]   genre preset: ${args.genreId}`);
  }
  const sbPages = await buildStoryboard({
    episodeNum: args.ep,
    episodeBody: episodeBody,
    plot,
    scenes,
    characters,
    locations,
    targetPages: args.targetPages,
    targetPanels: args.targetPanels,
    genreId: args.genreId,
    onProgress: (msg) => console.log(`  ${msg}`),
  });
  const totalPanelsRaw = sbPages.reduce(
    (sum, p) => sum + (p.panels?.length ?? 0),
    0
  );
  console.log(
    `  storyboard: ${sbPages.length} pages / ${totalPanelsRaw} panels`
  );

  // 6. 名前→UUID 変換 (フラット ShotlistPanelEntry[] + StoryboardPageEntry[])
  const { entries: rawEntries, pageEntries, warnings: convertWarnings } =
    convertStoryboardToShotlistEntries({
      pages: sbPages,
      characterNameToId,
      locationNameToId,
    });

  // 7. 検証（連続 face_close / silence 不在 / 必須イベント / 引き強度 等）
  const { entries, warnings: validateWarnings } = validateStoryboard(
    rawEntries,
    plot.beats.length,
    {
      targetPages: args.targetPages,
      actualPages: pageEntries.length,
      mustIncludeEvents: plot.must_include_events,
    }
  );

  const allWarnings = [...convertWarnings, ...validateWarnings];
  console.log(summarizeWarnings(allWarnings));

  const drift = Math.abs(entries.length - args.targetPanels);
  if (drift > 12) {
    console.warn(
      `  [WARN] panel_count_drift: 目標=${args.targetPanels} 実際=${entries.length}`
    );
  }
  const pageDrift = Math.abs(pageEntries.length - args.targetPages);
  if (pageDrift > 2) {
    console.warn(
      `  [WARN] page_count_drift: 目標=${args.targetPages}p 実際=${pageEntries.length}p`
    );
  }

  // narrative_function の分布レポート
  const distFn = new Map<string, number>();
  for (const e of entries) {
    const k = e.narrative_function ?? "?";
    distFn.set(k, (distFn.get(k) ?? 0) + 1);
  }
  const distFnLine = Array.from(distFn.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k}=${n}`)
    .join(" ");
  console.log(`  narrative_function dist: ${distFnLine}`);

  // importance 分布
  const distImp = new Map<number, number>();
  for (const e of entries) {
    const k = e.importance ?? 0;
    distImp.set(k, (distImp.get(k) ?? 0) + 1);
  }
  const distImpLine = [1, 2, 3, 4, 5]
    .map((k) => `imp${k}=${distImp.get(k) ?? 0}`)
    .join(" ");
  console.log(`  importance dist: ${distImpLine}`);

  // 横読み aspect 集計（旧縦読み aspect は互換のため残置だが実値は出ない想定）
  const totalHeightEstimate = entries.reduce((sum, e) => {
    const h: Record<string, number> = {
      // 旧縦読み
      vertical: 1536,
      square: 1024,
      big: 1920,
      splash: 2400,
      // 新横読み (B6 1748×2480 を想定したコマ高さ概算)
      page: 2480,
      spread: 2480,
      panel_landscape: 600,
      panel_portrait: 1100,
      panel_square: 800,
      panel_tall: 1600,
    };
    return sum + (h[e.aspect] ?? 800);
  }, 0);

  const shotlistData: ShotlistData = {
    rhythm_curve: rhythmCurve,
    panels: entries,
    pages: pageEntries,
    episode_target_pages: args.targetPages,
    meta: {
      total_panels: entries.length,
      total_height_px_estimate: totalHeightEstimate,
      generated_by: "codex-cli/gpt-5",
      generation_version: "phase-a-storyboard-v2",
    },
  };

  // 8. Markdown 絵コンテ出力 (人間1次レビュー用)
  const characterIdToName = new Map(
    characters.map((c) => [c.id, c.character_name])
  );
  const locationIdToName = new Map(
    locations.map((l) => [l.id, l.location_name])
  );
  const markdown = renderStoryboardMarkdown({
    episodeNum: args.ep,
    plot,
    shotlist: shotlistData,
    options: {
      characterIdToName,
      locationIdToName,
      workSlug: slug,
      workTitle: workTitle,
    },
  });

  const repoRoot = process.env.AINARO_REPO_ROOT ?? process.cwd();
  const mdDir = path.join(
    repoRoot,
    "content",
    "manga",
    slug,
    `ep${String(args.ep).padStart(3, "0")}`
  );
  const mdPath = path.join(mdDir, "storyboard.md");
  const jsonPath = path.join(mdDir, "storyboard.json");

  if (args.dryRun) {
    // snapshot 経由は dry-run 強制だが、markdown/json はローカル書き出す価値があるので出す
    if (args.snapshotPath) {
      await mkdir(mdDir, { recursive: true });
      await writeFile(mdPath, markdown, "utf-8");
      await writeFile(
        jsonPath,
        JSON.stringify(
          { plot, shotlist: shotlistData, warnings: allWarnings },
          null,
          2
        ),
        "utf-8"
      );
      console.log(`  [snapshot dry-run] markdown: ${mdPath}`);
      console.log(`  [snapshot dry-run] json:     ${jsonPath}`);
    } else {
      console.log(`  [dry-run] would upsert plot + shotlist`);
      console.log(`  [dry-run] would write Markdown to ${mdPath}`);
      console.log("  --- plot snapshot (first 1200) ---");
      console.log(JSON.stringify(plot, null, 2).slice(0, 1200));
      console.log("  --- markdown first 80 lines ---");
      console.log(markdown.split("\n").slice(0, 80).join("\n"));
    }
  } else {
    await upsertEpisodePlot({
      episode_id: episodeId,
      data: plot,
      generation_version: "phase-a-plot-v2",
    });
    await upsertShotlist({ episode_id: episodeId, data: shotlistData });
    await updateMangaEpisodeStatus(episodeId, "shotlisting");
    await mkdir(mdDir, { recursive: true });
    await writeFile(mdPath, markdown, "utf-8");
    await writeFile(
      jsonPath,
      JSON.stringify(
        { plot, shotlist: shotlistData, warnings: allWarnings },
        null,
        2
      ),
      "utf-8"
    );
    console.log(
      `  [persisted] episode_plots + shotlists upsert (pages=${pageEntries.length}, panels=${entries.length}, beats=${plot.beats.length})`
    );
    console.log(`  [persisted] markdown: ${mdPath}`);
    console.log(`  [persisted] json:     ${jsonPath}`);
  }

  console.log("");
  console.log("=========================================");
  console.log(`[generate-storyboard] DONE: episode ${args.ep}`);
  console.log("=========================================");
  console.log("");
  console.log("次のステップ:");
  console.log(`  1. 1次レビュー: ${mdPath} を開いて構成を確認`);
  console.log(`     - 必須イベント消化 / importance≥4 密度 / 話末 turn_strength≥4 をチェック`);
  if (args.snapshotPath) {
    console.log(`  2. 修正があれば --ep を再実行 (snapshot 入力)`);
    console.log(`  3. 参照画像生成: scripts/manga/build-bible-images-from-snapshot.ts --snapshot=${args.snapshotPath}`);
  } else {
    console.log(`  2. 修正があれば --ep を再実行 or pages 単位で部分再生成`);
    console.log(`  3. 参照画像生成: scripts/manga/build-bible-images.ts`);
    console.log(`  4. パネル生成: scripts/manga/generate-panels.ts --slug=${slug} --ep=${args.ep}`);
  }
}

main().catch((err) => {
  console.error("[generate-storyboard] FAILED:", err);
  process.exit(1);
});
