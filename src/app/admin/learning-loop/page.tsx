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

  if (loading) return <p className="text-gray-500">読み込み中...</p>;
  if (!stats) return <p className="text-red-500">データ取得に失敗しました</p>;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-gray-900">自己強化学習ループ</h2>
        <p className="text-sm text-gray-500">パターン発見と品質改善のサイクル</p>
      </div>

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
        <h3 className="mb-3 text-sm font-semibold text-gray-500">パターンステータス内訳</h3>
        <div className="flex gap-3 flex-wrap">
          {Object.entries(stats.patterns_by_status).map(([status, count]) => (
            <span
              key={status}
              className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600"
            >
              {statusLabel(status)}: {count}
            </span>
          ))}
        </div>
      </div>

      {/* 探索枠 vs 通常枠 */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-gray-500">探索枠 vs 通常枠</h3>
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
          <h3 className="mb-3 text-sm font-semibold text-gray-500">品質スコア週次推移</h3>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/50 text-left text-gray-500">
                  <th className="px-3 py-2 text-xs font-medium">週</th>
                  <th className="px-3 py-2 text-xs font-medium">平均スコア</th>
                  <th className="px-3 py-2 text-xs font-medium">バー</th>
                </tr>
              </thead>
              <tbody>
                {stats.quality_signal_trend.map(w => (
                  <tr key={w.week} className="border-b border-gray-100 hover:bg-gray-50/50 transition">
                    <td className="px-3 py-2 text-xs text-gray-600">{w.week}</td>
                    <td className="px-3 py-2 font-mono text-gray-900">{w.avg_signal.toFixed(1)}</td>
                    <td className="px-3 py-2">
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
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">
        {value}
        {unit && <span className="text-sm font-normal text-gray-500">{unit}</span>}
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
