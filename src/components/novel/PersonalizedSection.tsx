"use client";

import { useState, useEffect } from "react";
import { Link } from "@/i18n/navigation";
import type { Novel } from "@/types/novel";
import { getPersonalizedRecommendations } from "@/lib/recommendations";
import GenreBadge from "@/components/common/GenreBadge";

type Props = {
  allNovels: Novel[];
};

type ReadingHistoryEntry = {
  novelId: string;
  lastEpisode: number;
  lastReadAt: string;
};

export default function PersonalizedSection({ allNovels }: Props) {
  const [recommendations, setRecommendations] = useState<Novel[]>([]);

  useEffect(() => {
    // localStorageから読書履歴を取得
    try {
      const raw = localStorage.getItem("ainaro_reading_history");
      if (!raw) return;
      const history: Record<string, { lastEpisode: number; updatedAt: string }> = JSON.parse(raw);
      const entries: ReadingHistoryEntry[] = Object.entries(history).map(([novelId, data]) => ({
        novelId,
        lastEpisode: data.lastEpisode,
        lastReadAt: data.updatedAt,
      }));
      if (entries.length === 0) return;

      const recs = getPersonalizedRecommendations(allNovels, entries, 4);
      setRecommendations(recs);
    } catch {
      // localStorageの読み取りに失敗した場合は何もしない
    }
  }, [allNovels]);

  if (recommendations.length === 0) return null;

  return (
    <section className="mb-8">
      <h2 className="mb-4 text-lg font-bold text-text">あなたへのおすすめ</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {recommendations.map((novel) => (
          <Link
            key={novel.id}
            href={`/novels/${novel.slug}`}
            className="flex flex-col gap-2 rounded-lg border border-border p-3 transition hover:bg-surface"
          >
            <div className="mx-auto h-28 w-20 rounded bg-surface flex items-center justify-center overflow-hidden">
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
