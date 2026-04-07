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

export default function PointsPage() {
  const { balance, authenticated, loading } = usePoints();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    if (!authenticated) return;
    fetch("/api/points/history?limit=50")
      .then((r) => r.json())
      .then((data) => {
        setTransactions(data.transactions || []);
        setHistoryLoading(false);
      })
      .catch(() => setHistoryLoading(false));
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

      {/* 残高カード */}
      <div className="mb-8 rounded-2xl bg-gradient-to-br from-indigo-50 to-purple-50 p-6 text-center dark:from-indigo-950/30 dark:to-purple-950/30">
        <p className="mb-1 text-xs text-muted">現在の残高</p>
        <p className="text-4xl font-extrabold text-indigo-600">
          {balance}
          <span className="ml-1 text-base font-bold opacity-60">pt</span>
        </p>
        <p className="mt-3 text-xs text-muted">
          毎日ログインでボーナス獲得 / 公開前のエピソードを先読み解放できます
        </p>
      </div>

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
