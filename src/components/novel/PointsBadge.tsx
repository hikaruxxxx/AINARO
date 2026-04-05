"use client";

import { usePoints } from "@/hooks/usePoints";
import { useEffect, useState } from "react";

// ヘッダーやマイページに表示するポイント残高バッジ
export default function PointsBadge() {
  const { balance, authenticated, loading, claimLoginBonus } = usePoints();
  const [bonus, setBonus] = useState<number | null>(null);

  // ページ表示時にログインボーナスを自動受け取り
  useEffect(() => {
    if (!authenticated || loading) return;

    claimLoginBonus().then((earned) => {
      if (earned > 0) {
        setBonus(earned);
        // 3秒後に通知を消す
        setTimeout(() => setBonus(null), 3000);
      }
    });
  }, [authenticated, loading, claimLoginBonus]);

  if (!authenticated || loading) return null;

  return (
    <div className="relative">
      <div className="flex items-center gap-1 rounded-full bg-secondary/10 px-3 py-1 text-sm">
        <span className="text-secondary font-bold">{balance}</span>
        <span className="text-xs opacity-60">pt</span>
      </div>

      {/* ログインボーナス通知 */}
      {bonus !== null && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap animate-bounce rounded-full bg-secondary px-3 py-1 text-xs text-white shadow-lg">
          +{bonus} ログインボーナス!
        </div>
      )}
    </div>
  );
}
