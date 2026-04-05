import { notFound } from "next/navigation";
import { fetchNovelBySlug, fetchEpisodeRange, fetchEpisodes } from "@/lib/data";
import EpisodeReader from "@/components/novel/EpisodeReader";
import type { Episode } from "@/types/novel";
import type { Metadata } from "next";

export const revalidate = 3600;

type Props = { params: Promise<{ slug: string; episodeNum: string; locale: string }> };

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

  const { getLocale } = await import("next-intl/server");
  const locale = await getLocale();

  const novel = await fetchNovelBySlug(slug, locale);
  if (!novel) notFound();

  // 現在話 + 次話 + 全エピソード一覧を並行取得
  const [epRange, allEpisodes] = await Promise.all([
    fetchEpisodeRange(novel.id, num, num + 1, locale),
    fetchEpisodes(novel.id, locale),
  ]);
  if (epRange.length === 0) notFound();

  const currentEp = epRange[0] as Episode;
  const nextEp = epRange.length > 1 ? (epRange[1] as Episode) : null;

  // 目次用に軽量なデータだけ渡す
  const tocData = allEpisodes.map((ep) => ({
    episode_number: ep.episode_number,
    title: ep.title,
  }));

  return (
    <EpisodeReader
      novel={{ id: novel.id, slug: novel.slug, title: novel.title, total_chapters: novel.total_chapters }}
      currentEpisode={currentEp}
      nextEpisode={nextEp}
      currentNum={num}
      episodes={tocData}
    />
  );
}
