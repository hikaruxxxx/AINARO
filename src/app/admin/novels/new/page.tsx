"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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

export default function NewNovelPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // フォーム状態
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [tagline, setTagline] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [genre, setGenre] = useState("fantasy");
  const [tags, setTags] = useState("");
  const [authorType, setAuthorType] = useState<"self" | "external">("self");
  const [authorName, setAuthorName] = useState("編集部");
  const [status, setStatus] = useState("serial");
  const [isR18, setIsR18] = useState(false);

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
      const res = await fetch("/api/admin/novels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          slug: slug || undefined,
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

  return (
    <div>
      <h2 className="mb-6 text-lg font-bold">作品新規作成</h2>

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
              const v = e.target.value as "self" | "external";
              setAuthorType(v);
              if (v === "self") setAuthorName("編集部");
            }}
            className="border border-border rounded px-3 py-2 w-full"
          >
            <option value="self">自社制作</option>
            <option value="external">外部作者</option>
          </select>
        </div>

        {/* 著者名（ペンネーム） */}
        <div>
          <label className="mb-1 block text-sm font-medium">
            {authorType === "external" ? "ペンネーム *" : "著者名"}
          </label>
          <input
            type="text"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            required={authorType === "external"}
            placeholder={authorType === "external" ? "作者のペンネーム" : "編集部"}
            className="border border-border rounded px-3 py-2 w-full"
          />
        </div>

        {/* ステータス */}
        <div>
          <label className="mb-1 block text-sm font-medium">ステータス</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
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

        {/* 送信ボタン */}
        <div className="flex gap-3 pt-4">
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
        </div>
      </form>
    </div>
  );
}
