"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);
  const pathname = usePathname();

  // エピソード閲覧中はスクロール方向でヘッダーの表示/非表示を切り替え
  const isReading = /^\/novels\/[^/]+\/\d+/.test(pathname);

  useEffect(() => {
    if (!isReading) {
      setVisible(true);
      return;
    }

    const handleScroll = () => {
      const currentY = window.scrollY;
      // 上スクロール→表示、下スクロール→隠す
      if (currentY < lastScrollY.current || currentY < 50) {
        setVisible(true);
      } else {
        setVisible(false);
      }
      lastScrollY.current = currentY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isReading]);

  return (
    <header
      className={`sticky top-0 z-50 border-b border-border bg-bg/95 backdrop-blur transition-transform duration-300 ${
        visible ? "translate-y-0" : "-translate-y-full"
      }`}
    >
      <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-4">
        {/* ロゴ */}
        <Link href="/" className="text-lg font-bold text-primary">
          {process.env.NEXT_PUBLIC_SITE_NAME || "Novelis"}
        </Link>

        {/* PCナビ */}
        <nav className="hidden items-center gap-6 text-sm md:flex">
          <Link href="/novels" className="text-muted hover:text-text transition">
            作品一覧
          </Link>
          <Link href="/new" className="text-muted hover:text-text transition">
            新着
          </Link>
          <Link href="/ranking" className="text-muted hover:text-text transition">
            ランキング
          </Link>
        </nav>

        {/* モバイルメニューボタン */}
        <button
          className="flex items-center justify-center md:hidden"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="メニューを開く"
        >
          <svg className="h-6 w-6 text-text" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {menuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* モバイルメニュー */}
      {menuOpen && (
        <nav className="border-t border-border bg-bg px-4 py-3 md:hidden">
          <Link href="/novels" className="block py-2 text-muted hover:text-text" onClick={() => setMenuOpen(false)}>
            作品一覧
          </Link>
          <Link href="/new" className="block py-2 text-muted hover:text-text" onClick={() => setMenuOpen(false)}>
            新着
          </Link>
          <Link href="/ranking" className="block py-2 text-muted hover:text-text" onClick={() => setMenuOpen(false)}>
            ランキング
          </Link>
        </nav>
      )}
    </header>
  );
}
