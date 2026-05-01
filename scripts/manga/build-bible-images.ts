/**
 * 漫画パイプライン Phase 1: 聖書画像（スタイルシート + キャラ参照）一括生成
 *
 * 流れ:
 *   1. 主要キャラ 1-2 名を anchor として style sheet を 1 枚生成
 *      → manga_works.style_sheet_asset_id へ紐付け
 *   2. 各キャラに 5 種の参照画像（front, side, expr_joy/anger/sad）を生成
 *      → character_bibles.reference_images / refs_status 更新
 *
 * 並列度: MVP は 2（キャラ単位）。1 キャラ × 5 variants は順次。
 *
 * 使い方:
 *   npx tsx scripts/manga/build-bible-images.ts --slug=isek-mnx0hjph-1cen
 *   npx tsx scripts/manga/build-bible-images.ts --slug=<slug> --skip-style=true --skip-existing=true
 */

import "./_env";
import {
  getMangaWorkByNovelId,
  listCharacterBibles,
} from "@/lib/manga/db/dao";
import { generateStyleSheet } from "@/lib/manga/bible/style-sheet";
import { generateCharacterReferences } from "@/lib/manga/bible/character-images";
import { createAdminClient } from "@/lib/supabase/admin";
import { readFile, writeFile, mkdir } from "fs/promises";

type CliArgs = {
  slug: string;
  skipStyle: boolean;
  skipExisting: boolean;
  concurrency: number;
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
      case "skip-style":
        args.skipStyle = value === "true" || value === "1";
        break;
      case "skip-existing":
        args.skipExisting = value === "true" || value === "1";
        break;
      case "concurrency":
        args.concurrency = Number.parseInt(value, 10);
        break;
    }
  }
  if (!args.slug) throw new Error("--slug=<slug> が必要です");
  return {
    slug: args.slug,
    skipStyle: args.skipStyle ?? false,
    skipExisting: args.skipExisting ?? false,
    concurrency: args.concurrency ?? 2,
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

async function downloadToTempPng(
  cdnUrl: string,
  outPath: string
): Promise<void> {
  const res = await fetch(cdnUrl);
  if (!res.ok) throw new Error(`fetch ${cdnUrl} failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(outPath.substring(0, outPath.lastIndexOf("/")), { recursive: true });
  await writeFile(outPath, buf);
}

async function main() {
  const args = parseArgs();
  console.log(
    `[build-bible-images] slug=${args.slug} skip_style=${args.skipStyle} skip_existing=${args.skipExisting} concurrency=${args.concurrency}`
  );

  const novel = await findNovelBySlug(args.slug);
  if (!novel) throw new Error(`novels に slug='${args.slug}' が見つかりません`);
  const work = await getMangaWorkByNovelId(novel.id);
  if (!work) throw new Error(`manga_works が無い`);
  console.log(
    `[build-bible-images] manga_work id=${work.id} title=${work.title} art_style=${work.art_style}`
  );

  const characters = await listCharacterBibles(work.id);
  if (characters.length === 0) throw new Error("character_bibles が空");

  // 1. style sheet
  let styleSheetCdnUrl: string | null = work.style_sheet_asset_id
    ? null
    : null;
  let styleSheetLocalPath: string | undefined;

  if (!args.skipStyle && (!work.style_sheet_asset_id || !args.skipExisting)) {
    console.log(`[build-bible-images] style sheet 生成中...`);
    // 主要キャラ最大 2 名: protagonist + (heroine|antagonist|first supporting)
    const protagonist = characters.find((c) => c.character_role === "protagonist");
    const second = characters.find(
      (c) =>
        c.id !== protagonist?.id &&
        (c.character_role === "heroine" ||
          c.character_role === "antagonist" ||
          c.character_role === "supporting")
    );
    const anchors = [protagonist, second].filter(
      (c): c is NonNullable<typeof c> => !!c
    );
    if (anchors.length === 0) anchors.push(characters[0]);

    const result = await generateStyleSheet({
      workId: work.id,
      workTitle: work.title,
      artStyle: work.art_style,
      anchorCharacters: anchors,
    });
    styleSheetCdnUrl = result.cdnUrl;
    console.log(`  style_sheet_asset_id=${result.asset.id} url=${result.cdnUrl}`);
  } else if (work.style_sheet_asset_id) {
    // 既存スタイルシートをローカルへダウンロード（reference 用）
    const sb = createAdminClient();
    const { data: asset } = await sb
      .from("assets")
      .select("cdn_url")
      .eq("id", work.style_sheet_asset_id)
      .maybeSingle();
    styleSheetCdnUrl = (asset?.cdn_url as string | undefined) ?? null;
    console.log(
      `[build-bible-images] 既存 style sheet 再利用: ${styleSheetCdnUrl}`
    );
  }

  // style sheet をローカルに落としておく（gpt-image の reference として注入するため）
  if (styleSheetCdnUrl) {
    styleSheetLocalPath = `/tmp/ainaro-manga/${work.id}/style_sheet_ref.png`;
    try {
      await downloadToTempPng(styleSheetCdnUrl, styleSheetLocalPath);
      console.log(`  style sheet ローカル保存: ${styleSheetLocalPath}`);
    } catch (e) {
      console.warn(
        `[build-bible-images] style sheet ダウンロード失敗、reference 無しで続行: ${(e as Error).message}`
      );
      styleSheetLocalPath = undefined;
    }
  }

  // 2. キャラ参照画像
  const targets = args.skipExisting
    ? characters.filter((c) => c.refs_status !== "ready")
    : characters;

  console.log(
    `[build-bible-images] character refs 生成: ${targets.length} 名 (skip_existing=${args.skipExisting})`
  );

  const tasks = targets.map((c) => async () => {
    console.log(`  [${c.character_name}] 開始 (id=${c.id})`);
    const startedAt = Date.now();
    try {
      const result = await generateCharacterReferences({
        workId: work.id,
        character: c,
        artStyle: work.art_style,
        styleSheetLocalPath,
        styleSheetCdnUrl,
      });
      console.log(
        `  [${c.character_name}] 完了 (assets=${result.assetIds.length}, ${((Date.now() - startedAt) / 1000).toFixed(1)}s)`
      );
      return { ok: true, name: c.character_name, count: result.assetIds.length };
    } catch (e) {
      console.error(
        `  [${c.character_name}] 失敗: ${(e as Error).message}`
      );
      return { ok: false, name: c.character_name, error: (e as Error).message };
    }
  });

  // 並列実行（バッチ）
  const results: Array<{ ok: boolean; name: string; count?: number; error?: string }> = [];
  for (let i = 0; i < tasks.length; i += args.concurrency) {
    const batch = tasks.slice(i, i + args.concurrency);
    const settled = await Promise.allSettled(batch.map((t) => t()));
    for (const r of settled) {
      if (r.status === "fulfilled") results.push(r.value);
      else
        results.push({
          ok: false,
          name: "?",
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        });
    }
  }

  const ok = results.filter((r) => r.ok).length;
  const ng = results.filter((r) => !r.ok).length;

  console.log("");
  console.log("=========================================");
  console.log(`[build-bible-images] DONE: ${ok}/${results.length} 成功`);
  if (ng > 0) {
    console.log("失敗:");
    for (const r of results.filter((r) => !r.ok))
      console.log(`  - ${r.name}: ${r.error}`);
  }
  console.log("=========================================");
}

main().catch((err) => {
  console.error("[build-bible-images] FAILED:", err);
  process.exit(1);
});
