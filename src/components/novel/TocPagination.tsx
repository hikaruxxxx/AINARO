import { Link } from "@/i18n/navigation";

type Props = {
  currentPage: number;
  totalPages: number;
  slug: string;
};

export default function TocPagination({ currentPage, totalPages, slug }: Props) {
  // 表示するページ番号を計算（現在ページの前後2ページ + 最初と最後）
  const pages: (number | "...")[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "...") {
      pages.push("...");
    }
  }

  return (
    <nav className="mt-6 flex items-center justify-center gap-1" aria-label="目次ページネーション">
      {currentPage > 1 && (
        <Link
          href={`/novels/${slug}?page=${currentPage - 1}`}
          className="rounded px-3 py-2 text-sm text-muted hover:bg-surface transition"
        >
          &lt;
        </Link>
      )}
      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`ellipsis-${i}`} className="px-2 text-sm text-muted">...</span>
        ) : (
          <Link
            key={p}
            href={`/novels/${slug}?page=${p}`}
            className={`rounded px-3 py-2 text-sm transition ${
              p === currentPage
                ? "bg-secondary text-white font-medium"
                : "text-muted hover:bg-surface"
            }`}
          >
            {p}
          </Link>
        )
      )}
      {currentPage < totalPages && (
        <Link
          href={`/novels/${slug}?page=${currentPage + 1}`}
          className="rounded px-3 py-2 text-sm text-muted hover:bg-surface transition"
        >
          &gt;
        </Link>
      )}
    </nav>
  );
}
