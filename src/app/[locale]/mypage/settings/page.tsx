"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function SettingsPage() {
  const t = useTranslations("mypage");

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <Link href="/mypage" className="text-sm text-muted hover:text-text transition">
          {t("backToMypage")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-text">{t("settings")}</h1>
      </div>

      <div className="space-y-6">
        <section className="rounded-lg border border-border p-6">
          <h2 className="mb-4 text-lg font-bold">{t("readingSettings")}</h2>
          <p className="text-sm text-muted">{t("readingSettingsDesc")}</p>
        </section>

        <section className="rounded-lg border border-border p-6">
          <h2 className="mb-4 text-lg font-bold">{t("account")}</h2>
          <p className="text-sm text-muted whitespace-pre-line">{t("accountDesc")}</p>
        </section>

        <section className="rounded-lg border border-border p-6">
          <h2 className="mb-4 text-lg font-bold">{t("dataManagement")}</h2>
          <p className="mb-3 text-sm text-muted">{t("dataManagementDesc")}</p>
          <button
            onClick={() => {
              if (confirm(t("deleteConfirm"))) {
                localStorage.removeItem("ainaro_reading_history");
                localStorage.removeItem("ainaro_session_id");
                window.location.reload();
              }
            }}
            className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600 transition hover:bg-red-50"
          >
            {t("deleteHistory")}
          </button>
        </section>
      </div>
    </div>
  );
}
