"use client";

import { useEffect, useState } from "react";
import { usePoints } from "@/hooks/usePoints";
import { Link } from "@/i18n/navigation";

// ポイント取引種別の表示名
const TYPE_LABELS: Record<string, string> = {
  login_bonus: "ログインボーナス",
  episode_complete: "エピソード読了",
  episode_unlock: "エピソード先読み解放",
  signup_bonus: "新規登録ボーナス",
};

type Transaction = {
  id: string;
  amount: number;
  type: string;
  created_at: string;
  reference_id: string | null;
};

type Badge = {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string | null;
  tier: number;
  threshold: number | null;
  earned: boolean;
};

export default function PointsPage() {
  const { balance, authenticated, loading, currentStreak, longestStreak } = usePoints();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [badges, setBadges] = useState<Badge[]>([]);

  useEffect(() => {
    if (!authenticated) return;
    fetch("/api/points/history?limit=50")
      .then((r) => r.json())
      .then((data) => {
        setTransactions(data.transactions || []);
        setHistoryLoading(false);
      })
      .catch(() => setHistoryLoading(false));
    fetch("/api/badges")
      .then((r) => r.json())
      .then((data) => setBadges(data.badges || []))
      .catch(() => {});
  }, [authenticated]);

  if (loading) {
    return <div className="mx-auto max-w-2xl px-4 py-12 text-center text-muted">読み込み中...</div>;
  }

  if (!authenticated) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="mb-4 text-2xl font-bold">ポイント</h1>
        <p className="mb-6 text-muted">ポイントを利用するにはログインが必要です。</p>
        <Link
          href="/login"
          className="inline-flex items-center rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
        >
          ログイン
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold">ポイント</h1>

      {/* 残高 + ストリークカード */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-purple-50 p-6 text-center dark:from-indigo-950/30 dark:to-purple-950/30">
          <p className="mb-1 text-xs text-muted">現在の残高</p>
          <p className="text-4xl font-extrabold text-indigo-600">
            {balance}
            <span className="ml-1 text-base font-bold opacity-60">pt</span>
          </p>
          <p className="mt-3 text-xs text-muted">毎日ログインでボーナス獲得</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-orange-50 to-rose-50 p-6 text-center dark:from-orange-950/30 dark:to-rose-950/30">
          <p className="mb-1 text-xs text-muted">連続ログイン</p>
          <p className="text-4xl font-extrabold text-orange-600">
            🔥{currentStreak}
            <span className="ml-1 text-base font-bold opacity-60">日</span>
          </p>
          <p className="mt-3 text-xs text-muted">
            最長 {longestStreak}日 / 7日で2倍・14日で3倍・30日で5倍
          </p>
        </div>
      </div>

      {/* バッジ一覧 */}
      <h2 className="mb-3 text-sm font-bold text-muted">バッジ</h2>
      {badges.length === 0 ? (
        <p className="mb-8 text-center text-sm text-muted">読み込み中...</p>
      ) : (
        <div className="mb-8 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {badges.map((b) => (
            <div
              key={b.id}
              className={`flex flex-col items-center rounded-xl border p-3 text-center transition ${
                b.earned
                  ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30"
                  : "border-border bg-white opacity-40 dark:bg-gray-900"
              }`}
              title={b.description}
            >
              <div className="text-2xl">{b.icon || "🏅"}</div>
              <div className="mt-1 text-xs font-bold leading-tight">{b.name}</div>
              <div className="mt-0.5 text-[10px] text-muted leading-tight">
                {b.description}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 履歴 */}
      <h2 className="mb-3 text-sm font-bold text-muted">取引履歴</h2>
      {historyLoading ? (
        <p className="text-center text-sm text-muted">読み込み中...</p>
      ) : transactions.length === 0 ? (
        <p className="text-center text-sm text-muted">まだ履歴はありません</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-white dark:bg-gray-900">
          {transactions.map((tx) => (
            <li key={tx.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <p className="font-medium">{TYPE_LABELS[tx.type] || tx.type}</p>
                <p className="text-xs text-muted">
                  {new Date(tx.created_at).toLocaleString("ja-JP")}
                </p>
              </div>
              <span
                className={`font-bold ${tx.amount >= 0 ? "text-emerald-600" : "text-rose-600"}`}
              >
                {tx.amount >= 0 ? "+" : ""}
                {tx.amount} pt
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
