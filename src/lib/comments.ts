"use client";

// ローカルコメント管理（Phase 0: localStorage）
// Phase 2でSupabase episode_commentsテーブルに移行

import type { EpisodeComment } from "@/types/novel";

const STORAGE_KEY = "ainaro_comments";

type LocalComment = {
  id: string;
  episodeId: string;
  novelId: string;
  displayName: string;
  body: string;
  createdAt: string;
};

function getAllComments(): LocalComment[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAllComments(comments: LocalComment[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(comments));
}

// エピソードのコメント取得
export function getComments(episodeId: string): EpisodeComment[] {
  return getAllComments()
    .filter((c) => c.episodeId === episodeId)
    .map((c) => ({
      id: c.id,
      user_id: null,
      session_id: "",
      episode_id: c.episodeId,
      novel_id: c.novelId,
      display_name: c.displayName,
      body: c.body,
      created_at: c.createdAt,
    }));
}

// コメント投稿
export function addComment(
  episodeId: string,
  novelId: string,
  displayName: string,
  body: string
): EpisodeComment {
  const comments = getAllComments();
  const newComment: LocalComment = {
    id: crypto.randomUUID(),
    episodeId,
    novelId,
    displayName: displayName.trim() || "名無しの読者",
    body: body.trim(),
    createdAt: new Date().toISOString(),
  };
  comments.unshift(newComment);
  // 最大1000件保持
  if (comments.length > 1000) comments.length = 1000;
  saveAllComments(comments);

  return {
    id: newComment.id,
    user_id: null,
    session_id: "",
    episode_id: newComment.episodeId,
    novel_id: newComment.novelId,
    display_name: newComment.displayName,
    body: newComment.body,
    created_at: newComment.createdAt,
  };
}

// コメント数取得
export function getCommentCount(episodeId: string): number {
  return getAllComments().filter((c) => c.episodeId === episodeId).length;
}
