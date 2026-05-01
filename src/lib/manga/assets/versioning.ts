/**
 * アセットの sha256 計算 / 版管理 / ストレージキー組み立て
 *
 * Phase 1 MVP は Supabase Storage を使う（既存 'novel-covers' バケットと同じ流儀）。
 * R2 移行は Phase 2 以降のオプション。`buildPanelStorageKey` は R2 互換のフラットキーを返す。
 */

import { createHash } from "crypto";
import { getNextAssetVersion } from "../db/dao";

/** 漫画パネル用 Supabase Storage バケット名 */
export const MANGA_BUCKET = "manga-panels";

export function computeSha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * 漫画パネル本体のストレージキー（R2 互換のフラットパス）
 *   work/{work_id}/ep/{episode_id}/panels/{panel_idx_3digits}/v{version}.{ext}
 */
export function buildPanelStorageKey(args: {
  workId: string;
  episodeId: string;
  panelIdx: number;
  version: number;
  ext: "webp" | "png" | "jpg";
}): string {
  const idx = String(args.panelIdx).padStart(3, "0");
  return `work/${args.workId}/ep/${args.episodeId}/panels/${idx}/v${args.version}.${args.ext}`;
}

/** キャラ参照画像のキー */
export function buildCharacterRefStorageKey(args: {
  workId: string;
  characterId: string;
  variant: string; // 'front' | 'side' | 'expression_joy' 等
  ext: "webp" | "png";
}): string {
  return `work/${args.workId}/characters/${args.characterId}/${args.variant}.${args.ext}`;
}

/** ロケ参照画像のキー */
export function buildLocationRefStorageKey(args: {
  workId: string;
  locationId: string;
  variant: string;
  ext: "webp" | "png";
}): string {
  return `work/${args.workId}/locations/${args.locationId}/${args.variant}.${args.ext}`;
}

/** パネルの次バージョンを取得（DB 上の最大 version + 1） */
export async function nextPanelVersion(panelId: string): Promise<number> {
  return getNextAssetVersion(panelId);
}
