"use client";

import { useEffect, useRef, useCallback } from "react";
import { trackReadingEvent, getScrollDepth } from "@/lib/tracking";

type Params = {
  novelId: string;
  episodeId: string;
};

// 読書行動トラッキングフック
// start / progress(30秒ごと) / complete / drop を自動送信
export function useReadingTracker({ novelId, episodeId }: Params) {
  const startTime = useRef(Date.now());
  const hasCompleted = useRef(false);
  const hasSentStart = useRef(false);
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // 経過秒数
  const getElapsedSec = useCallback(() => {
    return Math.round((Date.now() - startTime.current) / 1000);
  }, []);

  // start イベント（ページ表示時に1回）
  useEffect(() => {
    if (hasSentStart.current) return;
    hasSentStart.current = true;

    trackReadingEvent({
      novelId,
      episodeId,
      eventType: "start",
      scrollDepth: 0,
      readingTimeSec: 0,
    });
  }, [novelId, episodeId]);

  // progress イベント（30秒ごと）
  useEffect(() => {
    progressInterval.current = setInterval(() => {
      if (hasCompleted.current) return;

      trackReadingEvent({
        novelId,
        episodeId,
        eventType: "progress",
        scrollDepth: getScrollDepth(),
        readingTimeSec: getElapsedSec(),
      });
    }, 30_000);

    return () => {
      if (progressInterval.current) clearInterval(progressInterval.current);
    };
  }, [novelId, episodeId, getElapsedSec]);

  // complete イベント（末尾到達を検知）
  useEffect(() => {
    const handleScroll = () => {
      if (hasCompleted.current) return;
      const depth = getScrollDepth();
      // 95%以上到達で読了とみなす
      if (depth >= 0.95) {
        hasCompleted.current = true;
        trackReadingEvent({
          novelId,
          episodeId,
          eventType: "complete",
          scrollDepth: 1.0,
          readingTimeSec: getElapsedSec(),
        });
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [novelId, episodeId, getElapsedSec]);

  // drop イベント（ページ離脱時、未読了なら送信）
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (hasCompleted.current) return;

      // sendBeacon で確実に送信（navigator.sendBeacon は Supabase クライアント非対応のため、
      // 離脱時は同期的に trackReadingEvent を呼ぶ。ブラウザが送信を保証しない可能性あり）
      trackReadingEvent({
        novelId,
        episodeId,
        eventType: "drop",
        scrollDepth: getScrollDepth(),
        readingTimeSec: getElapsedSec(),
      });
    };

    // visibilitychange の方が beforeunload より信頼性が高い（モバイル対応）
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && !hasCompleted.current) {
        trackReadingEvent({
          novelId,
          episodeId,
          eventType: "drop",
          scrollDepth: getScrollDepth(),
          readingTimeSec: getElapsedSec(),
        });
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [novelId, episodeId, getElapsedSec]);

  // next イベント（呼び出し側が次話遷移時に実行）
  const trackNext = useCallback(() => {
    trackReadingEvent({
      novelId,
      episodeId,
      eventType: "next",
      scrollDepth: getScrollDepth(),
      readingTimeSec: getElapsedSec(),
    });
  }, [novelId, episodeId, getElapsedSec]);

  return { trackNext };
}
