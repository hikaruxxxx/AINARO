"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

type EpisodeData = {
  id: string;
  episode_number: number;
  title: string;
  body_md: string;
  character_count: number;
  status: string;
  is_free: boolean;
};

export default function EditEpisodePage() {
  const t = useTranslations("dashboard");
  const params = useParams();
  const novelId = params.id as string;
  const episodeId = params.episodeId as string;

  const [episode, setEpisode] = useState<EpisodeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  // フォーム状態
  const [title, setTitle] = useState("");
  const [bodyMd, setBodyMd] = useState("");
  const [isFree, setIsFree] = useState(true);

  const characterCount = bodyMd.replace(/[\s\n\r]/g, "").length;

  // エピソードデータを取得
  useEffect(() => {
    const fetchEpisode = async () => {
      try {
        const res = await fetch(`/api/writer/novels/${novelId}/episodes/${episodeId}`);
        if (!res.ok) { setError(t("errorGeneric")); return; }
        const data = await res.json();
        setEpisode(data);
        setTitle(data.title);
        setBodyMd(data.body_md || "");
        setIsFree(data.is_free);
      } catch { setError(t("errorGeneric")); }
      finally { setLoading(false); }
    };
    fetchEpisode();
  }, [novelId, episodeId, t]);

  // 下書き保存
  const handleSave = useCallback(async () => {
    if (!episode || episode.status === "published") return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/writer/novels/${novelId}/episodes/${episodeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body_md: bodyMd, is_free: isFree }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error);
        return;
      }
      setLastSaved(new Date().toLocaleTimeString());
    } catch { setError(t("errorGeneric")); }
    finally { setSaving(false); }
  }, [episode, novelId, episodeId, title, bodyMd, isFree, t]);

  // 自動保存（30秒ごと、下書き時のみ）
  useEffect(() => {
    if (!episode || episode.status !== "draft") return;
    const interval = setInterval(handleSave, 30000);
    return () => clearInterval(interval);
  }, [episode, handleSave]);

  // 公開
  const handlePublish = async () => {
    if (!episode) return;
    // まず保存してから公開
    await handleSave();

    setPublishing(true);
    setError("");
    try {
      const res = await fetch(`/api/writer/novels/${novelId}/episodes/${episodeId}/publish`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setEpisode({ ...episode, status: "published" });
    } catch { setError(t("errorGeneric")); }
    finally { setPublishing(false); }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  if (!episode) {
    return <div className="py-16 text-center text-muted">{t("episodeNotFound")}</div>;
  }

  const isDraft = episode.status === "draft";
  const isPublished = episode.status === "published";

  return (
    <div className="mx-auto max-w-4xl">
      {/* ヘッダー */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href={`/dashboard/novels/${novelId}`} className="text-sm text-muted hover:text-text">
            ← {t("backToEpisodes")}
          </Link>
          <h1 className="mt-2 text-xl font-bold text-text">
            {t("episodeNumber")}{episode.episode_number}: {episode.title}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {isPublished && (
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
              {t("published")}
            </span>
          )}
          {isDraft && (
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
              {t("draft")}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-5">
        {/* タイトル */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text">{t("episodeTitle")}</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isPublished}
            className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-text focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900"
          />
        </div>

        {/* 本文 */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-sm font-medium text-text">{t("body")}</label>
            <div className="flex items-center gap-3">
              {lastSaved && (
                <span className="text-xs text-muted">{t("savedAt", { time: lastSaved })}</span>
              )}
            </div>
          </div>
          <textarea
            value={bodyMd}
            onChange={(e) => setBodyMd(e.target.value)}
            rows={30}
            disabled={isPublished}
            placeholder={t("bodyPlaceholder")}
            className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 font-mono text-sm leading-relaxed text-text placeholder:text-muted focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900"
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
          <label htmlFor="isFree" className="text-sm text-text">{t("freeLabel")}</label>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-400">
            {error}
          </div>
        )}

        {/* ボタン */}
        {isDraft && (
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 rounded-lg border border-gray-200 bg-white px-6 py-3 text-sm font-bold text-text transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800"
            >
              {saving ? t("saving") : t("saveDraft")}
            </button>
            <button
              onClick={handlePublish}
              disabled={publishing || characterCount < 100}
              className="flex-1 rounded-lg bg-indigo-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {publishing ? t("publishing") : t("publish")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
