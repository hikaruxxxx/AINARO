/**
 * Face Consistency 計測 (LLM-as-Judge)
 *
 * 目的:
 *   生成された panel 画像が、bible 参照画像 (front.png 等) と
 *   同一キャラとして一貫しているかを LLM 判定する。
 *
 * Phase:
 *   - Phase 1 (現): LLM judge (Codex CLI 経由、$0 課金、定額枠内)
 *   - Phase 2 (予定): CLIP / DINOv2 / ArcFace の数値 cosine スコアに置き換え
 *
 * 判定軸:
 *   - same_person: 同一人物として識別可能か (主指標)
 *   - hair_match / eye_match / outfit_match: 個別属性の一致
 *   - score (0-1): 主観総合スコア
 *   - comment: 逸脱箇所の自由記述
 *
 * 閾値 (Pilot 実績 character_consistency=0.92 を踏まえ保守的に設定):
 *   pass:   score >= 0.70 かつ same_person=true
 *   warn:   0.50 <= score < 0.70 または some属性 mismatch
 *   reroll: score < 0.50 または same_person=false
 *   hard_fail: score < 0.30 または同一人物として識別困難な逸脱
 */

import { runCodexText } from "../llm/codex-text";
import type { CharacterSpec } from "../schemas";

export type FaceConsistencyDecision = "pass" | "warn" | "reroll" | "hard_fail";

export type FaceConsistencyVerdict = {
  same_person: boolean;
  hair_match: boolean;
  eye_match: boolean;
  outfit_match: boolean;
  /** 0-1 の主観総合スコア */
  score: number;
  /** 逸脱箇所の自由記述 */
  comment: string;
  /** 閾値判定後の decision */
  decision: FaceConsistencyDecision;
};

/**
 * decision を score + flags から決定。
 * score 主導 + same_person false / hard mismatch は強制 hard_fail。
 */
function deriveDecision(args: {
  score: number;
  same_person: boolean;
  hair_match: boolean;
  eye_match: boolean;
  outfit_match: boolean;
}): FaceConsistencyDecision {
  if (!args.same_person) return "hard_fail";
  if (args.score < 0.3) return "hard_fail";
  if (args.score < 0.5) return "reroll";
  if (args.score < 0.7) return "warn";
  // hair / eye のいずれか mismatch なら warn まで降格
  if (!args.hair_match || !args.eye_match) return "warn";
  return "pass";
}

/**
 * spec を LLM 向けに 1 ブロックに整形
 */
function formatSpecForJudge(spec: CharacterSpec): string {
  const lines: string[] = [];
  if (spec.hair) {
    lines.push(
      `Hair: ${spec.hair.color ?? "?"} ${spec.hair.style ?? "?"}${spec.hair.specific ? ` (${spec.hair.specific})` : ""}`
    );
  }
  if (spec.eyes) {
    lines.push(
      `Eyes: ${spec.eyes.color ?? "?"} ${spec.eyes.shape ?? "?"} eyes${spec.eyes.expression_default ? ` (default: ${spec.eyes.expression_default})` : ""}`
    );
  }
  if (spec.outfit_default) {
    const outfit = [
      spec.outfit_default.outerwear,
      spec.outfit_default.top,
      spec.outfit_default.bottom,
      spec.outfit_default.shoes,
    ]
      .filter(Boolean)
      .join(", ");
    if (outfit) lines.push(`Outfit: ${outfit}`);
  }
  if (spec.build) lines.push(`Build: ${spec.build}`);
  if (spec.age_visual) lines.push(`Age: ${spec.age_visual}`);
  if (spec.gender) lines.push(`Gender: ${spec.gender}`);
  if (spec.personality_visual) lines.push(`Personality (visible): ${spec.personality_visual}`);
  return lines.join("\n");
}

export type MeasureFaceConsistencyArgs = {
  /** bible 参照画像のローカル絶対パス (front.png 推奨) */
  referenceImagePath: string;
  /** 判定対象の生成画像ローカル絶対パス */
  candidateImagePath: string;
  /** 対象キャラ名 (ログ用) */
  characterName: string;
  /** 期待される spec (mismatch 検出用) */
  spec: CharacterSpec;
  /** LLM タイムアウト ms */
  timeoutMs?: number;
  /** リトライ回数 */
  maxRetries?: number;
};

/**
 * 1 candidate 画像 vs 1 参照画像 の同一性を LLM judge する。
 * Codex CLI を呼び出し、結果を構造化して返す。
 */
export async function measureFaceConsistency(
  args: MeasureFaceConsistencyArgs
): Promise<FaceConsistencyVerdict> {
  const specBlock = formatSpecForJudge(args.spec);

  const task = [
    "あなたは漫画キャラクターの一貫性を判定する CV エージェントです。",
    "2 枚の白黒漫画画像を比較し、同一キャラクターとして識別可能かを判定してください。",
    "",
    "## 参照画像 (bible reference)",
    "",
    `画像パス: ${args.referenceImagePath}`,
    `これは「${args.characterName}」の正規参照画像です。以下の spec を持っています:`,
    "",
    specBlock,
    "",
    "## 判定対象 (candidate)",
    "",
    `画像パス: ${args.candidateImagePath}`,
    "この画像が、参照画像と同一キャラクターか判定してください。",
    "",
    "## 判定基準",
    "",
    "- same_person: 漫画読者が同一キャラクターと識別できるか (主指標)",
    "- hair_match: 髪型・髪色が spec と参照に一致するか",
    "- eye_match: 目の形・色が spec と参照に一致するか",
    "- outfit_match: 服装が spec と参照に一致するか (シーンによる衣装変化は spec.outfit_default ベースで判定)",
    "- score: 0-1 の主観総合スコア (1=完全に同一、0.7=同一だが微妙な差、0.5=同一かどうか怪しい、0.3=別人寄り、0=完全に別人)",
    "- comment: 具体的な逸脱箇所 (1-2文、日本語可)",
    "",
    "## 出力スキーマ",
    "",
    "```typescript",
    "{",
    "  same_person: boolean,",
    "  hair_match: boolean,",
    "  eye_match: boolean,",
    "  outfit_match: boolean,",
    "  score: number,  // 0-1",
    "  comment: string",
    "}",
    "```",
    "",
    "## 出力形式",
    "",
    "JSON のみを ```json ... ``` のコードブロックで返してください。説明文不要。",
  ].join("\n");

  const result = await runCodexText<{
    same_person: boolean;
    hair_match: boolean;
    eye_match: boolean;
    outfit_match: boolean;
    score: number;
    comment: string;
  }>({
    task,
    format: "json",
    timeoutMs: args.timeoutMs ?? 5 * 60 * 1000,
    maxRetries: args.maxRetries ?? 1,
  });

  if (!result.parsed) {
    throw new Error(
      `[face-consistency] LLM 出力 JSON 抽出失敗 (${args.characterName})`
    );
  }

  const r = result.parsed;
  // 値域クランプ + null 安全
  const same_person = Boolean(r.same_person);
  const hair_match = Boolean(r.hair_match);
  const eye_match = Boolean(r.eye_match);
  const outfit_match = Boolean(r.outfit_match);
  const score = Math.max(0, Math.min(1, Number(r.score) || 0));
  const comment = String(r.comment ?? "");

  const decision = deriveDecision({
    score,
    same_person,
    hair_match,
    eye_match,
    outfit_match,
  });

  return {
    same_person,
    hair_match,
    eye_match,
    outfit_match,
    score,
    comment,
    decision,
  };
}

// ============================================================
// 集計
// ============================================================

export type FaceConsistencyAggregate = {
  total: number;
  decisions: Record<FaceConsistencyDecision, number>;
  /** decision 別の panel_idx 一覧 */
  panels_by_decision: Record<FaceConsistencyDecision, number[]>;
  /** 平均 score */
  mean_score: number;
  /** 個別属性 mismatch 数 */
  hair_mismatch_count: number;
  eye_mismatch_count: number;
  outfit_mismatch_count: number;
};

export type FaceConsistencyReport = {
  character_name: string;
  reference_image_path: string;
  measured_at: string;
  /** panel_idx → verdict */
  per_panel: Array<{
    panel_idx: number;
    candidate_image_path: string;
    verdict: FaceConsistencyVerdict;
  }>;
  aggregate: FaceConsistencyAggregate;
};

/**
 * per_panel 結果集計
 */
export function aggregateFaceConsistency(
  per_panel: FaceConsistencyReport["per_panel"]
): FaceConsistencyAggregate {
  const decisions: Record<FaceConsistencyDecision, number> = {
    pass: 0,
    warn: 0,
    reroll: 0,
    hard_fail: 0,
  };
  const panels_by_decision: Record<FaceConsistencyDecision, number[]> = {
    pass: [],
    warn: [],
    reroll: [],
    hard_fail: [],
  };
  let scoreSum = 0;
  let hairMis = 0;
  let eyeMis = 0;
  let outfitMis = 0;

  for (const r of per_panel) {
    const v = r.verdict;
    decisions[v.decision]++;
    panels_by_decision[v.decision].push(r.panel_idx);
    scoreSum += v.score;
    if (!v.hair_match) hairMis++;
    if (!v.eye_match) eyeMis++;
    if (!v.outfit_match) outfitMis++;
  }

  return {
    total: per_panel.length,
    decisions,
    panels_by_decision,
    mean_score: per_panel.length === 0 ? 0 : scoreSum / per_panel.length,
    hair_mismatch_count: hairMis,
    eye_mismatch_count: eyeMis,
    outfit_mismatch_count: outfitMis,
  };
}
