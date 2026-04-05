"use client";

import { useState, useEffect, useCallback } from "react";
import { usePoints } from "@/hooks/usePoints";

type Props = {
  episodeId: string;
  episodeNumber: number;
  unlockAt: string;    // ISO8601
  unlockPrice: number; // ポイント数
  onUnlocked: () => void;
};

// ロックされたエピソードのオーバーレイ
// カウントダウンタイマー + ポイント解放ボタンを表示
export default function EpisodeLockOverlay({
  episodeId,
  episodeNumber,
  unlockAt,
  unlockPrice,
  onUnlocked,
}: Props) {
  const { balance, authenticated, unlockEpisode } = usePoints();
  const [countdown, setCountdown] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState("");

  // カウントダウン更新
  useEffect(() => {
    const update = () => {
      const now = Date.now();
      const target = new Date(unlockAt).getTime();
      const diff = target - now;

      if (diff <= 0) {
        setCountdown("");
        onUnlocked();
        return;
      }

      const hours = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);

      if (hours > 0) {
        setCountdown(`${hours}時間${mins}分${secs}秒`);
      } else if (mins > 0) {
        setCountdown(`${mins}分${secs}秒`);
      } else {
        setCountdown(`${secs}秒`);
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [unlockAt, onUnlocked]);

  const handleUnlock = useCallback(async () => {
    setUnlocking(true);
    setError("");
    const result = await unlockEpisode(episodeId);
    if (result.success) {
      onUnlocked();
    } else {
      setError(result.error);
    }
    setUnlocking(false);
  }, [episodeId, unlockEpisode, onUnlocked]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <div className="mb-6">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary/10">
          <svg className="h-8 w-8 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold mb-2">
          第{episodeNumber}話はまだ公開されていません
        </h2>
      </div>

      {/* カウントダウン */}
      {countdown && (
        <div className="mb-6">
          <p className="text-sm opacity-60 mb-1">無料公開まで</p>
          <p className="text-3xl font-mono font-bold text-secondary">{countdown}</p>
        </div>
      )}

      {/* ポイント解放 */}
      {unlockPrice > 0 && (
        <div className="w-full max-w-xs">
          <div className="mb-3 rounded-xl border border-secondary/20 bg-secondary/5 p-4">
            <p className="text-sm mb-2">
              <span className="font-bold text-secondary">{unlockPrice}ポイント</span>で今すぐ読む
            </p>
            {authenticated ? (
              <>
                <p className="text-xs opacity-60 mb-3">
                  現在の残高: {balance}ポイント
                </p>
                <button
                  onClick={handleUnlock}
                  disabled={unlocking || balance < unlockPrice}
                  className="w-full rounded-lg bg-secondary py-3 text-white font-bold transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {unlocking
                    ? "解放中..."
                    : balance < unlockPrice
                      ? `あと${unlockPrice - balance}ポイント不足`
                      : `${unlockPrice}ポイントで解放する`}
                </button>
              </>
            ) : (
              <p className="text-xs opacity-60">
                ログインするとポイントで先読みできます
              </p>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-500 mt-2">{error}</p>
          )}

          <p className="text-xs opacity-40 mt-4">
            ポイントはログインボーナスやエピソード読了で獲得できます
          </p>
        </div>
      )}
    </div>
  );
}
