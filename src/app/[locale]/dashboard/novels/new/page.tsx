"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

const GENRES = [
  { id: "fantasy", name: "異世界ファンタジー" },
  { id: "romance", name: "恋愛" },
  { id: "villainess", name: "悪役令嬢" },
  { id: "horror", name: "ホラー" },
  { id: "mystery", name: "ミステリー" },
  { id: "scifi", name: "SF" },
  { id: "drama", name: "現代ドラマ" },
  { id: "comedy", name: "コメディ" },
  { id: "action", name: "アクション" },
  { id: "other", name: "その他" },
];

export default function NewNovelPage() {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [tagline, setTagline] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [genre, setGenre] = useState("fantasy");
  const [tags, setTags] = useState("");
  const [isR18, setIsR18] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/writer/novels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, tagline, synopsis, genre, tags, is_r18: isR18 }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      router.push(`/dashboard/novels/${data.id}`);
    } catch { setError(t("errorGeneric")); }
    finally { setSaving(false); }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">← {t("backToNovels")}</Link>
        <h1 className="mt-2 text-xl font-bold text-gray-900">{t("newNovel")}</h1>
      </div>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-900">{t("novelTitle")}</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-900">{t("tagline")}</label>
          <input type="text" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder={t("taglinePlaceholder")} className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-900">{t("synopsis")}</label>
          <textarea value={synopsis} onChange={(e) => setSynopsis(e.target.value)} rows={4} placeholder={t("synopsisPlaceholder")} className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-900">{t("genre")}</label>
          <select value={genre} onChange={(e) => setGenre(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
            {GENRES.map((g) => (<option key={g.id} value={g.id}>{g.name}</option>))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-900">{t("tags")}</label>
          <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} placeholder={t("tagsPlaceholder")} className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
        <div className="flex items-center gap-3">
          <input id="r18" type="checkbox" checked={isR18} onChange={(e) => setIsR18(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
          <label htmlFor="r18" className="text-sm text-gray-900">{t("r18Label")}</label>
        </div>
        {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <button type="submit" disabled={saving || !title.trim()} className="w-full rounded-lg bg-indigo-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
          {saving ? t("saving") : t("createNovel")}
        </button>
      </form>
    </div>
  );
}
