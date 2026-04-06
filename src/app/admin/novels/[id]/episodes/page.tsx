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
          className="text-sm text-gray-500 hover:text-gray-900 transition"
        >
          &larr; 作品編集に戻る
        </Link>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">
          {novel.title} - エピソード一覧
        </h2>
        <Link
          href={`/admin/novels/${novelId}/episodes/new`}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition"
        >
          + 新規追加
        </Link>
      </div>

      {episodeList.length === 0 ? (
        <p className="py-12 text-center text-gray-500">
          エピソードがありません。新規追加してください。
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/50 text-left text-gray-500">
                <th className="px-3 py-2 text-xs font-medium">話数</th>
                <th className="px-3 py-2 text-xs font-medium">タイトル</th>
                <th className="px-3 py-2 text-xs font-medium">文字数</th>
                <th className="px-3 py-2 text-xs font-medium">PV</th>
                <th className="px-3 py-2 text-xs font-medium">公開日</th>
                <th className="px-3 py-2 text-xs font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {episodeList.map((ep) => (
                <tr key={ep.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition">
                  <td className="px-3 py-3 text-gray-900">{ep.episode_number}</td>
                  <td className="px-3 py-3 font-medium text-gray-900">{ep.title}</td>
                  <td className="px-3 py-3 text-gray-600">{ep.character_count.toLocaleString()}</td>
                  <td className="px-3 py-3 text-gray-600">{ep.pv.toLocaleString()}</td>
                  <td className="px-3 py-3 text-gray-500">{formatDate(ep.published_at)}</td>
                  <td className="px-3 py-3">
                    <Link
                      href={`/admin/novels/${novelId}/episodes/${ep.id}`}
                      className="text-blue-600 hover:underline"
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
