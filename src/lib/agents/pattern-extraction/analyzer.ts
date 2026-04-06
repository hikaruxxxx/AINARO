/**
 * パターン抽出エンジン
 * 高スコア/低スコアエピソードの構造的差分を分析し、
 * 「効くパターン」「避けるべきパターン」を自動発見する
 */

import Anthropic from "@anthropic-ai/sdk";
import { extractExtendedFeatures, type ExtendedFeatures } from "@/lib/features";
import { welchTTest, compareGroups } from "@/lib/statistics";
import type {
  EpisodeWithSignal,
  PatternFinding,
  PatternExtractionResult,
  FeatureDiff,
} from "@/types/learning-loop";

const FEATURE_LABELS: Record<string, string> = {
  avgSentenceLength: "平均文長",
  sentenceLengthCV: "文長の変動係数",
  dialogueRatio: "会話比率",
  shortSentenceRatio: "短文比率",
  emotionDensity: "感情語密度",
  questionRatio: "疑問文比率",
  exclamationRatio: "感嘆文比率",
  burstRatio: "文長バースト度",
  paragraphLengthCV: "段落長の変動係数",
  avgParagraphLength: "平均段落長",
  longSentenceRatio: "長文比率",
  sentenceLengthRange: "文長レンジ",
  dialogueAvgLength: "平均セリフ長",
  emotionPolarity: "感情極性",
  emotionSwing: "感情反転度",
  uniqueEmotionRatio: "感情表現多様性",
  commaPerSentence: "読点/文",
  sceneBreakCount: "シーン転換数",
  openingLength: "冒頭3文の文字数",
  endingQuestionOrTension: "末尾の緊張度",
  speakerVariety: "推定発話者数",
  innerMonologueRatio: "独白比率",
  uniqueKanjiRatio: "漢字多様性",
  katakanaRatio: "カタカナ比率",
  punctuationVariety: "記号種類数",
};

/**
 * エピソード群からパターンを抽出する
 */
export async function extractPatterns(
  topEpisodes: EpisodeWithSignal[],
  bottomEpisodes: EpisodeWithSignal[],
): Promise<PatternExtractionResult> {
  // 1. 各エピソードの特徴量を算出
  const topFeatures: { episode: EpisodeWithSignal; features: ExtendedFeatures }[] = [];
  const bottomFeatures: { episode: EpisodeWithSignal; features: ExtendedFeatures }[] = [];

  for (const ep of topEpisodes) {
    const f = extractExtendedFeatures(ep.body_md);
    if (f) topFeatures.push({ episode: ep, features: f });
  }
  for (const ep of bottomEpisodes) {
    const f = extractExtendedFeatures(ep.body_md);
    if (f) bottomFeatures.push({ episode: ep, features: f });
  }

  if (topFeatures.length < 3 || bottomFeatures.length < 3) {
    return {
      patterns: [],
      meta: {
        topEpisodesAnalyzed: topFeatures.length,
        bottomEpisodesAnalyzed: bottomFeatures.length,
        genresAnalyzed: [],
        statisticalDiffs: [],
      },
    };
  }

  // 2. 特徴量の統計的差分を計算
  const featureKeys = Object.keys(topFeatures[0].features) as (keyof ExtendedFeatures)[];
  const diffs: FeatureDiff[] = [];

  for (const key of featureKeys) {
    const topValues = topFeatures.map(f => f.features[key] as number);
    const bottomValues = bottomFeatures.map(f => f.features[key] as number);
    const comparison = compareGroups(topValues, bottomValues);
    const test = welchTTest(topValues, bottomValues);

    diffs.push({
      feature: FEATURE_LABELS[key] || key,
      topMean: comparison.meanA,
      bottomMean: comparison.meanB,
      diff: comparison.diff,
      significant: test.significant,
    });
  }

  // 有意差のある特徴量のみ
  const significantDiffs = diffs.filter(d => d.significant);

  // 3. ジャンル情報を収集
  const genres = new Set<string>();
  for (const ep of [...topEpisodes, ...bottomEpisodes]) {
    if (ep.genre) genres.add(ep.genre);
  }

  // 4. LLMでパターン分析
  const patterns = await analyzePatternsWithLLM(
    topFeatures.slice(0, 5),
    bottomFeatures.slice(0, 5),
    significantDiffs,
    Array.from(genres),
  );

  return {
    patterns,
    meta: {
      topEpisodesAnalyzed: topFeatures.length,
      bottomEpisodesAnalyzed: bottomFeatures.length,
      genresAnalyzed: Array.from(genres),
      statisticalDiffs: diffs,
    },
  };
}

/**
 * Claude APIでパターンをLLM分析
 */
async function analyzePatternsWithLLM(
  topEpisodes: { episode: EpisodeWithSignal; features: ExtendedFeatures }[],
  bottomEpisodes: { episode: EpisodeWithSignal; features: ExtendedFeatures }[],
  significantDiffs: FeatureDiff[],
  genres: string[],
): Promise<PatternFinding[]> {
  const client = new Anthropic();

  // 統計サマリーを生成
  const statsSummary = significantDiffs
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    .slice(0, 10)
    .map(d => `- ${d.feature}: 高品質群=${d.topMean}, 低品質群=${d.bottomMean} (差=${d.diff > 0 ? "+" : ""}${d.diff})`)
    .join("\n");

  // エピソード本文のサマリー（冒頭500字 + 末尾300字）
  const topSummaries = topEpisodes.map(e => {
    const body = e.episode.body_md;
    const opening = body.slice(0, 500);
    const ending = body.slice(-300);
    return `【高品質 ep${e.episode.episode_number} (quality=${e.episode.quality_signal})】\n冒頭: ${opening}\n...\n末尾: ${ending}\n---`;
  }).join("\n\n");

  const bottomSummaries = bottomEpisodes.map(e => {
    const body = e.episode.body_md;
    const opening = body.slice(0, 500);
    const ending = body.slice(-300);
    return `【低品質 ep${e.episode.episode_number} (quality=${e.episode.quality_signal})】\n冒頭: ${opening}\n...\n末尾: ${ending}\n---`;
  }).join("\n\n");

  const prompt = `あなたは小説の品質パターンを分析する専門家です。

以下は読者行動データ（読了率・次話遷移率等）から算出した品質スコアの高いエピソードと低いエピソードの比較データです。
構造的な差分から「効くパターン」と「避けるべきパターン」を特定してください。

## 統計的に有意な差分
${statsSummary || "有意差のある特徴量なし"}

## 高品質エピソード群
${topSummaries}

## 低品質エピソード群
${bottomSummaries}

## ジャンル: ${genres.join(", ") || "混合"}

## 分析タスク

統計データとテキスト内容の両方を踏まえ、以下のJSON配列を出力してください。
各パターンは生成エージェントへの具体的な指示として使える形にしてください。

\`\`\`json
[
  {
    "finding": "発見内容の要約（日本語）",
    "pattern_type": "positive" | "negative" | "conditional",
    "genre": "特定ジャンルに限定される場合のみ。全ジャンル共通ならnull",
    "confidence": "low" | "medium" | "high",
    "actionable_rule": "生成時の具体的な指示文（日本語）。例: 「冒頭3文以内に対話またはアクションを含める」"
  }
]
\`\`\`

ルール:
- パターンは3〜7個
- 統計データに裏付けのないパターンはconfidence="low"
- 小説の品質改善に直接使える、具体的で実行可能なルールにする
- 抽象的な「面白くする」のような指示は不可
- JSONのみ出力。説明文不要`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  // レスポンスからJSONを抽出
  const text = response.content
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("");

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(jsonMatch[0]) as PatternFinding[];
    return parsed.filter(p =>
      p.finding && p.pattern_type && p.actionable_rule &&
      ["positive", "negative", "conditional"].includes(p.pattern_type) &&
      ["low", "medium", "high"].includes(p.confidence),
    );
  } catch {
    return [];
  }
}
