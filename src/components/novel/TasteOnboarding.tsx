"use client";

// 初回訪問者向けジャンル選択オンボーディング
// Netflixが最初に「好きな映画を選んでください」と聞くのと同じ。
// コールドスタート問題を解決し、初回からパーソナライズされた体験を提供。

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { isOnboardingDone, saveTasteProfile, skipOnboarding } from "@/lib/taste-profile";
import { hasReadingHistory } from "@/lib/reading-history";

const GENRES = [
  { id: "fantasy", emoji: "🗡️" },
  { id: "romance", emoji: "💕" },
  { id: "villainess", emoji: "👑" },
  { id: "horror", emoji: "👻" },
  { id: "mystery", emoji: "🔍" },
  { id: "scifi", emoji: "🚀" },
  { id: "drama", emoji: "🎭" },
  { id: "comedy", emoji: "😂" },
  { id: "action", emoji: "⚡" },
] as const;

type Props = {
  onComplete?: (genres: string[]) => void;
};

export default function TasteOnboarding({ onComplete }: Props) {
  const t = useTranslations("home");
  const tGenre = useTranslations("genre");
  const [visible, setVisible] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    // 読書履歴がなく、オンボーディング未完了の場合のみ表示
    if (!isOnboardingDone() && !hasReadingHistory()) {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const toggle = (genreId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(genreId)) {
        next.delete(genreId);
      } else {
        next.add(genreId);
      }
      return next;
    });
  };

  const handleSubmit = () => {
    const genres = Array.from(selected);
    saveTasteProfile(genres);
    setVisible(false);
    onComplete?.(genres);
  };

  const handleSkip = () => {
    skipOnboarding();
    setVisible(false);
    onComplete?.([]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl">
        <h2 className="mb-1 text-lg font-bold text-text">{t("onboardingTitle")}</h2>
        <p className="mb-4 text-sm text-muted">{t("onboardingSubtitle")}</p>

        <div className="mb-5 grid grid-cols-3 gap-2">
          {GENRES.map(({ id, emoji }) => (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              className={`flex flex-col items-center gap-1 rounded-lg border-2 px-3 py-3 text-sm transition ${
                selected.has(id)
                  ? "border-secondary bg-secondary/10 text-secondary font-medium"
                  : "border-border text-muted hover:border-secondary/50"
              }`}
            >
              <span className="text-xl">{emoji}</span>
              <span className="text-xs">{tGenre(id)}</span>
            </button>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleSkip}
            className="flex-1 rounded-lg border border-border py-2.5 text-sm text-muted transition hover:bg-surface"
          >
            {t("onboardingSkip")}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={selected.size === 0}
            className="flex-1 rounded-lg bg-secondary py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
          >
            {t("onboardingStart")}
          </button>
        </div>
      </div>
    </div>
  );
}
