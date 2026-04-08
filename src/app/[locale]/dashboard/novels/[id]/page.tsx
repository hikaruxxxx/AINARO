import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { getUser } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import type { EpisodeStatus } from "@/types/novel";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<EpisodeStatus, { label: string; cls: string }> = {
  draft: { label: "下書き", cls: "bg-gray-100 text-gray-600" },
  pending_review: { label: "審査中", cls: "bg-yellow-100 text-yellow-700" },
  revision_requested: { label: "修正依頼", cls: "bg-red-100 text-red-700" },
  scheduled: { label: "予約公開", cls: "bg-blue-100 text-blue-700" },
  published: { label: "公開中", cls: "bg-green-100 text-green-700" },
};

export default async function NovelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations("dashboard");
  const user = await getUser();
  if (!user) redirect("/write");

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: novel } = await supabase
    .from("novels")
    .select("*")
    .eq("id", id)
    .eq("author_id", user.id)
    .single();

  if (!novel) redirect("/dashboard");

  const { data: episodes } = await supabase
    .from("episodes")
    .select("id, episode_number, title, character_count, status, published_at, updated_at")
    .eq("novel_id", id)
    .order("episode_number", { ascending: true });

  const eps = episodes || [];

  return (
    <div>
      <div className="mb-6">
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">← {t("backToNovels")}</Link>
        <h1 className="mt-2 text-xl font-bold text-gray-900">{novel.title}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {novel.total_chapters}{t("episodes")} · {(novel.total_characters || 0).toLocaleString()}{t("characters")}
        </p>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">{t("episodeList")}</h2>
        <Link href={`/dashboard/novels/${id}/episodes/new`} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {t("newEpisode")}
        </Link>
      </div>

      {eps.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white py-12 text-center">
          <p className="text-sm text-gray-500">{t("noEpisodes")}</p>
          <Link href={`/dashboard/novels/${id}/episodes/new`} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-500">
            {t("writeFirstEpisode")}
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="divide-y divide-gray-100">
            {eps.map((ep) => {
              const badge = STATUS_BADGE[ep.status as EpisodeStatus] || STATUS_BADGE.draft;
              return (
                <Link key={ep.id} href={`/dashboard/novels/${id}/episodes/${ep.id}`} className="flex items-center justify-between px-5 py-4 transition hover:bg-gray-50">
                  <div className="flex items-center gap-4">
                    <span className="w-8 text-center text-sm font-bold text-gray-500">{ep.episode_number}</span>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{ep.title}</p>
                    </div>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.cls}`}>{badge.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
