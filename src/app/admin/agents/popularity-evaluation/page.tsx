"use client";

import { useState } from "react";
import type { PopularityEvaluationResult, PopularityGenre } from "@/types/agents";

// 指標ラベルの定義
const metricLabels: Record<keyof PopularityEvaluationResult["metrics"], string> = {
  hookStrength: "冒頭の引き込み力",
  pacing: "テンポ",
  dialogueRatio: "会話比率",
  innerMonologue: "内面独白",
  cliffhanger: "引き（クリフハンガー）",
  emotionalArc: "感情起伏",
  sensoryDescription: "五感描写",
  readability: "読みやすさ",
};

// ジャンルの選択肢
const genreOptions: { value: PopularityGenre | ""; label: string }[] = [
  { value: "", label: "未指定（デフォルト）" },
  { value: "fantasy", label: "ファンタジー" },
  { value: "romance", label: "ロマンス" },
  { value: "horror", label: "ホラー" },
  { value: "mystery", label: "ミステリー" },
  { value: "scifi", label: "SF" },
  { value: "slice_of_life", label: "日常" },
];

// グレードの色
function gradeColor(grade: PopularityEvaluationResult["grade"]): string {
  switch (grade) {
    case "S": return "text-purple-600";
    case "A": return "text-blue-600";
    case "B": return "text-green-600";
    case "C": return "text-yellow-600";
    case "D": return "text-red-500";
  }
}

// グレードの背景色
function gradeBg(grade: PopularityEvaluationResult["grade"]): string {
  switch (grade) {
    case "S": return "bg-purple-100 border-purple-300";
    case "A": return "bg-blue-100 border-blue-300";
    case "B": return "bg-green-100 border-green-300";
    case "C": return "bg-yellow-100 border-yellow-300";
    case "D": return "bg-red-100 border-red-300";
  }
}

// スコアに応じた色クラスを返す（高いほど良い）
function scoreColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-blue-500";
  if (score >= 40) return "text-yellow-600";
  return "text-red-500";
}

// スコアに応じたバーの色
function barColor(score: number): string {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-blue-500";
  if (score >= 40) return "bg-yellow-500";
  return "bg-red-500";
}

export default function PopularityEvaluationPage() {
  const [text, setText] = useState("");
  const [genre, setGenre] = useState<PopularityGenre | "">("");
  const [result, setResult] = useState<PopularityEvaluationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const charCount = [...text].length;

  async function handleEvaluate() {
    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const body: { text: string; genre?: PopularityGenre } = { text };
      if (genre) body.genre = genre;

      const res = await fetch("/api/agents/popularity-evaluation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "評価に失敗しました");
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
        <h2 className="text-xl font-bold text-text">人気評価エージェント</h2>
        <p className="mt-1 text-sm text-muted">
          小説テキストの構造・文体を分析し、人気が出やすいかをスコアリングします
        </p>
      </div>

      {/* 入力エリア */}
      <div className="space-y-2">
        <label
          htmlFor="input-text"
          className="block text-sm font-medium text-text"
        >
          評価するテキスト
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

      {/* ジャンル選択 */}
      <div className="space-y-2">
        <label
          htmlFor="genre-select"
          className="block text-sm font-medium text-text"
        >
          ジャンル（任意）
        </label>
        <select
          id="genre-select"
          value={genre}
          onChange={(e) => setGenre(e.target.value as PopularityGenre | "")}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {genreOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted">
          ジャンルを指定すると、そのジャンルに適した重み付けで評価します
        </p>
      </div>

      {/* 評価ボタン */}
      <button
        onClick={handleEvaluate}
        disabled={loading || charCount < 500}
        className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "評価中..." : "評価"}
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
          {/* 総合スコア + グレード */}
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
              <div
                className={`flex h-16 w-16 items-center justify-center rounded-xl border-2 ${gradeBg(result.grade)}`}
              >
                <span className={`text-3xl font-black ${gradeColor(result.grade)}`}>
                  {result.grade}
                </span>
              </div>
              <div className="flex-1">
                <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${barColor(result.overallScore)}`}
                    style={{ width: `${result.overallScore}%` }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-xs text-muted">
                  <span>改善が必要</span>
                  <span>人気が出やすい</span>
                </div>
              </div>
            </div>
          </div>

          {/* PV��測 */}
          {result.pvPrediction && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <h3 className="mb-3 text-sm font-bold text-blue-800">PV予測（globalPoint推定）</h3>
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-700">
                    {result.pvPrediction.predictedGP.toLocaleString()}
                  </div>
                  <div className="mt-1 text-xs text-blue-500">予測gP</div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${
                      result.pvPrediction.tier === "top" ? "bg-purple-100 text-purple-700" :
                      result.pvPrediction.tier === "upper" ? "bg-blue-100 text-blue-700" :
                      result.pvPrediction.tier === "mid" ? "bg-green-100 text-green-700" :
                      result.pvPrediction.tier === "lower" ? "bg-yellow-100 text-yellow-700" :
                      "bg-gray-100 text-gray-700"
                    }`}>
                      {result.pvPrediction.tier} tier
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-blue-600">
                    予測範囲: {result.pvPrediction.confidenceRange.low.toLocaleString()} 〜 {result.pvPrediction.confidenceRange.high.toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    89作品で検証済み。スピアマン相関0.459。予測誤差中央値4倍。
                  </p>
                </div>
              </div>
            </div>
          )}

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
                  keyof PopularityEvaluationResult["metrics"],
                  PopularityEvaluationResult["metrics"][keyof PopularityEvaluationResult["metrics"]],
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

          {/* 強み */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <h3 className="mb-3 text-sm font-bold text-text">強み</h3>
            <ul className="space-y-1">
              {result.strengths.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-text">
                  <span className="mt-0.5 text-green-500">●</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>

          {/* 改善提案 */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <h3 className="mb-3 text-sm font-bold text-text">改善提案</h3>
            <ul className="space-y-1">
              {result.improvements.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-text">
                  <span className="mt-0.5 text-yellow-500">●</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
