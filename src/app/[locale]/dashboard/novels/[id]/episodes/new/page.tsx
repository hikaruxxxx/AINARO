"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { EditorModeToggle } from "@/components/dashboard/EditorModeToggle";
import { AIAssistPanel } from "@/components/dashboard/AIAssistPanel";

export default function NewEpisodePage() {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const params = useParams();
  const novelId = params.id as string;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [episodeNumber, setEpisodeNumber] = useState(1);
  const [title, setTitle] = useState("");
  const [bodyMd, setBodyMd] = useState("");
  const [isFree, setIsFree] = useState(true);
  // モード切替: デフォルトは通常執筆（自分で書く）。AI支援はオプション
  const [aiMode, setAiMode] = useState(false);

  const characterCount = bodyMd.replace(/[\s\n\r]/g, "").length;

  const handleSaveDraft = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/writer/novels/${novelId}/episodes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          episode_number: episodeNumber,
          title,
          body_md: bodyMd,
          is_free: isFree,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      router.push(`/dashboard/novels/${novelId}/episodes/${data.id}`);
    } catch { setError(t("errorGeneric")); }
    finally { setSaving(false); }
  };

  return (
    <div className={`mx-auto ${aiMode ? "max-w-6xl" : "max-w-4xl"}`}>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <Link href={`/dashboard/novels/${novelId}`} className="text-sm text-gray-500 hover:text-gray-900">
            ← {t("backToEpisodes")}
          </Link>
          <h1 className="mt-2 text-xl font-bold text-gray-900">{t("newEpisode")}</h1>
        </div>
        <EditorModeToggle aiMode={aiMode} onChange={setAiMode} />
      </div>

      <div className={aiMode ? "grid gap-6 lg:grid-cols-[1fr_300px]" : ""}>
      <div className="space-y-5">
        {/* 話数 + タイトル */}
        <div className="flex gap-4">
          <div className="w-24">
            <label className="mb-1.5 block text-sm font-medium text-gray-900">{t("episodeNumber")}</label>
            <input
              type="number"
              min={1}
              value={episodeNumber}
              onChange={(e) => setEpisodeNumber(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 text-center focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1.5 block text-sm font-medium text-gray-900">{t("episodeTitle")}</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* 本文エディタ */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-900">{t("body")}</label>
          </div>
          <textarea
            value={bodyMd}
            onChange={(e) => setBodyMd(e.target.value)}
            rows={25}
            placeholder={t("bodyPlaceholder")}
            className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 font-mono text-sm leading-relaxed text-gray-900 placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* 無料/有料 */}
        <div className="flex items-center gap-3">
          <input
            id="isFree"
            type="checkbox"
            checked={isFree}
            onChange={(e) => setIsFree(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <label htmlFor="isFree" className="text-sm text-gray-900">{t("freeLabel")}</label>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* ボタン */}
        <div className="flex gap-3">
          <button
            onClick={handleSaveDraft}
            disabled={saving || !title.trim()}
            className="flex-1 rounded-lg border border-gray-200 bg-white px-6 py-3 text-sm font-bold text-gray-900 transition hover:bg-gray-50 disabled:opacity-50"
          >
            {t("saveDraft")}
          </button>
        </div>
      </div>

      {aiMode && <AIAssistPanel />}
      </div>
    </div>
  );
}
