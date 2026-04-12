"use client";

import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import { useEffect, useState } from "react";
import { getAllReadingHistory, type ReadingHistoryEntry } from "@/lib/reading-history";
import { getFollowedNovelIds } from "@/lib/follows";
import { getBookmarkedNovelIds } from "@/lib/bookmarks";
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

type BadgeEntry = {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string | null;
  tier: number;
  threshold: number | null;
  earned: boolean;
  earned_at: string | null;
};

export default function MyPage() {
  const t = useTranslations("mypage");
  const locale = useLocale();
  const router = useRouter();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [followedNovels, setFollowedNovels] = useState<NovelInfo[]>([]);
  const [bookmarkedNovels, setBookmarkedNovels] = useState<NovelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [userLabel, setUserLabel] = useState<string | null>(null);
  const [isWriter, setIsWriter] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const points = usePoints();
  const [badges, setBadges] = useState<BadgeEntry[] | null>(null);

  // 獲得バッジ取得
  useEffect(() => {
    if (!authChecked || !userLabel) return;
    fetch("/api/badges/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.authenticated) setBadges(data.badges ?? []);
      })
      .catch(() => {});
  }, [authChecked, userLabel]);

  // ログインユーザー情報取得
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      const u = data.user;
      if (u) {
        // user_profiles を最優先（auth/confirm 時に自動作成済みのはず）
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("display_name, role, writer_status")
          .eq("user_id", u.id)
          .maybeSingle();
        // フォールバック: profile が無ければメールローカル部
        const fallback = (u.email ?? "").split("@")[0] || null;
        setUserLabel(profile?.display_name || fallback);
        if (profile?.role === "writer" && profile.writer_status === "approved") {
          setIsWriter(true);
        }
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

  // novel IDリストからNovelInfo[]をバッチ取得するヘルパー
  async function fetchNovelsByIds(ids: string[]): Promise<NovelInfo[]> {
    if (ids.length === 0) return [];
    try {
      const res = await fetch("/api/novels/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const { novels } = await res.json() as { novels: NovelInfo[] };
      return novels;
    } catch {
      return [];
    }
  }

  useEffect(() => {
    async function loadData() {
      const readHistory = getAllReadingHistory();
      const followIds = getFollowedNovelIds();
      const bookmarkIds = getBookmarkedNovelIds();

      // 全IDを一括取得（重複排除）
      const historyPoorEntries = readHistory.filter((e) => !e.slug);
      const allIdsToFetch = [...new Set([
        ...historyPoorEntries.map((e) => e.novelId),
        ...followIds,
        ...bookmarkIds,
      ])];

      const fetchedNovelsMap = new Map<string, NovelInfo>();
      if (allIdsToFetch.length > 0) {
        const novels = await fetchNovelsByIds(allIdsToFetch);
        for (const n of novels) fetchedNovelsMap.set(n.id, n);
      }

      // フォロー中の作品
      const followed = followIds
        .map((id) => fetchedNovelsMap.get(id))
        .filter((n): n is NovelInfo => !!n);
      setFollowedNovels(followed);

      // お気に入り作品
      const bookmarked = bookmarkIds
        .map((id) => fetchedNovelsMap.get(id))
        .filter((n): n is NovelInfo => !!n);
      setBookmarkedNovels(bookmarked);

      // 読書履歴
      if (readHistory.length > 0) {
        const richEntries = readHistory.filter((e) => e.slug);
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

        // メタデータがない旧形式エントリはバッチ取得結果で補完
        for (const e of historyPoorEntries) {
          const novel = fetchedNovelsMap.get(e.novelId);
          if (novel) {
            entries.push({
              novel,
              lastReadEpisode: e.lastEpisode,
              hasUnread: e.lastEpisode < novel.total_chapters,
            });
          } else {
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

        // 未読ありを優先
        entries.sort((a, b) => {
          if (a.hasUnread !== b.hasUnread) return a.hasUnread ? -1 : 1;
          return 0;
        });

        setHistory(entries);
      }

      setLoading(false);
    }

    loadData();
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

      {/* ポイント残高 + ストリークカード */}
      <section className="mb-4 rounded-lg border border-border bg-surface p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-xs text-muted">{t("pointsBalance")}</p>
            <p className="mt-1 text-2xl font-bold text-text">
              {points.loading ? "—" : points.balance.toLocaleString()}
              <span className="ml-1 text-sm font-normal text-muted">pt</span>
            </p>
          </div>
          {/* ストリーク表示 */}
          {!points.loading && points.authenticated && (
            <div className="flex flex-col items-end">
              {points.currentStreak > 0 ? (
                <>
                  <div className="flex items-center gap-1 rounded-full bg-orange-100 px-3 py-1">
                    <span className="text-base">🔥</span>
                    <span className="text-sm font-bold text-orange-700">
                      {t("streakLabel", { days: points.currentStreak })}
                    </span>
                  </div>
                  {points.longestStreak > points.currentStreak && (
                    <p className="mt-1 text-[10px] text-muted">
                      {t("streakBest", { days: points.longestStreak })}
                    </p>
                  )}
                </>
              ) : (
                <span className="rounded-full bg-surface px-3 py-1 text-xs text-muted">
                  {t("streakNone")}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="mt-3 flex justify-end">
          <Link href="/points" className="text-sm text-secondary hover:underline">
            {t("viewHistory")} →
          </Link>
        </div>
      </section>

      {/* バッジセクション */}
      {authChecked && userLabel && badges && badges.length > 0 && (
        <section className="mb-4 rounded-lg border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-text">{t("badgesTitle")}</h2>
            <span className="text-xs text-muted">
              {t("badgesProgress", {
                earned: badges.filter((b) => b.earned).length,
                total: badges.length,
              })}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
            {badges.map((b) => (
              <div
                key={b.id}
                className={`flex flex-col items-center text-center ${
                  b.earned ? "" : "opacity-30 grayscale"
                }`}
                title={`${b.name} — ${b.description}${b.earned ? "" : " (" + t("badgeNotEarned") + ")"}`}
              >
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-full text-2xl ${
                    b.tier === 3
                      ? "bg-yellow-100"
                      : b.tier === 2
                      ? "bg-gray-100"
                      : "bg-orange-50"
                  }`}
                >
                  {b.icon ?? "🏅"}
                </div>
                <p className="mt-1 line-clamp-2 text-[10px] leading-tight text-muted">
                  {b.name}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 作家化CTA: 未登録ユーザーのみ */}
      {authChecked && userLabel && !isWriter && (
        <section className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-bold text-indigo-900">{t("becomeWriterTitle")}</p>
              <p className="mt-0.5 text-xs text-indigo-700">{t("becomeWriterDesc")}</p>
            </div>
            <Link
              href="/write/apply"
              className="shrink-0 rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
            >
              {t("becomeWriterCta")}
            </Link>
          </div>
        </section>
      )}

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
          {isWriter && (
            <li>
              <Link href="/dashboard" className="flex items-center justify-between px-4 py-3 hover:bg-border/30 transition">
                <span className="text-text">{t("writerDashboard")}</span>
                <span className="text-muted">→</span>
              </Link>
            </li>
          )}
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

      {/* フォロー中の作品 */}
      {!loading && followedNovels.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-4 text-lg font-bold">{t("followedNovels")}</h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {followedNovels.map((novel) => (
              <Link key={novel.id} href={`/novels/${novel.slug}`} className="group">
                <div className="aspect-[2/3] overflow-hidden rounded-md bg-surface">
                  {novel.cover_image_url ? (
                    <img src={novel.cover_image_url} alt={novel.title} className="h-full w-full object-cover transition group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-2xl text-muted">📖</div>
                  )}
                </div>
                <p className="mt-1 line-clamp-2 text-xs font-medium text-text group-hover:text-secondary transition">{novel.title}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* お気に入り */}
      {!loading && bookmarkedNovels.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-4 text-lg font-bold">{t("bookmarkedNovels")}</h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {bookmarkedNovels.map((novel) => (
              <Link key={novel.id} href={`/novels/${novel.slug}`} className="group">
                <div className="aspect-[2/3] overflow-hidden rounded-md bg-surface">
                  {novel.cover_image_url ? (
                    <img src={novel.cover_image_url} alt={novel.title} className="h-full w-full object-cover transition group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-2xl text-muted">📖</div>
                  )}
                </div>
                <p className="mt-1 line-clamp-2 text-xs font-medium text-text group-hover:text-secondary transition">{novel.title}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

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
