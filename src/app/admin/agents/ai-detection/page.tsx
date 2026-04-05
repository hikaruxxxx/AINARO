"use client";

import { useState } from "react";
import type { AIDetectionResult } from "@/types/agents";

// 指標ラベルの定義
const metricLabels: Record<keyof AIDetectionResult["metrics"], string> = {
  vocabularyDiversity: "語彙多様性",
  sentenceLengthVariance: "文長分散",
  burstiness: "バースト性",
  conjunctionPattern: "接続詞パターン",
  repetition: "繰り返し検出",
  endingPattern: "文末パターン",
  punctuationDensity: "句読点密度",
  paragraphStructure: "段落構造",
};

// スコアに応じた色クラスを返す
function scoreColor(score: number): string {
  if (score >= 75) return "text-red-500";
  if (score >= 55) return "text-orange-500";
  if (score >= 35) return "text-yellow-500";
  return "text-green-500";
}

// スコアに応じたバーの色クラスを返す
function barColor(score: number): string {
  if (score >= 75) return "bg-red-500";
  if (score >= 55) return "bg-orange-500";
  if (score >= 35) return "bg-yellow-500";
  return "bg-green-500";
}

// 信頼度ラベル
function confidenceLabel(confidence: AIDetectionResult["confidence"]): string {
  switch (confidence) {
    case "high":
      return "高";
    case "medium":
      return "中";
    case "low":
      return "低";
  }
}

export default function AIDetectionPage() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<AIDetectionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const charCount = [...text].length;

  async function handleAnalyze() {
    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const res = await fetch("/api/agents/ai-detection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "分析に失敗しました");
        return;
      }

      setResult(data);
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-text">AI生成チェッカー</h2>
        <p className="mt-1 text-sm text-muted">
          テキストの統計分析によりAI生成の可能性をスコアリングします
        </p>
      </div>

      {/* 入力エリア */}
      <div className="space-y-2">
        <label
          htmlFor="input-text"
          className="block text-sm font-medium text-text"
        >
          分析するテキスト
        </label>
        <textarea
          id="input-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="小説のテキストを貼り付けてください（500文字以上）"
          rows={12}
          className="w-full rounded-lg border border-border bg-surface p-3 text-sm text-text placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="flex items-center justify-between text-sm text-muted">
          <span>{charCount}文字</span>
          {charCount > 0 && charCount < 500 && (
            <span className="text-red-500">
              あと{500 - charCount}文字必要です
            </span>
          )}
        </div>
      </div>

      {/* 分析ボタン */}
      <button
        onClick={handleAnalyze}
        disabled={loading || charCount < 500}
        className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "分析中..." : "分析"}
      </button>

      {/* エラー表示 */}
      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 結果表示 */}
      {result && (
        <div className="space-y-6">
          {/* 総合スコア */}
          <div className="rounded-lg border border-border bg-surface p-6">
            <div className="flex items-center gap-6">
              <div className="text-center">
                <div
                  className={`text-5xl font-bold ${scoreColor(result.overallScore)}`}
                >
                  {result.overallScore}
                </div>
                <div className="mt-1 text-xs text-muted">/ 100</div>
              </div>
              <div className="flex-1">
                <div className="mb-2 text-sm text-muted">
                  信頼度:{" "}
                  <span className="font-medium text-text">
                    {confidenceLabel(result.confidence)}
                  </span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${barColor(result.overallScore)}`}
                    style={{ width: `${result.overallScore}%` }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-xs text-muted">
                  <span>人間的</span>
                  <span>AI的</span>
                </div>
              </div>
            </div>
          </div>

          {/* 総評 */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <h3 className="mb-2 text-sm font-bold text-text">総評</h3>
            <p className="text-sm text-text leading-relaxed">
              {result.summary}
            </p>
          </div>

          {/* 各指標 */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <h3 className="mb-4 text-sm font-bold text-text">各指標の詳細</h3>
            <div className="space-y-4">
              {(
                Object.entries(result.metrics) as [
                  keyof AIDetectionResult["metrics"],
                  AIDetectionResult["metrics"][keyof AIDetectionResult["metrics"]],
                ][]
              ).map(([key, metric]) => (
                <div key={key}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm text-text">
                      {metricLabels[key]}
                    </span>
                    <span
                      className={`text-sm font-bold ${scoreColor(metric.score)}`}
                    >
                      {metric.score}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${barColor(metric.score)}`}
                      style={{ width: `${metric.score}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted">{metric.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
