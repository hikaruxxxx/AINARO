"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

const NAV_ICONS = {
  home: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  recommend: "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z",
  discover: "M7 4V2m0 2a2 2 0 100 4m0-4a2 2 0 110 4m10-4V2m0 2a2 2 0 100 4m0-4a2 2 0 110 4M3 20h18M3 16h18M3 12h18",
  novels: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
  mypage: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
};

export default function BottomNav() {
  const t = useTranslations("bottomNav");
  const pathname = usePathname();

  const NAV_ITEMS = [
    { href: "/" as const, label: t("home"), icon: NAV_ICONS.home },
    { href: "/recommend" as const, label: t("recommend"), icon: NAV_ICONS.recommend },
    { href: "/discover" as const, label: t("discover"), icon: NAV_ICONS.discover },
    { href: "/novels" as const, label: t("novels"), icon: NAV_ICONS.novels },
    { href: "/mypage" as const, label: t("mypage"), icon: NAV_ICONS.mypage },
  ];

  // 管理画面・エピソード閲覧中・発見ページ・おすすめページでは非表示
  if (pathname.startsWith("/admin") || pathname.startsWith("/discover") || pathname.startsWith("/recommend") || pathname.startsWith("/swipe") || /^\/novels\/[^/]+\/\d+/.test(pathname)) {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-white md:hidden">
      <div className="flex h-14 items-center justify-around">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 text-[10px] transition ${
                isActive ? "text-primary" : "text-muted"
              }`}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
              </svg>
              {item.label}
            </Link>
          );
        })}
      </div>
      {/* Safe area（iPhoneのホームバー対応） */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
