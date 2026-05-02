/**
 * BibleSnapshot → DB 行 (CharacterBibleRow / LocationBibleRow) 互換変換
 *
 * 用途:
 *   storyboard-builder / scene-splitter / plot-extractor 等の既存実装は
 *   DB 行型 (CharacterBibleRow[]) を受け取る前提で書かれている。
 *   snapshot を入力として既存実装を流用するため、ID 等を決定的に合成して
 *   行型互換オブジェクトを作る。
 *
 *   DB に流す前のドライラン経路で使う。実 INSERT 時は別 persist 関数を使う。
 */

import type {
  CharacterBibleRow,
  LocationBibleRow,
} from "../types";
import type {
  CharacterReferenceImages,
  LocationReferenceImages,
} from "../schemas";
import type {
  BibleSnapshot,
  BibleCharacterEntry,
  BibleLocationEntry,
} from "./bible-snapshot";

/**
 * 文字列から決定的な 32bit 符号付き整数 seed (FNV-1a)
 */
function fnvHash(s: string): number {
  let hash = 2166136261;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash | 0);
}

/**
 * 仮 ID (UUID 形式モドキ) を決定的に生成。
 * 実 DB の UUID とは混在しないよう "snap-" プレフィックスを付ける。
 */
function syntheticId(prefix: string, key: string): string {
  const h = fnvHash(`${prefix}:${key}`).toString(16).padStart(8, "0");
  return `snap-${prefix}-${h}`;
}

const NOW_ISO = new Date(0).toISOString();

/**
 * snapshot.characters[i] → CharacterBibleRow 互換オブジェクト
 */
export function snapshotCharacterToRow(args: {
  workId: string;
  entry: BibleCharacterEntry;
}): CharacterBibleRow {
  const id = syntheticId("char", `${args.workId}:${args.entry.character_name}`);
  return {
    id,
    work_id: args.workId,
    character_name: args.entry.character_name,
    character_role: args.entry.character_role,
    spec: args.entry.spec,
    reference_images:
      (args.entry.reference_images ?? {}) as CharacterReferenceImages,
    embedding_clip: null,
    embedding_dinov2: null,
    embedding_arcface: null,
    attribute_classifier: args.entry.attribute_classifier,
    master_seed: fnvHash(`${args.workId}:${args.entry.character_name}`),
    refs_status:
      args.entry.reference_images && args.entry.reference_images.front
        ? "ready"
        : "pending",
    created_at: NOW_ISO,
    updated_at: NOW_ISO,
  };
}

/**
 * snapshot.locations[i] → LocationBibleRow 互換オブジェクト
 */
export function snapshotLocationToRow(args: {
  workId: string;
  entry: BibleLocationEntry;
}): LocationBibleRow {
  const id = syntheticId("loc", `${args.workId}:${args.entry.location_name}`);
  return {
    id,
    work_id: args.workId,
    location_name: args.entry.location_name,
    location_type: args.entry.location_type,
    spec: args.entry.spec,
    reference_images:
      (args.entry.reference_images ?? {}) as LocationReferenceImages,
    master_seed: fnvHash(`${args.workId}:loc:${args.entry.location_name}`),
    three_d_model_path: null,
    refs_status:
      args.entry.reference_images && args.entry.reference_images.wide
        ? "ready"
        : "pending",
    created_at: NOW_ISO,
  };
}

/**
 * snapshot 全体を行型互換に変換
 */
export function snapshotToBibleRows(snapshot: BibleSnapshot): {
  workId: string;
  characters: CharacterBibleRow[];
  locations: LocationBibleRow[];
} {
  const workId = `snap-work-${fnvHash(snapshot.meta.slug)
    .toString(16)
    .padStart(8, "0")}`;
  return {
    workId,
    characters: snapshot.characters.map((entry) =>
      snapshotCharacterToRow({ workId, entry })
    ),
    locations: snapshot.locations.map((entry) =>
      snapshotLocationToRow({ workId, entry })
    ),
  };
}
