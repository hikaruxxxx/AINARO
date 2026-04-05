"use client";

import Link from "next/link";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <Link href="/mypage" className="text-sm text-muted hover:text-text transition">
          ← マイページ
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-text">設定</h1>
      </div>

      <div className="space-y-6">
        {/* 読書設定 */}
        <section className="rounded-lg border border-border p-6">
          <h2 className="mb-4 text-lg font-bold">読書設定</h2>
          <p className="text-sm text-muted">
            フォントサイズやテーマの設定は、エピソード閲覧画面から変更できます。
          </p>
        </section>

        {/* アカウント */}
        <section className="rounded-lg border border-border p-6">
          <h2 className="mb-4 text-lg font-bold">アカウント</h2>
          <p className="text-sm text-muted">
            アカウント機能は今後のアップデートで追加予定です。<br />
            現在は読書履歴がブラウザに保存されています。
          </p>
        </section>

        {/* データ管理 */}
        <section className="rounded-lg border border-border p-6">
          <h2 className="mb-4 text-lg font-bold">データ管理</h2>
          <p className="mb-3 text-sm text-muted">
            読書履歴はこのブラウザのローカルストレージに保存されています。
          </p>
          <button
            onClick={() => {
              if (confirm("読書履歴をすべて削除しますか？この操作は取り消せません。")) {
                localStorage.removeItem("ainaro_reading_history");
                localStorage.removeItem("ainaro_session_id");
                window.location.reload();
              }
            }}
            className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600 transition hover:bg-red-50"
          >
            読書履歴を削除
          </button>
        </section>
      </div>
    </div>
  );
}
