"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getAllReadingHistory } from "@/lib/reading-history";
import { getBookmarkedNovelIds } from "@/lib/bookmarks";
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
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [bookmarks, setBookmarks] = useState<NovelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"history" | "bookmarks">("history");

  useEffect(() => {
    async function loadData() {
      const readHistory = getAllReadingHistory();
      const bookmarkIds = getBookmarkedNovelIds();
      const allIds = [...new Set([...Object.keys(readHistory), ...bookmarkIds])];

      if (allIds.length === 0) {
        setLoading(false);
        return;
      }

      // API経由で小説情報をバッチ取得
      const res = await fetch("/api/novels/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: allIds }),
      });
      const { novels } = await res.json() as { novels: NovelInfo[] };
      const novelMap = new Map(novels.map((n: NovelInfo) => [n.id, n]));

      // 読書履歴
      const entries: HistoryEntry[] = [];
      for (const [novelId, lastRead] of Object.entries(readHistory)) {
        const novel = novelMap.get(novelId);
        if (novel) {
          entries.push({
            novel,
            lastReadEpisode: lastRead,
            hasUnread: lastRead < novel.total_chapters,
          });
        }
      }
      entries.sort((a, b) => {
        if (a.hasUnread !== b.hasUnread) return a.hasUnread ? -1 : 1;
        return 0;
      });
      setHistory(entries);

      // ブックマーク
      const bms = bookmarkIds.map((id) => novelMap.get(id)).filter(Boolean) as NovelInfo[];
      setBookmarks(bms);

      setLoading(false);
    }

    loadData();
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text">マイページ</h1>
      </div>

      {/* タブ切り替え */}
      <div className="mb-6 flex gap-4 border-b border-border">
        <button
          onClick={() => setTab("history")}
          className={`pb-2 text-sm font-medium transition ${
            tab === "history" ? "border-b-2 border-secondary text-secondary" : "text-muted hover:text-text"
          }`}
        >
          読書履歴
        </button>
        <button
          onClick={() => setTab("bookmarks")}
          className={`pb-2 text-sm font-medium transition ${
            tab === "bookmarks" ? "border-b-2 border-secondary text-secondary" : "text-muted hover:text-text"
          }`}
        >
          ブックマーク ({bookmarks.length})
        </button>
      </div>

      {/* ブックマーク一覧 */}
      {tab === "bookmarks" && (
        <section>
          {loading ? (
            <p className="py-8 text-center text-muted">読み込み中...</p>
          ) : bookmarks.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface p-8 text-center">
              <p className="text-muted">ブックマークした作品はありません。</p>
              <p className="mt-2 text-xs text-muted">作品詳細ページの♡ボタンでブックマークできます。</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {bookmarks.map((novel) => (
                <li key={novel.id}>
                  <Link
                    href={`/novels/${novel.slug}`}
                    className="flex gap-4 py-4 transition hover:bg-surface"
                  >
                    <div className="h-20 w-14 flex-shrink-0 rounded-md bg-surface flex items-center justify-center overflow-hidden">
                      {novel.cover_image_url ? (
                        <img src={novel.cover_image_url} alt={novel.title} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-xl text-muted">📖</span>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <h3 className="truncate font-bold text-text">{novel.title}</h3>
                      <p className="text-xs text-muted">{novel.total_chapters}話</p>
                      {novel.latest_chapter_at && (
                        <p className="text-xs text-muted">最終更新 {formatRelativeTime(novel.latest_chapter_at)}</p>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* 読書履歴 */}
      {tab === "history" && (
      <section>
        {loading ? (
          <p className="py-8 text-center text-muted">読み込み中...</p>
        ) : history.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-8 text-center">
            <p className="text-muted">まだ読んだ作品がありません。</p>
            <Link href="/novels" className="mt-3 inline-block text-sm text-secondary hover:underline">
              作品を探す →
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {history.map(({ novel, lastReadEpisode, hasUnread }) => (
              <li key={novel.id}>
                <div className="flex gap-4 py-4">
                  {/* 表紙 */}
                  <Link href={`/novels/${novel.slug}`} className="h-20 w-14 flex-shrink-0 rounded-md bg-surface flex items-center justify-center overflow-hidden">
                    {novel.cover_image_url ? (
                      <img src={novel.cover_image_url} alt={novel.title} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xl text-muted">📖</span>
                    )}
                  </Link>

                  {/* 作品情報 */}
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Link href={`/novels/${novel.slug}`} className="truncate font-bold text-text hover:text-secondary transition">
                      {novel.title}
                    </Link>
                    <p className="text-xs text-muted">
                      第{lastReadEpisode}話まで読了 / 全{novel.total_chapters}話
                    </p>
                    {novel.latest_chapter_at && (
                      <p className="text-xs text-muted">
                        最終更新 {formatRelativeTime(novel.latest_chapter_at)}
                      </p>
                    )}

                    {/* アクションボタン */}
                    <div className="mt-1 flex gap-2">
                      {hasUnread ? (
                        <Link
                          href={`/novels/${novel.slug}/${lastReadEpisode + 1}`}
                          className="rounded-full bg-secondary px-4 py-1 text-xs font-medium text-white transition hover:opacity-90"
                        >
                          第{lastReadEpisode + 1}話から読む
                        </Link>
                      ) : (
                        <span className="rounded-full bg-surface px-4 py-1 text-xs text-muted">
                          最新話まで読了
                        </span>
                      )}
                      {hasUnread && (
                        <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-600">
                          未読 {novel.total_chapters - lastReadEpisode}話
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
      )}
    </div>
  );
}
