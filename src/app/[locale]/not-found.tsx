import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex h-[80dvh] flex-col items-center justify-center px-6 text-center">
      <span className="mb-4 text-6xl">📖</span>
      <h1 className="mb-2 text-2xl font-bold text-text">
        ページが見つかりません
      </h1>
      <p className="mb-6 text-sm text-muted">
        お探しのページは存在しないか、移動した可能性があります。
      </p>
      <div className="flex gap-4">
        <Link
          href="/"
          className="rounded-full bg-secondary px-6 py-2 text-sm font-medium text-white transition hover:opacity-90"
        >
          トップへ戻る
        </Link>
        <Link
          href="/novels"
          className="rounded-full border border-border px-6 py-2 text-sm font-medium text-text transition hover:bg-surface"
        >
          作品一覧
        </Link>
      </div>
    </div>
  );
}
