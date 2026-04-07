"use client";

// 初めてエピソードを開いた読者向けの操作ツアー
// 4ステップでReaderの主要操作（タップ・自動次話遷移・読書設定）を伝える。
// localStorageで1回だけ表示する。

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

const STORAGE_KEY = "ainaro_reader_tour_done";

function isTourDone(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(STORAGE_KEY) === "true";
}

function markTourDone() {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, "true");
}

export default function ReaderTour() {
  const t = useTranslations("episode");
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!isTourDone()) {
      // 本文がレンダリングされた直後に少し遅延して表示
      const timer = setTimeout(() => setVisible(true), 400);
      return () => clearTimeout(timer);
    }
  }, []);

  if (!visible) return null;

  // 4ステップの内容
  const steps = [
    { icon: "👆", title: t("tourStep1Title"), body: t("tourStep1Body") },
    { icon: "↓", title: t("tourStep2Title"), body: t("tourStep2Body") },
    { icon: "Aa", title: t("tourStep3Title"), body: t("tourStep3Body") },
    { icon: "✨", title: t("tourStep4Title"), body: t("tourStep4Body") },
  ];

  const isLast = step === steps.length - 1;
  const current = steps[step];

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isLast) {
      markTourDone();
      setVisible(false);
    } else {
      setStep(step + 1);
    }
  };

  const handleSkip = (e: React.MouseEvent) => {
    e.stopPropagation();
    markTourDone();
    setVisible(false);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-6 text-gray-900 shadow-2xl sm:rounded-2xl">
        {/* ステップインジケーター */}
        <div className="mb-5 flex items-center justify-center gap-1.5">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-6 bg-secondary" : "w-1.5 bg-gray-200"
              }`}
            />
          ))}
        </div>

        {/* アイコン + 説明 */}
        <div className="mb-6 text-center">
          <div className="mb-3 inline-flex h-16 w-16 items-center justify-center rounded-full bg-secondary/10 text-3xl font-bold text-secondary">
            {current.icon}
          </div>
          <h2 className="mb-2 text-lg font-bold">{current.title}</h2>
          <p className="text-sm leading-relaxed text-gray-600">{current.body}</p>
        </div>

        {/* ボタン */}
        <div className="flex gap-3">
          {!isLast && (
            <button
              type="button"
              onClick={handleSkip}
              className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm text-gray-500 transition hover:bg-gray-50"
            >
              {t("tourSkip")}
            </button>
          )}
          <button
            type="button"
            onClick={handleNext}
            className="flex-1 rounded-lg bg-secondary py-2.5 text-sm font-medium text-white transition hover:opacity-90"
          >
            {isLast ? t("tourStart") : t("tourNext")}
          </button>
        </div>
      </div>
    </div>
  );
}
