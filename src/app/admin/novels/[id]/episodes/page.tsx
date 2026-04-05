import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { formatDate } from "@/lib/utils/format";
import type { Episode } from "@/types/novel";

export const dynamic = "force-dynamic";

export default async function EpisodesListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: novelId } = await params;
  const supabase = await createClient();

  // 作品情報を取得（タイトル表示用）
  const { data: novel } = await supabase
    .from("novels")
    .select("id, title")
    .eq("id", novelId)
    .single();

  if (!novel) {
    notFound();
  }

  // エピソード一覧を取得
  const { data: episodes } = await supabase
    .from("episodes")
    .select("*")
    .eq("novel_id", novelId)
    .order("episode_number", { ascending: true });

  const episodeList = (episodes as Episode[]) || [];

  return (
    <div>
      <div className="mb-4">
        <Link
          href={`/admin/novels/${novelId}`}
          className="text-sm text-muted hover:text-text transition"
        >
          &larr; 作品編集に戻る
        </Link>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">
          {novel.title} - エピソード一覧
        </h2>
        <Link
          href={`/admin/novels/${novelId}/episodes/new`}
          className="rounded bg-secondary px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition"
        >
          + 新規追加
        </Link>
      </div>

      {episodeList.length === 0 ? (
        <p className="py-12 text-center text-muted">
          エピソードがありません。新規追加してください。
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-muted">
              <tr>
                <th className="pb-2 font-medium">話数</th>
                <th className="pb-2 font-medium">タイトル</th>
                <th className="pb-2 font-medium">文字数</th>
                <th className="pb-2 font-medium">PV</th>
                <th className="pb-2 font-medium">公開日</th>
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {episodeList.map((ep) => (
                <tr key={ep.id}>
                  <td className="py-3">{ep.episode_number}</td>
                  <td className="py-3 font-medium">{ep.title}</td>
                  <td className="py-3">{ep.character_count.toLocaleString()}</td>
                  <td className="py-3">{ep.pv.toLocaleString()}</td>
                  <td className="py-3 text-muted">{formatDate(ep.published_at)}</td>
                  <td className="py-3">
                    <Link
                      href={`/admin/novels/${novelId}/episodes/${ep.id}`}
                      className="text-secondary hover:underline"
                    >
                      編集
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
