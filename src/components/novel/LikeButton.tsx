"use client";

import { useState, useEffect } from "react";
import { isLiked, toggleLike } from "@/lib/likes";

type Props = {
  episodeId: string;
};

export default function LikeButton({ episodeId }: Props) {
  const [liked, setLiked] = useState(false);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    setLiked(isLiked(episodeId));
  }, [episodeId]);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const newState = toggleLike(episodeId);
    setLiked(newState);
    if (newState) {
      setAnimating(true);
      setTimeout(() => setAnimating(false), 300);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm transition ${
        liked
          ? "border-red-300 bg-red-50 text-red-500"
          : "border-border bg-surface text-muted hover:text-red-400 hover:border-red-200"
      } ${animating ? "scale-110" : "scale-100"}`}
      aria-label={liked ? "いいね解除" : "いいね"}
    >
      <span className={`text-lg ${animating ? "animate-bounce" : ""}`}>
        {liked ? "♥" : "♡"}
      </span>
      <span>{liked ? "いいね済み" : "いいね"}</span>
    </button>
  );
}
