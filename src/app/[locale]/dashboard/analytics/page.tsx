"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

type Summary = {
  pv: number;
  unique_users: number;
  avg_completion_rate: number | null;
  avg_next_episode_rate: number | null;
  followers: number;
};

type NovelStat = {
  novel_id: string;
  title: string;
  total_pv: number;
  total_bookmarks: number;
  period_pv: number;
  period_unique_users: number;
  avg_completion_rate: number | null;
};

type DailyStat = {
  date: string;
  pv: number;
  unique_users: number;
};

export default function AnalyticsPage() {
  const t = useTranslations("analytics");
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [byNovel, setByNovel] = useState<NovelStat[]>([]);
  const [daily, setDaily] = useState<DailyStat[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/writer/analytics?days=${days}`);
        if (res.ok) {
          const data = await res.json();
          setSummary(data.summary);
          setByNovel(data.by_novel);
          setDaily(data.daily);
        }
      } catch { /* エラーは静かに処理 */ }
      finally { setLoading(false); }
    };
    fetchData();
  }, [days]);

  const formatRate = (rate: number | null) =>
    rate != null ? `${(rate * 100).toFixed(1)}%` : "—";

  const maxPv = Math.max(...daily.map((d) => d.pv), 1);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-text">{t("title")}</h1>
        {/* 期間フィルタ */}
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                days === d
                  ? "bg-white text-text shadow-sm dark:bg-gray-700"
                  : "text-muted hover:text-text"
              }`}
            >
              {d}{t("days")}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        </div>
      ) : summary ? (
        <>
          {/* サマリーカード */}
          <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-5">
            <StatCard label={t("pv")} value={summary.pv.toLocaleString()} />
            <StatCard label={t("uniqueUsers")} value={summary.unique_users.toLocaleString()} />
            <StatCard
              label={t("avgCompletionRate")}
              value={formatRate(summary.avg_completion_rate)}
              highlight
            />
            <StatCard label={t("avgNextRate")} value={formatRate(summary.avg_next_episode_rate)} />
            <StatCard label={t("followers")} value={summary.followers.toLocaleString()} />
          </div>

          {/* PV推移グラフ（シンプルなバーチャート） */}
          {daily.length > 0 && (
            <div className="mb-8 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
              <h2 className="mb-4 text-sm font-bold text-text">{t("pvTrend")}</h2>
              <div className="flex items-end gap-0.5" style={{ height: 120 }}>
                {daily.map((d) => (
                  <div
                    key={d.date}
                    className="flex-1 rounded-t bg-indigo-500 transition-all hover:bg-indigo-400"
                    style={{ height: `${(d.pv / maxPv) * 100}%`, minHeight: 2 }}
                    title={`${d.date}: ${d.pv} PV`}
                  />
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-muted">
                <span>{daily[0]?.date}</span>
                <span>{daily[daily.length - 1]?.date}</span>
              </div>
            </div>
          )}

          {/* 作品別 */}
          {byNovel.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
              <h2 className="border-b border-gray-100 px-5 py-3 text-sm font-bold text-text dark:border-gray-800">
                {t("byNovel")}
              </h2>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {byNovel.map((n) => (
                  <Link
                    key={n.novel_id}
                    href={`/dashboard/novels/${n.novel_id}`}
                    className="flex items-center justify-between px-5 py-4 transition hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <div>
                      <p className="text-sm font-medium text-text">{n.title}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {t("totalPv")}: {n.total_pv.toLocaleString()} · {t("bookmarks")}: {n.total_bookmarks}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-indigo-600">{formatRate(n.avg_completion_rate)}</p>
                      <p className="text-[10px] text-muted">{t("completionRate")}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="py-16 text-center text-muted">{t("noData")}</p>
      )}
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? "border-indigo-200 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/30" : "border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-xl font-bold ${highlight ? "text-indigo-600" : "text-text"}`}>{value}</p>
    </div>
  );
}
