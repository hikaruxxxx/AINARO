/**
 * ロケーション聖書ビルダー
 *
 * 小説IPの素材から登場するロケーションを構造化抽出する。
 * Codex指摘: 同じ部屋を任意角度で描けないと幾何学的整合が崩れる。
 * MVP は参照画像 1〜2枚 + spec で対応、3D下敷きは Phase 3 以降。
 */

import { extractStructuredJson } from "../llm/codex-text";
import { createLocationBible } from "../db/dao";
import type { LocationType } from "../types";
import type { LocationSpec } from "../schemas";
import type { WorkSourceMaterial } from "./source-loader";
import { formatMaterialsForLlm } from "./source-loader";

export type ExtractedLocation = {
  location_name: string;
  location_type: LocationType;
  spec: LocationSpec;
};

const SCHEMA = `
type ExtractedLocations = {
  locations: Array<{
    location_name: string;       // '主人公の部屋' '冒険者ギルド' 等
    location_type: 'school' | 'home' | 'cafe' | 'fantasy_castle' | 'office' | 'outdoor' | 'other';
    spec: {
      era?: string;              // 'modern_japan' | 'medieval_fantasy' 等
      atmosphere?: string;       // '暗め、廃墟感' 等
      layout?: {
        type?: 'rectangular' | 'L_shaped' | 'open' | 'complex';
        size_m?: string;
        doors?: Array<{ position: string; type?: string }>;
        windows?: Array<{ position: string; size?: string }>;
        furniture?: Array<{ type: string; position: string; color?: string }>;
      };
      lighting_default?: string;
      color_palette?: string[];  // ['#3a2a1a', '#8b7355'] のような色コード or 自然言語
    };
  }>;
};
`;

export async function extractLocations(
  src: WorkSourceMaterial
): Promise<ExtractedLocation[]> {
  const materials = formatMaterialsForLlm(src);

  const result = await extractStructuredJson<{
    locations: ExtractedLocation[];
  }>({
    systemContext: [
      "あなたは縦読み漫画用の「ロケーション聖書」を構造化するエージェントです。",
      "同じ場所を別アングル・別時間帯で描いても矛盾しないよう、空間構造を言語化してください。",
    ].join("\n"),
    materials: {
      synopsis: materials.synopsis,
      settings: materials.settings,
      episode_1: src.episodes[0]?.body ?? "(なし)",
      episode_2: src.episodes[1]?.body ?? "(なし)",
      episode_3: src.episodes[2]?.body ?? "(なし)",
    },
    instruction: [
      "上記素材から登場する主要ロケーションを 3-7 箇所抽出し、下記スキーマで返してください。",
      "",
      "重要なルール:",
      "1. 1〜3話で実際にシーンが展開する場所のみ。回想や言及だけは除外。",
      "2. spec.layout は画像生成で空間整合を保つために具体的に書く。",
      "3. atmosphere と lighting_default は色彩設計の根拠になる。",
      "4. 屋外シーン (outdoor) はランドマークや時間帯を spec に含めること。",
    ].join("\n"),
    outputSchema: SCHEMA,
    timeoutMs: 5 * 60 * 1000,
    maxRetries: 2,
  });

  return result.locations ?? [];
}

export async function persistLocations(
  workId: string,
  locations: ExtractedLocation[]
): Promise<string[]> {
  const ids: string[] = [];
  for (const l of locations) {
    const seed = computeMasterSeed(`${workId}:loc:${l.location_name}`);
    const row = await createLocationBible({
      work_id: workId,
      location_name: l.location_name,
      location_type: l.location_type,
      spec: l.spec,
      master_seed: seed,
    });
    ids.push(row.id);
  }
  return ids;
}

function computeMasterSeed(s: string): number {
  let hash = 2166136261;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash | 0);
}
