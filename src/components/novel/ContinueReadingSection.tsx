"use client";

// ホームページ用「続きを読む」セクション
// Netflixの「視聴中」に相当。リテンションの最重要UI要素。
// 読書履歴からまだ完走していない作品を表示し、ワンタップで続きへ遷移。

import { useState, useEffect } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { getAllReadingHistory, type ReadingHistoryEntry } from "@/lib/reading-history";

export default function ContinueReadingSection() {
  const t = useTranslations("home");
  const [entries, setEntries] = useState<ReadingHistoryEntry[]>([]);

  useEffect(() => {
    const history = getAllReadingHistory();
    // まだ完走していない作品のみ表示（slugがある＝メタデータあり）
    const unfinished = history.filter(
      (e) => e.slug && e.lastEpisode < e.totalChapters
    );
    // 最新から5件
    setEntries(unfinished.slice(0, 5));
  }, []);

  if (entries.length === 0) return null;

  return (
    <section className="mb-8">
      <h2 className="mb-3 text-lg font-bold text-text">{t("continueReading")}</h2>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {entries.map((entry) => {
          const nextEp = entry.lastEpisode + 1;
          const progress = entry.totalChapters > 0
            ? Math.round((entry.lastEpisode / entry.totalChapters) * 100)
            : 0;

          return (
            <Link
              key={entry.novelId}
              href={`/novels/${entry.slug}/${nextEp}`}
              className="group relative flex w-32 flex-shrink-0 flex-col gap-1.5 rounded-lg border border-border p-2 transition hover:border-secondary hover:bg-surface"
            >
              {/* カバー画像 */}
              <div className="mx-auto h-36 w-24 rounded bg-surface flex items-center justify-center overflow-hidden">
                {entry.coverImageUrl ? (
                  <img
                    src={entry.coverImageUrl}
                    alt={entry.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-2xl text-muted">📖</span>
                )}
              </div>

              {/* タイトル */}
              <h3 className="text-center text-xs font-medium leading-tight line-clamp-2">
                {entry.title}
              </h3>

              {/* 進捗バー */}
              <div className="mt-auto">
                <div className="h-1 w-full rounded-full bg-border">
                  <div
                    className="h-1 rounded-full bg-secondary transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="mt-1 text-center text-[10px] text-muted">
                  {t("continueFromEp", { ep: nextEp })}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
