"use client";

import { useEffect, useState } from "react";
import type { DiscoveredPattern, PatternStatus } from "@/types/learning-loop";

const STATUS_OPTIONS: { value: PatternStatus | ""; label: string }[] = [
  { value: "", label: "すべて" },
  { value: "hypothesis", label: "仮説" },
  { value: "testing", label: "テスト中" },
  { value: "confirmed", label: "確認済み" },
  { value: "rejected", label: "棄却" },
  { value: "retired", label: "退役" },
];

const STATUS_DOT_COLORS: Record<string, string> = {
  hypothesis: "bg-yellow-500",
  testing: "bg-blue-500",
  confirmed: "bg-green-500",
  rejected: "bg-red-500",
  retired: "bg-gray-400",
};

export default function PatternsPage() {
  const [patterns, setPatterns] = useState<DiscoveredPattern[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const fetchPatterns = (status?: string) => {
    setLoading(true);
    const url = status ? `/api/admin/patterns?status=${status}` : "/api/admin/patterns";
    fetch(url)
      .then(r => r.json())
      .then(data => setPatterns(data.patterns || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchPatterns(filter || undefined);
  }, [filter]);

  const updateStatus = async (id: string, newStatus: PatternStatus) => {
    await fetch(`/api/admin/patterns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    fetchPatterns(filter || undefined);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">発見パターン</h2>
          <p className="text-sm text-gray-500">コンテンツ品質改善のための知見</p>
        </div>
        <div className="flex gap-2">
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={`rounded-lg px-3 py-1 text-xs transition ${
                filter === opt.value
                  ? "bg-blue-600 text-white"
                  : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500">読み込み中...</p>
      ) : patterns.length === 0 ? (
        <p className="text-gray-500">パターンがありません</p>
      ) : (
        <div className="space-y-4">
          {patterns.map(p => (
            <div key={p.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="mb-2 flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT_COLORS[p.status] || "bg-gray-400"}`} />
                      <span className="text-xs font-medium text-gray-600">
                        {STATUS_OPTIONS.find(o => o.value === p.status)?.label || p.status}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400">
                      {p.pattern_type === "positive" ? "効く" : p.pattern_type === "negative" ? "避ける" : "条件付き"}
                    </span>
                    {p.genre && (
                      <span className="rounded-lg border border-gray-200 px-1.5 py-0.5 text-xs text-gray-500">
                        {p.genre}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      confidence: {p.confidence} | n={p.sample_size}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-900">{p.finding}</p>
                  {p.actionable_rule && (
                    <p className="mt-1 text-xs text-gray-500">
                      → {p.actionable_rule}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-gray-400">
                    発見: {new Date(p.discovered_at).toLocaleDateString("ja-JP")}
                    {p.promoted_at && ` | 昇格: ${new Date(p.promoted_at).toLocaleDateString("ja-JP")}`}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  {p.status === "hypothesis" && (
                    <button
                      onClick={() => updateStatus(p.id, "confirmed")}
                      className="rounded-lg bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700 transition"
                    >
                      確認
                    </button>
                  )}
                  {(p.status === "hypothesis" || p.status === "testing") && (
                    <button
                      onClick={() => updateStatus(p.id, "rejected")}
                      className="rounded-lg bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700 transition"
                    >
                      棄却
                    </button>
                  )}
                  {p.status === "confirmed" && (
                    <button
                      onClick={() => updateStatus(p.id, "retired")}
                      className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 transition"
                    >
                      退役
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
