"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

// 没入系ページではFooterを非表示にして読書体験を優先（locale抜きのパスで判定）
const IMMERSIVE_PATHS = [/^\/discover$/, /^\/swipe$/, /^\/novels\/[^/]+\/[^/]+$/];

export default function Footer() {
  const t = useTranslations("footer");
  const pathname = usePathname();
  if (IMMERSIVE_PATHS.some((re) => re.test(pathname))) return null;

  return (
    <footer className="mt-auto border-t border-border bg-surface">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex flex-col items-center gap-4 text-sm text-muted">
          <p className="font-bold text-primary">
            {process.env.NEXT_PUBLIC_SITE_NAME || "Novelis"}
          </p>
          <p>{t("tagline")}</p>
          <nav className="flex flex-wrap justify-center gap-4">
            <Link href="/about" className="hover:text-text transition">
              {t("about")}
            </Link>
            <Link href="/terms" className="hover:text-text transition">
              {t("terms")}
            </Link>
            <Link href="/privacy" className="hover:text-text transition">
              {t("privacy")}
            </Link>
            <Link href="/contact" className="hover:text-text transition">
              {t("contact")}
            </Link>
          </nav>
          <p className="text-xs">&copy; {new Date().getFullYear()} Novelis</p>
        </div>
      </div>
    </footer>
  );
}
