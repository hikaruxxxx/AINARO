import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-surface">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex flex-col items-center gap-4 text-sm text-muted">
          <p className="font-bold text-primary">
            {process.env.NEXT_PUBLIC_SITE_NAME || "Novelis"}
          </p>
          <p>もっと面白い小説を、すべての人に</p>
          <nav className="flex flex-wrap justify-center gap-4">
            <Link href="/about" className="hover:text-text transition">
              サイト概要
            </Link>
            <Link href="/terms" className="hover:text-text transition">
              利用規約
            </Link>
            <Link href="/privacy" className="hover:text-text transition">
              プライバシーポリシー
            </Link>
            <Link href="/contact" className="hover:text-text transition">
              お問い合わせ
            </Link>
          </nav>
          <p className="text-xs">&copy; {new Date().getFullYear()} Novelis</p>
        </div>
      </div>
    </footer>
  );
}
