"use client";

import { useEffect, useState } from "react";
import type { LoopStats } from "@/types/learning-loop";

export default function LearningLoopPage() {
  const [stats, setStats] = useState<LoopStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/learning-loop")
      .then(r => r.json())
      .then(setStats)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-muted">読み込み中...</p>;
  if (!stats) return <p className="text-red-500">データ取得に失敗しました</p>;

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-bold">自己強化学習ループ</h2>

      {/* サマリーカード */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="平均品質スコア"
          value={stats.avg_quality_signal?.toFixed(1) ?? "—"}
          unit="/100"
        />
        <StatCard
          label="発見パターン数"
          value={stats.total_patterns}
        />
        <StatCard
          label="実行中A/Bテスト"
          value={stats.active_ab_tests}
        />
        <StatCard
          label="確認済みパターン"
          value={stats.patterns_by_status.confirmed}
        />
      </div>

      {/* パターンステータス内訳 */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted">パターンステータス内訳</h3>
        <div className="flex gap-3 flex-wrap">
          {Object.entries(stats.patterns_by_status).map(([status, count]) => (
            <span
              key={status}
              className="rounded-full border border-border px-3 py-1 text-xs"
            >
              {statusLabel(status)}: {count}
            </span>
          ))}
        </div>
      </div>

      {/* 探索枠 vs 通常枠 */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted">探索枠 vs 通常枠</h3>
        <div className="grid grid-cols-2 gap-4">
          <StatCard
            label="通常枠 平均品質"
            value={stats.exploration_vs_normal.normal_avg?.toFixed(1) ?? "—"}
            unit="/100"
          />
          <StatCard
            label="探索枠 平均品質"
            value={stats.exploration_vs_normal.exploration_avg?.toFixed(1) ?? "—"}
            unit="/100"
          />
        </div>
      </div>

      {/* 品質推移グラフ（テキストベース） */}
      {stats.quality_signal_trend.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-muted">品質スコア週次推移</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="pb-2 pr-4">週</th>
                  <th className="pb-2 pr-4">平均スコア</th>
                  <th className="pb-2">バー</th>
                </tr>
              </thead>
              <tbody>
                {stats.quality_signal_trend.map(w => (
                  <tr key={w.week} className="border-b border-border/50">
                    <td className="py-1.5 pr-4 text-xs">{w.week}</td>
                    <td className="py-1.5 pr-4 font-mono">{w.avg_signal.toFixed(1)}</td>
                    <td className="py-1.5">
                      <div
                        className="h-3 rounded bg-blue-500/70"
                        style={{ width: `${Math.min(w.avg_signal, 100)}%` }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  unit,
}: {
  label: string;
  value: string | number;
  unit?: string;
}) {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold">
        {value}
        {unit && <span className="text-sm font-normal text-muted">{unit}</span>}
      </p>
    </div>
  );
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    hypothesis: "仮説",
    testing: "テスト中",
    confirmed: "確認済み",
    rejected: "棄却",
    retired: "退役",
  };
  return labels[status] || status;
}
