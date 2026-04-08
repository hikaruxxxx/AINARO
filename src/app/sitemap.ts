import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://novelis.tokyo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient();

  // 全作品取得
  const { data: novels } = await supabase
    .from("novels")
    .select("slug, updated_at");

  // 全エピソード取得（作品のslugと紐付け）
  const { data: episodes } = await supabase
    .from("episodes")
    .select("episode_number, updated_at, novel_id, novels(slug)")
    .order("updated_at", { ascending: false });

  // ジャンル一覧（sitemap用）
  const { data: genres } = await supabase.from("genres").select("id");

  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: new Date(), changeFrequency: "daily", priority: 1.0 },
    { url: `${SITE_URL}/novels`, lastModified: new Date(), changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/ranking`, lastModified: new Date(), changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/new`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.7 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, changeFrequency: "monthly", priority: 0.2 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "monthly", priority: 0.2 },
  ];

  const genrePages: MetadataRoute.Sitemap = (genres || []).map((g) => ({
    url: `${SITE_URL}/genre/${g.id}`,
    changeFrequency: "daily" as const,
    priority: 0.6,
  }));

  const novelPages: MetadataRoute.Sitemap = (novels || []).map((n) => ({
    url: `${SITE_URL}/novels/${n.slug}`,
    lastModified: new Date(n.updated_at),
    changeFrequency: "daily" as const,
    priority: 0.7,
  }));

  const episodePages: MetadataRoute.Sitemap = (episodes || []).map((ep) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slug = (ep as any).novels?.slug;
    return {
      url: `${SITE_URL}/novels/${slug}/${ep.episode_number}`,
      lastModified: new Date(ep.updated_at),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    };
  });

  return [...staticPages, ...genrePages, ...novelPages, ...episodePages];
}
