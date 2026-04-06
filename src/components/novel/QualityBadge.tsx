"use client";

// 品質シグナルバッジ
// 「読者の92%が読了」のような社会的証明を表示
// なろう・カクヨムにはない「ハズレなし」の信頼を視覚化する

import { useTranslations } from "next-intl";

type Props = {
  completionRate?: number | null; // 0-100
  nextEpisodeRate?: number | null; // 0-100
  size?: "sm" | "md";
};

export default function QualityBadge({ completionRate, nextEpisodeRate, size = "sm" }: Props) {
  const t = useTranslations("home");

  if (!completionRate && !nextEpisodeRate) return null;

  // 読了率が高い作品にのみバッジを表示（70%以上）
  const showCompletion = completionRate != null && completionRate >= 70;
  const showNext = nextEpisodeRate != null && nextEpisodeRate >= 70;

  if (!showCompletion && !showNext) return null;

  const textSize = size === "sm" ? "text-[10px]" : "text-xs";

  return (
    <div className="flex flex-wrap gap-1">
      {showCompletion && (
        <span className={`inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 ${textSize} font-medium text-emerald-700`}>
          <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a7 7 0 110 14A7 7 0 018 1zm3.22 4.97a.75.75 0 00-1.06-1.06L7.08 8h-.01L6.03 6.97a.75.75 0 00-1.06 1.06l1.5 1.5a.75.75 0 001.06 0l3.69-3.56z" />
          </svg>
          {t("completionBadge", { rate: Math.round(completionRate!) })}
        </span>
      )}
      {showNext && (
        <span className={`inline-flex items-center gap-0.5 rounded-full bg-blue-50 px-2 py-0.5 ${textSize} font-medium text-blue-700`}>
          <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8.22 2.97a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L11.69 8 8.22 4.53a.75.75 0 010-1.06z" />
            <path d="M1.5 8a.75.75 0 01.75-.75h10a.75.75 0 010 1.5h-10A.75.75 0 011.5 8z" />
          </svg>
          {t("nextEpBadge", { rate: Math.round(nextEpisodeRate!) })}
        </span>
      )}
    </div>
  );
}
