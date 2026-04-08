/**
 * 表紙画像生成の共通ロジック
 *
 * Pollinations.ai（無料）で背景画像を取得し、sharp + SVGでタイトル文字を合成、
 * Supabase Storageにアップロードして cover_image_url を返す。
 *
 * 呼び出し元:
 * - POST /api/admin/novels/[id]/cover （手動再生成）
 * - POST /api/admin/novels（小説作成時の自動生成・fire-and-forget）
 * - POST /api/writer/novels（同上）
 * - scripts/generation/test-cover-generation.ts（検証用）
 * - .claude/skills/ の一括生成スキル
 */

import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getGenreConfig } from "./templates";

const COVER_W = 1024;
const COVER_H = 1536;

/** 表紙生成の入力 */
export type CoverInput = {
  novelId: string;
  title: string;
  tagline?: string | null;
  authorName?: string | null;
  genre: string;
};

/** 表紙生成の結果 */
export type CoverResult = {
  /** 公開URL（キャッシュバスター付き） */
  publicUrl: string;
  /** 生成に使った背景プロンプト（デバッグ用） */
  scenePrompt: string;
};

/** 文字列を簡易ハッシュして整数seedに変換（同じIDなら同じ画像が出るように） */
function hashStringToInt(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h) % 1000000;
}

/**
 * 表紙画像を生成して Supabase Storage に保存する
 * novels.cover_image_url の DB 更新は呼び出し側で行う
 *
 * @returns 公開URL（キャッシュバスター付き）
 */
export async function generateCover(
  input: CoverInput,
  supabase: SupabaseClient
): Promise<CoverResult> {
  const config = getGenreConfig(input.genre);

  // 1. Pollinations.ai から背景画像を取得
  const seed = hashStringToInt(input.novelId);
  const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(config.scenePrompt)}?width=${COVER_W}&height=${COVER_H}&seed=${seed}&nologo=true`;

  const imageRes = await fetch(pollinationsUrl);
  if (!imageRes.ok) {
    throw new Error(
      `背景画像の取得に失敗しました: ${imageRes.status} ${imageRes.statusText}`
    );
  }
  const imageBuffer = Buffer.from(await imageRes.arrayBuffer());

  // Pollinationsはまれにエラーレスポンス（JSON）を返すので簡易チェック
  if (imageBuffer.length < 5000) {
    throw new Error(
      `背景画像が不正です（レート制限の可能性）: ${imageBuffer.toString().slice(0, 200)}`
    );
  }

  // 2. SVGでタイトル合成（ジャンル別フォントを適用）
  const svg = config.template({
    title: input.title,
    subtitle: input.tagline ?? null,
    author: input.authorName ?? null,
    font: config.font,
  });

  const resized = await sharp(imageBuffer)
    .resize(COVER_W, COVER_H, { fit: "cover", position: "center" })
    .toBuffer();

  const finalBuffer = await sharp(resized)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .webp({ quality: 88 })
    .toBuffer();

  // 3. Supabase Storage にアップロード（既存があれば上書き）
  const fileName = `${input.novelId}.webp`;
  const { error: uploadError } = await supabase.storage
    .from("novel-covers")
    .upload(fileName, finalBuffer, {
      contentType: "image/webp",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`画像のアップロードに失敗しました: ${uploadError.message}`);
  }

  // 4. 公開URLを取得（キャッシュ回避のため updated_at を付与）
  const { data: urlData } = supabase.storage
    .from("novel-covers")
    .getPublicUrl(fileName);

  return {
    publicUrl: `${urlData.publicUrl}?t=${Date.now()}`,
    scenePrompt: config.scenePrompt,
  };
}

/**
 * 表紙画像を生成して novels.cover_image_url まで更新する高レベル関数
 * fire-and-forget で呼び出すために、エラーは投げずに console.error にログするだけ。
 *
 * 既に cover_image_url が設定されている場合は何もしない（プロが描いた表紙を上書きしない）。
 *
 * @param force true なら既存のcover_image_urlがあっても上書き
 */
export async function generateCoverInBackground(
  input: CoverInput,
  supabase: SupabaseClient,
  options: { force?: boolean } = {}
): Promise<void> {
  try {
    if (!options.force) {
      // 既存のcover_image_urlを確認
      const { data: existing } = await supabase
        .from("novels")
        .select("cover_image_url")
        .eq("id", input.novelId)
        .single();

      if (existing?.cover_image_url) {
        console.log(
          `[cover-gen] スキップ (id=${input.novelId}): 既存の表紙があります`
        );
        return;
      }
    }

    console.log(`[cover-gen] 開始 (id=${input.novelId}, genre=${input.genre})`);
    const result = await generateCover(input, supabase);

    const { error: updateError } = await supabase
      .from("novels")
      .update({ cover_image_url: result.publicUrl })
      .eq("id", input.novelId);

    if (updateError) {
      console.error(
        `[cover-gen] DB更新失敗 (id=${input.novelId}):`,
        updateError.message
      );
      return;
    }

    console.log(`[cover-gen] 完了 (id=${input.novelId}): ${result.publicUrl}`);
  } catch (err) {
    console.error(`[cover-gen] 失敗 (id=${input.novelId}):`, (err as Error).message);
  }
}
