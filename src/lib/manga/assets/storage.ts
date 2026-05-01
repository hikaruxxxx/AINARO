/**
 * 漫画アセットのストレージ層
 *
 * Phase 1 MVP は Supabase Storage（既存 'novel-covers' と同じ仕組み）。
 * バケット 'manga-panels' は初回呼び出し時に自動作成（service-role 必須）。
 *
 * 保存後は assets テーブルに INSERT し、SHA256 で重複検知する。
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAsset, findAssetByHash } from "../db/dao";
import {
  MANGA_BUCKET,
  computeSha256,
  buildPanelStorageKey,
  nextPanelVersion,
} from "./versioning";
import type { AssetKind, AssetRow, AssetVisibility } from "../types";
import type { GenerationMetadata } from "../schemas";

let bucketEnsured = false;

/** Supabase Storage に manga-panels バケットを存在保証（初回のみ） */
export async function ensureMangaBucket(): Promise<void> {
  if (bucketEnsured) return;
  const sb = createAdminClient();
  const { data: list, error } = await sb.storage.listBuckets();
  if (error) {
    throw new Error(`storage.listBuckets failed: ${error.message}`);
  }
  if (list?.some((b) => b.name === MANGA_BUCKET)) {
    bucketEnsured = true;
    return;
  }
  const { error: createErr } = await sb.storage.createBucket(MANGA_BUCKET, {
    public: true,
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: ["image/webp", "image/png", "image/jpeg"],
  });
  if (createErr) {
    throw new Error(
      `storage.createBucket('${MANGA_BUCKET}') failed: ${createErr.message}`
    );
  }
  bucketEnsured = true;
  console.log(`[storage] bucket '${MANGA_BUCKET}' を作成しました`);
}

/** Supabase Storage へアップロードして公開 URL を返す */
export async function uploadToBucket(args: {
  storageKey: string;
  buffer: Buffer;
  mime: string;
}): Promise<{ publicUrl: string }> {
  await ensureMangaBucket();
  const sb = createAdminClient();
  const { error } = await sb.storage
    .from(MANGA_BUCKET)
    .upload(args.storageKey, args.buffer, {
      contentType: args.mime,
      upsert: true,
    });
  if (error) {
    throw new Error(`storage.upload('${args.storageKey}') failed: ${error.message}`);
  }
  const { data } = sb.storage.from(MANGA_BUCKET).getPublicUrl(args.storageKey);
  return { publicUrl: data.publicUrl };
}

/** ローカルの生成済み画像（PNG）を WebP に変換し、寸法を取得 */
export async function pngFileToWebp(localPngPath: string): Promise<{
  webpBuffer: Buffer;
  width: number;
  height: number;
}> {
  const raw = await readFile(localPngPath);
  const img = sharp(raw);
  const meta = await img.metadata();
  const webpBuffer = await img.webp({ quality: 88 }).toBuffer();
  return {
    webpBuffer,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
  };
}

/**
 * 生成済み PNG ファイル → WebP 変換 → SHA256 → 重複検知 → アップロード → assets INSERT
 *
 * @returns 既存・新規いずれかの assets 行（重複時は既存を返す）
 */
export async function persistPanelAsset(args: {
  workId: string;
  episodeId: string;
  panelId: string;
  panelIdx: number;
  localPngPath: string;
  prompt: string;
  seed: number | null;
  modelUsed: string; // 'gpt-image-1.5'
  generationMetadata?: GenerationMetadata;
  visibility?: AssetVisibility;
  kind?: AssetKind;
}): Promise<{ asset: AssetRow; reused: boolean; storageKey: string }> {
  const { webpBuffer, width, height } = await pngFileToWebp(args.localPngPath);
  const hash = computeSha256(webpBuffer);

  const existing = await findAssetByHash(hash);
  if (existing) {
    return {
      asset: existing,
      reused: true,
      storageKey: existing.storage_key,
    };
  }

  const version = await nextPanelVersion(args.panelId);
  const storageKey = buildPanelStorageKey({
    workId: args.workId,
    episodeId: args.episodeId,
    panelIdx: args.panelIdx,
    version,
    ext: "webp",
  });

  const { publicUrl } = await uploadToBucket({
    storageKey,
    buffer: webpBuffer,
    mime: "image/webp",
  });

  const asset = await createAsset({
    asset_kind: args.kind ?? "panel",
    parent_id: args.panelId,
    version,
    storage_key: storageKey,
    cdn_url: publicUrl,
    hash_sha256: hash,
    width_px: width,
    height_px: height,
    file_size_bytes: webpBuffer.length,
    mime_type: "image/webp",
    prompt: args.prompt,
    seed: args.seed ?? undefined,
    model_used: args.modelUsed,
    generation_metadata: args.generationMetadata ?? {
      provider: "openai",
    },
    visibility: args.visibility ?? "internal",
    moderation_status: "pending",
  });

  return { asset, reused: false, storageKey };
}

/** ローカル中間ファイル用ディレクトリ作成 */
export async function ensureLocalScratchDir(absDir: string): Promise<void> {
  await mkdir(absDir, { recursive: true });
}

/** ローカル中間ファイルへ書き込み（デバッグ・参照画像注入用） */
export async function writeLocalFile(
  absPath: string,
  buffer: Buffer
): Promise<void> {
  await mkdir(path.dirname(absPath), { recursive: true });
  await writeFile(absPath, buffer);
}
