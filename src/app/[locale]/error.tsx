"use client";

import { Link } from "@/i18n/navigation";

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <span className="mb-4 text-4xl">📖</span>
      <h2 className="mb-2 text-lg font-bold text-text">ページの読み込みに失敗しました</h2>
      <p className="mb-2 text-sm text-muted">
        一時的な問題が発生しています。もう一度お試しください。
      </p>
      {error.message && <p className="mb-2 font-mono text-xs text-red-400">{error.message}</p>}
      {error.digest && <p className="mb-6 font-mono text-xs text-muted">digest: {error.digest}</p>}
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
        >
          再試行
        </button>
        <Link
          href="/"
          className="rounded-full border border-border px-6 py-2.5 text-sm text-muted transition hover:bg-surface"
        >
          ホームに戻る
        </Link>
      </div>
    </div>
  );
}
