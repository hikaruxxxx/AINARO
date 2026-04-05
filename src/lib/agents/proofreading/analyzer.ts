import type { ProofreadingResult } from "@/types/agents";
import { analyzeBlacklist } from "@/lib/agents/blacklist-detection/analyzer";
import {
  analyzeStyleConsistency,
  type StyleProfile,
} from "@/lib/agents/style-consistency/analyzer";
import {
  analyzeSettingsConsistency,
  type SettingsInput,
} from "@/lib/agents/settings-consistency/analyzer";

// 各観点の重み（合計100）
const WEIGHTS = {
  blacklist: 30,
  style: 35,
  settings: 35,
};

function determineGrade(score: number): ProofreadingResult["grade"] {
  if (score >= 90) return "S";
  if (score >= 80) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  return "D";
}

/**
 * 校正エージェント: NG表現 + 文体一貫性 + 設定整合性を一括チェック
 */
export function proofread(
  text: string,
  styleProfile: Partial<StyleProfile>,
  settingsInput: SettingsInput
): ProofreadingResult {
  // 3つのanalyzerを実行
  const blacklist = analyzeBlacklist(text);
  const style = analyzeStyleConsistency(text, styleProfile);
  const settings = analyzeSettingsConsistency(text, settingsInput);

  // NG表現のスコア変換（severity → 0-100。clean=100, critical=20）
  const blacklistScore = {
    clean: 100,
    minor: 80,
    warning: 55,
    critical: 20,
  }[blacklist.severity];

  // 重み付き総合スコア
  const overallScore = Math.round(
    (blacklistScore * WEIGHTS.blacklist +
      style.overallScore * WEIGHTS.style +
      settings.overallScore * WEIGHTS.settings) /
      100
  );

  const grade = determineGrade(overallScore);

  // 総評を生成
  const parts: string[] = [`校正スコア${overallScore}点（${grade}ランク）。`];

  // 最も問題のある観点を指摘
  const scores = [
    { name: "NG表現", score: blacklistScore },
    { name: "文体一貫性", score: style.overallScore },
    { name: "設定整合性", score: settings.overallScore },
  ].sort((a, b) => a.score - b.score);

  if (scores[0].score < 60) {
    parts.push(`${scores[0].name}に改善の余地があります（${scores[0].score}点）。`);
  }

  if (overallScore >= 80) {
    parts.push("全体的に高品質です。");
  } else if (overallScore >= 60) {
    parts.push("いくつかの改善点があります。");
  } else {
    parts.push("複数の観点で修正が必要です。");
  }

  return {
    overallScore,
    grade,
    blacklist,
    style,
    settings,
    summary: parts.join(""),
  };
}

// 入力型を再エクスポート（routeから参照しやすいように）
export type { StyleProfile, SettingsInput };
