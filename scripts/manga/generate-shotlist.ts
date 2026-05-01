/**
 * 漫画パイプライン Phase 1: ショットリスト生成オーケストレータ
 *
 * 使い方:
 *   # work bible 完成済みの作品の 1-3 話分を生成
 *   npx tsx scripts/manga/generate-shotlist.ts --slug=isek-mnx0hjph-1cen
 *
 *   # 単一エピソードのみ
 *   npx tsx scripts/manga/generate-shotlist.ts --slug=<slug> --ep=2
 *
 *   # DB へ書き込まず stdout に出すだけ
 *   npx tsx scripts/manga/generate-shotlist.ts --slug=<slug> --dry-run=true
 *
 * 流れ:
 *   1. content/works/<slug>/ から本文ロード
 *   2. novels から novel_id 取得 → manga_works 取得（無ければエラー）
 *   3. character_bibles / location_bibles をロード
 *   4. 各エピソードについて:
 *      a. scene-splitter でシーン分割
 *      b. rhythm-curve でリズム曲線
 *      c. shot-planner でパネル列計画
 *      d. 名前→UUID 解決 + validateAndFix
 *      e. shotlists へ upsert
 *      f. manga_episodes.status を 'shotlisting' へ
 */

import "./_env";
import { loadWorkSource } from "@/lib/manga/bible/source-loader";
import { splitScenes } from "@/lib/manga/shotlist/scene-splitter";
import { computeRhythmCurve } from "@/lib/manga/shotlist/rhythm-curve";
import {
  planShots,
  convertToShotlistEntries,
  validateAndFix,
  type PlanWarning,
} from "@/lib/manga/shotlist/shot-planner";
import {
  getMangaWorkByNovelId,
  listMangaEpisodes,
  listCharacterBibles,
  listLocationBibles,
  upsertShotlist,
  updateMangaEpisodeStatus,
} from "@/lib/manga/db/dao";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ShotlistData } from "@/lib/manga/schemas";

type CliArgs = {
  slug: string;
  episodes: number;
  /** 単一エピソード指定（指定時 episodes は無視） */
  singleEp: number | null;
  /** 1話あたり目標パネル数 */
  targetPanels: number;
  dryRun: boolean;
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
      case "episodes":
        args.episodes = Number.parseInt(value, 10);
        break;
      case "ep":
        args.singleEp = Number.parseInt(value, 10);
        break;
      case "target-panels":
        args.targetPanels = Number.parseInt(value, 10);
        break;
      case "dry-run":
        args.dryRun = value === "true" || value === "1";
        break;
    }
  }
  if (!args.slug) {
    throw new Error("--slug=<slug> が必要です");
  }
  return {
    slug: args.slug,
    episodes: args.episodes ?? 3,
    singleEp: args.singleEp ?? null,
    targetPanels: args.targetPanels ?? 40,
    dryRun: args.dryRun ?? false,
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

function summarizeWarnings(warnings: PlanWarning[]): string {
  if (warnings.length === 0) return "  warnings: なし";
  const byKind = new Map<string, number>();
  for (const w of warnings) byKind.set(w.kind, (byKind.get(w.kind) ?? 0) + 1);
  const lines = ["  warnings:"];
  for (const [k, n] of byKind) lines.push(`    - ${k}: ${n}件`);
  for (const w of warnings.slice(0, 5)) {
    lines.push(`    [panel ${w.panel_idx}/${w.scene_id}] ${w.kind}: ${w.detail}`);
  }
  if (warnings.length > 5) lines.push(`    ... 他 ${warnings.length - 5}件`);
  return lines.join("\n");
}

async function main() {
  const args = parseArgs();
  console.log(
    `[generate-shotlist] slug=${args.slug} episodes=${args.episodes}${args.singleEp ? ` (ep=${args.singleEp} only)` : ""} target_panels=${args.targetPanels} dry_run=${args.dryRun}`
  );

  const epsToLoad = args.singleEp ?? args.episodes;

  // 1. 素材ロード
  const src = await loadWorkSource(args.slug, epsToLoad);
  console.log(
    `[generate-shotlist] loaded ${src.episodes.length} episodes from content/works/${args.slug}/`
  );

  // 2. novel + manga_work
  const novel = await findNovelBySlug(args.slug);
  if (!novel) throw new Error(`novels に slug='${args.slug}' が見つかりません`);
  const work = await getMangaWorkByNovelId(novel.id);
  if (!work)
    throw new Error(
      `manga_works に novel_id='${novel.id}' が見つかりません。先に build-bible.ts を実行してください`
    );
  console.log(`[generate-shotlist] manga_work id=${work.id} title=${work.title}`);

  // 3. bible ロード
  const characters = await listCharacterBibles(work.id);
  const locations = await listLocationBibles(work.id);
  if (characters.length === 0)
    throw new Error("character_bibles が空。先に build-bible.ts を完了してください");
  console.log(
    `[generate-shotlist] bibles loaded: characters=${characters.length} locations=${locations.length}`
  );

  const characterNameToId = new Map(
    characters.map((c) => [c.character_name, c.id])
  );
  const locationNameToId = new Map(locations.map((l) => [l.location_name, l.id]));
  const characterNames = characters.map((c) => c.character_name);
  const locationNames = locations.map((l) => l.location_name);

  // 4. エピソード一覧
  const episodes = await listMangaEpisodes(work.id);
  if (episodes.length === 0)
    throw new Error("manga_episodes が空。先に build-bible.ts を完了してください");

  const targets = args.singleEp
    ? episodes.filter((e) => e.ep_num === args.singleEp)
    : episodes.filter((e) => e.ep_num <= args.episodes);

  if (targets.length === 0) {
    throw new Error(
      `処理対象のエピソードがありません（singleEp=${args.singleEp}, episodes=${args.episodes}, available=${episodes.map((e) => e.ep_num).join(",")}）`
    );
  }

  // 5. 各エピソードで shotlist 生成
  for (const ep of targets) {
    const epSrc = src.episodes.find((e) => e.ep_num === ep.ep_num);
    if (!epSrc) {
      console.warn(
        `[generate-shotlist] ep${ep.ep_num}: 本文が content/works/${args.slug}/ に見つかりません。スキップ`
      );
      continue;
    }

    console.log("");
    console.log(`========== Episode ${ep.ep_num} (id=${ep.id}) ==========`);
    console.log(`  body length: ${epSrc.body.length} chars`);

    // 5a. シーン分割
    console.log(`[generate-shotlist] ep${ep.ep_num}: scene-splitter 実行中...`);
    const scenes = await splitScenes({
      episodeNum: ep.ep_num,
      episodeBody: epSrc.body,
      knownCharacterNames: characterNames,
      knownLocationNames: locationNames,
      targetPanelCount: args.targetPanels,
    });
    console.log(`  scenes: ${scenes.length} 件`);
    for (const s of scenes) {
      console.log(
        `    ${s.scene_id} [${s.dramatic_intent}, intensity=${s.intensity_hint.toFixed(2)}, panels=${s.suggested_panel_count}] ${s.summary.slice(0, 50)}`
      );
    }

    // 5b. リズム曲線
    const rhythmCurve = computeRhythmCurve(scenes);
    console.log(
      `  rhythm_curve: [${rhythmCurve.map((v) => v.toFixed(2)).join(", ")}]`
    );

    // 5c. ショットプラン
    console.log(`[generate-shotlist] ep${ep.ep_num}: shot-planner 実行中...`);
    const planned = await planShots({
      episodeNum: ep.ep_num,
      episodeBody: epSrc.body,
      scenes,
      rhythmCurve,
      characters,
      locations,
      targetPanelCount: args.targetPanels,
    });
    console.log(`  planned panels: ${planned.length} 件`);

    // 5d. 名前→UUID 変換
    const { entries: rawEntries, warnings: convertWarnings } =
      convertToShotlistEntries({
        panels: planned,
        characterNameToId,
        locationNameToId,
      });

    // 5e. 検証 + 自動補正
    const { entries, warnings: validateWarnings } = validateAndFix(rawEntries);
    const allWarnings = [...convertWarnings, ...validateWarnings];
    console.log(summarizeWarnings(allWarnings));

    // パネル数ドリフト検査
    const drift = Math.abs(entries.length - args.targetPanels);
    if (drift > 8) {
      console.warn(
        `  [WARN] panel_count_drift: 目標=${args.targetPanels} 実際=${entries.length} (差=${drift})`
      );
    }

    const totalHeightEstimate = entries.reduce((sum, e) => {
      // 縦ピクセル概算（後の panel-generator が確定値を埋める）
      const aspectHeight: Record<string, number> = {
        vertical: 1536,
        square: 1024,
        big: 1920,
        splash: 2400,
      };
      return sum + (aspectHeight[e.aspect] ?? 1536);
    }, 0);

    const shotlistData: ShotlistData = {
      rhythm_curve: rhythmCurve,
      panels: entries,
      meta: {
        total_panels: entries.length,
        total_height_px_estimate: totalHeightEstimate,
        generated_by: "codex-cli/gpt-5",
        generation_version: "phase1-mvp-v1",
      },
    };

    if (args.dryRun) {
      console.log(`  [dry-run] shotlist would upsert (panels=${entries.length})`);
      console.log(JSON.stringify(shotlistData, null, 2).slice(0, 2000));
    } else {
      await upsertShotlist({
        episode_id: ep.id,
        data: shotlistData,
      });
      await updateMangaEpisodeStatus(ep.id, "shotlisting");
      console.log(
        `  [persisted] shotlists へ upsert 完了 (panels=${entries.length}, total_height_est=${totalHeightEstimate}px)`
      );
    }
  }

  console.log("");
  console.log("=========================================");
  console.log(`[generate-shotlist] DONE: ${targets.length} エピソード処理`);
  console.log("=========================================");
  console.log("");
  console.log("次のステップ:");
  console.log("  - パネル生成: scripts/manga/generate-panels.ts (未実装)");
}

main().catch((err) => {
  console.error("[generate-shotlist] FAILED:", err);
  process.exit(1);
});
