"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Novel } from "@/types/novel";

// ジャンル選択肢
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

// ステータス選択肢
const STATUSES = [
  { id: "serial", name: "連載中" },
  { id: "complete", name: "完結" },
  { id: "hiatus", name: "休止" },
];

export default function NovelEditForm({ novel }: { novel: Novel }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState(novel.cover_image_url);
  const [generating, setGenerating] = useState(false);

  // フォーム状態（既存データで初期化）
  const [title, setTitle] = useState(novel.title);
  const [slug, setSlug] = useState(novel.slug);
  const [tagline, setTagline] = useState(novel.tagline || "");
  const [synopsis, setSynopsis] = useState(novel.synopsis || "");
  const [genre, setGenre] = useState(novel.genre);
  const [tags, setTags] = useState(novel.tags.join(", "));
  const [authorType, setAuthorType] = useState<"self" | "external">(novel.author_type);
  const [authorName, setAuthorName] = useState(novel.author_name);
  const [status, setStatus] = useState(novel.status);
  const [isR18, setIsR18] = useState(novel.is_r18);

  // タイトルからスラッグを生成
  const generateSlug = () => {
    const generated = title
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w\u3000-\u9fff\uff00-\uffef-]/g, "");
    setSlug(generated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const res = await fetch(`/api/admin/novels/${novel.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          slug,
          tagline,
          synopsis,
          genre,
          tags,
          status,
          author_type: authorType,
          author_name: authorName,
          is_r18: isR18,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "保存に失敗しました");
        return;
      }

      router.push("/admin/novels");
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("この作品を削除しますか？関連するエピソードもすべて削除されます。")) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/novels/${novel.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "削除に失敗しました");
        return;
      }

      router.push("/admin/novels");
    } catch {
      setError("通信エラーが発生しました");
    }
  };

  return (
    <>
      {error && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
        {/* タイトル */}
        <div>
          <label className="mb-1 block text-sm font-medium">タイトル *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="border border-border rounded px-3 py-2 w-full"
          />
        </div>

        {/* スラッグ */}
        <div>
          <label className="mb-1 block text-sm font-medium">スラッグ</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="英語のURL用スラッグ"
              className="border border-border rounded px-3 py-2 w-full"
            />
            <button
              type="button"
              onClick={generateSlug}
              className="border border-border rounded px-4 py-2 text-sm whitespace-nowrap"
            >
              自動生成
            </button>
          </div>
        </div>

        {/* キャプション */}
        <div>
          <label className="mb-1 block text-sm font-medium">キャプション</label>
          <input
            type="text"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            className="border border-border rounded px-3 py-2 w-full"
          />
        </div>

        {/* あらすじ */}
        <div>
          <label className="mb-1 block text-sm font-medium">あらすじ</label>
          <textarea
            value={synopsis}
            onChange={(e) => setSynopsis(e.target.value)}
            rows={5}
            className="border border-border rounded px-3 py-2 w-full"
          />
        </div>

        {/* 表紙画像 */}
        <div>
          <label className="mb-1 block text-sm font-medium">表紙画像</label>
          {coverImageUrl && (
            <div className="mb-2">
              <img
                src={coverImageUrl}
                alt="表紙プレビュー"
                className="h-48 w-32 rounded border border-border object-cover"
              />
            </div>
          )}
          <button
            type="button"
            disabled={generating}
            onClick={async () => {
              setGenerating(true);
              setError("");
              try {
                const res = await fetch(
                  `/api/admin/novels/${novel.id}/cover`,
                  { method: "POST" }
                );
                const data = await res.json();
                if (!res.ok) {
                  setError(data.error || "画像生成に失敗しました");
                  return;
                }
                setCoverImageUrl(data.cover_image_url);
              } catch {
                setError("画像生成中に通信エラーが発生しました");
              } finally {
                setGenerating(false);
              }
            }}
            className="border border-border rounded px-4 py-2 text-sm hover:bg-surface transition disabled:opacity-50"
          >
            {generating
              ? "生成中...（30〜60秒かかります）"
              : coverImageUrl
                ? "表紙画像を再生成"
                : "表紙画像を生成"}
          </button>
        </div>

        {/* ジャンル */}
        <div>
          <label className="mb-1 block text-sm font-medium">ジャンル *</label>
          <select
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            className="border border-border rounded px-3 py-2 w-full"
          >
            {GENRES.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        {/* タグ */}
        <div>
          <label className="mb-1 block text-sm font-medium">タグ（カンマ区切り）</label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="例: 転生, チート, ほのぼの"
            className="border border-border rounded px-3 py-2 w-full"
          />
        </div>

        {/* 著者タイプ */}
        <div>
          <label className="mb-1 block text-sm font-medium">著者タイプ</label>
          <select
            value={authorType}
            onChange={(e) => {
              setAuthorType(e.target.value as "self" | "external");
            }}
            className="border border-border rounded px-3 py-2 w-full"
          >
            <option value="self">自社制作</option>
            <option value="external">外部作者</option>
          </select>
        </div>

        {/* ペンネーム */}
        <div>
          <label className="mb-1 block text-sm font-medium">ペンネーム *</label>
          <input
            type="text"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            required
            placeholder="読者に表示される著者名"
            className="border border-border rounded px-3 py-2 w-full"
          />
        </div>

        {/* ステータス */}
        <div>
          <label className="mb-1 block text-sm font-medium">ステータス</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Novel["status"])}
            className="border border-border rounded px-3 py-2 w-full"
          >
            {STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* R18 */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="is_r18"
            checked={isR18}
            onChange={(e) => setIsR18(e.target.checked)}
          />
          <label htmlFor="is_r18" className="text-sm">
            R18作品
          </label>
        </div>

        {/* ボタン */}
        <div className="flex items-center gap-3 pt-4">
          <button
            type="submit"
            disabled={saving}
            className="bg-secondary text-white rounded px-4 py-2 text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
          >
            {saving ? "保存中..." : "保存"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/admin/novels")}
            className="border border-border rounded px-4 py-2 text-sm"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="ml-auto text-red-600 hover:underline text-sm"
          >
            削除
          </button>
        </div>
      </form>
    </>
  );
}
