"use client";

// 初回訪問者向けウェルカム＋ジャンル選択オンボーディング
// 3ステップ構成:
//   1) Welcome — Novelisが何かを伝える（価値提案）
//   2) Genres — 好きなジャンルを選択（コールドスタート対策）
//   3) Ready  — 完了。ホームのおすすめへ視線を戻す
// Netflixが最初に「好きな映画を選んでください」と聞くのと同じ思想だが、
// その前に「ここは何のサイトか」を1ステップ挟むことで初訪問者の理解を助ける。

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

type Step = "welcome" | "genres" | "ready";

type Props = {
  onComplete?: (genres: string[]) => void;
};

export default function TasteOnboarding({ onComplete }: Props) {
  const t = useTranslations("home");
  const tGenre = useTranslations("genre");
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<Step>("welcome");
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

  // ジャンル保存→完了ステップへ
  const handleSaveGenres = () => {
    const genres = Array.from(selected);
    saveTasteProfile(genres);
    setStep("ready");
  };

  // モーダルを閉じる（完了 or スキップ後の最終アクション）
  const close = () => {
    setVisible(false);
    onComplete?.(Array.from(selected));
  };

  // スキップ：途中離脱でも二度と表示しない
  const handleSkip = () => {
    skipOnboarding();
    setVisible(false);
    onComplete?.([]);
  };

  // ステップインジケーター（3ドット）
  const stepIndex = step === "welcome" ? 0 : step === "genres" ? 1 : 2;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-6 shadow-2xl sm:rounded-2xl">
        {/* ステップインジケーター */}
        <div className="mb-5 flex items-center justify-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === stepIndex ? "w-6 bg-secondary" : "w-1.5 bg-border"
              }`}
            />
          ))}
        </div>

        {/* Step 1: Welcome */}
        {step === "welcome" && (
          <>
            <div className="mb-4 text-center">
              <span className="mb-3 inline-block text-4xl">📖</span>
              <h2 className="mb-2 text-xl font-bold text-text">
                {t("onboardingWelcomeTitle")}
              </h2>
              <p className="mb-3 text-base font-medium text-secondary">
                {t("onboardingWelcomeLead")}
              </p>
              <p className="text-sm leading-relaxed text-muted">
                {t("onboardingWelcomeBody")}
              </p>
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
                onClick={() => setStep("genres")}
                className="flex-1 rounded-lg bg-secondary py-2.5 text-sm font-medium text-white transition hover:opacity-90"
              >
                {t("onboardingNext")}
              </button>
            </div>
          </>
        )}

        {/* Step 2: ジャンル選択 */}
        {step === "genres" && (
          <>
            <h2 className="mb-1 text-lg font-bold text-text">{t("onboardingTitle")}</h2>
            <p className="mb-1 text-sm text-muted">{t("onboardingSubtitle")}</p>
            <p className="mb-4 text-xs text-muted/80">{t("onboardingGenreHint")}</p>

            <div className="mb-3 grid grid-cols-3 gap-2">
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

            {/* 選択数表示 */}
            <p className="mb-4 text-center text-xs text-muted">
              {t("onboardingSelectedCount", { count: selected.size })}
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep("welcome")}
                className="flex-1 rounded-lg border border-border py-2.5 text-sm text-muted transition hover:bg-surface"
              >
                {t("onboardingBack")}
              </button>
              <button
                type="button"
                onClick={handleSaveGenres}
                disabled={selected.size === 0}
                className="flex-1 rounded-lg bg-secondary py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
              >
                {t("onboardingStart")}
              </button>
            </div>
          </>
        )}

        {/* Step 3: 完了 */}
        {step === "ready" && (
          <>
            <div className="mb-5 text-center">
              <span className="mb-3 inline-block text-4xl">✨</span>
              <h2 className="mb-2 text-xl font-bold text-text">
                {t("onboardingReadyTitle")}
              </h2>
              <p className="text-sm leading-relaxed text-muted">
                {t("onboardingReadyBody")}
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              className="w-full rounded-lg bg-secondary py-2.5 text-sm font-medium text-white transition hover:opacity-90"
            >
              {t("onboardingReadyCta")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
