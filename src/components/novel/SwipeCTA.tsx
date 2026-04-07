"use client";

import { useLocale } from "next-intl";

export default function SwipeCTA() {
  const locale = useLocale();

  return (
    <section className="mx-auto mb-10 max-w-6xl px-4 md:px-8">
      <button
        onClick={() => { window.location.href = `/${locale}/swipe`; }}
        className="group flex w-full items-center gap-4 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 p-5 text-left text-white shadow-md transition hover:shadow-lg md:p-6"
      >
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-white/20">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold md:text-base">スワイプで好みの作品を発見</p>
          <p className="text-xs text-white/70">左右にスワイプして、あなたの好みを教えてください</p>
        </div>
        <svg className="h-5 w-5 text-white/60 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </button>
    </section>
  );
}
