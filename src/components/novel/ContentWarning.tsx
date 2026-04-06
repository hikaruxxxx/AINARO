"use client";

import { useState } from "react";
import type { ContentWarningType } from "@/types/novel";

type Props = {
  warnings: ContentWarningType[];
};

const WARNING_LABELS: Record<ContentWarningType, string> = {
  violence: "暴力表現",
  gore: "グロテスク",
  sexual: "性的表現",
  death: "死亡描写",
  abuse: "虐待",
  suicide: "自殺描写",
  horror: "ホラー表現",
  drug: "薬物描写",
};

// 表示用バッジ
export function ContentWarningBadges({ warnings }: Props) {
  if (!warnings || warnings.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {warnings.map((w) => (
        <span
          key={w}
          className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 border border-amber-200"
        >
          {WARNING_LABELS[w]}
        </span>
      ))}
    </div>
  );
}

// 閲覧前の警告オーバーレイ
export default function ContentWarningOverlay({
  warnings,
  onAccept,
}: Props & { onAccept: () => void }) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || !warnings || warnings.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 text-center">
          <span className="text-3xl">⚠️</span>
          <h2 className="mt-2 text-lg font-bold">コンテンツに関する注意</h2>
        </div>

        <p className="mb-3 text-sm text-muted">
          この作品には以下の表現が含まれます。
        </p>

        <div className="mb-5 flex flex-wrap gap-2">
          {warnings.map((w) => (
            <span
              key={w}
              className="rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700 border border-amber-200"
            >
              {WARNING_LABELS[w]}
            </span>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => {
              setDismissed(true);
              onAccept();
            }}
            className="w-full rounded-xl bg-secondary py-3 text-sm font-bold text-white transition active:scale-95"
          >
            了解して読む
          </button>
          <button
            onClick={() => window.history.back()}
            className="w-full rounded-xl border border-border py-3 text-sm text-muted transition active:scale-95"
          >
            戻る
          </button>
        </div>
      </div>
    </div>
  );
}
