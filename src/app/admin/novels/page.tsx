import Link from "next/link";
import { fetchNovels } from "@/lib/data";
import { formatPV, formatDate } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

const STATUS_CONFIG: Record<string, { label: string; dot: string }> = {
  serial: { label: "連載中", dot: "bg-green-500" },
  complete: { label: "完結", dot: "bg-blue-500" },
  hiatus: { label: "休止", dot: "bg-gray-400" },
};

const GENRE_LABELS: Record<string, string> = {
  fantasy: "ファンタジー",
  romance: "恋愛",
  villainess: "悪役令嬢",
  horror: "ホラー",
  mystery: "ミステリー",
  scifi: "SF",
  drama: "ドラマ",
  comedy: "コメディ",
  action: "アクション",
  other: "その他",
};

export default async function AdminNovelsPage() {
  const novels = await fetchNovels();

  return (
    <div>
      {/* ヘッダー */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">作品管理</h1>
          <p className="mt-1 text-sm text-gray-500">{novels.length}作品</p>
        </div>
        <Link
          href="/admin/novels/new"
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          新規作成
        </Link>
      </div>

      {novels.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <p className="mt-4 text-sm font-medium text-gray-900">作品がありません</p>
          <p className="mt-1 text-sm text-gray-500">新規作成ボタンから最初の作品を追加しましょう</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/50">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">タイトル</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">ジャンル</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">話数</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">PV</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">状態</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">更新日</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {novels.map((novel) => {
                const status = STATUS_CONFIG[novel.status] || STATUS_CONFIG.serial;
                return (
                  <tr key={novel.id} className="transition-colors hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{novel.title}</div>
                      <div className="mt-0.5 text-xs text-gray-400">{novel.author_name}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        {GENRE_LABELS[novel.genre] || novel.genre}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">{novel.total_chapters}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{formatPV(novel.total_pv)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                        <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{formatDate(novel.updated_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/admin/novels/${novel.id}`}
                          className="rounded-md px-2.5 py-1 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50"
                        >
                          編集
                        </Link>
                        <Link
                          href={`/admin/novels/${novel.id}/episodes`}
                          className="rounded-md px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100"
                        >
                          話管理
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
