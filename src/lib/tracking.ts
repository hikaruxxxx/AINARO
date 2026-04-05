"use client";

import { createClient } from "@/lib/supabase/client";
import type { ReadingEventType } from "@/types/novel";

// セッションID管理（未ログインユーザーも追跡）
const SESSION_KEY = "ainaro_session_id";

function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function getSessionId(): string {
  if (typeof window === "undefined") return "";

  let sessionId = sessionStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = generateSessionId();
    sessionStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
}

// reading_events へ INSERT
export async function trackReadingEvent(params: {
  novelId: string;
  episodeId: string;
  eventType: ReadingEventType;
  scrollDepth?: number;
  readingTimeSec?: number;
}) {
  const supabase = createClient();
  const sessionId = getSessionId();
  if (!sessionId) return; // SSR時は何もしない

  // 認証ユーザーのIDを取得（未ログインならnull）
  const { data: { user } } = await supabase.auth.getUser();

  await supabase.from("reading_events").insert({
    user_id: user?.id ?? null,
    session_id: sessionId,
    novel_id: params.novelId,
    episode_id: params.episodeId,
    event_type: params.eventType,
    scroll_depth: params.scrollDepth ?? null,
    reading_time_sec: params.readingTimeSec ?? null,
  });
}

// スクロール深度を計算（0.0-1.0）
export function getScrollDepth(): number {
  const scrollTop = window.scrollY;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  if (docHeight <= 0) return 1;
  return Math.min(1, Math.max(0, scrollTop / docHeight));
}
