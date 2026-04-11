// データ取得レイヤー
// Supabase接続時はSupabaseから、未接続時はモックデータから取得
// locale引数で英語フィールドにフォールバック対応
import type { Novel, Episode, EpisodeTocItem, NovelScore } from "@/types/novel";

// locale対応: 英語フィールドがあればそちらを使い、なければ日本語にフォールバック
function localizeNovel(novel: Novel, locale: string): Novel {
  if (locale !== "en") return novel;
  return {
    ...novel,
    title: novel.title_en || novel.title,
    tagline: novel.tagline_en || novel.tagline,
    synopsis: novel.synopsis_en || novel.synopsis,
  };
}

function localizeEpisode(episode: Episode, locale: string): Episode {
  if (locale !== "en") return episode;
  return {
    ...episode,
    title: episode.title_en || episode.title,
    body_md: episode.body_md_en || episode.body_md,
    body_html: episode.body_html_en || episode.body_html,
  };
}
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

// USE_MOCK_DATA=trueで強制的にモックデータを使用（Supabaseクエリをスキップして高速化）
const isSupabaseConfigured =
  process.env.USE_MOCK_DATA !== "true" &&
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Supabaseクライアントを遅延importして、未設定時のエラーを防ぐ
async function getSupabase() {
  const { createClient } = await import("./supabase/server");
  return createClient();
}

// 小説一覧（ページネーション対応）
export async function fetchNovels(locale: string = "ja", page: number = 1, perPage: number = 30): Promise<{ novels: Novel[]; total: number }> {
  const mockFallback = () => {
    const all = getMockNovels().map((n) => localizeNovel(n, locale));
    return { novels: all.slice((page - 1) * perPage, page * perPage), total: all.length };
  };
  if (!isSupabaseConfigured) return mockFallback();

  try {
    const supabase = await getSupabase();
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;
    const { data, count } = await supabase
      .from("novels")
      .select("*", { count: "exact" })
      .order("latest_chapter_at", { ascending: false, nullsFirst: false })
      .range(from, to);
    const novels = (data as Novel[]) || [];
    if (novels.length === 0 && page === 1) return mockFallback();
    return { novels: novels.map((n) => localizeNovel(n, locale)), total: count ?? novels.length };
  } catch {
    return mockFallback();
  }
}

// 小説（slug指定）
export async function fetchNovelBySlug(slug: string, locale: string = "ja"): Promise<Novel | null> {
  const mockFallback = () => { const m = getMockNovelBySlug(slug); return m ? localizeNovel(m, locale) : null; };
  if (!isSupabaseConfigured) return mockFallback();

  try {
    const supabase = await getSupabase();
    const { data } = await supabase
      .from("novels")
      .select("*")
      .eq("slug", slug)
      .single();
    if (!data) return mockFallback();
    return localizeNovel(data as Novel, locale);
  } catch {
    return mockFallback();
  }
}

// 小説（id指定）
export async function fetchNovelById(id: string): Promise<Novel | null> {
  if (!isSupabaseConfigured) return getMockNovelById(id);

  try {
    const supabase = await getSupabase();
    const { data } = await supabase
      .from("novels")
      .select("*")
      .eq("id", id)
      .single();
    return (data as Novel) || getMockNovelById(id);
  } catch {
    return getMockNovelById(id);
  }
}

// エピソード一覧
export async function fetchEpisodes(novelId: string, locale: string = "ja"): Promise<Episode[]> {
  const mockFallback = () => getMockEpisodes(novelId).map((e) => localizeEpisode(e, locale));
  if (!isSupabaseConfigured) return mockFallback();

  try {
    const supabase = await getSupabase();
    const { data } = await supabase
      .from("episodes")
      .select("*")
      .eq("novel_id", novelId)
      .order("episode_number", { ascending: true });
    const episodes = (data as Episode[]) || [];
    if (episodes.length === 0) return mockFallback();
    return episodes.map((e) => localizeEpisode(e, locale));
  } catch {
    return mockFallback();
  }
}

// 目次用エピソード一覧（body_mdを含まない軽量版、ページネーション対応）
export async function fetchEpisodeToc(
  novelId: string,
  page: number = 1,
  perPage: number = 50,
  locale: string = "ja"
): Promise<{ episodes: EpisodeTocItem[]; total: number }> {
  const mockFallback = () => {
    const all = getMockEpisodes(novelId);
    const start = (page - 1) * perPage;
    const sliced = all.slice(start, start + perPage).map((e) => ({
      episode_number: e.episode_number,
      title: locale === "en" ? (e.title_en || e.title) : e.title,
      title_en: e.title_en,
      character_count: e.character_count,
      is_free: e.is_free,
      published_at: e.published_at,
    }));
    return { episodes: sliced, total: all.length };
  };
  if (!isSupabaseConfigured) return mockFallback();

  try {
    const supabase = await getSupabase();
    const { count } = await supabase
      .from("episodes")
      .select("id", { count: "exact", head: true })
      .eq("novel_id", novelId);

    const { data } = await supabase
      .from("episodes")
      .select("episode_number, title, title_en, character_count, is_free, published_at")
      .eq("novel_id", novelId)
      .order("episode_number", { ascending: true })
      .range((page - 1) * perPage, page * perPage - 1);

    const episodes = ((data as EpisodeTocItem[]) || []).map((e) => ({
      ...e,
      title: locale === "en" ? (e.title_en || e.title) : e.title,
    }));
    if (episodes.length === 0) return mockFallback();
    return { episodes, total: count ?? 0 };
  } catch {
    return mockFallback();
  }
}

// エピソード（話数指定）
// episodes_with_body ビューで本文を含む完全なデータを取得
// ビュー未作成時は episodes テーブルにフォールバック
const EPISODE_VIEW = "episodes_with_body";

export async function fetchEpisode(
  novelId: string,
  episodeNumber: number
): Promise<Episode | null> {
  if (!isSupabaseConfigured) return getMockEpisode(novelId, episodeNumber);

  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from(EPISODE_VIEW)
      .select("*")
      .eq("novel_id", novelId)
      .eq("episode_number", episodeNumber)
      .single();

    if (error && !data) {
      const { data: fallback } = await supabase
        .from("episodes")
        .select("*")
        .eq("novel_id", novelId)
        .eq("episode_number", episodeNumber)
        .single();
      return (fallback as Episode) || getMockEpisode(novelId, episodeNumber);
    }
    return (data as Episode) || getMockEpisode(novelId, episodeNumber);
  } catch {
    return getMockEpisode(novelId, episodeNumber);
  }
}

// エピソード（id指定）
export async function fetchEpisodeById(
  episodeId: string
): Promise<Episode | null> {
  if (!isSupabaseConfigured) return getMockEpisodeById(episodeId);

  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from(EPISODE_VIEW)
      .select("*")
      .eq("id", episodeId)
      .single();

    if (error && !data) {
      const { data: fallback } = await supabase
        .from("episodes")
        .select("*")
        .eq("id", episodeId)
        .single();
      return (fallback as Episode) || getMockEpisodeById(episodeId);
    }
    return (data as Episode) || getMockEpisodeById(episodeId);
  } catch {
    return getMockEpisodeById(episodeId);
  }
}

// 面白さスコア順の小説一覧（トップページ・ランキング用）
// genre指定でジャンルフィルタ対応
export async function fetchRankedNovels(options?: {
  genre?: string;
  limit?: number;
  locale?: string;
}): Promise<NovelScore[]> {
  const limit = options?.limit ?? 50;
  const locale = options?.locale ?? "ja";
  const mockFallback = () => getMockRankedNovels(options?.genre, limit).map((n) => localizeNovel(n, locale) as NovelScore);

  if (!isSupabaseConfigured) return mockFallback();

  try {
    const supabase = await getSupabase();
    let query = supabase
      .from("novel_scores")
      .select("*")
      .order("score", { ascending: false, nullsFirst: false })
      .limit(limit);

    if (options?.genre) {
      query = query.eq("genre", options.genre);
    }

    const { data, error } = await query;
    if (error) return mockFallback();
    const novels = (data as NovelScore[]) || [];
    if (novels.length === 0) return mockFallback();
    return novels.map((n) => localizeNovel(n, locale) as NovelScore);
  } catch {
    return mockFallback();
  }
}

// 関連作品（同ジャンル・タグ重複で類似度計算）
// 類似度 = ジャンル一致ボーナス(5) + タグ重複数 × 2
export async function fetchRelatedNovels(
  novel: Pick<Novel, "id" | "genre" | "tags">,
  limit: number = 3,
  locale: string = "ja"
): Promise<Novel[]> {
  const mockFallback = () => getMockRelatedNovels(novel, limit).map((n) => localizeNovel(n, locale));
  if (!isSupabaseConfigured) return mockFallback();

  try {
    const supabase = await getSupabase();
    const { data } = await supabase
      .from("novels")
      .select("*")
      .neq("id", novel.id)
      .or(`genre.eq.${novel.genre},tags.ov.{${novel.tags.join(",")}}`)
      .order("total_pv", { ascending: false })
      .limit(20);

    if (!data || data.length === 0) return mockFallback();

    const scored = (data as Novel[]).map((n) => {
      const genreBonus = n.genre === novel.genre ? 5 : 0;
      const tagOverlap = n.tags.filter((t) => novel.tags.includes(t)).length;
      return { novel: n, similarity: genreBonus + tagOverlap * 2 };
    });

    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, limit).map((s) => localizeNovel(s.novel, locale));
  } catch {
    return mockFallback();
  }
}

// 新着エピソード（公開日降順）
export type RecentEpisode = Episode & { novel_title: string; novel_slug: string };

export async function fetchRecentEpisodes(limit: number = 20, locale: string = "ja"): Promise<RecentEpisode[]> {
  const mockFallback = () => (getMockRecentEpisodes(limit) as RecentEpisode[]).map((e) => localizeEpisode(e, locale) as RecentEpisode);
  if (!isSupabaseConfigured) return mockFallback();

  try {
    const supabase = await getSupabase();
    const { data } = await supabase
      .from("episodes")
      .select("*, novels!inner(title, slug)")
      .order("published_at", { ascending: false })
      .limit(limit);

    if (!data || data.length === 0) return mockFallback();
    return data.map((ep: Record<string, unknown>) => {
      const novels = ep.novels as { title: string; slug: string };
      const episode = localizeEpisode(ep as unknown as Episode, locale);
      return {
        ...episode,
        novel_title: novels.title,
        novel_slug: novels.slug,
      };
    });
  } catch {
    return mockFallback();
  }
}

// ジャンル別小説一覧
export async function fetchNovelsByGenre(genreId: string, locale: string = "ja"): Promise<Novel[]> {
  const mockFallback = () => getMockNovelsByGenre(genreId).map((n) => localizeNovel(n, locale));
  if (!isSupabaseConfigured) return mockFallback();

  try {
    const supabase = await getSupabase();
    const { data } = await supabase
      .from("novels")
      .select("*")
      .eq("genre", genreId)
      .order("total_pv", { ascending: false });
    const novels = (data as Novel[]) || [];
    if (novels.length === 0) return mockFallback();
    return novels.map((n) => localizeNovel(n, locale));
  } catch {
    return mockFallback();
  }
}

// タグ別小説一覧
export async function fetchNovelsByTag(tag: string, locale: string = "ja"): Promise<Novel[]> {
  const mockFallback = () => getMockNovelsByTag(tag).map((n) => localizeNovel(n, locale));
  if (!isSupabaseConfigured) return mockFallback();

  try {
    const supabase = await getSupabase();
    const { data } = await supabase
      .from("novels")
      .select("*")
      .contains("tags", [tag])
      .order("total_pv", { ascending: false });
    const novels = (data as Novel[]) || [];
    if (novels.length === 0) return mockFallback();
    return novels.map((n) => localizeNovel(n, locale));
  } catch {
    return mockFallback();
  }
}

// 検索（タイトル・タグ・あらすじのキーワード検索）
export async function searchNovels(query: string, locale: string = "ja"): Promise<Novel[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const mockSearch = () => getMockNovels()
    .filter((n) => {
      const text = [n.title, n.title_en, n.tagline, n.synopsis, ...n.tags].filter(Boolean).join(" ").toLowerCase();
      return q.split(/\s+/).every((word) => text.includes(word));
    })
    .map((n) => localizeNovel(n, locale));

  if (!isSupabaseConfigured) return mockSearch();

  try {
    const supabase = await getSupabase();
    const words = q.split(/\s+/).filter(Boolean);
    let queryBuilder = supabase.from("novels").select("*");
    for (const word of words) {
      queryBuilder = queryBuilder.or(
        `title.ilike.%${word}%,tagline.ilike.%${word}%,synopsis.ilike.%${word}%,tags.cs.{${word}}`
      );
    }
    const { data } = await queryBuilder.order("total_pv", { ascending: false }).limit(50);
    const novels = (data as Novel[]) || [];
    if (novels.length === 0) return mockSearch();
    return novels.map((n) => localizeNovel(n, locale));
  } catch {
    return mockSearch();
  }
}

// エピソード（範囲取得 — 閲覧ページで現在話+次話を取得）
export async function fetchEpisodeRange(
  novelId: string,
  from: number,
  to: number,
  locale: string = "ja"
): Promise<Episode[]> {
  const mockFallback = () => getMockEpisodes(novelId)
    .filter((e) => e.episode_number >= from && e.episode_number <= to)
    .map((e) => localizeEpisode(e, locale));
  if (!isSupabaseConfigured) return mockFallback();

  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from(EPISODE_VIEW)
      .select("*")
      .eq("novel_id", novelId)
      .gte("episode_number", from)
      .lte("episode_number", to)
      .order("episode_number", { ascending: true });

    if (error && !data) {
      const { data: fallback } = await supabase
        .from("episodes")
        .select("*")
        .eq("novel_id", novelId)
        .gte("episode_number", from)
        .lte("episode_number", to)
        .order("episode_number", { ascending: true });
      const episodes = (fallback as Episode[]) || [];
      if (episodes.length === 0) return mockFallback();
      return episodes.map((e) => localizeEpisode(e, locale));
    }
    const episodes = (data as Episode[]) || [];
    if (episodes.length === 0) return mockFallback();
    return episodes.map((e) => localizeEpisode(e, locale));
  } catch {
    return mockFallback();
  }
}
