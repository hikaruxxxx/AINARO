import Link from "next/link";
import { fetchRecentEpisodes } from "@/lib/data";
import { formatRelativeTime } from "@/lib/utils/format";
import type { Metadata } from "next";

export const revalidate = 300; // 5分ごとに再生成

export const metadata: Metadata = {
  title: "新着エピソード",
  description: "最近公開されたエピソードの一覧。最新話をいち早くチェック。",
};

export default async function NewEpisodesPage() {
  const episodes = await fetchRecentEpisodes(30);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-text">新着エピソード</h1>

      {episodes.length === 0 ? (
        <p className="py-12 text-center text-muted">まだエピソードが公開されていません。</p>
      ) : (
        <ul className="divide-y divide-border">
          {episodes.map((ep) => (
            <li key={ep.id}>
              <Link
                href={`/novels/${ep.novel_slug}/${ep.episode_number}`}
                className="block py-4 transition hover:bg-surface"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted">{ep.novel_title}</p>
                    <h2 className="mt-0.5 font-bold text-text">
                      第{ep.episode_number}話 {ep.title}
                    </h2>
                    <div className="mt-1 flex gap-3 text-xs text-muted">
                      <span>{ep.character_count.toLocaleString()}字</span>
                      <span>{formatRelativeTime(ep.published_at)}</span>
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
