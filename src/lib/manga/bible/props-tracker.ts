/**
 * 小物（持ち物）追跡ビルダー
 *
 * Codex指摘: 「剣、スマホ、指輪、傷跡、制服バッジ」など重要小物が
 * シーン間で変わらないように所有履歴を構造化する。
 */

import { extractStructuredJson } from "../llm/codex-text";
import { createProp } from "../db/dao";
import type { PropSpec, PropOwnershipEntry } from "../schemas";
import type { WorkSourceMaterial } from "./source-loader";
import { formatMaterialsForLlm } from "./source-loader";

export type ExtractedProp = {
  prop_name: string;
  spec: PropSpec;
  ownership_history: Array<{
    owner_character_name: string;
    from_episode: number;
    to_episode: number | null;
    notes?: string;
  }>;
};

const SCHEMA = `
type ExtractedProps = {
  props: Array<{
    prop_name: string;             // '聖剣エクスカリバー' 'スマホ' 'お守り' 等
    spec: {
      kind?: string;               // 'sword' | 'phone' | 'ring' | 'amulet' 等
      color?: string;
      material?: string;
      distinguishing_features?: string[];
    };
    ownership_history: Array<{
      owner_character_name: string;
      from_episode: number;
      to_episode: number | null;   // null = 連続中
      notes?: string;
    }>;
  }>;
};
`;

export async function extractProps(
  src: WorkSourceMaterial
): Promise<ExtractedProp[]> {
  const materials = formatMaterialsForLlm(src);

  const result = await extractStructuredJson<{ props: ExtractedProp[] }>({
    systemContext:
      "あなたは縦読み漫画用の小物・持ち物追跡エージェントです。",
    materials: {
      synopsis: materials.synopsis,
      settings: materials.settings,
      episode_1: src.episodes[0]?.body ?? "(なし)",
      episode_2: src.episodes[1]?.body ?? "(なし)",
      episode_3: src.episodes[2]?.body ?? "(なし)",
    },
    instruction: [
      "上記素材から、視覚的に再現性が必要な小物を 0-10 個抽出し、下記スキーマで返してください。",
      "",
      "重要なルール:",
      "1. 武器・スマホ・指輪・お守り・特徴的なアクセサリのみ。日用品は除外。",
      "2. 名前のないものは描写から命名（例: '主人公のお守り'）。",
      "3. 該当する小物が無い場合は空配列を返してよい。",
      "4. ownership_history は本文中の所有変化を時系列で記録。",
    ].join("\n"),
    outputSchema: SCHEMA,
    timeoutMs: 5 * 60 * 1000,
    maxRetries: 2,
  });

  return result.props ?? [];
}

export async function persistProps(
  workId: string,
  props: ExtractedProp[],
  characterNameToId: Map<string, string>
): Promise<string[]> {
  const ids: string[] = [];
  for (const p of props) {
    const ownershipHistory: PropOwnershipEntry[] = [];
    for (const o of p.ownership_history) {
      const ownerId = characterNameToId.get(o.owner_character_name);
      if (!ownerId) {
        console.warn(
          `[props-tracker] 所有者 ${o.owner_character_name} のキャラが見つからずownershipエントリをスキップ`
        );
        continue;
      }
      ownershipHistory.push({
        owner_character_id: ownerId,
        from_episode: o.from_episode,
        to_episode: o.to_episode,
        notes: o.notes,
      });
    }
    const row = await createProp({
      work_id: workId,
      prop_name: p.prop_name,
      spec: p.spec,
      ownership_history: ownershipHistory,
    });
    ids.push(row.id);
  }
  return ids;
}
