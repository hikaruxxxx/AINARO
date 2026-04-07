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

  // 発見・おすすめページでは非表示
  if (pathname.startsWith("/discover") || pathname.startsWith("/recommend") || pathname.startsWith("/swipe")) return null;

  const isReading = /^\/novels\/[^/]+\/\d+/.test(pathname);

  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;

      if (isReading) {
        if (currentY < lastScrollY.current || currentY < 50) {
          setVisible(true);
        } else {
          setVisible(false);
        }
      }
      lastScrollY.current = currentY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isReading]);

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        visible ? "translate-y-0" : "-translate-y-full"
      } border-b border-border/50 bg-white/95 backdrop-blur-md shadow-sm`}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 md:px-8">
        {/* ロゴ */}
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl font-bold tracking-tight text-gray-900">
            {process.env.NEXT_PUBLIC_SITE_NAME || "Novelis"}
          </span>
        </Link>

        {/* PCナビ */}
        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                pathname === link.href
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              {link.label}
            </Link>
          ))}
          <div className="ml-2">
            <SearchBar />
          </div>
          <PointsBadge />
          <LanguageSwitcher />
        </nav>

        {/* モバイルメニュー */}
        <button
          className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100 md:hidden"
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
        <nav className="border-t border-gray-100 bg-white px-4 py-2 md:hidden">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`block rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                pathname === link.href
                  ? "bg-gray-50 text-gray-900"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/search"
            className="block rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
            onClick={() => setMenuOpen(false)}
          >
            検索
          </Link>
          <div className="mt-2 border-t border-gray-100 pt-2">
            <LanguageSwitcher />
          </div>
        </nav>
      )}
    </header>
  );
}
