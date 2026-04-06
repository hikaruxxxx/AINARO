"use client";

import { Link } from "@/i18n/navigation";

export default function SwipeError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-gray-50 px-8 text-center">
      <p className="mb-4 text-sm text-gray-500">ページの読み込みに問題が発生しました</p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="rounded-full bg-gray-900 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800"
        >
          再試行
        </button>
        <Link
          href="/"
          className="rounded-full border border-gray-300 px-6 py-2.5 text-sm text-gray-600 transition hover:bg-gray-100"
        >
          ホームに戻る
        </Link>
      </div>
    </div>
  );
}
