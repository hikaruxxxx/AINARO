// ペアワイズLLM比較: 2作品を比較して勝者を返す
//
// 設計:
// - 絶対スコアではなく勝敗のみ返す(LLMの再現性問題への根本対応)
// - 評価軸はジャンル別重みから取得(eval-weights-by-genre.json)
// - LLMバイアス対策: A/Bの順序をランダム化、両順序で比較する Position-Symmetric モード
// - 結果は matches.jsonl に追記(後でBradley-Terry集計)

import { readFileSync, existsSync } from "fs";

export interface CompareInput {
  slugA: string;
  textA: string;
  slugB: string;
  textB: string;
  genre: string;
  layer: number; // どの層の比較か(1=logline, 2=plot, ...)
}

export type Winner = "A" | "B" | "tie";

export interface CompareResult {
  winner: Winner;
  reason: string;
  // バイアス対策で2回比較した場合
  symmetric?: {
    forwardWinner: Winner;
    reverseWinner: Winner;
    consistent: boolean;
  };
}

export interface GenreEvalWeights {
  common: Record<string, number>;
  specific: Record<string, number>;
}

export interface EvalWeightsFile {
  version: string;
  commonAxes: string[];
  genres: Record<string, GenreEvalWeights>;
}

let cachedWeights: EvalWeightsFile | null = null;

export function loadEvalWeights(path = "data/generation/eval-weights-by-genre.json"): EvalWeightsFile {
  if (cachedWeights) return cachedWeights;
  if (!existsSync(path)) {
    throw new Error(`eval-weights-by-genre.json not found at ${path}`);
  }
  cachedWeights = JSON.parse(readFileSync(path, "utf-8")) as EvalWeightsFile;
  return cachedWeights;
}

/** ジャンル別の評価軸を文字列化 */
export function buildAxesPrompt(genre: string, weightsFile?: EvalWeightsFile): string {
  const weights = weightsFile ?? loadEvalWeights();
  const g = weights.genres[genre];
  if (!g) {
    return `共通軸: ${weights.commonAxes.join(" / ")}`;
  }
  const commonOrdered = Object.entries(g.common)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}(重み${v})`)
    .join(" / ");
  const specificOrdered = Object.entries(g.specific)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}(重み${v})`)
    .join(" / ");
  return `共通軸: ${commonOrdered}\nジャンル特化軸: ${specificOrdered}`;
}

/** ペアワイズ比較プロンプトを構築 */
export function buildComparePrompt(input: CompareInput, swap: boolean): string {
  const axes = buildAxesPrompt(input.genre);
  const layerName = layerLabel(input.layer);
  const [first, second] = swap
    ? [input.textB, input.textA]
    : [input.textA, input.textB];
  return `あなたはWeb小説の評価者です。以下のジャンル「${input.genre}」の${layerName}を2つ読み、総合的にどちらが面白いか判定してください。

評価軸:
${axes}

【作品A】
${first}

【作品B】
${second}

# 出力形式
以下のJSONのみを出力してください(説明文は不要):
{
  "winner": "A" | "B" | "tie",
  "reason": "100字以内の判断理由"
}

絶対スコアは付けず、AとBの相対比較のみで判断してください。同程度の場合のみtieとし、できる限り勝敗をつけてください。`;
}

function layerLabel(layer: number): string {
  switch (layer) {
    case 1:
      return "ログライン(1文)";
    case 2:
      return "プロット骨格";
    case 3:
      return "あらすじ";
    case 4:
      return "アーク詳細プロット";
    case 5:
      return "ep1本文";
    default:
      return `Layer ${layer}本文`;
  }
}

/** LLMからのJSONレスポンスをパース。失敗時は tie 扱い */
export function parseCompareResponse(raw: string, swap: boolean): { winner: Winner; reason: string } {
  // 余計なテキストを除去してJSON部分を抽出
  const jsonMatch = raw.match(/\{[\s\S]*?"winner"[\s\S]*?\}/);
  if (!jsonMatch) {
    return { winner: "tie", reason: "parse_failed" };
  }
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    let winner = parsed.winner as Winner;
    if (winner !== "A" && winner !== "B" && winner !== "tie") {
      return { winner: "tie", reason: "invalid_winner" };
    }
    // swap=true の場合、LLMが見たAは元のB、Bは元のA。元の勝者にマッピングし直す
    if (swap) {
      if (winner === "A") winner = "B";
      else if (winner === "B") winner = "A";
    }
    return { winner, reason: String(parsed.reason ?? "") };
  } catch {
    return { winner: "tie", reason: "parse_failed" };
  }
}

/**
 * 1回のペアワイズ比較を実行する高レベル関数の型定義。
 * 実際のLLM呼び出しは外部から注入する(テスト容易性 + claude -p との分離)。
 */
export type LlmCallFn = (prompt: string) => Promise<string>;

/** 1方向比較(swap指定) */
export async function compareOnce(
  input: CompareInput,
  llm: LlmCallFn,
  swap: boolean,
): Promise<{ winner: Winner; reason: string }> {
  const prompt = buildComparePrompt(input, swap);
  const raw = await llm(prompt);
  return parseCompareResponse(raw, swap);
}

/** Position-Symmetric 比較: A→B と B→A の両方を試して整合性を見る */
export async function compareSymmetric(
  input: CompareInput,
  llm: LlmCallFn,
): Promise<CompareResult> {
  const forward = await compareOnce(input, llm, false);
  const reverse = await compareOnce(input, llm, true);
  const consistent = forward.winner === reverse.winner;
  // 整合性があれば forward を採用、不整合なら tie
  const winner = consistent ? forward.winner : "tie";
  const reason = consistent ? forward.reason : `inconsistent: f=${forward.winner} r=${reverse.winner}`;
  return {
    winner,
    reason,
    symmetric: {
      forwardWinner: forward.winner,
      reverseWinner: reverse.winner,
      consistent,
    },
  };
}
