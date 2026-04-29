/**
 * キャラクター聖書ビルダー
 *
 * 小説IPの素材（synopsis/settings/episodes）からキャラ spec を構造化抽出する。
 * 参照画像生成は別スクリプトに分離（scripts/manga/build-bible-images.ts）。
 */

import { extractStructuredJson } from "../llm/codex-text";
import { createCharacterBible } from "../db/dao";
import type { CharacterRole } from "../types";
import type { CharacterSpec, AttributeClassifierLabels } from "../schemas";
import type { WorkSourceMaterial } from "./source-loader";
import { formatMaterialsForLlm } from "./source-loader";

export type ExtractedCharacter = {
  character_name: string;
  character_role: CharacterRole;
  spec: CharacterSpec;
  attribute_classifier: AttributeClassifierLabels;
};

const SCHEMA = `
type ExtractedCharacters = {
  characters: Array<{
    character_name: string;        // 漢字・カタカナ・ひらがなで原作通りの名前
    character_role: 'protagonist' | 'heroine' | 'antagonist' | 'supporting';
    spec: {
      age_visual?: string;         // '16-18' 等
      gender?: 'male' | 'female' | 'non_binary' | 'unspecified';
      height_cm?: number;
      build?: 'lean' | 'athletic' | 'curvy' | 'stocky' | 'petite';
      hair?: { style: string; color: string; specific?: string };
      eyes?: { shape: string; color: string; expression_default?: string };
      face?: { jaw?: string; skin_tone?: string; marks?: string[] };
      outfit_default?: { top?: string; bottom?: string; outerwear?: string; shoes?: string; accessories?: string[] };
      voice_tag?: string;
      personality_visual?: string; // 「無表情多め」など見た目に出る性格
    };
    // CV検査用の属性分類器ラベル（上記 spec の属性を短い識別語にしたもの）
    attribute_classifier: {
      hair_color: string;          // 'black' | 'blond' | 'silver' | 'red' 等
      hair_style: string;          // 'short_messy' | 'long_straight' 等
      gender_visual: string;       // 'male' | 'female' | 'androgynous'
      age_band: string;            // 'teen' | '20s' | '30s' | 'middle_age'
      outfit_default: string;      // 'salaryman_suit' | 'fantasy_armor' 等
    };
  }>;
};
`;

/**
 * 小説素材からキャラ spec を抽出（DBへの insert は呼び出し元で行う）
 */
export async function extractCharacters(
  src: WorkSourceMaterial
): Promise<ExtractedCharacter[]> {
  const materials = formatMaterialsForLlm(src);

  const result = await extractStructuredJson<{
    characters: ExtractedCharacter[];
  }>({
    systemContext: [
      "あなたは縦読み漫画用の「キャラクター聖書」を構造化するエージェントです。",
      "原作小説のキャラを画像生成 AI が一貫して描けるよう、視覚要素を細部まで言語化してください。",
      "Codex 3度のレビューで「キャラ聖書化が必須」と確定しています。",
    ].join("\n"),
    materials: {
      synopsis: materials.synopsis,
      settings: materials.settings,
      characters_doc: materials.characters,
      episode_1: src.episodes[0]?.body ?? "(なし)",
      episode_2: src.episodes[1]?.body ?? "(なし)",
      episode_3: src.episodes[2]?.body ?? "(なし)",
    },
    instruction: [
      "上記素材から登場するキャラクターを抽出し、下記スキーマに従って JSON で返してください。",
      "",
      "重要なルール:",
      "1. 主人公・ヒロイン格は必ず含める。脇役は本文に複数回登場するもののみ。",
      "2. spec は画像生成プロンプトにそのまま使えるレベルで具体的に書く。",
      "3. 髪型・髪色・目の形・服装は、後で別の画像と比較できるように一貫した語彙で書く。",
      "4. attribute_classifier は属性分類器が短い識別語で照合できるよう簡潔に。",
      "5. 1コマ最大2キャラの制約があるため、主要キャラ3-5名に絞ってよい。",
      "6. 原作で曖昧な部分は推定で構わないが、原作の描写と矛盾しないこと。",
    ].join("\n"),
    outputSchema: SCHEMA,
    timeoutMs: 5 * 60 * 1000,
    maxRetries: 2,
  });

  return result.characters ?? [];
}

/**
 * 抽出したキャラを DB に insert する。
 * master_seed はキャラ名のハッシュから決定的に生成（再生成しても同じseed）。
 */
export async function persistCharacters(
  workId: string,
  characters: ExtractedCharacter[]
): Promise<string[]> {
  const ids: string[] = [];
  for (const c of characters) {
    const seed = computeMasterSeed(`${workId}:${c.character_name}`);
    const row = await createCharacterBible({
      work_id: workId,
      character_name: c.character_name,
      character_role: c.character_role,
      spec: c.spec,
      attribute_classifier: c.attribute_classifier,
      master_seed: seed,
    });
    ids.push(row.id);
  }
  return ids;
}

/**
 * 文字列から決定的な 32bit 符号付き整数 seed を生成（FNV-1a）
 */
function computeMasterSeed(s: string): number {
  let hash = 2166136261;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash | 0);
}
