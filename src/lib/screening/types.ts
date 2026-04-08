// Phase 1 スクリーニングの共通型定義

export type Tier = "top" | "upper" | "mid" | "lower" | "bottom";

export type SlugState =
  | "pending"
  | "generating"
  | "generated"
  | "early_exit"
  | "scored"
  | "promoted"
  | "rescued"
  | "discarded"
  | "negative_saved"
  | "failed";

/** 1作品の進捗エントリ */
export interface ProgressEntry {
  slug: string;
  state: SlugState;
  logline?: string;
  genre?: string;
  tags?: ElementTags;
  charCount?: number;
  hitProbability?: number;
  llmScores?: LlmScores;
  tier?: Tier;
  failureReason?: string;
  retryCount?: number;
  updatedAt: string;
}

export interface LlmScores {
  hook: number;
  character: number;
  originality: number;
  prose: number;
  tension: number;
  pull: number;
}

/** 4軸の要素タグ */
export interface ElementTags {
  境遇: string;
  転機: string;
  方向: string;
  フック: string;
}

/** バッチ進捗ファイル `_progress.json` の本体 */
export interface ProgressFile {
  batchId: string;
  startedAt: string;
  updatedAt: string;
  parallelism: number;
  totalTarget: number;
  entries: Record<string, ProgressEntry>;
}
