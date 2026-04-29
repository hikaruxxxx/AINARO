/**
 * 衣装タイムラインビルダー（Codex最重要指摘）
 *
 * キャラごとに、エピソード進行で衣装がどう変化するかを構造化する。
 * 「制服」「私服A」「戦闘服」「怪我中」「変身後」などの状態を
 * valid_from_episode / valid_to_episode で管理する。
 */

import { extractStructuredJson } from "../llm/codex-text";
import { createCostumeState } from "../db/dao";
import type { CostumeSpec } from "../schemas";
import type { WorkSourceMaterial } from "./source-loader";
import { formatMaterialsForLlm } from "./source-loader";

export type ExtractedCostumeState = {
  character_name: string;
  state_name: string;
  spec: CostumeSpec;
  valid_from_episode?: number | null;
  valid_to_episode?: number | null;
  notes?: string;
};

const SCHEMA = `
type ExtractedCostumes = {
  costume_states: Array<{
    character_name: string;        // character_bibles.character_name と一致させる
    state_name: string;            // '制服' '私服A' '戦闘服' '怪我中' '変身後' 等
    spec: {
      top?: string;
      bottom?: string;
      outerwear?: string;
      shoes?: string;
      accessories?: string[];
      notes?: string;
      state_description?: string;
    };
    valid_from_episode: number | null;  // null = 未確定
    valid_to_episode: number | null;
    notes?: string;
  }>;
};
`;

export async function extractCostumeStates(
  src: WorkSourceMaterial
): Promise<ExtractedCostumeState[]> {
  const materials = formatMaterialsForLlm(src);

  const result = await extractStructuredJson<{
    costume_states: ExtractedCostumeState[];
  }>({
    systemContext: [
      "あなたは縦読み漫画の衣装タイムラインを構造化するエージェントです。",
      "Codex のレビューで「連載中の衣装変更管理が破綻すると一貫性より先に読者が違和感を持つ」と指摘されています。",
    ].join("\n"),
    materials: {
      synopsis: materials.synopsis,
      settings: materials.settings,
      episode_1: src.episodes[0]?.body ?? "(なし)",
      episode_2: src.episodes[1]?.body ?? "(なし)",
      episode_3: src.episodes[2]?.body ?? "(なし)",
    },
    instruction: [
      "上記素材から、各キャラの衣装状態を抽出し、エピソード範囲付きで返してください。",
      "",
      "重要なルール:",
      "1. 主要キャラ（character_bibles で抽出される範囲）のみ対象。",
      "2. 1キャラにつき少なくとも 1 つは衣装状態を作る（デフォルト = 'default'）。",
      "3. 怪我・変身・季節服など、本文中に明示的に変化があるものは別状態として分ける。",
      "4. valid_from_episode は登場/変化した話、valid_to_episode は次の状態に切り替わる前の話。連続中は null。",
    ].join("\n"),
    outputSchema: SCHEMA,
    timeoutMs: 5 * 60 * 1000,
    maxRetries: 2,
  });

  return result.costume_states ?? [];
}

/**
 * character_name → character_id のマップを使って costume_states を DB insert する
 */
export async function persistCostumeStates(
  costumes: ExtractedCostumeState[],
  characterNameToId: Map<string, string>
): Promise<string[]> {
  const ids: string[] = [];
  for (const c of costumes) {
    const characterId = characterNameToId.get(c.character_name);
    if (!characterId) {
      console.warn(
        `[costume-timeline] character "${c.character_name}" 未登録のためスキップ`
      );
      continue;
    }
    const row = await createCostumeState({
      character_id: characterId,
      state_name: c.state_name,
      spec: c.spec,
      valid_from_episode: c.valid_from_episode ?? undefined,
      valid_to_episode: c.valid_to_episode ?? undefined,
      notes: c.notes,
    });
    ids.push(row.id);
  }
  return ids;
}
