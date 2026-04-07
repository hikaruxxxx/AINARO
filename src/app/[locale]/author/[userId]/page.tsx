import { Link } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

type Props = { params: Promise<{ userId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { userId } = await params;
  const supabase = createAdminClient();
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("display_name, bio")
    .eq("user_id", userId)
    .eq("role", "writer")
    .single();

  if (!profile) return { title: "作家が見つかりません" };

  return {
    title: `${profile.display_name} — Novelis`,
    description: profile.bio || `${profile.display_name}の作品一覧`,
  };
}

export default async function AuthorProfilePage({ params }: Props) {
  const { userId } = await params;
  const locale = await getLocale();
  const t = await getTranslations("authorProfile");

  const supabase = createAdminClient();

  // プロフィール取得
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("display_name, bio, avatar_url, writer_approved_at")
    .eq("user_id", userId)
    .eq("role", "writer")
    .single();

  if (!profile) notFound();

  // 公開作品を取得
  const { data: novels } = await supabase
    .from("novels")
    .select("id, slug, title, cover_image_url, genre, status, total_chapters, total_pv, total_bookmarks, synopsis")
    .eq("author_id", userId)
    .eq("author_type", "external")
    .order("total_pv", { ascending: false });

  const publishedNovels = (novels || []).filter(
    (n) => n.total_chapters > 0
  );

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      {/* プロフィールヘッダー */}
      <div className="mb-10 flex items-start gap-5">
        {profile.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={profile.display_name}
            className="h-20 w-20 rounded-full object-cover ring-2 ring-gray-100 dark:ring-gray-800"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-indigo-100 text-2xl font-bold text-indigo-600 dark:bg-indigo-900 dark:text-indigo-400">
            {profile.display_name.charAt(0)}
          </div>
        )}
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-text">{profile.display_name}</h1>
          {profile.bio && (
            <p className="mt-2 text-sm leading-relaxed text-muted">{profile.bio}</p>
          )}
          <div className="mt-3 flex items-center gap-4 text-xs text-muted">
            <span>{t("novelCount", { count: publishedNovels.length })}</span>
            {profile.writer_approved_at && (
              <span>
                {t("memberSince", {
                  date: new Date(profile.writer_approved_at).toLocaleDateString(
                    locale === "ja" ? "ja-JP" : "en-US",
                    { year: "numeric", month: "long" }
                  ),
                })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 作品一覧 */}
      <h2 className="mb-4 text-lg font-bold text-text">{t("works")}</h2>

      {publishedNovels.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">{t("noWorks")}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {publishedNovels.map((novel) => (
            <Link
              key={novel.id}
              href={`/novels/${novel.slug}`}
              className="group flex gap-4 rounded-xl border border-gray-200 bg-white p-4 transition hover:border-indigo-200 hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:hover:border-indigo-800"
            >
              {/* カバー画像 */}
              <div className="h-24 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
                {novel.cover_image_url ? (
                  <img src={novel.cover_image_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 text-[10px] font-bold text-white/80 leading-tight text-center px-1">
                    {novel.title}
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-text group-hover:text-indigo-600 line-clamp-1">
                  {novel.title}
                </h3>
                {novel.synopsis && (
                  <p className="mt-1 text-xs text-muted line-clamp-2">{novel.synopsis}</p>
                )}
                <div className="mt-2 flex items-center gap-3 text-xs text-muted">
                  <span>{novel.total_chapters}{locale === "ja" ? "話" : " eps"}</span>
                  <span>PV {novel.total_pv.toLocaleString()}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
