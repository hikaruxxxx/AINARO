"use client";

import { useState, useEffect, useCallback } from "react";

type NovelSummary = {
  id: string;
  slug: string;
  title: string;
  total_pv: number;
  total_bookmarks: number;
  total_chapters: number;
};

type EpisodeStat = {
  episode_id: string;
  episode_number: number | null;
  episode_title: string | null;
  starts: number;
  completes: number;
  nexts: number;
  drops: number;
  completion_rate: number | null;
  next_episode_rate: number | null;
  drop_rate: number | null;
  avg_scroll_depth: number | null;
  scroll_buckets: number[];
};

type RealtimeStats = {
  total_events: number;
  unique_sessions: number;
  total_starts: number;
  total_completes: number;
  total_nexts: number;
  total_drops: number;
  completion_rate: number | null;
  next_episode_rate: number | null;
  drop_rate: number | null;
  avg_read_duration_sec: number | null;
  by_episode: EpisodeStat[];
};

type StatsData = {
  novels: NovelSummary[];
  realtime: RealtimeStats;
};

// パーセント表示
function pct(val: number | null): string {
  if (val === null) return "—";
  return `${(val * 100).toFixed(1)}%`;
}

// 秒→分秒
function formatDuration(sec: number | null): string {
  if (sec === null) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}分${s}秒` : `${s}秒`;
}

// ヒートマップの色（離脱が多い箇所ほど赤）
function heatColor(count: number, max: number): string {
  if (max === 0) return "bg-surface";
  const ratio = count / max;
  if (ratio > 0.7) return "bg-emerald-500";
  if (ratio > 0.4) return "bg-emerald-300";
  if (ratio > 0.2) return "bg-emerald-200";
  if (ratio > 0) return "bg-emerald-100";
  return "bg-surface";
}

export default function StatsPage() {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNovelId, setSelectedNovelId] = useState<string>("");
  const [days, setDays] = useState(7);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ days: String(days) });
    if (selectedNovelId) params.set("novel_id", selectedNovelId);

    const res = await fetch(`/api/admin/stats?${params}`);
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, [selectedNovelId, days]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading && !data) {
    return <div className="py-12 text-center text-muted">読み込み中...</div>;
  }

  if (!data) return null;

  const { realtime, novels } = data;

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-bold">読書統計ダッシュボード</h2>

      {/* フィルター */}
      <div className="flex flex-wrap items-center gap-4">
        <select
          value={selectedNovelId}
          onChange={(e) => setSelectedNovelId(e.target.value)}
          className="rounded-lg border border-border bg-bg px-3 py-2 text-sm"
        >
          <option value="">全作品</option>
          {novels.map((n) => (
            <option key={n.id} value={n.id}>
              {n.title}
            </option>
          ))}
        </select>

        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-lg border border-border bg-bg px-3 py-2 text-sm"
        >
          <option value={1}>24時間</option>
          <option value={7}>7日間</option>
          <option value={30}>30日間</option>
          <option value={90}>90日間</option>
        </select>

        <button
          onClick={fetchStats}
          className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface transition"
        >
          更新
        </button>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="ユニークセッション" value={String(realtime.unique_sessions)} />
        <StatCard label="閲覧開始" value={String(realtime.total_starts)} />
        <StatCard label="読了率" value={pct(realtime.completion_rate)} highlight />
        <StatCard label="次話遷移率" value={pct(realtime.next_episode_rate)} highlight />
        <StatCard label="離脱率" value={pct(realtime.drop_rate)} negative />
        <StatCard label="読了数" value={String(realtime.total_completes)} />
        <StatCard label="次話遷移数" value={String(realtime.total_nexts)} />
        <StatCard label="離脱数" value={String(realtime.total_drops)} />
        <StatCard label="平均滞在時間" value={formatDuration(realtime.avg_read_duration_sec)} />
        <StatCard label="総イベント数" value={String(realtime.total_events)} />
      </div>

      {/* エピソード別詳細 */}
      {realtime.by_episode.length > 0 && (
        <div>
          <h3 className="mb-4 text-lg font-bold">エピソード別指標</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="px-3 py-2">エピソード</th>
                  <th className="px-3 py-2 text-right">開始</th>
                  <th className="px-3 py-2 text-right">読了</th>
                  <th className="px-3 py-2 text-right">読了率</th>
                  <th className="px-3 py-2 text-right">次話遷移率</th>
                  <th className="px-3 py-2 text-right">離脱率</th>
                  <th className="px-3 py-2 text-right">平均深度</th>
                  <th className="px-3 py-2">スクロール分布</th>
                </tr>
              </thead>
              <tbody>
                {realtime.by_episode.map((ep) => {
                  const maxBucket = Math.max(...ep.scroll_buckets, 1);
                  return (
                    <tr key={ep.episode_id} className="border-b border-border/50">
                      <td className="px-3 py-2 text-sm">
                        {ep.episode_number != null ? (
                          <span>第{ep.episode_number}話 {ep.episode_title}</span>
                        ) : (
                          <span className="font-mono text-xs text-muted">{ep.episode_id.slice(0, 8)}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">{ep.starts}</td>
                      <td className="px-3 py-2 text-right">{ep.completes}</td>
                      <td className="px-3 py-2 text-right">{pct(ep.completion_rate)}</td>
                      <td className="px-3 py-2 text-right">{pct(ep.next_episode_rate)}</td>
                      <td className="px-3 py-2 text-right">{pct(ep.drop_rate)}</td>
                      <td className="px-3 py-2 text-right">{pct(ep.avg_scroll_depth)}</td>
                      <td className="px-3 py-2">
                        {/* ヒートマップ: 10%刻みのスクロール到達分布 */}
                        <div className="flex gap-0.5">
                          {ep.scroll_buckets.map((count, i) => (
                            <div
                              key={i}
                              className={`h-5 w-4 rounded-sm ${heatColor(count, maxBucket)}`}
                              title={`${i * 10}-${(i + 1) * 10}%: ${count}件`}
                            />
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ヒートマップ凡例 */}
          <div className="mt-2 flex items-center gap-2 text-xs text-muted">
            <span>スクロール到達分布:</span>
            <span className="inline-block h-3 w-3 rounded-sm bg-surface" /> 0%
            <span className="inline-block h-3 w-3 rounded-sm bg-emerald-100" />
            <span className="inline-block h-3 w-3 rounded-sm bg-emerald-200" />
            <span className="inline-block h-3 w-3 rounded-sm bg-emerald-300" />
            <span className="inline-block h-3 w-3 rounded-sm bg-emerald-500" /> 多
          </div>
        </div>
      )}

      {/* データなし */}
      {realtime.total_events === 0 && (
        <div className="rounded-lg border border-border bg-surface p-8 text-center text-muted">
          <p className="text-lg">まだ読書データがありません</p>
          <p className="mt-2 text-sm">
            読者がエピソードを閲覧すると、ここに統計が表示されます。
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
  negative,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p
        className={`mt-1 text-xl font-bold ${
          highlight ? "text-emerald-600" : negative ? "text-red-500" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
