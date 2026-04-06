"use client";

import { useState, useEffect, useCallback } from "react";
import type { ABTest } from "@/types/novel";

type TestWithRelations = ABTest & {
  episodes?: { episode_number: number; title: string };
  novels?: { title: string; slug: string };
};

export default function ABTestsPage() {
  const [tests, setTests] = useState<TestWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");

  const fetchTests = useCallback(async () => {
    const url = filter ? `/api/admin/ab-tests?status=${filter}` : "/api/admin/ab-tests";
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      setTests(data.tests);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    fetchTests();
  }, [fetchTests]);

  const handleAction = async (testId: string, action: string) => {
    const res = await fetch(`/api/admin/ab-tests/${testId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (res.ok) fetchTests();
  };

  if (loading) {
    return <div className="py-8 text-center text-sm text-gray-500">読み込み中...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">A/Bテスト管理</h2>
          <p className="text-sm text-gray-500">コンテンツバリアントのテスト結果を管理</p>
        </div>
        <div className="flex gap-2">
          {["", "draft", "running", "completed"].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`rounded-lg px-3 py-1 text-sm transition ${
                filter === s ? "bg-blue-600 text-white" : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {s === "" ? "すべて" : s === "draft" ? "下書き" : s === "running" ? "実行中" : "完了"}
            </button>
          ))}
        </div>
      </div>

      {tests.length === 0 ? (
        <p className="text-sm text-gray-500">テストがありません</p>
      ) : (
        <div className="space-y-4">
          {tests.map((test) => (
            <div key={test.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-gray-900">{test.name}</h3>
                  {test.description && (
                    <p className="text-sm text-gray-500 mt-1">{test.description}</p>
                  )}
                  <div className="mt-2 flex gap-3 text-xs text-gray-500">
                    <span>作品: {test.novels?.title}</span>
                    <span>第{test.episodes?.episode_number}話</span>
                    <span>判定指標: {test.primary_metric}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        test.status === "draft"
                          ? "bg-gray-400"
                          : test.status === "running"
                            ? "bg-green-500"
                            : "bg-blue-500"
                      }`}
                    />
                    <span className="text-xs font-medium text-gray-600">
                      {test.status === "draft" ? "下書き" : test.status === "running" ? "実行中" : "完了"}
                    </span>
                  </div>
                </div>
              </div>

              {/* バリアント一覧 */}
              <div className="mt-3 flex gap-2">
                {test.variants.map((v) => (
                  <span key={v.id} className="rounded-lg border border-gray-200 px-2 py-0.5 text-xs text-gray-600">
                    {v.id}: {v.name}
                    {test.winner_variant === v.id && " 🏆"}
                  </span>
                ))}
              </div>

              {/* 結果表示 */}
              {test.results && (
                <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50/50 text-left text-gray-500">
                        <th className="py-2 px-3 font-medium">バリアント</th>
                        <th className="py-2 px-3 font-medium">セッション</th>
                        <th className="py-2 px-3 font-medium">読了率</th>
                        <th className="py-2 px-3 font-medium">次話遷移率</th>
                        <th className="py-2 px-3 font-medium">BM率</th>
                        <th className="py-2 px-3 font-medium">平均滞在</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(test.results).map(([vid, metrics]) => (
                        <tr key={vid} className={`border-b border-gray-100 hover:bg-gray-50/50 ${test.winner_variant === vid ? "font-bold" : ""}`}>
                          <td className="py-2 px-3 text-gray-900">{vid}</td>
                          <td className="py-2 px-3 text-gray-600">{metrics.unique_sessions}</td>
                          <td className="py-2 px-3 text-gray-600">{(metrics.completion_rate * 100).toFixed(1)}%</td>
                          <td className="py-2 px-3 text-gray-600">{(metrics.next_episode_rate * 100).toFixed(1)}%</td>
                          <td className="py-2 px-3 text-gray-600">{(metrics.bookmark_rate * 100).toFixed(1)}%</td>
                          <td className="py-2 px-3 text-gray-600">{Math.round(metrics.avg_read_duration)}秒</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* アクションボタン */}
              <div className="mt-3 flex gap-2">
                {test.status === "draft" && (
                  <button
                    onClick={() => handleAction(test.id, "start")}
                    className="rounded-lg bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700 transition"
                  >
                    テスト開始
                  </button>
                )}
                {test.status === "running" && (
                  <button
                    onClick={() => handleAction(test.id, "complete")}
                    className="rounded-lg bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 transition"
                  >
                    テスト終了・集計
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
