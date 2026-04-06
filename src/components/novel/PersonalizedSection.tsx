"use client";

import { useState, useEffect } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import type { Novel } from "@/types/novel";
import { getPersonalizedRecommendations } from "@/lib/recommendations";
import { getAllReadingHistory } from "@/lib/reading-history";
import { getTasteProfile } from "@/lib/taste-profile";
import GenreBadge from "@/components/common/GenreBadge";

type Props = {
  allNovels: Novel[];
};

export default function PersonalizedSection({ allNovels }: Props) {
  const t = useTranslations("home");
  const [recommendations, setRecommendations] = useState<Novel[]>([]);

  useEffect(() => {
    const history = getAllReadingHistory();

    if (history.length > 0) {
      // 読書履歴ベースのレコメンド
      const entries = history.map((h) => ({
        novelId: h.novelId,
        lastEpisode: h.lastEpisode,
        lastReadAt: h.updatedAt,
      }));
      const recs = getPersonalizedRecommendations(allNovels, entries, 6);
      setRecommendations(recs);
    } else {
      // テイストプロファイルベース（オンボーディングで選んだジャンル）
      const profile = getTasteProfile();
      if (profile && profile.preferredGenres.length > 0) {
        const filtered = allNovels.filter((n) =>
          profile.preferredGenres.includes(n.genre)
        );
        setRecommendations(filtered.slice(0, 6));
      }
    }
  }, [allNovels]);

  if (recommendations.length === 0) return null;

  return (
    <section className="mb-8">
      <h2 className="mb-3 text-lg font-bold text-text">{t("forYou")}</h2>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {recommendations.map((novel) => (
          <Link
            key={novel.id}
            href={`/novels/${novel.slug}`}
            className="flex w-32 flex-shrink-0 flex-col gap-1.5 rounded-lg border border-border p-2 transition hover:border-secondary hover:bg-surface"
          >
            <div className="mx-auto h-36 w-24 rounded bg-surface flex items-center justify-center overflow-hidden">
              {novel.cover_image_url ? (
                <img src={novel.cover_image_url} alt={novel.title} className="h-full w-full object-cover" />
              ) : (
                <span className="text-2xl text-muted">📖</span>
              )}
            </div>
            <h3 className="text-center text-xs font-medium leading-tight line-clamp-2">{novel.title}</h3>
            <div className="flex justify-center">
              <GenreBadge genre={novel.genre} />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
