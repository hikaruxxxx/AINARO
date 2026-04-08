"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";

export default function NewEpisodePage() {
  const router = useRouter();
  const params = useParams();
  const novelId = params.id as string;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // フォーム状態
  const [episodeNumber, setEpisodeNumber] = useState(1);
  const [title, setTitle] = useState("");
  const [bodyMd, setBodyMd] = useState("");
  const [isFree, setIsFree] = useState(true);

  // 本文の文字数（空白・改行除く）
  const characterCount = bodyMd.replace(/[\s\n\r]/g, "").length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const res = await fetch(`/api/admin/novels/${novelId}/episodes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          episode_number: episodeNumber,
          title,
          body_md: bodyMd,
          is_free: isFree,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "保存に失敗しました");
        return;
      }

      router.push(`/admin/novels/${novelId}/episodes`);
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">エピソード新規作成</h2>
        <p className="text-sm text-gray-500">新しいエピソードを追加</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
        {/* 話数 */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-900">話数 *</label>
          <input
            type="number"
            value={episodeNumber}
            onChange={(e) => setEpisodeNumber(Number(e.target.value))}
            min={1}
            required
            className="border border-gray-200 rounded-lg px-3 py-2 w-full bg-white"
          />
        </div>

        {/* タイトル */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-900">タイトル *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="border border-gray-200 rounded-lg px-3 py-2 w-full bg-white"
          />
        </div>

        {/* 本文 */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-900">
            本文（Markdown） *
          </label>
          <textarea
            value={bodyMd}
            onChange={(e) => setBodyMd(e.target.value)}
            rows={20}
            required
            className="border border-gray-200 rounded-lg px-3 py-2 w-full font-mono text-sm bg-white"
          />
        </div>

        {/* 無料公開 */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="is_free"
            checked={isFree}
            onChange={(e) => setIsFree(e.target.checked)}
          />
          <label htmlFor="is_free" className="text-sm text-gray-600">
            無料公開
          </label>
        </div>

        {/* ボタン */}
        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
          >
            {saving ? "保存中..." : "保存"}
          </button>
          <button
            type="button"
            onClick={() => router.push(`/admin/novels/${novelId}/episodes`)}
            className="border border-gray-200 bg-white text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50 transition"
          >
            キャンセル
          </button>
        </div>
      </form>
    </div>
  );
}
