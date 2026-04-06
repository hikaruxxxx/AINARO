"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { useState, useEffect, useRef } from "react";
import LanguageSwitcher from "./LanguageSwitcher";
import SearchBar from "./SearchBar";
import PointsBadge from "@/components/novel/PointsBadge";

export default function Header() {
  const t = useTranslations("header");
  const [menuOpen, setMenuOpen] = useState(false);
  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);
  const pathname = usePathname();

  const NAV_LINKS = [
    { href: "/novels" as const, label: t("novels") },
    { href: "/new" as const, label: t("new") },
    { href: "/ranking" as const, label: t("ranking") },
  ];

  // エピソード閲覧中はスクロール方向でヘッダーの表示/非表示を切り替え
  const isReading = /^\/novels\/[^/]+\/\d+/.test(pathname);

  useEffect(() => {
    if (!isReading) {
      setVisible(true);
      return;
    }

    const handleScroll = () => {
      const currentY = window.scrollY;
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
      className={`sticky top-0 z-50 border-b border-border bg-white transition-transform duration-300 ${
        visible ? "translate-y-0" : "-translate-y-full"
      }`}
    >
      <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-4">
        {/* ロゴ */}
        <Link href="/" className="text-xl font-bold text-primary">
          {process.env.NEXT_PUBLIC_SITE_NAME || "Novelis"}
        </Link>

        {/* PCナビ */}
        <nav className="hidden items-center gap-6 text-sm md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`transition hover:text-primary ${
                pathname === link.href ? "font-bold text-primary" : "text-text"
              }`}
            >
              {link.label}
            </Link>
          ))}
          <SearchBar />
          <PointsBadge />
          <LanguageSwitcher />
        </nav>

        {/* モバイルメニュー */}
        <button
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition hover:bg-surface md:hidden"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={t("menu")}
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            {menuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* モバイルドロワー */}
      {menuOpen && (
        <nav className="border-t border-border bg-white px-4 py-3 md:hidden">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block py-2 text-sm text-text transition hover:text-primary"
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/search"
            className="block py-2 text-sm text-text transition hover:text-primary"
            onClick={() => setMenuOpen(false)}
          >
            検索
          </Link>
          <div className="pt-2 border-t border-border mt-2">
            <LanguageSwitcher />
          </div>
        </nav>
      )}
    </header>
  );
}
