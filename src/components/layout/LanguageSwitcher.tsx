"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";

export default function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const toggleLocale = () => {
    const next = locale === "ja" ? "en" : "ja";
    router.replace(pathname, { locale: next });
  };

  return (
    <button
      onClick={toggleLocale}
      className="rounded-md border border-border px-2 py-1 text-xs text-muted transition hover:bg-surface hover:text-text"
    >
      {locale === "ja" ? "EN" : "日本語"}
    </button>
  );
}
