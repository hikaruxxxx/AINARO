/**
 * キャラクター関係グラフビルダー
 *
 * Codex指摘: 「同席可否、呼称、距離感、恋愛進行」を構造化保持しないと
 * 連載中にセリフ・行動・感情表現が破綻する。
 */

import { extractStructuredJson } from "../llm/codex-text";
import { createCharacterRelation } from "../db/dao";
import type { RelationType } from "../types";
import type { RelationHistoryEntry } from "../schemas";
import type { WorkSourceMaterial } from "./source-loader";
import { formatMaterialsForLlm } from "./source-loader";

export type ExtractedRelation = {
  char_a_name: string;
  char_b_name: string;
  relation_type: RelationType;
  address_a_to_b?: string;
  address_b_to_a?: string;
  intimacy_level?: number;
  current_status?: string;
  history?: RelationHistoryEntry[];
};

const SCHEMA = `
type ExtractedRelations = {
  relations: Array<{
    char_a_name: string;
    char_b_name: string;
    relation_type: 'family' | 'friend' | 'rival' | 'lover' | 'enemy' | 'mentor' | 'subordinate';
    address_a_to_b?: string;       // A → B への呼称: '蓮' '先輩' '師匠' 等
    address_b_to_a?: string;
    intimacy_level?: number;        // 0-100
    current_status?: string;        // '険悪' '友好' '恋愛初期' 等
    history?: Array<{
      episode: number;
      change_summary: string;
      intimacy_delta?: number;
    }>;
  }>;
};
`;

export async function extractCharacterRelations(
  src: WorkSourceMaterial
): Promise<ExtractedRelation[]> {
  const materials = formatMaterialsForLlm(src);

  const result = await extractStructuredJson<{
    relations: ExtractedRelation[];
  }>({
    systemContext:
      "あなたは縦読み漫画用のキャラ関係グラフを構造化するエージェントです。",
    materials: {
      synopsis: materials.synopsis,
      settings: materials.settings,
      characters_doc: materials.characters,
      episode_1: src.episodes[0]?.body ?? "(なし)",
      episode_2: src.episodes[1]?.body ?? "(なし)",
      episode_3: src.episodes[2]?.body ?? "(なし)",
    },
    instruction: [
      "上記素材から、登場キャラ間の関係を抽出し、下記スキーマで返してください。",
      "",
      "重要なルール:",
      "1. 主要キャラ間の関係のみ。脇役同士の関係は除外。",
      "2. 同一ペアは 1 件のみ（A→B の方向で正規化）。",
      "3. 呼称（address）は本文中の実際の呼び方をそのまま記録。敬称や呼び捨て、あだ名を区別。",
      "4. intimacy_level は 0=敵対, 50=普通, 100=最大親密。",
      "5. history は1〜3話で関係性に変化があった場合のみ。",
    ].join("\n"),
    outputSchema: SCHEMA,
    timeoutMs: 5 * 60 * 1000,
    maxRetries: 2,
  });

  return result.relations ?? [];
}

export async function persistCharacterRelations(
  workId: string,
  relations: ExtractedRelation[],
  characterNameToId: Map<string, string>
): Promise<string[]> {
  const ids: string[] = [];
  for (const r of relations) {
    const aId = characterNameToId.get(r.char_a_name);
    const bId = characterNameToId.get(r.char_b_name);
    if (!aId || !bId) {
      console.warn(
        `[character-graph] 関係 ${r.char_a_name}-${r.char_b_name} のキャラが見つからずスキップ`
      );
      continue;
    }
    if (aId === bId) {
      console.warn(`[character-graph] 自己ループの関係をスキップ: ${r.char_a_name}`);
      continue;
    }
    const row = await createCharacterRelation({
      work_id: workId,
      char_a_id: aId,
      char_b_id: bId,
      relation_type: r.relation_type,
      address_a_to_b: r.address_a_to_b,
      address_b_to_a: r.address_b_to_a,
      intimacy_level: r.intimacy_level,
      current_status: r.current_status,
      history: r.history ?? [],
    });
    ids.push(row.id);
  }
  return ids;
}
