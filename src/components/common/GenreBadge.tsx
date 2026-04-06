"use client";

import { useTranslations } from "next-intl";

// 後方互換: サーバーコンポーネントからは @/lib/constants を使うこと
export { GENRE_KEYS } from "@/lib/constants";

export default function GenreBadge({ genre }: { genre: string }) {
  const t = useTranslations("genre");

  return (
    <span className="inline-block rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
      {t.has(genre) ? t(genre) : genre}
    </span>
  );
}
