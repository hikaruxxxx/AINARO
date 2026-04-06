import Link from "next/link";
import { fetchNovels } from "@/lib/data";
import { formatPV, formatDate } from "@/lib/utils/format";

// 管理画面用の簡易ステータス表示（i18nコンテキスト外で動作）
const STATUS_LABELS: Record<string, { label: string; style: string }> = {
  serial: { label: "連載中", style: "bg-green-100 text-green-800" },
  complete: { label: "完結", style: "bg-blue-100 text-blue-800" },
  hiatus: { label: "休止", style: "bg-gray-100 text-gray-600" },
};
function AdminStatusBadge({ status }: { status: string }) {
  const { label, style } = STATUS_LABELS[status] || STATUS_LABELS.serial;
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${style}`}>{label}</span>;
}

export const dynamic = "force-dynamic";

export default async function AdminNovelsPage() {
  const novels = await fetchNovels();

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">作品一覧</h2>
        <Link
          href="/admin/novels/new"
          className="rounded bg-secondary px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition"
        >
          + 新規作成
        </Link>
      </div>

      {novels.length === 0 ? (
        <p className="py-12 text-center text-muted">作品がありません。新規作成してください。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-muted">
              <tr>
                <th className="pb-2 font-medium">タイトル</th>
                <th className="pb-2 font-medium">ジャンル</th>
                <th className="pb-2 font-medium">話数</th>
                <th className="pb-2 font-medium">PV</th>
                <th className="pb-2 font-medium">状態</th>
                <th className="pb-2 font-medium">更新日</th>
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {novels.map((novel) => (
                <tr key={novel.id}>
                  <td className="py-3 font-medium">{novel.title}</td>
                  <td className="py-3">{novel.genre}</td>
                  <td className="py-3">{novel.total_chapters}</td>
                  <td className="py-3">{formatPV(novel.total_pv)}</td>
                  <td className="py-3"><AdminStatusBadge status={novel.status} /></td>
                  <td className="py-3 text-muted">{formatDate(novel.updated_at)}</td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      <Link href={`/admin/novels/${novel.id}`} className="text-secondary hover:underline">編集</Link>
                      <Link href={`/admin/novels/${novel.id}/episodes`} className="text-secondary hover:underline">話管理</Link>
                    </div>
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
