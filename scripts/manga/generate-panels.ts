/**
 * 漫画パイプライン Phase 1: パネル画像一括生成 CLI
 *
 * 使い方:
 *   # 1作品の指定エピソードを生成
 *   npx tsx scripts/manga/generate-panels.ts --slug=isek-mnx0hjph-1cen --ep=1
 *
 *   # 並列度・タイムアウト調整
 *   npx tsx scripts/manga/generate-panels.ts --slug=<slug> --ep=1 --concurrency=3 --timeout-ms=600000
 *
 *   # 既に asset 紐付け済みのパネルはスキップ（差分実行）
 *   npx tsx scripts/manga/generate-panels.ts --slug=<slug> --ep=1 --skip-existing=true
 *
 * 前提:
 *   - manga_works が存在（build-bible 完了）
 *   - shotlists にエピソードのデータが存在（generate-shotlist 完了）
 *   - codex CLI ログイン済み
 */

import "./_env";
import { loadWorkSource } from "@/lib/manga/bible/source-loader";
import { generateEpisodePanels } from "@/lib/manga/generate/orchestrator";
import {
  getMangaWorkByNovelId,
  listMangaEpisodes,
  listCharacterBibles,
  listLocationBibles,
  getShotlist,
  updateMangaEpisodeStatus,
} from "@/lib/manga/db/dao";
import { createAdminClient } from "@/lib/supabase/admin";

type CliArgs = {
  slug: string;
  ep: number;
  concurrency: number;
  timeoutMs: number;
  skipExisting: boolean;
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
      case "concurrency":
        args.concurrency = Number.parseInt(value, 10);
        break;
      case "timeout-ms":
        args.timeoutMs = Number.parseInt(value, 10);
        break;
      case "skip-existing":
        args.skipExisting = value === "true" || value === "1";
        break;
    }
  }
  if (!args.slug) throw new Error("--slug=<slug> が必要です");
  if (!args.ep) throw new Error("--ep=<n> が必要です");
  return {
    slug: args.slug,
    ep: args.ep,
    concurrency: args.concurrency ?? 5,
    timeoutMs: args.timeoutMs ?? 6 * 60 * 1000,
    skipExisting: args.skipExisting ?? false,
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

async function main() {
  const args = parseArgs();
  console.log(
    `[generate-panels] slug=${args.slug} ep=${args.ep} concurrency=${args.concurrency} timeout=${args.timeoutMs}ms skip_existing=${args.skipExisting}`
  );

  // 1. novel + work
  const novel = await findNovelBySlug(args.slug);
  if (!novel) throw new Error(`novels に slug='${args.slug}' が見つかりません`);
  const work = await getMangaWorkByNovelId(novel.id);
  if (!work)
    throw new Error(
      `manga_works に novel_id='${novel.id}' が見つかりません。先に build-bible.ts を完了してください`
    );
  console.log(
    `[generate-panels] manga_work id=${work.id} title=${work.title} art_style=${work.art_style}`
  );

  // 2. episodes / shotlist
  const episodes = await listMangaEpisodes(work.id);
  const ep = episodes.find((e) => e.ep_num === args.ep);
  if (!ep) throw new Error(`Episode ep_num=${args.ep} が見つかりません`);
  const shotlist = await getShotlist(ep.id);
  if (!shotlist)
    throw new Error(
      `shotlists に episode_id='${ep.id}' が見つかりません。先に generate-shotlist.ts を完了してください`
    );
  console.log(
    `[generate-panels] episode id=${ep.id} ep_num=${ep.ep_num} shotlist_panels=${shotlist.data.panels.length}`
  );

  // 3. bibles
  const characters = await listCharacterBibles(work.id);
  const locations = await listLocationBibles(work.id);
  console.log(
    `[generate-panels] bibles: characters=${characters.length} locations=${locations.length}`
  );

  // 4. 素材ロード（このスクリプト自体は本文を使わないが、整合確認用）
  await loadWorkSource(args.slug, args.ep);

  // 5. 生成実行
  const startedAt = Date.now();
  const results = await generateEpisodePanels({
    workId: work.id,
    episodeId: ep.id,
    shotlist: shotlist.data,
    characters,
    locations,
    artStyle: work.art_style,
    concurrency: args.concurrency,
    imageTimeoutMs: args.timeoutMs,
    skipExisting: args.skipExisting,
  });
  const totalMs = Date.now() - startedAt;

  // 6. 集計
  const counts = {
    generated: 0,
    reused: 0,
    skipped: 0,
    failed: 0,
  };
  for (const r of results) counts[r.status] += 1;

  console.log("");
  console.log("=========================================");
  console.log(`[generate-panels] DONE: 総 ${results.length} パネル`);
  console.log(`  generated: ${counts.generated}`);
  console.log(`  reused:    ${counts.reused}`);
  console.log(`  skipped:   ${counts.skipped}`);
  console.log(`  failed:    ${counts.failed}`);
  console.log(`  total time: ${(totalMs / 1000).toFixed(1)}s`);
  console.log("=========================================");

  if (counts.failed > 0) {
    console.log("");
    console.log("失敗したパネル:");
    for (const r of results) {
      if (r.status === "failed") {
        console.log(`  panel ${r.panelIdx}: ${r.error}`);
      }
    }
  }

  // 7. 全成功なら episode を qa へ、失敗あれば generating のまま
  if (counts.failed === 0 && counts.generated + counts.reused > 0) {
    await updateMangaEpisodeStatus(ep.id, "qa");
    console.log(
      `[generate-panels] episode ${ep.id} を 'qa' へ遷移（CV検査・人間レビュー待ち）`
    );
  }
}

main().catch((err) => {
  console.error("[generate-panels] FAILED:", err);
  process.exit(1);
});
