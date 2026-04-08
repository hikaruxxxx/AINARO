"use client";

import { usePoints } from "@/hooks/usePoints";
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";

// ヘッダーやマイページに表示するポイント残高バッジ
export default function PointsBadge() {
  const { balance, authenticated, loading, currentStreak, claimLoginBonus } = usePoints();
  const [bonus, setBonus] = useState<number | null>(null);
  const [streakOnClaim, setStreakOnClaim] = useState<number | null>(null);

  // ページ表示時にログインボーナスを自動受け取り
  useEffect(() => {
    if (!authenticated || loading) return;

    claimLoginBonus().then((result) => {
      if (result && result.bonus > 0) {
        setBonus(result.bonus);
        setStreakOnClaim(result.current_streak);
        // 4秒後に通知を消す
        setTimeout(() => {
          setBonus(null);
          setStreakOnClaim(null);
        }, 4000);
      }
    });
  }, [authenticated, loading, claimLoginBonus]);

  if (!authenticated || loading) return null;
  // 残高0かつログインボーナス通知もないときは非表示
  // （初めてポイントを得たタイミングで初登場し、何のための数字か文脈が生まれる）
  if (balance === 0 && bonus === null) return null;

  return (
    <div className="relative flex items-center gap-2">
      <Link
        href="/points"
        className="flex items-center gap-1 rounded-full bg-secondary/10 px-3 py-1 text-sm transition hover:bg-secondary/20"
        aria-label="ポイント詳細"
      >
        <span className="text-secondary font-bold">{balance}</span>
        <span className="text-xs opacity-60">pt</span>
      </Link>

      {/* ストリーク表示 (1日以上連続なら常時表示) */}
      {currentStreak > 0 && (
        <Link
          href="/points"
          className="flex items-center gap-0.5 rounded-full bg-orange-500/10 px-2 py-1 text-xs transition hover:bg-orange-500/20"
          aria-label={`連続ログイン ${currentStreak}日`}
        >
          <span>🔥</span>
          <span className="font-bold text-orange-600">{currentStreak}</span>
        </Link>
      )}

      {/* ログインボーナス通知 */}
      {bonus !== null && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap animate-bounce rounded-full bg-secondary px-3 py-1 text-xs text-white shadow-lg">
          +{bonus}pt {streakOnClaim && streakOnClaim > 1 ? `🔥${streakOnClaim}日連続!` : "ログインボーナス!"}
        </div>
      )}
    </div>
  );
}
