"use client";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="py-12 text-center">
      <h2 className="mb-4 text-lg font-bold text-red-600">エラーが発生しました</h2>
      <p className="mb-2 text-sm text-muted">{error.message}</p>
      {error.digest && <p className="mb-4 text-xs text-muted">digest: {error.digest}</p>}
      <button
        onClick={reset}
        className="rounded bg-primary px-4 py-2 text-sm text-white hover:opacity-90"
      >
        再試行
      </button>
    </div>
  );
}
