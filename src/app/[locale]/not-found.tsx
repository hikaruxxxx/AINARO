import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";

export default async function NotFound() {
  const t = await getTranslations("notFound");

  return (
    <div className="flex h-[80dvh] flex-col items-center justify-center px-6 text-center">
      <span className="mb-4 text-6xl">📖</span>
      <h1 className="mb-2 text-2xl font-bold text-text">{t("title")}</h1>
      <p className="mb-6 text-sm text-muted">{t("description")}</p>
      <div className="flex gap-4">
        <Link
          href="/"
          className="rounded-full bg-secondary px-6 py-2 text-sm font-medium text-white transition hover:opacity-90"
        >
          {t("backToTop")}
        </Link>
        <Link
          href="/novels"
          className="rounded-full border border-border px-6 py-2 text-sm font-medium text-text transition hover:bg-surface"
        >
          {t("novelsList")}
        </Link>
      </div>
    </div>
  );
}
