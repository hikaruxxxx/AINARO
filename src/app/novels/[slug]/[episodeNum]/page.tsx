import { notFound } from "next/navigation";
import { fetchNovelBySlug, fetchEpisodeRange } from "@/lib/data";
import EpisodeReader from "@/components/novel/EpisodeReader";
import type { Episode } from "@/types/novel";
import type { Metadata } from "next";

export const revalidate = 3600;

type Props = { params: Promise<{ slug: string; episodeNum: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, episodeNum } = await params;
  const novel = await fetchNovelBySlug(slug);
  if (!novel) return {};

  const episodes = await fetchEpisodeRange(novel.id, Number(episodeNum), Number(episodeNum));
  const episode = episodes[0];
  if (!episode) return {};

  return {
    title: `${episode.title} - ${novel.title}`,
    description: episode.body_md.slice(0, 120) + "...",
    openGraph: {
      title: `${episode.title} - ${novel.title}`,
      images: novel.cover_image_url ? [novel.cover_image_url] : [],
    },
  };
}

export default async function EpisodeReaderPage({ params }: Props) {
  const { slug, episodeNum } = await params;
  const num = Number(episodeNum);
  if (isNaN(num) || num < 1) notFound();

  const novel = await fetchNovelBySlug(slug);
  if (!novel) notFound();

  // 現在話 + 次話を取得
  const episodes = await fetchEpisodeRange(novel.id, num, num + 1);
  if (episodes.length === 0) notFound();

  const currentEp = episodes[0] as Episode;
  const nextEp = episodes.length > 1 ? (episodes[1] as Episode) : null;

  return (
    <EpisodeReader
      novel={{ id: novel.id, slug: novel.slug, title: novel.title, total_chapters: novel.total_chapters }}
      currentEpisode={currentEp}
      nextEpisode={nextEp}
      currentNum={num}
    />
  );
}
