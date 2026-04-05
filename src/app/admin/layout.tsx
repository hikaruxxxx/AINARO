import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "管理画面",
  robots: "noindex, nofollow",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* 管理画面ヘッダー */}
      <div className="mb-6 flex items-center gap-6 border-b border-border pb-4">
        <h1 className="text-lg font-bold text-primary">管理画面</h1>
        <nav className="flex gap-4 text-sm">
          <Link href="/admin/novels" className="text-muted hover:text-text transition">
            作品管理
          </Link>
          <Link href="/admin/stats" className="text-muted hover:text-text transition">
            統計
          </Link>
          <Link href="/admin/agents/ai-detection" className="text-muted hover:text-text transition">
            AI検出
          </Link>
          <Link href="/admin/agents/popularity-evaluation" className="text-muted hover:text-text transition">
            人気評価
          </Link>
          <Link href="/admin/agents/proofreading" className="text-muted hover:text-text transition">
            校正
          </Link>
        </nav>
      </div>
      {children}
    </div>
  );
}
