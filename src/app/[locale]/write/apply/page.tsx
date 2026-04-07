"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function WriterApplyPage() {
  const t = useTranslations("writerApply");
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/writer/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName,
          agreed_to_terms: agreedToTerms,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error);
        return;
      }

      router.push("/dashboard");
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <h1 className="mb-2 text-2xl font-bold text-text">{t("title")}</h1>
      <p className="mb-8 text-sm text-muted">{t("subtitle")}</p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="displayName" className="mb-1.5 block text-sm font-medium text-text">
            {t("penNameLabel")}
          </label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t("penNamePlaceholder")}
            maxLength={50}
            required
            className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-text placeholder:text-muted focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-900"
          />
          <p className="mt-1 text-xs text-muted">{t("penNameHint")}</p>
        </div>

        <div className="flex items-start gap-3">
          <input
            id="terms"
            type="checkbox"
            checked={agreedToTerms}
            onChange={(e) => setAgreedToTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <label htmlFor="terms" className="text-sm text-text">
            <Link href="/terms" className="text-indigo-600 underline hover:text-indigo-500">
              {t("termsLink")}
            </Link>
            {t("termsAgree")}
          </label>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-400">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !displayName.trim() || !agreedToTerms}
          className="w-full rounded-lg bg-indigo-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? t("submitting") : t("submit")}
        </button>
      </form>

      <div className="mt-8 rounded-xl bg-gray-50 p-5 dark:bg-gray-900">
        <h3 className="mb-2 text-sm font-bold text-text">{t("benefitsTitle")}</h3>
        <ul className="space-y-2 text-sm text-muted">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-indigo-500">&#10003;</span>
            {t("benefit1")}
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-indigo-500">&#10003;</span>
            {t("benefit2")}
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-indigo-500">&#10003;</span>
            {t("benefit3")}
          </li>
        </ul>
      </div>
    </div>
  );
}
