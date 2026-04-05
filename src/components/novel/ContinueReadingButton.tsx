"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useEffect, useState } from "react";
import { getLastReadEpisode } from "@/lib/reading-history";

type Props = {
  novelId: string;
  slug: string;
  totalChapters: number;
};

export default function ContinueReadingButton({ novelId, slug, totalChapters }: Props) {
  const t = useTranslations("novel");
  const [lastRead, setLastRead] = useState<number | null>(null);

  useEffect(() => {
    setLastRead(getLastReadEpisode(novelId));
  }, [novelId]);

  if (lastRead === null || lastRead >= totalChapters) return null;

  const nextEp = lastRead + 1;

  return (
    <Link
      href={`/novels/${slug}/${nextEp}`}
      className="inline-block w-fit rounded-full border border-secondary px-6 py-2 text-sm font-medium text-secondary transition hover:bg-secondary hover:text-white"
    >
      {t("continueFromEp", { ep: nextEp })}
    </Link>
  );
}
