import Link from "next/link";
import { fetchRankedNovels } from "@/lib/data";
import GenreBadge from "@/components/common/GenreBadge";
import StatusBadge from "@/components/common/StatusBadge";
import { formatPV, formatRelativeTime } from "@/lib/utils/format";

export const revalidate = 3600;

export default async function HomePage() {
  // 面白さスコア順で取得（データ不足時はPV順にフォールバック）
  const novels = await fetchRankedNovels({ limit: 20 });

  if (novels.length === 0) {
    return (
      <div className="flex h-[80dvh] flex-col items-center justify-center px-6 text-center">
        <span className="mb-4 text-5xl">📖</span>
        <h1 className="mb-2 text-2xl font-bold text-primary">Novelis</h1>
        <p className="text-muted">もっと面白い小説を、すべての人に</p>
        <p className="mt-4 text-sm text-muted">作品はまだ公開されていません。</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      {/* ピックアップ（1作目を大きく） */}
      {novels.length > 0 && (
        <section className="mb-8">
          <PickupCard novel={novels[0]} />
        </section>
      )}

      {/* 作品一覧 */}
      {novels.length > 1 && (
        <section>
          <h2 className="mb-4 text-lg font-bold text-text">おすすめ作品</h2>
          <ul className="divide-y divide-border">
            {novels.slice(1).map((novel) => (
              <li key={novel.id}>
                <Link
                  href={`/novels/${novel.slug}`}
                  className="flex gap-4 py-4 transition hover:bg-surface"
                >
                  {/* 表紙サムネイル */}
                  <div className="h-24 w-16 flex-shrink-0 rounded-md bg-surface flex items-center justify-center overflow-hidden">
                    {novel.cover_image_url ? (
                      <img
                        src={novel.cover_image_url}
                        alt={novel.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-2xl text-muted">📖</span>
                    )}
                  </div>

                  {/* 作品情報 */}
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <h3 className="truncate font-bold text-text">{novel.title}</h3>
                    {novel.tagline && (
                      <p className="truncate text-xs text-muted">{novel.tagline}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <GenreBadge genre={novel.genre} />
                      <StatusBadge status={novel.status} />
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-muted">
                      <span>{novel.total_chapters}話</span>
                      <span>PV {formatPV(novel.total_pv)}</span>
                      {novel.latest_chapter_at && (
                        <span>更新 {formatRelativeTime(novel.latest_chapter_at)}</span>
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

/* ピックアップカード（トップ1作品を目立たせる） */
function PickupCard({ novel }: { novel: any }) {
  return (
    <Link
      href={`/novels/${novel.slug}`}
      className="block overflow-hidden rounded-xl border border-border bg-white transition hover:shadow-md"
    >
      {/* 表紙エリア */}
      <div className="flex items-center justify-center bg-surface py-8">
        <div className="h-48 w-32 rounded-lg bg-white shadow-sm flex items-center justify-center overflow-hidden">
          {novel.cover_image_url ? (
            <img
              src={novel.cover_image_url}
              alt={novel.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-4xl">📖</span>
          )}
        </div>
      </div>

      {/* 作品情報 */}
      <div className="p-5">
        <h2 className="mb-1 text-lg font-bold text-text">{novel.title}</h2>
        {novel.tagline && (
          <p className="mb-3 text-sm text-muted">{novel.tagline}</p>
        )}
        {novel.synopsis && (
          <p className="mb-3 text-sm leading-relaxed text-muted line-clamp-2">
            {novel.synopsis}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <GenreBadge genre={novel.genre} />
          <StatusBadge status={novel.status} />
          <span className="text-xs text-muted">{novel.total_chapters}話</span>
        </div>
      </div>
    </Link>
  );
}
