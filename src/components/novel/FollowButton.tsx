"use client";

import { useState, useEffect } from "react";
import { isFollowing, toggleFollow } from "@/lib/follows";

type Props = {
  novelId: string;
};

export default function FollowButton({ novelId }: Props) {
  const [following, setFollowing] = useState(false);

  useEffect(() => {
    setFollowing(isFollowing(novelId));
  }, [novelId]);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const newState = toggleFollow(novelId);
    setFollowing(newState);
  };

  return (
    <button
      onClick={handleClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition ${
        following
          ? "border-secondary bg-secondary/10 text-secondary"
          : "border-border bg-surface text-muted hover:border-secondary hover:text-secondary"
      }`}
      aria-label={following ? "フォロー解除" : "フォロー"}
    >
      <svg className="h-4 w-4" fill={following ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
      <span>{following ? "フォロー中" : "フォロー"}</span>
    </button>
  );
}
