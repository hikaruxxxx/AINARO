"use client";

import { useState, useEffect, useCallback } from "react";

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

type Novel = {
  id: string;
  slug: string;
  title: string;
  total_pv: number;
  total_chapters: number;
};

export default function RetentionAnalysisPage() {
  const [novels, setNovels] = useState<Novel[]>([]);
  const [selectedNovel, setSelectedNovel] = useState<string>("");
  const [stats, setStats] = useState<EpisodeStat[]>([]);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);

  // 作品一覧取得
  useEffect(() => {
    fetch("/api/admin/stats")
      .then((res) => res.json())
      .then((data) => {
        setNovels(data.novels || []);
        if (data.novels?.length > 0) {
          setSelectedNovel(data.novels[0].id);
        }
      });
  }, []);

  // 統計データ取得
  const fetchStats = useCallback(async () => {
    if (!selectedNovel) return;
    setLoading(true);
    const res = await fetch(`/api/admin/stats?novel_id=${selectedNovel}&days=${days}`);
    if (res.ok) {
      const data = await res.json();
      // エピソード番号順にソート
      const sorted = (data.realtime?.by_episode || []).sort(
        (a: EpisodeStat, b: EpisodeStat) => (a.episode_number ?? 0) - (b.episode_number ?? 0)
      );
      setStats(sorted);
    }
    setLoading(false);
  }, [selectedNovel, days]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // ファネルチャートのバーの色（読了率の高さで変化）
  const getBarColor = (rate: number | null) => {
    if (rate === null) return "bg-gray-200";
    if (rate >= 0.8) return "bg-green-500";
    if (rate >= 0.6) return "bg-green-400";
    if (rate >= 0.4) return "bg-yellow-400";
    if (rate >= 0.2) return "bg-orange-400";
    return "bg-red-400";
  };

  // スクロールヒートマップの色
  const getHeatColor = (count: number, max: number) => {
    if (max === 0) return "bg-gray-100";
    const intensity = count / max;
    if (intensity >= 0.8) return "bg-red-500 text-white";
    if (intensity >= 0.6) return "bg-red-300";
    if (intensity >= 0.4) return "bg-orange-300";
    if (intensity >= 0.2) return "bg-yellow-200";
    return "bg-gray-100";
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">章単位 離脱分析</h2>
        <p className="text-sm text-gray-500">読者の離脱ポイントを可視化</p>
      </div>

      {/* フィルター */}
      <div className="mb-6 flex gap-4 items-center">
        <select
          value={selectedNovel}
          onChange={(e) => setSelectedNovel(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
        >
          {novels.map((n) => (
            <option key={n.id} value={n.id}>{n.title}</option>
          ))}
        </select>

        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
        >
          <option value={7}>7日間</option>
          <option value={14}>14日間</option>
          <option value={30}>30日間</option>
          <option value={90}>90日間</option>
        </select>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-gray-500">読み込み中...</div>
      ) : stats.length === 0 ? (
        <p className="text-sm text-gray-500">データがありません</p>
      ) : (
        <>
          {/* 1. 章→章リテンションファネル */}
          <div className="mb-8 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-gray-900 mb-3">リテンションファネル</h3>
            <p className="text-xs text-gray-400 mb-4">
              各話を読み始めた読者数と、次話への遷移率。どこで読者が離脱しているかを可視化。
            </p>
            <div className="space-y-2">
              {stats.map((ep, i) => {
                const maxStarts = Math.max(...stats.map((s) => s.starts));
                const barWidth = maxStarts > 0 ? (ep.starts / maxStarts) * 100 : 0;
                return (
                  <div key={ep.episode_id} className="flex items-center gap-3">
                    <div className="w-24 text-right text-xs text-gray-500 shrink-0">
                      {ep.episode_number !== null ? `第${ep.episode_number}話` : "?"}
                    </div>
                    <div className="flex-1 relative h-8">
                      <div
                        className={`h-full rounded ${getBarColor(ep.completion_rate)} transition-all`}
                        style={{ width: `${barWidth}%` }}
                      />
                      <div className="absolute inset-0 flex items-center px-2 text-xs">
                        <span className="font-bold text-gray-900">{ep.starts}人</span>
                        {ep.completion_rate !== null && (
                          <span className="ml-2 text-gray-600">読了{(ep.completion_rate * 100).toFixed(0)}%</span>
                        )}
                        {i < stats.length - 1 && ep.next_episode_rate !== null && (
                          <span className="ml-2 text-gray-600">→次話{(ep.next_episode_rate * 100).toFixed(0)}%</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. スクロールヒートマップ */}
          <div className="mb-8 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-gray-900 mb-3">スクロール深度ヒートマップ</h3>
            <p className="text-xs text-gray-400 mb-4">
              各話の章内で、読者がどこまでスクロールしたか。赤が濃いほどその位置で多くの読者が停止/離脱。
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/50">
                    <th className="py-2 text-left text-xs font-medium text-gray-500">話</th>
                    {Array.from({ length: 10 }, (_, i) => (
                      <th key={i} className="py-2 text-center w-12 text-xs font-medium text-gray-500">{i * 10}%</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stats.map((ep) => {
                    const maxBucket = Math.max(...(ep.scroll_buckets || [0]));
                    return (
                      <tr key={ep.episode_id} className="border-b border-gray-100 hover:bg-gray-50/50 transition">
                        <td className="py-1 pr-2 whitespace-nowrap text-gray-600">
                          {ep.episode_number !== null ? `第${ep.episode_number}話` : "?"}
                        </td>
                        {(ep.scroll_buckets || Array(10).fill(0)).map((count, i) => (
                          <td key={i} className="py-1 text-center">
                            <div className={`mx-auto w-10 rounded py-0.5 text-[10px] ${getHeatColor(count, maxBucket)}`}>
                              {count > 0 ? count : ""}
                            </div>
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. エピソード別詳細 */}
          <div>
            <h3 className="text-lg font-bold text-gray-900 mb-3">エピソード別詳細</h3>
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/50 text-left text-gray-500">
                    <th className="py-2 px-3 font-medium">話</th>
                    <th className="py-2 px-3 font-medium">タイトル</th>
                    <th className="py-2 px-3 font-medium">開始</th>
                    <th className="py-2 px-3 font-medium">読了</th>
                    <th className="py-2 px-3 font-medium">次話</th>
                    <th className="py-2 px-3 font-medium">離脱</th>
                    <th className="py-2 px-3 font-medium">読了率</th>
                    <th className="py-2 px-3 font-medium">次話率</th>
                    <th className="py-2 px-3 font-medium">離脱率</th>
                    <th className="py-2 px-3 font-medium">平均深度</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((ep) => (
                    <tr key={ep.episode_id} className="border-b border-gray-100 hover:bg-gray-50/50 transition">
                      <td className="py-2 px-3 text-gray-900">{ep.episode_number ?? "-"}</td>
                      <td className="py-2 px-3 max-w-32 truncate text-gray-900">{ep.episode_title ?? "-"}</td>
                      <td className="py-2 px-3 text-gray-600">{ep.starts}</td>
                      <td className="py-2 px-3 text-gray-600">{ep.completes}</td>
                      <td className="py-2 px-3 text-gray-600">{ep.nexts}</td>
                      <td className="py-2 px-3 text-gray-600">{ep.drops}</td>
                      <td className="py-2 px-3 font-bold text-gray-900">
                        {ep.completion_rate !== null ? `${(ep.completion_rate * 100).toFixed(1)}%` : "-"}
                      </td>
                      <td className="py-2 px-3 text-gray-600">
                        {ep.next_episode_rate !== null ? `${(ep.next_episode_rate * 100).toFixed(1)}%` : "-"}
                      </td>
                      <td className="py-2 px-3 text-gray-600">
                        {ep.drop_rate !== null ? `${(ep.drop_rate * 100).toFixed(1)}%` : "-"}
                      </td>
                      <td className="py-2 px-3 text-gray-600">
                        {ep.avg_scroll_depth !== null ? `${(ep.avg_scroll_depth * 100).toFixed(0)}%` : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
