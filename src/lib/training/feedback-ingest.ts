// 公開済み作品の読者シグナル（episode_signals）を取得し、
// v11ヒット予測モデルの学習データとして data/training/ 配下に書き出す共通ロジック。
//
// 出力構造:
//   data/training/positive/{slug}/ep{NN}.json   ... quality_signal が高い作品
//   data/training/feedback/{slug}/ep{NN}.json   ... 全公開作品の生シグナル
//   data/training/_index.json                    ... バッチ実行履歴
//
// 学習データには「本文 + シグナル」をペアで保存する。
// 本文は content/works/{slug}/episodes/ep{NN}.md から読む（DBに無ければスキップ）。

import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 学習データに含める1エピソード分のレコード
export interface TrainingRecord {
  novelId: string;
  slug: string;
  episodeNumber: number;
  characterCount: number;
  text: string;
  signals: {
    completionRate: number | null;
    nextTransitionRate: number | null;
    bookmarkRate: number | null;
    avgReadingTimeRatio: number | null;
    dropCliffPosition: number | null;
    qualitySignal: number | null;
    sampleSize: number;
  };
  fetchedAt: string;
}

// バッチ実行サマリ
export interface IngestSummary {
  ranAt: string;
  totalEpisodesFetched: number;
  positiveCount: number;
  feedbackCount: number;
  skippedNoText: number;
  skippedLowSample: number;
  positiveThreshold: number;
  minSampleSize: number;
}

const POSITIVE_QUALITY_THRESHOLD = 70; // quality_signal >= 70 を positive 扱い
const MIN_SAMPLE_SIZE = 30; // sample_size < 30 はノイズ扱いで除外

export function createSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要です");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

interface SignalRow {
  episode_id: string;
  novel_id: string;
  completion_rate: number | null;
  next_transition_rate: number | null;
  bookmark_rate: number | null;
  avg_reading_time_ratio: number | null;
  drop_cliff_position: number | null;
  quality_signal: number | null;
  sample_size: number;
}

interface EpisodeRow {
  id: string;
  novel_id: string;
  episode_number: number;
  character_count: number;
  novels: { slug: string } | null;
}

/** episode_signalsとepisodesをjoinして取得 */
export async function fetchSignals(
  supabase: SupabaseClient,
  minSample: number,
): Promise<{ signals: SignalRow[]; episodes: Map<string, EpisodeRow> }> {
  const { data: signals, error } = await supabase
    .from("episode_signals")
    .select("*")
    .gte("sample_size", minSample);
  if (error) throw error;

  const episodeIds = (signals ?? []).map((s) => s.episode_id);
  if (episodeIds.length === 0) {
    return { signals: [], episodes: new Map() };
  }
  const { data: episodes, error: epErr } = await supabase
    .from("episodes")
    .select("id, novel_id, episode_number, character_count, novels(slug)")
    .in("id", episodeIds);
  if (epErr) throw epErr;

  const epMap = new Map<string, EpisodeRow>();
  for (const e of (episodes ?? []) as unknown as EpisodeRow[]) {
    epMap.set(e.id, e);
  }
  return { signals: signals as SignalRow[], episodes: epMap };
}

/** content/works/{slug}/episodes/ep{NN}.md を読む。なければnull */
export function loadEpisodeText(slug: string, episodeNumber: number): string | null {
  const padded = String(episodeNumber).padStart(3, "0");
  // よくあるパス候補を順番に試す
  const candidates = [
    join("content/works", slug, "episodes", `ep${padded}.md`),
    join("content/works", slug, `ep${padded}.md`),
    join("content/works", slug, "episodes", `${padded}.md`),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return readFileSync(p, "utf-8");
  }
  return null;
}

export function buildRecord(
  signal: SignalRow,
  episode: EpisodeRow,
  text: string,
): TrainingRecord {
  return {
    novelId: episode.novel_id,
    slug: episode.novels?.slug ?? "unknown",
    episodeNumber: episode.episode_number,
    characterCount: episode.character_count,
    text,
    signals: {
      completionRate: signal.completion_rate,
      nextTransitionRate: signal.next_transition_rate,
      bookmarkRate: signal.bookmark_rate,
      avgReadingTimeRatio: signal.avg_reading_time_ratio,
      dropCliffPosition: signal.drop_cliff_position,
      qualitySignal: signal.quality_signal,
      sampleSize: signal.sample_size,
    },
    fetchedAt: new Date().toISOString(),
  };
}

/** 1レコードを feedback/ と必要なら positive/ にも書き出す */
export function writeRecord(
  record: TrainingRecord,
  rootDir: string,
  positiveThreshold: number,
): { positive: boolean } {
  const padded = String(record.episodeNumber).padStart(3, "0");
  const filename = `ep${padded}.json`;

  // feedback/ には常に保存
  const fbDir = join(rootDir, "feedback", record.slug);
  mkdirSync(fbDir, { recursive: true });
  writeFileSync(join(fbDir, filename), JSON.stringify(record, null, 2));

  // positive/ には quality_signal が閾値以上のものだけ
  const isPositive =
    record.signals.qualitySignal !== null && record.signals.qualitySignal >= positiveThreshold;
  if (isPositive) {
    const posDir = join(rootDir, "positive", record.slug);
    mkdirSync(posDir, { recursive: true });
    writeFileSync(join(posDir, filename), JSON.stringify(record, null, 2));
  }
  return { positive: isPositive };
}

export function appendIndex(rootDir: string, summary: IngestSummary): void {
  const indexPath = join(rootDir, "_index.json");
  const existing: IngestSummary[] = existsSync(indexPath)
    ? (JSON.parse(readFileSync(indexPath, "utf-8")) as IngestSummary[])
    : [];
  existing.push(summary);
  writeFileSync(indexPath, JSON.stringify(existing, null, 2));
}

/** 取り込みのメインフロー */
export async function ingestFeedback(options?: {
  rootDir?: string;
  minSampleSize?: number;
  positiveThreshold?: number;
}): Promise<IngestSummary> {
  const rootDir = options?.rootDir ?? "data/training";
  const minSample = options?.minSampleSize ?? MIN_SAMPLE_SIZE;
  const threshold = options?.positiveThreshold ?? POSITIVE_QUALITY_THRESHOLD;

  const supabase = createSupabase();
  const { signals, episodes } = await fetchSignals(supabase, minSample);

  let positive = 0;
  let feedback = 0;
  let skippedNoText = 0;

  for (const sig of signals) {
    const ep = episodes.get(sig.episode_id);
    if (!ep) continue;
    const slug = ep.novels?.slug;
    if (!slug) continue;
    const text = loadEpisodeText(slug, ep.episode_number);
    if (!text) {
      skippedNoText++;
      continue;
    }
    const record = buildRecord(sig, ep, text);
    const { positive: isPositive } = writeRecord(record, rootDir, threshold);
    feedback++;
    if (isPositive) positive++;
  }

  const summary: IngestSummary = {
    ranAt: new Date().toISOString(),
    totalEpisodesFetched: signals.length,
    positiveCount: positive,
    feedbackCount: feedback,
    skippedNoText,
    skippedLowSample: 0, // クエリ側で minSample 未満を除外済み
    positiveThreshold: threshold,
    minSampleSize: minSample,
  };
  appendIndex(rootDir, summary);
  return summary;
}

/** 既存の保存済みslug一覧（再ingestの差分検知用、現状は参考のみ） */
export function listSavedSlugs(rootDir: string): string[] {
  const fbDir = join(rootDir, "feedback");
  if (!existsSync(fbDir)) return [];
  return readdirSync(fbDir);
}
