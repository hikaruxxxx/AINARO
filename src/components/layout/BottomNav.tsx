"use client";

import { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { usePathname } from "@/i18n/navigation";

const NAV_ICONS = {
  home: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  discover: "M7 4V2m0 2a2 2 0 100 4m0-4a2 2 0 110 4m10-4V2m0 2a2 2 0 100 4m0-4a2 2 0 110 4M3 20h18M3 16h18M3 12h18",
  novels: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
  mypage: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
};

export default function BottomNav() {
  const t = useTranslations("bottomNav");
  const locale = useLocale();
  const pathname = usePathname();
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setHidden(document.body.hasAttribute("data-reading"));
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ["data-reading"] });
    return () => observer.disconnect();
  }, []);

  if (pathname.startsWith("/admin") || /^\/novels\/[^/]+\/\d+/.test(pathname)) {
    return null;
  }

  const NAV_ITEMS = [
    { href: "/", label: t("home"), icon: NAV_ICONS.home },
    { href: "/swipe", label: t("discover"), icon: NAV_ICONS.discover },
    { href: "/novels", label: t("novels"), icon: NAV_ICONS.novels },
    { href: "/mypage", label: t("mypage"), icon: NAV_ICONS.mypage },
  ];

  return (
    <nav className={`fixed bottom-0 left-0 right-0 z-[60] border-t border-border bg-white/95 backdrop-blur-sm transition-all duration-300 ${
      hidden ? "translate-y-full opacity-0" : "translate-y-0 opacity-100"
    }`}>
      <div className="flex h-14 items-center justify-around">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <button
              key={item.href}
              onClick={() => { window.location.href = `/${locale}${item.href}`; }}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 text-[10px] transition ${
                isActive ? "text-primary" : "text-muted"
              }`}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
              </svg>
              {item.label}
            </button>
          );
        })}
      </div>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
