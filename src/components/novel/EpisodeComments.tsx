"use client";

import { useState, useEffect } from "react";
import { getComments, addComment } from "@/lib/comments";
import type { EpisodeComment } from "@/types/novel";

type Props = {
  episodeId: string;
  novelId: string;
};

export default function EpisodeComments({ episodeId, novelId }: Props) {
  const [comments, setComments] = useState<EpisodeComment[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [body, setBody] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setComments(getComments(episodeId));
    // 前回使った表示名を復元
    const savedName = localStorage.getItem("ainaro_display_name");
    if (savedName) setDisplayName(savedName);
  }, [episodeId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;

    // 表示名を保存
    if (displayName.trim()) {
      localStorage.setItem("ainaro_display_name", displayName.trim());
    }

    const newComment = addComment(episodeId, novelId, displayName, body);
    setComments((prev) => [newComment, ...prev]);
    setBody("");
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "たった今";
    if (mins < 60) return `${mins}分前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}時間前`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}日前`;
    return d.toLocaleDateString("ja-JP");
  };

  return (
    <div className="border-t border-current/10 px-5 py-6" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between text-sm font-bold opacity-70 hover:opacity-100 transition"
      >
        <span>コメント {comments.length > 0 && `(${comments.length})`}</span>
        <span className="text-xs">{isOpen ? "▲ 閉じる" : "▼ 開く"}</span>
      </button>

      {isOpen && (
        <div className="mt-4 space-y-4">
          {/* コメント投稿フォーム */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="名前（任意）"
              maxLength={20}
              className="w-full rounded-lg border border-current/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-secondary"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="感想を書く..."
              maxLength={500}
              rows={3}
              className="w-full resize-none rounded-lg border border-current/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-secondary"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs opacity-40">{body.length}/500</span>
              <button
                type="submit"
                disabled={!body.trim()}
                className="rounded-lg bg-secondary px-4 py-1.5 text-sm font-medium text-white transition disabled:opacity-30 active:scale-95"
              >
                投稿
              </button>
            </div>
          </form>

          {/* コメント一覧 */}
          {comments.length === 0 ? (
            <p className="py-4 text-center text-sm opacity-40">まだコメントがありません</p>
          ) : (
            <ul className="space-y-3">
              {comments.map((c) => (
                <li key={c.id} className="rounded-lg border border-current/5 p-3">
                  <div className="flex items-center justify-between text-xs opacity-50">
                    <span>{c.display_name}</span>
                    <span>{formatDate(c.created_at)}</span>
                  </div>
                  <p className="mt-1 text-sm whitespace-pre-wrap">{c.body}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
