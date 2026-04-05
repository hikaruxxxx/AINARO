"use client";

import { useState, useEffect } from "react";
import { isBookmarked, toggleBookmark } from "@/lib/bookmarks";

type Props = {
  novelId: string;
  size?: "sm" | "md";
};

export default function BookmarkButton({ novelId, size = "md" }: Props) {
  const [bookmarked, setBookmarked] = useState(false);

  useEffect(() => {
    setBookmarked(isBookmarked(novelId));
  }, [novelId]);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const newState = toggleBookmark(novelId);
    setBookmarked(newState);
  };

  const sizeClasses = size === "sm" ? "h-8 w-8 text-lg" : "h-10 w-10 text-xl";

  return (
    <button
      onClick={handleClick}
      className={`flex items-center justify-center rounded-full border transition ${sizeClasses} ${
        bookmarked
          ? "border-red-300 bg-red-50 text-red-500"
          : "border-border bg-surface text-muted hover:text-red-400"
      }`}
      aria-label={bookmarked ? "ブックマーク解除" : "ブックマークに追加"}
      title={bookmarked ? "ブックマーク解除" : "ブックマークに追加"}
    >
      {bookmarked ? "♥" : "♡"}
    </button>
  );
}
