"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

export default function WriterApplyPage() {
  const t = useTranslations("writerApply");
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);

  // ログイン中のメールと既存 display_name をプリフィル
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      const u = data.user;
      if (!u) return;
      setAccountEmail(u.email ?? null);
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("display_name")
        .eq("user_id", u.id)
        .maybeSingle();
      if (profile?.display_name) setDisplayName(profile.display_name);
    });
  }, []);

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
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-lg px-6 py-16">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">{t("title")}</h1>
        <p className="mb-6 text-sm text-gray-600">{t("subtitle")}</p>

        {/* ログイン中アカウント表示（認証状態を可視化） */}
        {accountEmail && (
          <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
            <span className="text-gray-500">{t("loggedInAs")}: </span>
            <span className="font-medium">{accountEmail}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="displayName" className="mb-1.5 block text-sm font-medium text-gray-900">
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
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <p className="mt-1 text-xs text-gray-500">{t("penNameHint")}</p>
          </div>

          <div className="flex items-start gap-3">
            <input
              id="terms"
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="terms" className="text-sm text-gray-900">
              <Link href="/terms" className="text-indigo-600 underline hover:text-indigo-500">
                {t("termsLink")}
              </Link>
              {t("termsAgree")}
            </label>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
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

        <div className="mt-8 rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="mb-2 text-sm font-bold text-gray-900">{t("benefitsTitle")}</h3>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-indigo-600">&#10003;</span>
              {t("benefit1")}
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-indigo-600">&#10003;</span>
              {t("benefit2")}
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-indigo-600">&#10003;</span>
              {t("benefit3")}
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
