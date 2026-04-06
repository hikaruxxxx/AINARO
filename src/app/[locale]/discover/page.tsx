"use client";

// ディスカバーページ — TikTok的な縦スワイプで作品を発見
// BottomNavの「発見」タブからアクセス
// 作品のカバー・あらすじ・ジャンルを全画面カードで表示し、タップで詳細/第1話へ遷移

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import GenreBadge from "@/components/common/GenreBadge";
import QualityBadge from "@/components/novel/QualityBadge";

type DiscoverItem = {
  id: string;
  slug: string;
  title: string;
  tagline: string | null;
  synopsis: string | null;
  genre: string;
  cover_image_url: string | null;
  total_chapters: number;
  avg_completion_rate: number | null;
  avg_next_episode_rate: number | null;
};

export default function DiscoverPage() {
  const t = useTranslations("discover");
  const [items, setItems] = useState<DiscoverItem[]>([]);
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/discover")
      .then((res) => res.json())
      .then((data) => {
        setItems(data.novels || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollTop / el.clientHeight);
    setCurrent(idx);
  }, []);

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center text-white">
        <p className="text-sm text-white/60">{t("loading")}</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex h-dvh items-center justify-center text-white">
        <div className="text-center">
          <span className="mb-4 block text-5xl">📖</span>
          <Link href="/novels" className="text-sm text-white/60 underline">
            {t("browseAll")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="h-dvh snap-y snap-mandatory overflow-y-auto"
    >
      {items.map((item, idx) => (
        <div
          key={item.id}
          className="relative flex h-dvh snap-start flex-col items-center justify-end px-6 pb-24"
        >
          {/* 背景画像/グラデーション */}
          {item.cover_image_url ? (
            <img
              src={item.cover_image_url}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-b from-gray-800 to-black" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

          {/* コンテンツ */}
          <div className="relative z-10 w-full max-w-md space-y-3">
            <h2 className="text-2xl font-bold text-white">{item.title}</h2>
            {item.tagline && (
              <p className="text-sm text-white/80">{item.tagline}</p>
            )}
            {item.synopsis && (
              <p className="text-sm leading-relaxed text-white/70 line-clamp-3">
                {item.synopsis}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <GenreBadge genre={item.genre} />
              <span className="text-xs text-white/60">
                {item.total_chapters} {t("episodes")}
              </span>
              <QualityBadge
                completionRate={item.avg_completion_rate}
                nextEpisodeRate={item.avg_next_episode_rate}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Link
                href={`/novels/${item.slug}/1`}
                className="flex-1 rounded-lg bg-secondary py-3 text-center text-sm font-bold text-white transition hover:opacity-90"
              >
                {t("episode1")} {t("readNow")}
              </Link>
              <Link
                href={`/novels/${item.slug}`}
                className="rounded-lg border border-white/30 px-6 py-3 text-center text-sm text-white transition hover:bg-white/10"
              >
                {t("details")}
              </Link>
            </div>
          </div>

          {/* スワイプヒント（最初のカードのみ） */}
          {idx === 0 && current === 0 && (
            <p className="relative z-10 mt-4 animate-bounce text-xs text-white/40">
              {t("swipeHint")}
            </p>
          )}
        </div>
      ))}

      {/* フィード終端 */}
      <div className="flex h-dvh snap-start flex-col items-center justify-center gap-4">
        <p className="text-sm text-white/50">{t("endOfFeed")}</p>
        <Link
          href="/novels"
          className="text-sm text-secondary underline"
        >
          {t("browseAll")}
        </Link>
      </div>
    </div>
  );
}
