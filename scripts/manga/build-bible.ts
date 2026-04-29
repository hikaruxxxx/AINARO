/**
 * 漫画パイプライン Phase 1: work bible ビルドオーケストレータ
 *
 * 使い方:
 *   npx tsx scripts/manga/build-bible.ts --slug=isek-mnx0hjph-1cen
 *   npx tsx scripts/manga/build-bible.ts --slug=<slug> --episodes=3
 *
 * 流れ:
 *   1. content/works/<slug>/ から素材をロード
 *   2. novels テーブルから novel_id を取得（slug 一致）
 *   3. manga_works レコード作成
 *   4. manga_episodes を episodes 件作成
 *   5. キャラ → ロケーション → 衣装 → 関係 → 小物 の順に Codex CLI で抽出
 *   6. それぞれを DB へ insert
 *   7. 完了サマリ出力
 *
 * 参照画像生成は本スクリプトには含まない。
 * 参照画像生成は scripts/manga/build-bible-images.ts (Phase 1 後段) で行う。
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { loadWorkSource } from "@/lib/manga/bible/source-loader";
import {
  extractCharacters,
  persistCharacters,
} from "@/lib/manga/bible/character-builder";
import {
  extractLocations,
  persistLocations,
} from "@/lib/manga/bible/location-builder";
import {
  extractCostumeStates,
  persistCostumeStates,
} from "@/lib/manga/bible/costume-timeline";
import {
  extractCharacterRelations,
  persistCharacterRelations,
} from "@/lib/manga/bible/character-graph";
import {
  extractProps,
  persistProps,
} from "@/lib/manga/bible/props-tracker";
import {
  createMangaWork,
  createMangaEpisode,
  getMangaWorkByNovelId,
  updateMangaWorkStatus,
  listCharacterBibles,
} from "@/lib/manga/db/dao";
import type { ArtStyle } from "@/lib/manga/types";

type CliArgs = {
  slug: string;
  episodes: number;
  artStyle: ArtStyle;
  reuseExistingWork: boolean;
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
      case "art-style":
        args.artStyle = value as ArtStyle;
        break;
      case "reuse":
        args.reuseExistingWork = value === "true" || value === "1";
        break;
    }
  }
  if (!args.slug) {
    throw new Error("--slug=<slug> が必要です");
  }
  return {
    slug: args.slug,
    episodes: args.episodes ?? 3,
    artStyle: args.artStyle ?? "webtoon",
    reuseExistingWork: args.reuseExistingWork ?? false,
  };
}

async function findNovelBySlug(slug: string): Promise<{ id: string; title: string } | null> {
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
  console.log(`[build-bible] slug=${args.slug} episodes=${args.episodes} art_style=${args.artStyle}`);

  // 1. 素材ロード
  const src = await loadWorkSource(args.slug, args.episodes);
  console.log(
    `[build-bible] loaded: synopsis=${!!src.synopsis} settings=${!!src.settings} episodes=${src.episodes.length}`
  );
  if (src.episodes.length < args.episodes) {
    console.warn(
      `[build-bible] 警告: 要求 ${args.episodes} 話に対して ${src.episodes.length} 話のみロード`
    );
  }

  // 2. novels から novel_id 取得
  const novel = await findNovelBySlug(args.slug);
  if (!novel) {
    throw new Error(
      `novels テーブルに slug='${args.slug}' が見つかりません。先に小説本体を Supabase に同期してください。`
    );
  }
  console.log(`[build-bible] novel resolved: id=${novel.id} title=${novel.title}`);

  // 3. manga_works 作成 or 既存再利用
  let work = args.reuseExistingWork ? await getMangaWorkByNovelId(novel.id) : null;
  if (!work) {
    work = await createMangaWork({
      novel_id: novel.id,
      title: novel.title,
      art_style: args.artStyle,
      primary_model: "gpt-image-1.5",
      target_platforms: ["self"],
      rights_status: {
        ai_use_allowed: true,
        commercial_allowed: true,
        ai_disclosure_required: true,
      },
      metadata: { source_slug: args.slug, build_phase: "phase1_mvp" },
    });
    console.log(`[build-bible] manga_work created: id=${work.id}`);
  } else {
    console.log(`[build-bible] manga_work reused: id=${work.id}`);
  }

  // 4. manga_episodes 作成
  for (let i = 1; i <= args.episodes; i++) {
    try {
      const ep = await createMangaEpisode({
        work_id: work.id,
        ep_num: i,
        title: `第${i}話`,
      });
      console.log(`[build-bible] episode ${i} created: id=${ep.id}`);
    } catch (e) {
      // UNIQUE制約で既存の場合はスキップ
      console.warn(
        `[build-bible] episode ${i} skipped (exists?): ${(e as Error).message}`
      );
    }
  }

  // 5. キャラ抽出 → 保存
  await updateMangaWorkStatus(work.id, "bible_build");
  console.log(`[build-bible] characters: extracting...`);
  const characters = await extractCharacters(src);
  console.log(`[build-bible] characters: ${characters.length} extracted`);
  const charIds = await persistCharacters(work.id, characters);
  console.log(`[build-bible] characters: ${charIds.length} persisted`);

  // character_name → id マップ
  const allChars = await listCharacterBibles(work.id);
  const characterNameToId = new Map(allChars.map((c) => [c.character_name, c.id]));

  // 6. ロケーション抽出 → 保存
  console.log(`[build-bible] locations: extracting...`);
  const locations = await extractLocations(src);
  console.log(`[build-bible] locations: ${locations.length} extracted`);
  const locIds = await persistLocations(work.id, locations);
  console.log(`[build-bible] locations: ${locIds.length} persisted`);

  // 7. 衣装タイムライン抽出 → 保存
  console.log(`[build-bible] costumes: extracting...`);
  const costumes = await extractCostumeStates(src);
  console.log(`[build-bible] costumes: ${costumes.length} extracted`);
  const costumeIds = await persistCostumeStates(costumes, characterNameToId);
  console.log(`[build-bible] costumes: ${costumeIds.length} persisted`);

  // 8. キャラ関係抽出 → 保存
  console.log(`[build-bible] relations: extracting...`);
  const relations = await extractCharacterRelations(src);
  console.log(`[build-bible] relations: ${relations.length} extracted`);
  const relIds = await persistCharacterRelations(
    work.id,
    relations,
    characterNameToId
  );
  console.log(`[build-bible] relations: ${relIds.length} persisted`);

  // 9. 小物抽出 → 保存
  console.log(`[build-bible] props: extracting...`);
  const props = await extractProps(src);
  console.log(`[build-bible] props: ${props.length} extracted`);
  const propIds = await persistProps(work.id, props, characterNameToId);
  console.log(`[build-bible] props: ${propIds.length} persisted`);

  console.log("");
  console.log("=========================================");
  console.log(`[build-bible] DONE: manga_work_id=${work.id}`);
  console.log("  characters:", charIds.length);
  console.log("  locations: ", locIds.length);
  console.log("  costumes:  ", costumeIds.length);
  console.log("  relations: ", relIds.length);
  console.log("  props:     ", propIds.length);
  console.log("=========================================");
  console.log("");
  console.log("次のステップ:");
  console.log("  - 参照画像生成: scripts/manga/build-bible-images.ts (未実装)");
  console.log("  - ショットリスト生成: scripts/manga/generate-shotlist.ts (未実装)");
}

main().catch((err) => {
  console.error("[build-bible] FAILED:", err);
  process.exit(1);
});
