"use client";

import { useState, useCallback } from "react";
import { useRouter } from "@/i18n/navigation";

type Props = {
  onClose?: () => void;
  compact?: boolean;
};

export default function SearchBar({ onClose, compact = false }: Props) {
  const [query, setQuery] = useState("");
  const router = useRouter();

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const q = query.trim();
      if (!q) return;
      router.push(`/search?q=${encodeURIComponent(q)}`);
      onClose?.();
    },
    [query, router, onClose]
  );

  if (compact) {
    return (
      <button
        onClick={onClose}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition hover:bg-surface"
        aria-label="検索"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="relative">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="作品・タグを検索..."
        className="h-8 w-40 rounded-full border border-border bg-surface px-3 pl-8 text-xs outline-none transition focus:w-56 focus:border-secondary"
        autoFocus
      />
      <svg
        className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    </form>
  );
}
