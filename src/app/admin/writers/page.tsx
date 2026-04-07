import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/supabase/auth";
import WriterActions from "./WriterActions";

export const dynamic = "force-dynamic";

export default async function AdminWritersPage() {
  await requireAdmin();

  const supabase = createAdminClient();
  const { data: writers } = await supabase
    .from("user_profiles")
    .select("*")
    .in("role", ["writer", "admin"])
    .order("writer_approved_at", { ascending: false });

  const allWriters = writers || [];

  // 各作家の作品数を取得
  const writerIds = allWriters.map((w) => w.user_id);
  const { data: novelCounts } = await supabase
    .from("novels")
    .select("author_id")
    .eq("author_type", "external")
    .in("author_id", writerIds.length > 0 ? writerIds : ["__none__"]);

  const countMap = new Map<string, number>();
  for (const n of novelCounts || []) {
    countMap.set(n.author_id, (countMap.get(n.author_id) || 0) + 1);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">作家管理</h1>
          <p className="mt-1 text-sm text-gray-500">{allWriters.length}人の作家</p>
        </div>
      </div>

      {allWriters.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
          <p className="text-sm text-gray-500">まだ作家が登録されていません</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/50">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">ペンネーム</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">ロール</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">ステータス</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">作品数</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">登録日</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {allWriters.map((writer) => {
                const novelCount = countMap.get(writer.user_id) || 0;
                const statusColor =
                  writer.writer_status === "approved"
                    ? "bg-green-100 text-green-700"
                    : writer.writer_status === "suspended"
                      ? "bg-red-100 text-red-700"
                      : "bg-gray-100 text-gray-600";

                return (
                  <tr key={writer.user_id} className="transition-colors hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {writer.avatar_url ? (
                          <img
                            src={writer.avatar_url}
                            alt=""
                            className="h-8 w-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600">
                            {writer.display_name.charAt(0)}
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-gray-900">{writer.display_name}</p>
                          {writer.bio && (
                            <p className="mt-0.5 text-xs text-gray-400 line-clamp-1">{writer.bio}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        {writer.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor}`}>
                        {writer.writer_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">{novelCount}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {writer.writer_approved_at
                        ? new Date(writer.writer_approved_at).toLocaleDateString("ja-JP")
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <WriterActions
                        userId={writer.user_id}
                        currentStatus={writer.writer_status}
                      />
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
