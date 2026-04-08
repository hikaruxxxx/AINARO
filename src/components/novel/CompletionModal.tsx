"use client";

import { useEffect } from "react";
import { Link } from "@/i18n/navigation";

type Props = {
  novel: { slug: string; title: string };
  totalChapters: number;
  onClose: () => void;
};

// 作品完走時に表示するお祝いモーダル
// EXIT戦略: 完走の達成感を最大化 + Xシェアで作者ストーリー型バイラル(柱3)を駆動
export default function CompletionModal({ novel, totalChapters, onClose }: Props) {
  // ESCで閉じる
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const shareUrl = typeof window !== "undefined"
    ? `${window.location.origin}/novels/${novel.slug}`
    : "";
  const shareText = `「${novel.title}」(全${totalChapters}話) を読み終えました📚\n\nNovelisで読む:`;
  const xUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 text-6xl">🎉</div>
        <h2 className="mb-2 text-xl font-extrabold">完走おめでとうございます!</h2>
        <p className="mb-1 text-sm font-bold">{novel.title}</p>
        <p className="mb-6 text-xs text-muted">全{totalChapters}話を最後まで読み切りました</p>

        <div className="mb-4 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 p-4 text-xs text-amber-900 dark:from-amber-950/40 dark:to-orange-950/40 dark:text-amber-200">
          🏅 完走バッジを獲得しました
        </div>

        <div className="flex flex-col gap-2">
          <a
            href={xUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-black px-6 py-3 text-sm font-bold text-white transition hover:bg-gray-800"
          >
            <span>𝕏</span> 完走をシェア
          </a>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full border border-border bg-white px-6 py-3 text-sm font-bold text-foreground transition hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700"
          >
            次の作品を探す
          </Link>
          <button
            onClick={onClose}
            className="mt-1 text-xs text-muted hover:text-foreground"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
