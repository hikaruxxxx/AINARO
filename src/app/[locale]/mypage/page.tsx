"use client";

import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useEffect, useState } from "react";
import { getAllReadingHistory } from "@/lib/reading-history";
import { formatRelativeTime } from "@/lib/utils/format";

type NovelInfo = {
  id: string;
  slug: string;
  title: string;
  cover_image_url: string | null;
  total_chapters: number;
  latest_chapter_at: string | null;
};

type HistoryEntry = {
  novel: NovelInfo;
  lastReadEpisode: number;
  hasUnread: boolean;
};

export default function MyPage() {
  const t = useTranslations("mypage");
  const locale = useLocale();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadHistory() {
      const readHistory = getAllReadingHistory();
      const novelIds = Object.keys(readHistory);

      if (novelIds.length === 0) {
        setLoading(false);
        return;
      }

      const res = await fetch("/api/novels/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: novelIds }),
      });
      const { novels } = await res.json() as { novels: NovelInfo[] };

      const entries: HistoryEntry[] = [];
      for (const novel of novels) {
        const lastRead = readHistory[novel.id];
        entries.push({
          novel,
          lastReadEpisode: lastRead,
          hasUnread: lastRead < novel.total_chapters,
        });
      }

      entries.sort((a, b) => {
        if (a.hasUnread !== b.hasUnread) return a.hasUnread ? -1 : 1;
        return 0;
      });

      setHistory(entries);
      setLoading(false);
    }

    loadHistory();
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text">{t("title")}</h1>
      </div>

      <section>
        <h2 className="mb-4 text-lg font-bold">{t("readingHistory")}</h2>

        {loading ? (
          <p className="py-8 text-center text-muted">{t("loading")}</p>
        ) : history.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-8 text-center">
            <p className="text-muted">{t("noHistory")}</p>
            <Link href="/novels" className="mt-3 inline-block text-sm text-secondary hover:underline">
              {t("findNovels")}
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {history.map(({ novel, lastReadEpisode, hasUnread }) => (
              <li key={novel.id}>
                <div className="flex gap-4 py-4">
                  <Link href={`/novels/${novel.slug}`} className="h-20 w-14 flex-shrink-0 rounded-md bg-surface flex items-center justify-center overflow-hidden">
                    {novel.cover_image_url ? (
                      <img src={novel.cover_image_url} alt={novel.title} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xl text-muted">📖</span>
                    )}
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Link href={`/novels/${novel.slug}`} className="truncate font-bold text-text hover:text-secondary transition">
                      {novel.title}
                    </Link>
                    <p className="text-xs text-muted">
                      {t("readUpTo", { ep: lastReadEpisode, total: novel.total_chapters })}
                    </p>
                    {novel.latest_chapter_at && (
                      <p className="text-xs text-muted">
                        {t("lastUpdated", { time: formatRelativeTime(novel.latest_chapter_at, locale) })}
                      </p>
                    )}
                    <div className="mt-1 flex gap-2">
                      {hasUnread ? (
                        <Link
                          href={`/novels/${novel.slug}/${lastReadEpisode + 1}`}
                          className="rounded-full bg-secondary px-4 py-1 text-xs font-medium text-white transition hover:opacity-90"
                        >
                          {t("readFromEp", { ep: lastReadEpisode + 1 })}
                        </Link>
                      ) : (
                        <span className="rounded-full bg-surface px-4 py-1 text-xs text-muted">
                          {t("caughtUp")}
                        </span>
                      )}
                      {hasUnread && (
                        <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-600">
                          {t("unread", { count: novel.total_chapters - lastReadEpisode })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
