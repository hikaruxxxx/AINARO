"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Episode } from "@/types/novel";

export default function EpisodeEditForm({
  episode,
  novelId,
}: {
  episode: Episode;
  novelId: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // フォーム状態（既存データで初期化）
  const [episodeNumber, setEpisodeNumber] = useState(episode.episode_number);
  const [title, setTitle] = useState(episode.title);
  const [bodyMd, setBodyMd] = useState(episode.body_md);
  const [isFree, setIsFree] = useState(episode.is_free);

  // 本文の文字数（空白・改行除く）
  const characterCount = bodyMd.replace(/[\s\n\r]/g, "").length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const res = await fetch(
        `/api/admin/novels/${novelId}/episodes/${episode.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            episode_number: episodeNumber,
            title,
            body_md: bodyMd,
            is_free: isFree,
          }),
        }
      );

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

  const handleDelete = async () => {
    if (!confirm("このエピソードを削除しますか？")) {
      return;
    }

    try {
      const res = await fetch(
        `/api/admin/novels/${novelId}/episodes/${episode.id}`,
        { method: "DELETE" }
      );

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "削除に失敗しました");
        return;
      }

      router.push(`/admin/novels/${novelId}/episodes`);
    } catch {
      setError("通信エラーが発生しました");
    }
  };

  return (
    <>
      {error && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
        {/* 話数 */}
        <div>
          <label className="mb-1 block text-sm font-medium">話数 *</label>
          <input
            type="number"
            value={episodeNumber}
            onChange={(e) => setEpisodeNumber(Number(e.target.value))}
            min={1}
            required
            className="border border-border rounded px-3 py-2 w-full"
          />
        </div>

        {/* タイトル */}
        <div>
          <label className="mb-1 block text-sm font-medium">タイトル *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="border border-border rounded px-3 py-2 w-full"
          />
        </div>

        {/* 本文 */}
        <div>
          <label className="mb-1 block text-sm font-medium">
            本文（Markdown） *
          </label>
          <textarea
            value={bodyMd}
            onChange={(e) => setBodyMd(e.target.value)}
            rows={20}
            required
            className="border border-border rounded px-3 py-2 w-full font-mono text-sm"
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
          <label htmlFor="is_free" className="text-sm">
            無料公開
          </label>
        </div>

        {/* ボタン */}
        <div className="flex items-center gap-3 pt-4">
          <button
            type="submit"
            disabled={saving}
            className="bg-secondary text-white rounded px-4 py-2 text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
          >
            {saving ? "保存中..." : "保存"}
          </button>
          <button
            type="button"
            onClick={() =>
              router.push(`/admin/novels/${novelId}/episodes`)
            }
            className="border border-border rounded px-4 py-2 text-sm"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="ml-auto text-red-600 hover:underline text-sm"
          >
            削除
          </button>
        </div>
      </form>
    </>
  );
}
