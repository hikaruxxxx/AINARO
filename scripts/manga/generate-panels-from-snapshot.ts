/**
 * BibleSnapshot 起点のパネル画像生成 CLI (DB 不要)
 *
 * 流れ:
 *   1. snapshot.json を読み、CharacterBibleRow / LocationBibleRow 互換に変換
 *   2. 既存 storyboard.json (generate-storyboard --snapshot で生成済み) を読む
 *   3. mapStoryboardToPages → resolveContinuityGroupIds で PagePlan に
 *      continuity_group_ids を埋める
 *   4. buildGroupRefRegistry で snapshot + refsRoot から参照画像 paths を解決
 *   5. buildCharacterRefPathsFromRegistry で character_id ベースの map に変換
 *   6. shotlist.panels の各 panel を順に composePanelPrompt + generateMangaImage
 *      にかけ、ローカル PNG に保存
 *
 * 使い方:
 *   npx tsx scripts/manga/generate-panels-from-snapshot.ts \
 *     --snapshot=data/manga/bible/work-1-dungeon-explorer/snapshot.json \
 *     --ep=1
 *
 *   # 特定 panel idx だけ生成
 *   npx tsx scripts/manga/generate-panels-from-snapshot.ts \
 *     --snapshot=... --ep=1 --panel-indices=0,1,2
 *
 *   # dry-run (プロンプトと参照画像 paths だけ表示、画像生成なし)
 *   npx tsx scripts/manga/generate-panels-from-snapshot.ts \
 *     --snapshot=... --ep=1 --dry-run=true
 *
 * 出力:
 *   data/manga/output/<slug>/ep<NNN>/panel_<NNN>.png
 *   data/manga/output/<slug>/ep<NNN>/manifest.json (各 panel の prompt/refs/elapsed)
 */

import "./_env";
import { readFile, mkdir, writeFile } from "fs/promises";
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
import type {
  ShotlistData,
  ShotlistPanelEntry,
  CostumeStateRow,
} from "../../src/lib/manga/schemas";

type CliArgs = {
  snapshotPath: string;
  ep: number;
  storyboardJsonPath?: string;
  panelIndices?: number[];
  refsRoot: string;
  outputRoot: string;
  imageTimeoutMs: number;
  maxRetries: number;
  dryRun: boolean;
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
      case "ep":
        args.ep = Number.parseInt(value, 10);
        break;
      case "storyboard":
        args.storyboardJsonPath = value;
        break;
      case "panel-indices":
        args.panelIndices = value
          .split(",")
          .map((s) => Number.parseInt(s.trim(), 10))
          .filter((n) => Number.isFinite(n));
        break;
      case "refs-root":
        args.refsRoot = value;
        break;
      case "output-root":
        args.outputRoot = value;
        break;
      case "timeout-ms":
        args.imageTimeoutMs = Number.parseInt(value, 10);
        break;
      case "max-retries":
        args.maxRetries = Number.parseInt(value, 10);
        break;
      case "dry-run":
        args.dryRun = value === "true" || value === "1";
        break;
    }
  }
  if (!args.snapshotPath) throw new Error("--snapshot=<path> が必要です");
  if (!args.ep) throw new Error("--ep=<n> が必要です");
  return {
    snapshotPath: args.snapshotPath,
    ep: args.ep,
    storyboardJsonPath: args.storyboardJsonPath,
    panelIndices: args.panelIndices,
    refsRoot: args.refsRoot ?? "data/manga/bible",
    outputRoot: args.outputRoot ?? "data/manga/output",
    imageTimeoutMs: args.imageTimeoutMs ?? 6 * 60 * 1000,
    maxRetries: args.maxRetries ?? 1,
    dryRun: args.dryRun ?? false,
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

async function main() {
  const args = parseArgs();
  const { snapshot, todos } = loadBibleSnapshot(args.snapshotPath);
  console.log(
    `[generate-panels-from-snapshot] slug=${snapshot.meta.slug} ep=${args.ep} dry_run=${args.dryRun}`
  );
  if (todos.length > 0) {
    console.log(`  ⚠️ TODO 残: ${todos.length} 件`);
  }

  const { workId, characters, locations } = snapshotToBibleRows(snapshot);

  // storyboard.json の場所
  const epPad = String(args.ep).padStart(3, "0");
  const sbJsonPath =
    args.storyboardJsonPath ??
    path.resolve(
      "content",
      "manga",
      snapshot.meta.slug,
      `ep${epPad}`,
      "storyboard.json"
    );
  let sbJsonRaw: string;
  try {
    sbJsonRaw = await readFile(sbJsonPath, "utf-8");
  } catch {
    throw new Error(
      `storyboard.json が見つかりません: ${sbJsonPath}\n` +
        `先に generate-storyboard.ts --snapshot=${args.snapshotPath} --ep=${args.ep} を実行してください`
    );
  }
  const sbJson = JSON.parse(sbJsonRaw) as {
    plot: unknown;
    shotlist: ShotlistData;
  };
  const shotlist = sbJson.shotlist;
  console.log(
    `  storyboard: ${shotlist.panels.length} panels / ${shotlist.pages?.length ?? "?"} pages`
  );

  // PagePlan を作って continuity_group_ids を埋める
  const pages = mapStoryboardToPages(shotlist.panels, {
    constraints: DEFAULT_CONSTRAINTS,
    targetPagePanels: DEFAULT_CONSTRAINTS.avg_panels_per_page,
    readingDirection: "rtl",
    recommendedStrategy: "panel_composite",
  });

  const characterIdToName = new Map(
    characters.map((c) => [c.id, c.character_name])
  );
  const locationIdToName = new Map(
    locations.map((l) => [l.id, l.location_name])
  );

  const resolvedPages = resolveContinuityGroupIds({
    pages,
    shotlistPanels: shotlist.panels,
    targetPagePanels: DEFAULT_CONSTRAINTS.avg_panels_per_page,
    maxPanelsPerPage: DEFAULT_CONSTRAINTS.max_panels_per_page,
    characterIdToName,
    locationIdToName,
    snapshot,
  });

  const totalPanelsWithGroups = resolvedPages
    .flatMap((p) => p.panels)
    .filter((p) => (p.continuity_group_ids ?? []).length > 0).length;
  console.log(
    `  PagePlan: ${resolvedPages.length} pages / ${totalPanelsWithGroups} panels に continuity_group_ids 注入済`
  );

  // 参照画像 registry
  const registry = buildGroupRefRegistry({
    snapshot,
    refsRoot: args.refsRoot,
    ext: "png",
    warnMissing: true,
  });
  const characterRefPaths = buildCharacterRefPathsFromRegistry({
    snapshot,
    registry,
    characterIdToName,
  });
  console.log(
    `  refs: ${registry.size} groups / ${characterRefPaths.size} characters`
  );

  // 対象 panel
  let targetPanels = shotlist.panels;
  if (args.panelIndices && args.panelIndices.length > 0) {
    const wanted = new Set(args.panelIndices);
    targetPanels = shotlist.panels.filter((p) => wanted.has(p.idx));
  }
  console.log(`  対象: ${targetPanels.length} / ${shotlist.panels.length} panels`);

  // 出力ディレクトリ
  const outDir = path.resolve(
    args.outputRoot,
    snapshot.meta.slug,
    `ep${epPad}`
  );
  await mkdir(outDir, { recursive: true });

  const charById = new Map(characters.map((c) => [c.id, c]));
  const locById = new Map(locations.map((l) => [l.id, l]));
  // snapshot 経路では衣装変化未対応 (Phase 2 以降)
  const costumesByCharacterId = new Map<string, CostumeStateRow[]>();

  type Manifest = {
    panel_idx: number;
    prompt: string;
    referenceImagePaths: string[];
    durationMs: number;
    outputPath: string;
    error?: string;
  };
  const manifest: Manifest[] = [];

  // PagePlan の panel.continuity_group_ids を panel_idx でルックアップできる map に変換
  // (注: ShotlistPanelEntry.idx と PagePanel.panel_idx は別軸なので、page-mapper のグルーピングを再現)
  const continuityByShotlistIdx = new Map<number, string[]>();
  // resolveContinuityGroupIds と同じ splitIntoPages 分割を使い、各 ShotlistPanelEntry に
  // 対応する PagePanel.continuity_group_ids を引く
  // (簡略化: shotlist.panels の順序で resolvedPages.flatMap(p.panels) と対応)
  // ※ continuity-resolver 内部は ShotlistPanelEntry 単位で characters/location を見ているため、
  //   ここでも同じ集合を再計算する
  const nameToGroupIds = new Map<string, string[]>();
  for (const seed of snapshot.continuity_seeds) {
    if (!seed.target_name || seed.target_name.startsWith("TODO")) continue;
    const arr = nameToGroupIds.get(seed.target_name) ?? [];
    arr.push(seed.group_id);
    nameToGroupIds.set(seed.target_name, arr);
  }
  for (const sb of shotlist.panels) {
    const ids = new Set<string>();
    for (const charId of sb.characters ?? []) {
      const name = characterIdToName.get(charId);
      if (!name) continue;
      for (const gid of nameToGroupIds.get(name) ?? []) ids.add(gid);
    }
    if (sb.location) {
      const locName = locationIdToName.get(sb.location);
      if (locName) {
        for (const gid of nameToGroupIds.get(locName) ?? []) ids.add(gid);
      }
    }
    if (ids.size > 0) continuityByShotlistIdx.set(sb.idx, [...ids]);
  }
  // 黙示的に resolvedPages の値も使うことを明示 (lint 用)
  void resolvedPages;

  for (const entry of targetPanels) {
    const charsInPanel = entry.characters
      .map((id) => charById.get(id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c));
    const location = entry.location ? locById.get(entry.location) ?? null : null;

    const composed = composePanelPrompt({
      panel: entry,
      characters: charsInPanel,
      costumesByCharacterId,
      location,
      artStyle: snapshot.meta.art_style,
      characterRefPaths,
    });

    // 連続性 group 経由の参照画像を refs に追加 (ロケ参照画像など、character_id 経由では入らないもの)
    const groupIds = continuityByShotlistIdx.get(entry.idx) ?? [];
    const groupRefs = resolveRefsForGroupIds(groupIds, registry);
    const seenRefs = new Set(composed.referenceImagePaths);
    const mergedRefs = [...composed.referenceImagePaths];
    for (const p of groupRefs) {
      if (!seenRefs.has(p)) {
        seenRefs.add(p);
        mergedRefs.push(p);
      }
    }
    composed.referenceImagePaths = mergedRefs;

    const outputPath = path.join(
      outDir,
      `panel_${String(entry.idx).padStart(3, "0")}.png`
    );

    if (args.dryRun) {
      console.log(
        `  [dry-run] panel ${entry.idx} refs=${composed.referenceImagePaths.length} prompt=${composed.prompt.length}chars`
      );
      manifest.push({
        panel_idx: entry.idx,
        prompt: composed.prompt,
        referenceImagePaths: composed.referenceImagePaths,
        durationMs: 0,
        outputPath,
      });
      continue;
    }

    const startedAt = Date.now();
    try {
      await generateMangaImage({
        prompt: composed.prompt,
        outputPath,
        size: composed.size,
        referenceImagePaths: composed.referenceImagePaths,
        timeoutMs: args.imageTimeoutMs,
        maxRetries: args.maxRetries,
      });
      const durationMs = Date.now() - startedAt;
      console.log(
        `  [gen] panel ${entry.idx} -> ${outputPath} (${(durationMs / 1000).toFixed(1)}s, refs=${composed.referenceImagePaths.length})`
      );
      manifest.push({
        panel_idx: entry.idx,
        prompt: composed.prompt,
        referenceImagePaths: composed.referenceImagePaths,
        durationMs,
        outputPath,
      });
    } catch (e) {
      const error = (e as Error).message;
      console.warn(`  [fail] panel ${entry.idx}: ${error}`);
      manifest.push({
        panel_idx: entry.idx,
        prompt: composed.prompt,
        referenceImagePaths: composed.referenceImagePaths,
        durationMs: Date.now() - startedAt,
        outputPath,
        error,
      });
    }
  }

  const manifestPath = path.join(outDir, "manifest.json");
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        slug: snapshot.meta.slug,
        ep: args.ep,
        generated_at: new Date().toISOString(),
        dry_run: args.dryRun,
        panels: manifest,
      },
      null,
      2
    ),
    "utf-8"
  );

  const ok = manifest.filter((m) => !m.error).length;
  const ng = manifest.filter((m) => m.error).length;
  console.log("");
  console.log("=========================================");
  console.log(
    `[generate-panels-from-snapshot] DONE: ${ok}/${manifest.length} 成功 (失敗 ${ng})`
  );
  console.log(`  output: ${outDir}`);
  console.log(`  manifest: ${manifestPath}`);
  console.log("=========================================");
}

main().catch((err) => {
  console.error("[generate-panels-from-snapshot] FAILED:", err);
  process.exit(1);
});
