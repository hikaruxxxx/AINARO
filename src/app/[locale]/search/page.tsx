import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { searchNovels, fetchRankedNovels } from "@/lib/data";
import GenreBadge from "@/components/common/GenreBadge";
import StatusBadge from "@/components/common/StatusBadge";
import { formatCharCount } from "@/lib/utils/format";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "検索",
};

type Props = {
  searchParams: Promise<{ q?: string }>;
};

export default async function SearchPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations();
  const query = q?.trim() || "";
  const results = query ? await searchNovels(query, locale) : [];
  // 空状態用: 人気作品トップ5と頻出タグ
  const popularNovels = !query ? (await fetchRankedNovels({ locale })).slice(0, 5) : [];
  const popularTags = !query
    ? Array.from(new Set(popularNovels.flatMap((n) => n.tags ?? []))).slice(0, 12)
    : [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">検索</h1>

      {/* 検索フォーム */}
      <form action="" method="GET" className="mb-8">
        <div className="relative">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="作品タイトル・タグ・キーワードで検索..."
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 pl-10 text-sm outline-none transition focus:border-secondary"
            autoFocus
          />
          <svg
            className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </form>

      {/* 検索結果 */}
      {query && (
        <div>
          <p className="mb-4 text-sm text-muted">
            「{query}」の検索結果: {results.length}件
          </p>

          {results.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-lg text-muted">該当する作品が見つかりませんでした。</p>
              <p className="mt-2 text-sm text-muted">キーワードを変えて再検索してみてください。</p>
            </div>
          ) : (
            <ul className="space-y-4">
              {results.map((novel) => (
                <li key={novel.id}>
                  <Link
                    href={`/novels/${novel.slug}`}
                    className="flex gap-4 rounded-lg border border-border p-4 transition hover:bg-surface"
                  >
                    <div className="h-24 w-16 flex-shrink-0 rounded bg-surface flex items-center justify-center overflow-hidden">
                      {novel.cover_image_url ? (
                        <img src={novel.cover_image_url} alt={novel.title} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-2xl text-muted">📖</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="font-bold">{novel.title}</h2>
                      {novel.tagline && <p className="mt-0.5 text-sm text-muted line-clamp-1">{novel.tagline}</p>}
                      <div className="mt-2 flex flex-wrap gap-2">
                        <GenreBadge genre={novel.genre} />
                        <StatusBadge status={novel.status} />
                        <span className="text-xs text-muted">{t("novel.episodes", { count: novel.total_chapters })}</span>
                        <span className="text-xs text-muted">{formatCharCount(novel.total_characters, locale)}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {novel.tags.slice(0, 5).map((tag) => (
                          <span key={tag} className="text-xs text-muted">#{tag}</span>
                        ))}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* クエリなし時: 人気タグと人気作品でユーザーに何を打てばいいか示す */}
      {!query && (
        <div className="space-y-8">
          {popularTags.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-bold text-text">人気のタグ</h2>
              <div className="flex flex-wrap gap-2">
                {popularTags.map((tag) => (
                  <Link
                    key={tag}
                    href={`/search?q=${encodeURIComponent(tag)}`}
                    className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-text transition hover:border-secondary hover:text-secondary"
                  >
                    #{tag}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {popularNovels.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-bold text-text">いま読まれている作品</h2>
              <ul className="space-y-2">
                {popularNovels.map((novel, idx) => (
                  <li key={novel.id}>
                    <Link
                      href={`/novels/${novel.slug}`}
                      className="flex items-center gap-3 rounded-lg border border-border p-3 transition hover:bg-surface"
                    >
                      <span className="w-5 text-center text-sm font-bold text-muted">{idx + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-text">{novel.title}</p>
                        {novel.tagline && (
                          <p className="truncate text-xs text-muted">{novel.tagline}</p>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
