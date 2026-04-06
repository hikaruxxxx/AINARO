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

const isSupabaseConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Supabaseクライアントを遅延importして、未設定時のエラーを防ぐ
async function getSupabase() {
  const { createClient } = await import("./supabase/server");
  return createClient();
}

// 小説一覧
export async function fetchNovels(locale: string = "ja"): Promise<Novel[]> {
  if (!isSupabaseConfigured) return getMockNovels().map((n) => localizeNovel(n, locale));

  const supabase = await getSupabase();
  const { data } = await supabase
    .from("novels")
    .select("*")
    .order("latest_chapter_at", { ascending: false, nullsFirst: false })
    .limit(20);
  return ((data as Novel[]) || []).map((n) => localizeNovel(n, locale));
}

// 小説（slug指定）
export async function fetchNovelBySlug(slug: string, locale: string = "ja"): Promise<Novel | null> {
  if (!isSupabaseConfigured) {
    const novel = getMockNovelBySlug(slug);
    return novel ? localizeNovel(novel, locale) : null;
  }

  const supabase = await getSupabase();
  const { data } = await supabase
    .from("novels")
    .select("*")
    .eq("slug", slug)
    .single();
  return data ? localizeNovel(data as Novel, locale) : null;
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
export async function fetchEpisodes(novelId: string, locale: string = "ja"): Promise<Episode[]> {
  if (!isSupabaseConfigured) return getMockEpisodes(novelId).map((e) => localizeEpisode(e, locale));

  const supabase = await getSupabase();
  const { data } = await supabase
    .from("episodes")
    .select("*")
    .eq("novel_id", novelId)
    .order("episode_number", { ascending: true });
  return ((data as Episode[]) || []).map((e) => localizeEpisode(e, locale));
}

// 目次用エピソード一覧（body_mdを含まない軽量版、ページネーション対応）
export async function fetchEpisodeToc(
  novelId: string,
  page: number = 1,
  perPage: number = 50,
  locale: string = "ja"
): Promise<{ episodes: EpisodeTocItem[]; total: number }> {
  if (!isSupabaseConfigured) {
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
  }

  const supabase = await getSupabase();

  // 総数取得
  const { count } = await supabase
    .from("episodes")
    .select("id", { count: "exact", head: true })
    .eq("novel_id", novelId);

  // body_mdを除いた軽量カラムのみ取得
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

  return { episodes, total: count ?? 0 };
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

  const supabase = await getSupabase();
  // episodes_with_body ビューから取得（body_md分離対応）
  const { data, error } = await supabase
    .from(EPISODE_VIEW)
    .select("*")
    .eq("novel_id", novelId)
    .eq("episode_number", episodeNumber)
    .single();

  // ビューが存在しない場合は元テーブルにフォールバック
  if (error && !data) {
    const { data: fallback } = await supabase
      .from("episodes")
      .select("*")
      .eq("novel_id", novelId)
      .eq("episode_number", episodeNumber)
      .single();
    return (fallback as Episode) || null;
  }
  return (data as Episode) || null;
}

// エピソード（id指定）
export async function fetchEpisodeById(
  episodeId: string
): Promise<Episode | null> {
  if (!isSupabaseConfigured) return getMockEpisodeById(episodeId);

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
    return (fallback as Episode) || null;
  }
  return (data as Episode) || null;
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

  if (!isSupabaseConfigured) return getMockRankedNovels(options?.genre, limit).map((n) => localizeNovel(n, locale) as NovelScore);

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
  return ((data as NovelScore[]) || []).map((n) => localizeNovel(n, locale) as NovelScore);
}

// 関連作品（同ジャンル・タグ重複で類似度計算）
// 類似度 = ジャンル一致ボーナス(5) + タグ重複数 × 2
export async function fetchRelatedNovels(
  novel: Pick<Novel, "id" | "genre" | "tags">,
  limit: number = 3,
  locale: string = "ja"
): Promise<Novel[]> {
  if (!isSupabaseConfigured) return getMockRelatedNovels(novel, limit).map((n) => localizeNovel(n, locale));

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
  return scored.slice(0, limit).map((s) => localizeNovel(s.novel, locale));
}

// 新着エピソード（公開日降順）
export type RecentEpisode = Episode & { novel_title: string; novel_slug: string };

export async function fetchRecentEpisodes(limit: number = 20, locale: string = "ja"): Promise<RecentEpisode[]> {
  if (!isSupabaseConfigured) return (getMockRecentEpisodes(limit) as RecentEpisode[]).map((e) => localizeEpisode(e, locale) as RecentEpisode);

  const supabase = await getSupabase();
  const { data } = await supabase
    .from("episodes")
    .select("*, novels!inner(title, slug)")
    .order("published_at", { ascending: false })
    .limit(limit);

  if (!data) return [];
  return data.map((ep: Record<string, unknown>) => {
    const novels = ep.novels as { title: string; slug: string };
    const episode = localizeEpisode(ep as unknown as Episode, locale);
    return {
      ...episode,
      novel_title: novels.title,
      novel_slug: novels.slug,
    };
  });
}

// ジャンル別小説一覧
export async function fetchNovelsByGenre(genreId: string, locale: string = "ja"): Promise<Novel[]> {
  if (!isSupabaseConfigured) return getMockNovelsByGenre(genreId).map((n) => localizeNovel(n, locale));

  const supabase = await getSupabase();
  const { data } = await supabase
    .from("novels")
    .select("*")
    .eq("genre", genreId)
    .order("total_pv", { ascending: false });
  return ((data as Novel[]) || []).map((n) => localizeNovel(n, locale));
}

// タグ別小説一覧
export async function fetchNovelsByTag(tag: string, locale: string = "ja"): Promise<Novel[]> {
  if (!isSupabaseConfigured) return getMockNovelsByTag(tag).map((n) => localizeNovel(n, locale));

  const supabase = await getSupabase();
  const { data } = await supabase
    .from("novels")
    .select("*")
    .contains("tags", [tag])
    .order("total_pv", { ascending: false });
  return ((data as Novel[]) || []).map((n) => localizeNovel(n, locale));
}

// 検索（タイトル・タグ・あらすじのキーワード検索）
export async function searchNovels(query: string, locale: string = "ja"): Promise<Novel[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  if (!isSupabaseConfigured) {
    // モックデータからの検索
    return getMockNovels()
      .filter((n) => {
        const text = [n.title, n.title_en, n.tagline, n.synopsis, ...n.tags].filter(Boolean).join(" ").toLowerCase();
        return q.split(/\s+/).every((word) => text.includes(word));
      })
      .map((n) => localizeNovel(n, locale));
  }

  const supabase = await getSupabase();
  // Supabaseのilike検索（各ワードでAND検索）
  const words = q.split(/\s+/).filter(Boolean);
  let queryBuilder = supabase.from("novels").select("*");
  for (const word of words) {
    queryBuilder = queryBuilder.or(
      `title.ilike.%${word}%,tagline.ilike.%${word}%,synopsis.ilike.%${word}%,tags.cs.{${word}}`
    );
  }
  const { data } = await queryBuilder.order("total_pv", { ascending: false }).limit(50);
  return ((data as Novel[]) || []).map((n) => localizeNovel(n, locale));
}

// エピソード（範囲取得 — 閲覧ページで現在話+次話を取得）
export async function fetchEpisodeRange(
  novelId: string,
  from: number,
  to: number,
  locale: string = "ja"
): Promise<Episode[]> {
  if (!isSupabaseConfigured) {
    return getMockEpisodes(novelId)
      .filter((e) => e.episode_number >= from && e.episode_number <= to)
      .map((e) => localizeEpisode(e, locale));
  }

  const supabase = await getSupabase();
  // episodes_with_body ビューで本文含む完全データを取得
  const { data, error } = await supabase
    .from(EPISODE_VIEW)
    .select("*")
    .eq("novel_id", novelId)
    .gte("episode_number", from)
    .lte("episode_number", to)
    .order("episode_number", { ascending: true });

  // ビュー未作成時は元テーブルにフォールバック
  if (error && !data) {
    const { data: fallback } = await supabase
      .from("episodes")
      .select("*")
      .eq("novel_id", novelId)
      .gte("episode_number", from)
      .lte("episode_number", to)
      .order("episode_number", { ascending: true });
    return ((fallback as Episode[]) || []).map((e) => localizeEpisode(e, locale));
  }
  return ((data as Episode[]) || []).map((e) => localizeEpisode(e, locale));
}
