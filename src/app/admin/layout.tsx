import Link from "next/link";
import type { Metadata } from "next";
import { isAdmin } from "@/lib/supabase/auth";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "管理画面",
  robots: "noindex, nofollow",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // /admin/login は認証不要
  // layoutはすべての子ルートに適用されるため、
  // loginページかどうかはchildren側で判断できない
  // → 認証チェックは各ページで行うか、middlewareで行う方が良いが、
  //   最小実装としてここでチェックし、loginページは独自layoutを持たせる
  const admin = await isAdmin();

  if (!admin) {
    // 未認証の場合、childrenのレンダリングは行うがナビは非表示
    // loginページだけがchildrenとして表示される想定
    return (
      <div className="mx-auto max-w-5xl px-4 py-6">
        {children}
      </div>
    );
  }

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
          <Link href="/admin/ab-tests" className="text-muted hover:text-text transition">
            A/Bテスト
          </Link>
          <Link href="/admin/content-funnel" className="text-muted hover:text-text transition">
            選別ファネル
          </Link>
          <Link href="/admin/retention" className="text-muted hover:text-text transition">
            離脱分析
          </Link>
          <Link href="/admin/learning-loop" className="text-muted hover:text-text transition">
            学習ループ
          </Link>
          <Link href="/admin/patterns" className="text-muted hover:text-text transition">
            パターン
          </Link>
        </nav>
      </div>
      {children}
    </div>
  );
}
