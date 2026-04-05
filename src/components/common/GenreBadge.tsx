"use client";

import { useTranslations } from "next-intl";

// ジャンルキー一覧（サーバーコンポーネントからの参照用）
export const GENRE_KEYS = [
  "fantasy", "romance", "villainess", "horror", "mystery",
  "scifi", "drama", "comedy", "action", "other",
] as const;

export default function GenreBadge({ genre }: { genre: string }) {
  const t = useTranslations("genre");

  return (
    <span className="inline-block rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
      {t.has(genre) ? t(genre) : genre}
    </span>
  );
}
