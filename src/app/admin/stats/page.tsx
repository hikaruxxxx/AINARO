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

// 主KPI: 完走者数 (月次)
type MonthlyCompletion = {
  month: string;
  completed_work_total: number;
  completed_work_logged_in: number;
  caught_up_total: number;
  caught_up_logged_in: number;
};

type TopCompletedWork = {
  novel_id: string;
  novel_title: string;
  novel_status: string;
  completion_type: "completed_work" | "caught_up";
  completion_count: number;
};

type CompletionsData = {
  monthly: MonthlyCompletion[];
  top_works: TopCompletedWork[];
};

// v2 主KPI: MAU/DAU
type MauSummary = {
  mau_users: number;
  mau_sessions: number;
  dau_avg_users: number;
  dau_avg_sessions: number;
  dau_mau_ratio: number;
};

type DauDaily = {
  date: string;
  dau_users: number;
  dau_sessions: number;
};

type MauDauData = {
  summary: MauSummary | null;
  daily: DauDaily[];
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
  if (max === 0) return "bg-gray-100";
  const ratio = count / max;
  if (ratio > 0.7) return "bg-emerald-500";
  if (ratio > 0.4) return "bg-emerald-300";
  if (ratio > 0.2) return "bg-emerald-200";
  if (ratio > 0) return "bg-emerald-100";
  return "bg-gray-100";
}

export default function StatsPage() {
  const [data, setData] = useState<StatsData | null>(null);
  const [completions, setCompletions] = useState<CompletionsData | null>(null);
  const [mauDau, setMauDau] = useState<MauDauData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNovelId, setSelectedNovelId] = useState<string>("");
  const [days, setDays] = useState(7);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ days: String(days) });
    if (selectedNovelId) params.set("novel_id", selectedNovelId);

    const [statsRes, compRes, mauRes] = await Promise.all([
      fetch(`/api/admin/stats?${params}`),
      fetch(`/api/admin/completions`),
      fetch(`/api/admin/mau-dau`),
    ]);
    const [statsJson, compJson, mauJson] = await Promise.all([
      statsRes.json(),
      compRes.json(),
      mauRes.json(),
    ]);
    setData(statsJson);
    setCompletions(compJson);
    setMauDau(mauJson);
    setLoading(false);
  }, [selectedNovelId, days]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading && !data) {
    return <div className="py-12 text-center text-gray-500">読み込み中...</div>;
  }

  if (!data) return null;

  const { realtime, novels } = data;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-gray-900">読書統計ダッシュボード</h2>
        <p className="text-sm text-gray-500">リアルタイムの読書行動データを分析</p>
      </div>

      {/* v2 主KPI: MAU / DAU / DAU/MAU比 */}
      {mauDau?.summary && (
        <div>
          <h3 className="mb-1 text-lg font-bold text-gray-900">
            主KPI: MAU / DAU <span className="text-sm font-normal text-gray-500">(過去30日)</span>
          </h3>
          <p className="mb-4 text-xs text-gray-500">
            ログイン読者ベース = v2 主KPI(買い手評価指標) / セッションベース = 補助指標。philosophy v2 §1
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard
              label="MAU(ログイン)"
              value={String(mauDau.summary.mau_users)}
              highlight
            />
            <StatCard
              label="MAU(全セッション)"
              value={String(mauDau.summary.mau_sessions)}
            />
            <StatCard
              label="DAU平均(ログイン)"
              value={mauDau.summary.dau_avg_users.toFixed(1)}
              highlight
            />
            <StatCard
              label="DAU平均(全セッション)"
              value={mauDau.summary.dau_avg_sessions.toFixed(1)}
            />
            <StatCard
              label="DAU/MAU比"
              value={`${(mauDau.summary.dau_mau_ratio * 100).toFixed(1)}%`}
              highlight
            />
          </div>
        </div>
      )}

      {/* 副KPI: 完走者数 (月次) — 品質ガード */}
      {completions && (
        <div>
          <h3 className="mb-1 text-lg font-bold text-gray-900">
            副KPI: 完走者数 <span className="text-sm font-normal text-gray-500">(月次・品質ガード)</span>
          </h3>
          <p className="mb-4 text-xs text-gray-500">
            完結作品の最終話到達 = 完走 / 連載作品の最新話到達 = 追従。v2 では品質劣化の早期警告として継続計測 (philosophy v2 §3.4)
          </p>
          {completions.monthly.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
              まだ完走データがありません
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/50 text-left text-gray-500">
                    <th className="px-3 py-2 text-xs font-medium">月</th>
                    <th className="px-3 py-2 text-right text-xs font-medium">完走者数(完結)</th>
                    <th className="px-3 py-2 text-right text-xs font-medium">うちログイン</th>
                    <th className="px-3 py-2 text-right text-xs font-medium">追従者数(連載)</th>
                    <th className="px-3 py-2 text-right text-xs font-medium">うちログイン</th>
                  </tr>
                </thead>
                <tbody>
                  {completions.monthly.map((m) => (
                    <tr key={m.month} className="border-b border-gray-100">
                      <td className="px-3 py-2 text-gray-900">{m.month.slice(0, 7)}</td>
                      <td className="px-3 py-2 text-right text-2xl font-bold text-emerald-600">
                        {m.completed_work_total}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600">{m.completed_work_logged_in}</td>
                      <td className="px-3 py-2 text-right text-lg font-semibold text-gray-700">
                        {m.caught_up_total}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600">{m.caught_up_logged_in}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 作品別完走数トップ (直近30日) */}
          {completions.top_works.length > 0 && (
            <div className="mt-6">
              <h4 className="mb-2 text-sm font-bold text-gray-900">作品別完走/追従数 (直近30日)</h4>
              <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50/50 text-left text-gray-500">
                      <th className="px-3 py-2 text-xs font-medium">作品</th>
                      <th className="px-3 py-2 text-xs font-medium">種別</th>
                      <th className="px-3 py-2 text-right text-xs font-medium">人数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completions.top_works.map((w) => (
                      <tr key={`${w.novel_id}-${w.completion_type}`} className="border-b border-gray-100">
                        <td className="px-3 py-2 text-gray-900">{w.novel_title}</td>
                        <td className="px-3 py-2">
                          {w.completion_type === "completed_work" ? (
                            <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                              完走(完結作)
                            </span>
                          ) : (
                            <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                              追従(連載)
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-900">
                          {w.completion_count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* フィルター */}
      <div className="flex flex-wrap items-center gap-4">
        <select
          value={selectedNovelId}
          onChange={(e) => setSelectedNovelId(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
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
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
        >
          <option value={1}>24時間</option>
          <option value={7}>7日間</option>
          <option value={30}>30日間</option>
          <option value={90}>90日間</option>
        </select>

        <button
          onClick={fetchStats}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
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
          <h3 className="mb-4 text-lg font-bold text-gray-900">エピソード別指標</h3>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/50 text-left text-gray-500">
                  <th className="px-3 py-2 text-xs font-medium">エピソード</th>
                  <th className="px-3 py-2 text-right text-xs font-medium">開始</th>
                  <th className="px-3 py-2 text-right text-xs font-medium">読了</th>
                  <th className="px-3 py-2 text-right text-xs font-medium">読了率</th>
                  <th className="px-3 py-2 text-right text-xs font-medium">次話遷移率</th>
                  <th className="px-3 py-2 text-right text-xs font-medium">離脱率</th>
                  <th className="px-3 py-2 text-right text-xs font-medium">平均深度</th>
                  <th className="px-3 py-2 text-xs font-medium">スクロール分布</th>
                </tr>
              </thead>
              <tbody>
                {realtime.by_episode.map((ep) => {
                  const maxBucket = Math.max(...ep.scroll_buckets, 1);
                  return (
                    <tr key={ep.episode_id} className="border-b border-gray-100 hover:bg-gray-50/50 transition">
                      <td className="px-3 py-2 text-sm text-gray-900">
                        {ep.episode_number != null ? (
                          <span>第{ep.episode_number}話 {ep.episode_title}</span>
                        ) : (
                          <span className="font-mono text-xs text-gray-400">{ep.episode_id.slice(0, 8)}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600">{ep.starts}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{ep.completes}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{pct(ep.completion_rate)}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{pct(ep.next_episode_rate)}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{pct(ep.drop_rate)}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{pct(ep.avg_scroll_depth)}</td>
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
          <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
            <span>スクロール到達分布:</span>
            <span className="inline-block h-3 w-3 rounded-sm bg-gray-100" /> 0%
            <span className="inline-block h-3 w-3 rounded-sm bg-emerald-100" />
            <span className="inline-block h-3 w-3 rounded-sm bg-emerald-200" />
            <span className="inline-block h-3 w-3 rounded-sm bg-emerald-300" />
            <span className="inline-block h-3 w-3 rounded-sm bg-emerald-500" /> 多
          </div>
        </div>
      )}

      {/* データなし */}
      {realtime.total_events === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <p className="text-lg text-gray-900">まだ読書データがありません</p>
          <p className="mt-2 text-sm text-gray-500">
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
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold ${
          highlight ? "text-emerald-600" : negative ? "text-red-500" : "text-gray-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
