import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { searchNovels } from "@/lib/data";
import GenreBadge from "@/components/common/GenreBadge";
import StatusBadge from "@/components/common/StatusBadge";
import { formatCharCount } from "@/lib/utils/format";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("search");
  return { title: t("title") };
}

type Props = {
  searchParams: Promise<{ q?: string }>;
};

export default async function SearchPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations();
  const query = q?.trim() || "";
  const results = query ? await searchNovels(query, locale) : [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">{t("search.title")}</h1>

      {/* 検索フォーム */}
      <form action="" method="GET" className="mb-8">
        <div className="relative">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder={t("search.placeholder")}
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
            {t("search.resultCount", { query, count: results.length })}
          </p>

          {results.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-lg text-muted">{t("search.noResults")}</p>
              <p className="mt-2 text-sm text-muted">{t("search.noResultsHint")}</p>
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

      {/* クエリなし時 */}
      {!query && (
        <div className="py-12 text-center">
          <p className="text-lg text-muted">{t("search.idle")}</p>
          <p className="mt-2 text-sm text-muted">{t("search.idleHint")}</p>
        </div>
      )}
    </div>
  );
}
