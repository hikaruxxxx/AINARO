"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import type { Novel, Episode } from "@/types/novel";
import { useReadingTracker } from "@/hooks/useReadingTracker";
import { markEpisodeRead } from "@/lib/reading-history";

type Props = {
  novel: Pick<Novel, "id" | "slug" | "title" | "total_chapters">;
  currentEpisode: Episode;
  nextEpisode: Episode | null;
  currentNum: number;
};

export default function EpisodeReader({ novel, currentEpisode, nextEpisode, currentNum }: Props) {
  const router = useRouter();
  const [showUI, setShowUI] = useState(true);
  const [nextLoading, setNextLoading] = useState(false);
  const nextTriggerRef = useRef<HTMLDivElement>(null);
  const lastTapTime = useRef(0);

  // 読書行動トラッキング
  const { trackNext } = useReadingTracker({
    novelId: novel.id,
    episodeId: currentEpisode.id,
  });

  // ローカル読書履歴に記録
  useEffect(() => {
    markEpisodeRead(novel.id, currentNum);
  }, [novel.id, currentNum]);

  const hasPrev = currentNum > 1;
  const hasNext = currentNum < novel.total_chapters;

  // 画面タップでUI表示/非表示トグル
  const handleTap = useCallback(() => {
    const now = Date.now();
    // ダブルタップ防止
    if (now - lastTapTime.current < 300) return;
    lastTapTime.current = now;
    setShowUI((prev) => !prev);
  }, []);

  // 次のエピソードへの自動遷移（IntersectionObserver）
  useEffect(() => {
    if (!nextTriggerRef.current || !hasNext) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !nextLoading) {
          setNextLoading(true);
          trackNext();
          router.push(`/novels/${novel.slug}/${currentNum + 1}`);
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(nextTriggerRef.current);
    return () => observer.disconnect();
  }, [hasNext, nextLoading, router, novel.slug, currentNum]);

  const paragraphs = currentEpisode.body_md.split(/\n\n+/).filter(Boolean);

  return (
    <div className="relative min-h-[100dvh]" onClick={handleTap}>
      {/* フローティングUI（タップで表示/非表示） */}
      <div
        className={`fixed top-0 left-0 right-0 z-40 bg-bg/90 backdrop-blur border-b border-border transition-all duration-300 ${
          showUI ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0"
        }`}
      >
        <div className="mx-auto flex h-11 max-w-3xl items-center justify-between px-4">
          <Link
            href={`/novels/${novel.slug}`}
            className="text-sm text-secondary"
            onClick={(e) => e.stopPropagation()}
          >
            ← 目次
          </Link>
          <div className="flex-1 text-center">
            <p className="truncate text-xs text-muted">{novel.title}</p>
            <p className="truncate text-sm font-medium">第{currentNum}話 {currentEpisode.title}</p>
          </div>
          <span className="text-xs text-muted w-10 text-right">
            {currentNum}/{novel.total_chapters}
          </span>
        </div>
      </div>

      {/* 本文エリア */}
      <article className="novel-body px-5 pt-16 pb-24">
        {/* エピソードタイトル */}
        <header className="mb-8 border-b border-border pb-4 text-center">
          <p className="text-xs text-muted">第{currentNum}話</p>
          <h1 className="mt-1 text-xl font-bold">{currentEpisode.title}</h1>
        </header>

        {/* 本文 */}
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </article>

      {/* エピソード間ナビゲーション */}
      <div className="border-t border-border px-5 py-8">
        <div className="mx-auto max-w-md flex flex-col items-center gap-4">
          {hasNext ? (
            <>
              <Link
                href={`/novels/${novel.slug}/${currentNum + 1}`}
                className="w-full rounded-xl bg-secondary py-4 text-center text-lg font-bold text-white shadow-md transition active:scale-95"
                onClick={(e) => {
                  e.stopPropagation();
                  trackNext();
                }}
              >
                次の話を読む →
              </Link>

              {/* 次話のプレビュー（あれば） */}
              {nextEpisode && (
                <p className="text-sm text-muted">
                  第{currentNum + 1}話「{nextEpisode.title}」
                </p>
              )}
            </>
          ) : (
            <div className="text-center">
              <p className="mb-2 text-lg font-bold">最新話です</p>
              <p className="text-sm text-muted">次の更新をお楽しみに！</p>
            </div>
          )}

          <div className="flex gap-4">
            {hasPrev && (
              <Link
                href={`/novels/${novel.slug}/${currentNum - 1}`}
                className="text-sm text-muted hover:text-text transition"
                onClick={(e) => e.stopPropagation()}
              >
                ← 前の話
              </Link>
            )}
            <Link
              href={`/novels/${novel.slug}`}
              className="text-sm text-muted hover:text-text transition"
              onClick={(e) => e.stopPropagation()}
            >
              目次に戻る
            </Link>
          </div>
        </div>
      </div>

      {/* 次話自動遷移トリガー（スクロール末端） */}
      {hasNext && (
        <div ref={nextTriggerRef} className="flex items-center justify-center py-12">
          {nextLoading ? (
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-secondary border-t-transparent" />
          ) : (
            <p className="text-xs text-muted">↓ スクロールで次の話へ</p>
          )}
        </div>
      )}

      {/* ボトムUI（タップで表示） */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-40 bg-bg/90 backdrop-blur border-t border-border transition-all duration-300 ${
          showUI ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
        }`}
      >
        <div className="mx-auto flex h-12 max-w-3xl items-center justify-between px-4">
          {hasPrev ? (
            <Link
              href={`/novels/${novel.slug}/${currentNum - 1}`}
              className="rounded-lg border border-border px-4 py-1.5 text-sm transition active:bg-surface"
              onClick={(e) => e.stopPropagation()}
            >
              ← 前
            </Link>
          ) : (
            <div />
          )}

          <span className="text-xs text-muted">
            {currentEpisode.character_count.toLocaleString()}字
          </span>

          {hasNext ? (
            <Link
              href={`/novels/${novel.slug}/${currentNum + 1}`}
              className="rounded-lg bg-secondary px-4 py-1.5 text-sm font-medium text-white transition active:opacity-90"
              onClick={(e) => {
                e.stopPropagation();
                trackNext();
              }}
            >
              次 →
            </Link>
          ) : (
            <div />
          )}
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>
    </div>
  );
}
