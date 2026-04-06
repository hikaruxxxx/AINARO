"use client";

import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import type { Novel, Episode } from "@/types/novel";
import { useReadingTracker } from "@/hooks/useReadingTracker";
import { useABTest } from "@/hooks/useABTest";
import { usePoints } from "@/hooks/usePoints";
import { markEpisodeRead } from "@/lib/reading-history";
import EpisodeLockOverlay from "./EpisodeLockOverlay";
import LikeButton from "./LikeButton";
import ShareButton from "./ShareButton";
import EpisodeComments from "./EpisodeComments";
import {
  getReadingSettings,
  saveReadingSettings,
  THEME_STYLES,
  FONT_SIZES,
  type ReadingSettings,
  type ReadingTheme,
} from "@/lib/reading-settings";

type Props = {
  novel: Pick<Novel, "id" | "slug" | "title" | "total_chapters" | "genre" | "cover_image_url">;
  currentEpisode: Episode;
  nextEpisode: Episode | null;
  currentNum: number;
  episodes?: { episode_number: number; title: string }[];
};

export default function EpisodeReader({ novel, currentEpisode, nextEpisode, currentNum, episodes }: Props) {
  const t = useTranslations("episode");
  const router = useRouter();
  const [showUI, setShowUI] = useState(true);
  const [nextLoading, setNextLoading] = useState(false);
  const [showToc, setShowToc] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<ReadingSettings>({ fontSize: 16, theme: "light" });
  const nextTriggerRef = useRef<HTMLDivElement>(null);
  const lastTapTime = useRef(0);

  // エピソードロック判定
  const isLocked = currentEpisode.unlock_at
    ? new Date(currentEpisode.unlock_at) > new Date()
    : false;
  const [unlocked, setUnlocked] = useState(!isLocked);

  // A/Bテストのバリアント取得
  const abTest = useABTest(currentEpisode.id);

  // 読了ポイント獲得
  const { earnFromComplete } = usePoints();

  // 読書行動トラッキング（A/BテストのバリアントIDを含む）
  const { trackNext } = useReadingTracker({
    novelId: novel.id,
    episodeId: currentEpisode.id,
    variantId: abTest.variantId ?? undefined,
  });

  // ローカル読書履歴に記録
  useEffect(() => {
    markEpisodeRead(novel.id, currentNum, {
      slug: novel.slug,
      title: novel.title,
      genre: novel.genre,
      coverImageUrl: novel.cover_image_url,
      totalChapters: novel.total_chapters,
    });
  }, [novel.id, currentNum]);

  // 読書設定を読み込み
  useEffect(() => {
    setSettings(getReadingSettings());
  }, []);

  // 読了時にポイント獲得（1回だけ）
  const hasEarnedRef = useRef(false);
  useEffect(() => {
    if (!unlocked) return;
    const handleScroll = () => {
      if (hasEarnedRef.current) return;
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight > 0 && scrollTop / docHeight >= 0.95) {
        hasEarnedRef.current = true;
        earnFromComplete(currentEpisode.id);
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [unlocked, currentEpisode.id, earnFromComplete]);

  const hasPrev = currentNum > 1;
  const hasNext = currentNum < novel.total_chapters;

  const theme = THEME_STYLES[settings.theme];

  // 設定変更
  const updateSettings = useCallback((patch: Partial<ReadingSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveReadingSettings(next);
      return next;
    });
  }, []);

  // 画面タップでUI表示/非表示トグル
  const handleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapTime.current < 300) return;
    lastTapTime.current = now;
    setShowUI((prev) => !prev);
    setShowSettings(false);
    setShowToc(false);
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
  }, [hasNext, nextLoading, router, novel.slug, currentNum, trackNext]);

  // 表示する本文を決定（A/Bテスト時はバリアント本文を使用）
  const displayBodyMd = abTest.bodyMd ?? currentEpisode.body_md;
  const paragraphs = displayBodyMd.split(/\n\n+/).filter(Boolean);

  // ロック中はロック画面を表示
  if (!unlocked) {
    return (
      <div className={`relative min-h-[100dvh] ${theme.bg} ${theme.text}`}>
        <EpisodeLockOverlay
          episodeId={currentEpisode.id}
          episodeNumber={currentNum}
          unlockAt={currentEpisode.unlock_at!}
          unlockPrice={currentEpisode.unlock_price}
          onUnlocked={() => setUnlocked(true)}
        />
      </div>
    );
  }

  return (
    <div className={`relative min-h-[100dvh] ${theme.bg} ${theme.text}`} onClick={handleTap}>
      {/* フローティングUI */}
      <div
        className={`fixed top-0 left-0 right-0 z-40 ${theme.bg} backdrop-blur border-b border-border/30 transition-all duration-300 ${
          showUI ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0"
        }`}
      >
        <div className="mx-auto flex h-11 max-w-3xl items-center justify-between px-4">
          <Link
            href={`/novels/${novel.slug}`}
            className="text-sm text-secondary"
            onClick={(e) => e.stopPropagation()}
          >
            {t("backToToc")}
          </Link>
          <div className="flex-1 text-center">
            <p className="truncate text-xs opacity-50">{novel.title}</p>
            <p className="truncate text-sm font-medium">{t("epTitle", { num: currentNum, title: currentEpisode.title })}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* 目次ボタン */}
            {episodes && episodes.length > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowToc(!showToc);
                  setShowSettings(false);
                }}
                className="rounded p-1 text-xs opacity-60 hover:opacity-100"
                aria-label="目次を開く"
              >
                ☰
              </button>
            )}
            {/* 設定ボタン */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowSettings(!showSettings);
                setShowToc(false);
              }}
              className="rounded p-1 text-xs opacity-60 hover:opacity-100"
              aria-label="読書設定"
            >
              Aa
            </button>
          </div>
        </div>
      </div>

      {/* 目次ドロワー */}
      {showToc && episodes && (
        <div
          className={`fixed top-11 right-0 z-50 h-[80vh] w-72 overflow-y-auto border-l border-border/30 ${theme.bg} shadow-lg`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-4">
            <h3 className="mb-3 text-sm font-bold">{t("backToTocLink")}</h3>
            <ul className="space-y-1">
              {episodes.map((ep) => (
                <li key={ep.episode_number}>
                  <Link
                    href={`/novels/${novel.slug}/${ep.episode_number}`}
                    className={`block rounded px-2 py-1.5 text-sm transition hover:bg-black/5 ${
                      ep.episode_number === currentNum ? "font-bold bg-black/5" : "opacity-70"
                    }`}
                    onClick={() => setShowToc(false)}
                  >
                    {t("epTitle", { num: ep.episode_number, title: ep.title })}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* 読書設定パネル */}
      {showSettings && (
        <div
          className={`fixed top-11 right-0 z-50 w-64 border-l border-border/30 ${theme.bg} shadow-lg`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-4 space-y-4">
            <h3 className="text-sm font-bold">読書設定</h3>

            {/* フォントサイズ */}
            <div>
              <p className="mb-2 text-xs opacity-60">文字サイズ</p>
              <div className="flex gap-1">
                {FONT_SIZES.map((size) => (
                  <button
                    key={size}
                    onClick={() => updateSettings({ fontSize: size })}
                    className={`flex-1 rounded py-1.5 text-xs transition ${
                      settings.fontSize === size
                        ? "bg-secondary text-white"
                        : "bg-black/5 hover:bg-black/10"
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* テーマ */}
            <div>
              <p className="mb-2 text-xs opacity-60">テーマ</p>
              <div className="flex gap-2">
                {(Object.keys(THEME_STYLES) as ReadingTheme[]).map((key) => {
                  const ts = THEME_STYLES[key];
                  return (
                    <button
                      key={key}
                      onClick={() => updateSettings({ theme: key })}
                      className={`flex-1 rounded-lg border-2 py-2 text-center text-xs transition ${ts.bg} ${ts.text} ${
                        settings.theme === key ? "border-secondary" : "border-transparent"
                      }`}
                    >
                      {ts.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 本文エリア */}
      <article className="novel-body px-5 pt-16 pb-24" style={{ fontSize: `${settings.fontSize}px` }}>
        <header className="mb-8 border-b border-current/10 pb-4 text-center">
          <p className="text-xs opacity-50">{t("epNumber", { num: currentNum })}</p>
          <h1 className="mt-1 text-xl font-bold">{currentEpisode.title}</h1>
        </header>

        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </article>

      {/* いいね・シェアエリア */}
      <div className="border-t border-current/10 px-5 py-6" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto max-w-md flex flex-col items-center gap-4">
          <p className="text-xs opacity-40">この話はいかがでしたか？</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <LikeButton episodeId={currentEpisode.id} />
            <ShareButton
              title={`${novel.title} ${t("epTitle", { num: currentNum, title: currentEpisode.title })}`}
            />
          </div>
        </div>
      </div>

      {/* コメント */}
      <EpisodeComments episodeId={currentEpisode.id} novelId={novel.id} />

      {/* エピソード間ナビゲーション */}
      <div className="border-t border-current/10 px-5 py-8">
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
                {t("nextEpisode")}
              </Link>

              {nextEpisode && (
                <p className="text-sm opacity-50">
                  {t("nextPreview", { num: currentNum + 1, title: nextEpisode.title })}
                </p>
              )}
            </>
          ) : (
            <div className="text-center">
              <p className="mb-2 text-lg font-bold">{t("latestEpisode")}</p>
              <p className="text-sm opacity-50">{t("stayTuned")}</p>
            </div>
          )}

          <div className="flex gap-4">
            {hasPrev && (
              <Link
                href={`/novels/${novel.slug}/${currentNum - 1}`}
                className="text-sm opacity-50 hover:opacity-100 transition"
                onClick={(e) => e.stopPropagation()}
              >
                {t("prevEpisode")}
              </Link>
            )}
            <Link
              href={`/novels/${novel.slug}`}
              className="text-sm opacity-50 hover:opacity-100 transition"
              onClick={(e) => e.stopPropagation()}
            >
              {t("backToTocLink")}
            </Link>
          </div>
        </div>
      </div>

      {/* 次話自動遷移トリガー */}
      {hasNext && (
        <div ref={nextTriggerRef} className="flex items-center justify-center py-12">
          {nextLoading ? (
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-secondary border-t-transparent" />
          ) : (
            <p className="text-xs opacity-30">{t("scrollForNext")}</p>
          )}
        </div>
      )}

      {/* ボトムUI */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-40 ${theme.bg} backdrop-blur border-t border-border/30 transition-all duration-300 ${
          showUI ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
        }`}
      >
        <div className="mx-auto flex h-12 max-w-3xl items-center justify-between px-4">
          {hasPrev ? (
            <Link
              href={`/novels/${novel.slug}/${currentNum - 1}`}
              className="rounded-lg border border-current/20 px-4 py-1.5 text-sm transition active:bg-black/5"
              onClick={(e) => e.stopPropagation()}
            >
              {t("prev")}
            </Link>
          ) : (
            <div />
          )}

          <span className="text-xs opacity-50">
            {t("charCount", { count: currentEpisode.character_count.toLocaleString() })}
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
              {t("next")}
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
