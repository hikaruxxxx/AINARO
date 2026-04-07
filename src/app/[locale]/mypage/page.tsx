"use client";

import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import { useEffect, useState } from "react";
import { getAllReadingHistory, type ReadingHistoryEntry } from "@/lib/reading-history";
import { formatRelativeTime } from "@/lib/utils/format";
import { createClient } from "@/lib/supabase/client";
import { usePoints } from "@/hooks/usePoints";

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
  const router = useRouter();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [userLabel, setUserLabel] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const points = usePoints();

  // ログインユーザー情報取得
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (u) {
        const meta = (u.user_metadata ?? {}) as { display_name?: string; name?: string };
        setUserLabel(meta.display_name || meta.name || u.email || null);
      }
      setAuthChecked(true);
    });
  }, []);

  // ログアウト処理
  const handleSignOut = async () => {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  useEffect(() => {
    async function loadHistory() {
      const readHistory = getAllReadingHistory();

      if (readHistory.length === 0) {
        setLoading(false);
        return;
      }

      // リッチデータ（slug付き）がある場合はAPIコール不要
      const richEntries = readHistory.filter((e) => e.slug);
      const poorEntries = readHistory.filter((e) => !e.slug);

      const entries: HistoryEntry[] = richEntries.map((e) => ({
        novel: {
          id: e.novelId,
          slug: e.slug,
          title: e.title,
          cover_image_url: e.coverImageUrl,
          total_chapters: e.totalChapters,
          latest_chapter_at: null,
        },
        lastReadEpisode: e.lastEpisode,
        hasUnread: e.lastEpisode < e.totalChapters,
      }));

      // メタデータがない旧形式エントリはAPIで補完
      if (poorEntries.length > 0) {
        try {
          const res = await fetch("/api/novels/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: poorEntries.map((e) => e.novelId) }),
          });
          const { novels } = await res.json() as { novels: NovelInfo[] };

          for (const novel of novels) {
            const entry = poorEntries.find((e) => e.novelId === novel.id);
            if (entry) {
              entries.push({
                novel,
                lastReadEpisode: entry.lastEpisode,
                hasUnread: entry.lastEpisode < novel.total_chapters,
              });
            }
          }
        } catch {
          // APIエラー時は旧データもそのまま表示
          for (const e of poorEntries) {
            entries.push({
              novel: {
                id: e.novelId,
                slug: e.slug || e.novelId,
                title: e.title || e.novelId,
                cover_image_url: null,
                total_chapters: e.totalChapters,
                latest_chapter_at: null,
              },
              lastReadEpisode: e.lastEpisode,
              hasUnread: false,
            });
          }
        }
      }

      // 未読ありを優先
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

      {/* ヘッダーカード: ユーザー情報 */}
      <section className="mb-4 rounded-lg border border-border bg-surface p-4">
        {!authChecked ? (
          <p className="text-sm text-muted">{t("loading")}</p>
        ) : userLabel ? (
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary/10 text-lg font-bold text-secondary">
              {userLabel.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-text">{userLabel}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-bold text-text">{t("guestGreeting")}</p>
              <p className="mt-1 text-xs text-muted">{t("loginPrompt")}</p>
            </div>
            <Link
              href="/login"
              className="rounded-full bg-secondary px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
            >
              {t("login")}
            </Link>
          </div>
        )}
      </section>

      {/* ポイント残高カード */}
      <section className="mb-4 rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted">{t("pointsBalance")}</p>
            <p className="mt-1 text-2xl font-bold text-text">
              {points.loading ? "—" : points.balance.toLocaleString()}
              <span className="ml-1 text-sm font-normal text-muted">pt</span>
            </p>
          </div>
          <Link href="/points" className="text-sm text-secondary hover:underline">
            {t("viewHistory")} →
          </Link>
        </div>
      </section>

      {/* メニューリスト */}
      <section className="mb-8">
        <h2 className="mb-2 text-lg font-bold">{t("menu")}</h2>
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          <li>
            <Link href="/mypage/settings" className="flex items-center justify-between px-4 py-3 hover:bg-border/30 transition">
              <span className="text-text">{t("settings")}</span>
              <span className="text-muted">→</span>
            </Link>
          </li>
          <li>
            <Link href="/points" className="flex items-center justify-between px-4 py-3 hover:bg-border/30 transition">
              <span className="text-text">{t("points")}</span>
              <span className="text-muted">→</span>
            </Link>
          </li>
          <li>
            <Link href="/dashboard" className="flex items-center justify-between px-4 py-3 hover:bg-border/30 transition">
              <span className="text-text">{t("writerDashboard")}</span>
              <span className="text-muted">→</span>
            </Link>
          </li>
          {userLabel && (
            <li>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-border/30 transition disabled:opacity-50"
              >
                <span className="text-red-600">{signingOut ? t("loggingOut") : t("logout")}</span>
                <span className="text-muted">→</span>
              </button>
            </li>
          )}
        </ul>
      </section>

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
