// データ取得レイヤー
// Supabase接続時はSupabaseから、未接続時はモックデータから取得
import type { Novel, Episode, NovelScore } from "@/types/novel";
import {
  getMockNovels,
  getMockNovelBySlug,
  getMockNovelById,
  getMockEpisodes,
  getMockEpisode,
  getMockEpisodeById,
  getMockRankedNovels,
  getMockRelatedNovels,
  getMockRecentEpisodes,
  getMockNovelsByGenre,
  getMockNovelsByTag,
} from "./mock-data";

const isSupabaseConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Supabaseクライアントを遅延importして、未設定時のエラーを防ぐ
async function getSupabase() {
  const { createClient } = await import("./supabase/server");
  return createClient();
}

// 小説一覧
export async function fetchNovels(): Promise<Novel[]> {
  if (!isSupabaseConfigured) return getMockNovels();

  const supabase = await getSupabase();
  const { data } = await supabase
    .from("novels")
    .select("*")
    .order("latest_chapter_at", { ascending: false, nullsFirst: false })
    .limit(20);
  return (data as Novel[]) || [];
}

// 小説（slug指定）
export async function fetchNovelBySlug(slug: string): Promise<Novel | null> {
  if (!isSupabaseConfigured) return getMockNovelBySlug(slug);

  const supabase = await getSupabase();
  const { data } = await supabase
    .from("novels")
    .select("*")
    .eq("slug", slug)
    .single();
  return (data as Novel) || null;
}

// 小説（id指定）
export async function fetchNovelById(id: string): Promise<Novel | null> {
  if (!isSupabaseConfigured) return getMockNovelById(id);

  const supabase = await getSupabase();
  const { data } = await supabase
    .from("novels")
    .select("*")
    .eq("id", id)
    .single();
  return (data as Novel) || null;
}

// エピソード一覧
export async function fetchEpisodes(novelId: string): Promise<Episode[]> {
  if (!isSupabaseConfigured) return getMockEpisodes(novelId);

  const supabase = await getSupabase();
  const { data } = await supabase
    .from("episodes")
    .select("*")
    .eq("novel_id", novelId)
    .order("episode_number", { ascending: true });
  return (data as Episode[]) || [];
}

// エピソード（話数指定）
export async function fetchEpisode(
  novelId: string,
  episodeNumber: number
): Promise<Episode | null> {
  if (!isSupabaseConfigured) return getMockEpisode(novelId, episodeNumber);

  const supabase = await getSupabase();
  const { data } = await supabase
    .from("episodes")
    .select("*")
    .eq("novel_id", novelId)
    .eq("episode_number", episodeNumber)
    .single();
  return (data as Episode) || null;
}

// エピソード（id指定）
export async function fetchEpisodeById(
  episodeId: string
): Promise<Episode | null> {
  if (!isSupabaseConfigured) return getMockEpisodeById(episodeId);

  const supabase = await getSupabase();
  const { data } = await supabase
    .from("episodes")
    .select("*")
    .eq("id", episodeId)
    .single();
  return (data as Episode) || null;
}

// 面白さスコア順の小説一覧（トップページ・ランキング用）
// genre指定でジャンルフィルタ対応
export async function fetchRankedNovels(options?: {
  genre?: string;
  limit?: number;
}): Promise<NovelScore[]> {
  const limit = options?.limit ?? 50;

  if (!isSupabaseConfigured) return getMockRankedNovels(options?.genre, limit);

  const supabase = await getSupabase();
  let query = supabase
    .from("novel_scores")
    .select("*")
    .order("score", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (options?.genre) {
    query = query.eq("genre", options.genre);
  }

  const { data } = await query;
  return (data as NovelScore[]) || [];
}

// 関連作品（同ジャンル・タグ重複で類似度計算）
// 類似度 = ジャンル一致ボーナス(5) + タグ重複数 × 2
export async function fetchRelatedNovels(
  novel: Pick<Novel, "id" | "genre" | "tags">,
  limit: number = 3
): Promise<Novel[]> {
  if (!isSupabaseConfigured) return getMockRelatedNovels(novel, limit);

  const supabase = await getSupabase();
  // 同ジャンル or タグが1つ以上重複する作品を取得し、アプリ側で類似度ソート
  const { data } = await supabase
    .from("novels")
    .select("*")
    .neq("id", novel.id)
    .or(`genre.eq.${novel.genre},tags.ov.{${novel.tags.join(",")}}`)
    .order("total_pv", { ascending: false })
    .limit(20);

  if (!data || data.length === 0) return [];

  // 類似度計算してソート
  const scored = (data as Novel[]).map((n) => {
    const genreBonus = n.genre === novel.genre ? 5 : 0;
    const tagOverlap = n.tags.filter((t) => novel.tags.includes(t)).length;
    return { novel: n, similarity: genreBonus + tagOverlap * 2 };
  });

  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, limit).map((s) => s.novel);
}

// 新着エピソード（公開日降順）
export type RecentEpisode = Episode & { novel_title: string; novel_slug: string };

export async function fetchRecentEpisodes(limit: number = 20): Promise<RecentEpisode[]> {
  if (!isSupabaseConfigured) return getMockRecentEpisodes(limit) as RecentEpisode[];

  const supabase = await getSupabase();
  const { data } = await supabase
    .from("episodes")
    .select("*, novels!inner(title, slug)")
    .order("published_at", { ascending: false })
    .limit(limit);

  if (!data) return [];
  return data.map((ep: Record<string, unknown>) => {
    const novels = ep.novels as { title: string; slug: string };
    return {
      ...(ep as unknown as Episode),
      novel_title: novels.title,
      novel_slug: novels.slug,
    };
  });
}

// ジャンル別小説一覧
export async function fetchNovelsByGenre(genreId: string): Promise<Novel[]> {
  if (!isSupabaseConfigured) return getMockNovelsByGenre(genreId);

  const supabase = await getSupabase();
  const { data } = await supabase
    .from("novels")
    .select("*")
    .eq("genre", genreId)
    .order("total_pv", { ascending: false });
  return (data as Novel[]) || [];
}

// タグ別小説一覧
export async function fetchNovelsByTag(tag: string): Promise<Novel[]> {
  if (!isSupabaseConfigured) return getMockNovelsByTag(tag);

  const supabase = await getSupabase();
  const { data } = await supabase
    .from("novels")
    .select("*")
    .contains("tags", [tag])
    .order("total_pv", { ascending: false });
  return (data as Novel[]) || [];
}

// エピソード（範囲取得 — 閲覧ページで現在話+次話を取得）
export async function fetchEpisodeRange(
  novelId: string,
  from: number,
  to: number
): Promise<Episode[]> {
  if (!isSupabaseConfigured) {
    return getMockEpisodes(novelId).filter(
      (e) => e.episode_number >= from && e.episode_number <= to
    );
  }

  const supabase = await getSupabase();
  const { data } = await supabase
    .from("episodes")
    .select("*")
    .eq("novel_id", novelId)
    .gte("episode_number", from)
    .lte("episode_number", to)
    .order("episode_number", { ascending: true });
  return (data as Episode[]) || [];
}
