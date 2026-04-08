"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const t = useTranslations("login");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || `/${locale}/mypage`;
  const errorParam = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(
    errorParam ? t("errorGeneric") : null
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      // コールバックはロケール非依存。next には locale 込みのパスを渡す
      const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo,
          // 既存ユーザーがいなければ自動作成（=サインアップを兼ねる）
          shouldCreateUser: true,
        },
      });

      if (error) {
        setError(error.message);
        return;
      }

      setSent(true);
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <div className="rounded-2xl border border-border bg-surface p-8">
        <h1 className="mb-2 text-2xl font-bold text-text">{t("title")}</h1>
        <p className="mb-8 text-sm text-muted">{t("subtitle")}</p>

        {sent ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300">
              <p className="font-bold">{t("sentTitle")}</p>
              <p className="mt-1">{t("sentBody", { email })}</p>
            </div>
            <p className="text-xs text-muted">{t("sentHint")}</p>
            <button
              type="button"
              onClick={() => {
                setSent(false);
                setEmail("");
              }}
              className="text-sm text-secondary hover:underline"
            >
              {t("resend")}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-text">
                {t("emailLabel")}
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full rounded-lg bg-secondary px-6 py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? t("sending") : t("submit")}
            </button>

            <p className="text-center text-xs text-muted">
              {t("noPassword")}
            </p>
          </form>
        )}

        <div className="mt-6 border-t border-border pt-4 text-center">
          <Link href="/" className="text-xs text-muted hover:text-text">
            ← {t("backToHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}
