"use client";

import { useState, useEffect, useCallback } from "react";

type PointsState = {
  balance: number;
  authenticated: boolean;
  loading: boolean;
  currentStreak: number;
  longestStreak: number;
};

export type LoginBonusResult = {
  balance: number;
  bonus: number;
  current_streak: number;
  longest_streak: number;
  already_claimed: boolean;
};

// ポイント残高管理フック
export function usePoints() {
  const [state, setState] = useState<PointsState>({
    balance: 0,
    authenticated: false,
    loading: true,
    currentStreak: 0,
    longestStreak: 0,
  });

  // 残高取得
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/points");
      if (res.ok) {
        const data = await res.json();
        setState({
          balance: data.balance ?? 0,
          authenticated: data.authenticated ?? false,
          loading: false,
          currentStreak: data.current_streak ?? 0,
          longestStreak: data.longest_streak ?? 0,
        });
      }
    } catch {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ログインボーナス受け取り
  const claimLoginBonus = useCallback(async (): Promise<LoginBonusResult | null> => {
    const res = await fetch("/api/points/login-bonus", { method: "POST" });
    if (res.ok) {
      const data: LoginBonusResult = await res.json();
      setState((prev) => ({
        ...prev,
        balance: data.balance,
        currentStreak: data.current_streak,
        longestStreak: data.longest_streak,
      }));
      return data;
    }
    return null;
  }, []);

  // エピソード読了ポイント獲得
  const earnFromComplete = useCallback(async (episodeId: string) => {
    const res = await fetch("/api/points/earn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "episode_complete", reference_id: episodeId }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.earned > 0) {
        setState((prev) => ({ ...prev, balance: data.balance }));
      }
      return data.earned as number;
    }
    return 0;
  }, []);

  // エピソード解放
  const unlockEpisode = useCallback(async (episodeId: string) => {
    const res = await fetch("/api/episodes/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ episode_id: episodeId }),
    });
    const data = await res.json();
    if (res.ok && data.unlocked) {
      setState((prev) => ({ ...prev, balance: data.balance }));
      return { success: true as const };
    }
    return { success: false as const, error: data.error as string };
  }, []);

  return {
    ...state,
    refresh,
    claimLoginBonus,
    earnFromComplete,
    unlockEpisode,
  };
}
