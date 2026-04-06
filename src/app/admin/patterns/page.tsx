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

const STATUS_COLORS: Record<string, string> = {
  hypothesis: "bg-yellow-100 text-yellow-800",
  testing: "bg-blue-100 text-blue-800",
  confirmed: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  retired: "bg-gray-100 text-gray-600",
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
        <h2 className="text-xl font-bold">発見パターン</h2>
        <div className="flex gap-2">
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={`rounded-full px-3 py-1 text-xs transition ${
                filter === opt.value
                  ? "bg-primary text-white"
                  : "border border-border hover:bg-surface"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-muted">読み込み中...</p>
      ) : patterns.length === 0 ? (
        <p className="text-muted">パターンがありません</p>
      ) : (
        <div className="space-y-4">
          {patterns.map(p => (
            <div key={p.id} className="rounded-lg border border-border p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="mb-2 flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLORS[p.status] || ""}`}>
                      {STATUS_OPTIONS.find(o => o.value === p.status)?.label || p.status}
                    </span>
                    <span className="text-xs text-muted">
                      {p.pattern_type === "positive" ? "効く" : p.pattern_type === "negative" ? "避ける" : "条件付き"}
                    </span>
                    {p.genre && (
                      <span className="rounded border border-border px-1.5 py-0.5 text-xs text-muted">
                        {p.genre}
                      </span>
                    )}
                    <span className="text-xs text-muted">
                      confidence: {p.confidence} | n={p.sample_size}
                    </span>
                  </div>
                  <p className="text-sm font-medium">{p.finding}</p>
                  {p.actionable_rule && (
                    <p className="mt-1 text-xs text-muted">
                      → {p.actionable_rule}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-muted">
                    発見: {new Date(p.discovered_at).toLocaleDateString("ja-JP")}
                    {p.promoted_at && ` | 昇格: ${new Date(p.promoted_at).toLocaleDateString("ja-JP")}`}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  {p.status === "hypothesis" && (
                    <button
                      onClick={() => updateStatus(p.id, "confirmed")}
                      className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700"
                    >
                      確認
                    </button>
                  )}
                  {(p.status === "hypothesis" || p.status === "testing") && (
                    <button
                      onClick={() => updateStatus(p.id, "rejected")}
                      className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700"
                    >
                      棄却
                    </button>
                  )}
                  {p.status === "confirmed" && (
                    <button
                      onClick={() => updateStatus(p.id, "retired")}
                      className="rounded border border-border px-2 py-1 text-xs hover:bg-surface"
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
