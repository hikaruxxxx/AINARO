import { Link } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { fetchRankedNovels } from "@/lib/data";
import GenreBadge from "@/components/common/GenreBadge";
import StatusBadge from "@/components/common/StatusBadge";
import PersonalizedSection from "@/components/novel/PersonalizedSection";
import { formatRelativeTime } from "@/lib/utils/format";

export const revalidate = 3600;

export default async function HomePage() {
  const locale = await getLocale();
  const t = await getTranslations("novel");
  const novels = await fetchRankedNovels({ limit: 20, locale });

  if (novels.length === 0) {
    return (
      <div className="flex h-[80dvh] flex-col items-center justify-center px-6 text-center">
        <span className="mb-4 text-5xl">📖</span>
        <h1 className="mb-2 text-2xl font-bold text-primary">Novelis</h1>
        <p className="text-muted">{t("noNovels")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      {novels.length > 0 && (
        <section className="mb-8">
          <PickupCard novel={novels[0]} locale={locale} />
        </section>
      )}

      {/* パーソナライズドレコメンド（読書履歴がある場合のみ表示） */}
      <PersonalizedSection allNovels={novels} />

      {novels.length > 1 && (
        <section>
          <h2 className="mb-4 text-lg font-bold text-text">{t("recommended")}</h2>
          <ul className="divide-y divide-border">
            {novels.slice(1).map((novel) => (
              <li key={novel.id}>
                <Link
                  href={`/novels/${novel.slug}`}
                  className="flex gap-4 py-4 transition hover:bg-surface"
                >
                  <div className="h-24 w-16 flex-shrink-0 rounded-md bg-surface flex items-center justify-center overflow-hidden">
                    {novel.cover_image_url ? (
                      <img src={novel.cover_image_url} alt={novel.title} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-2xl text-muted">📖</span>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <h3 className="truncate font-bold text-text">{novel.title}</h3>
                    {novel.tagline && <p className="truncate text-xs text-muted">{novel.tagline}</p>}
                    <div className="flex flex-wrap items-center gap-2">
                      <GenreBadge genre={novel.genre} />
                      <StatusBadge status={novel.status} />
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-muted">
                      <span>{t("episodes", { count: novel.total_chapters })}</span>
                      {novel.latest_chapter_at && (
                        <span>{t("update", { time: formatRelativeTime(novel.latest_chapter_at, locale) })}</span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function PickupCard({ novel, locale }: { novel: any; locale: string }) {
  return (
    <Link
      href={`/novels/${novel.slug}`}
      className="block overflow-hidden rounded-xl border border-border bg-white transition hover:shadow-md"
    >
      <div className="flex items-center justify-center bg-surface py-8">
        <div className="h-48 w-32 rounded-lg bg-white shadow-sm flex items-center justify-center overflow-hidden">
          {novel.cover_image_url ? (
            <img src={novel.cover_image_url} alt={novel.title} className="h-full w-full object-cover" />
          ) : (
            <span className="text-4xl">📖</span>
          )}
        </div>
      </div>
      <div className="p-5">
        <h2 className="mb-1 text-lg font-bold text-text">{novel.title}</h2>
        {novel.tagline && <p className="mb-3 text-sm text-muted">{novel.tagline}</p>}
        {novel.synopsis && (
          <p className="mb-3 text-sm leading-relaxed text-muted line-clamp-2">{novel.synopsis}</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <GenreBadge genre={novel.genre} />
          <StatusBadge status={novel.status} />
          <span className="text-xs text-muted">{novel.total_chapters} {locale === "en" ? "eps" : "話"}</span>
        </div>
      </div>
    </Link>
  );
}
