// 自己強化学習ループ関連の型定義

// --- episode_signals テーブル ---

export interface EpisodeSignal {
  episode_id: string;
  novel_id: string;
  completion_rate: number | null;
  next_transition_rate: number | null;
  avg_reading_time_ratio: number | null;
  drop_cliff_position: number | null;
  engagement_curve: number[] | null;
  bookmark_rate: number | null;
  sample_size: number;
  quality_signal: number | null; // 0-100
  calculated_at: string;
}

// --- discovered_patterns テーブル ---

export type PatternType = "positive" | "negative" | "conditional";
export type PatternConfidence = "low" | "medium" | "high";
export type PatternStatus =
  | "hypothesis"
  | "testing"
  | "confirmed"
  | "rejected"
  | "retired";

export interface DiscoveredPattern {
  id: string;
  finding: string;
  pattern_type: PatternType;
  genre: string | null;
  confidence: PatternConfidence;
  sample_size: number;
  actionable_rule: string | null;
  status: PatternStatus;
  ab_test_id: string | null;
  promoted_at: string | null;
  discovered_at: string;
}

// --- episode_generation_meta テーブル ---

export interface EpisodeGenerationMeta {
  episode_id: string;
  model_version: string | null;
  applied_patterns: string[];
  is_exploration: boolean;
  experiment_id: string | null;
  variant: string | null;
  created_at: string;
}

// --- パターン抽出エンジン ---

export interface EpisodeWithSignal {
  episode_id: string;
  novel_id: string;
  episode_number: number;
  title: string;
  body_md: string;
  genre: string | null;
  quality_signal: number;
  completion_rate: number;
  next_transition_rate: number;
  sample_size: number;
}

export interface PatternFinding {
  finding: string;
  pattern_type: PatternType;
  genre: string | null;
  confidence: PatternConfidence;
  actionable_rule: string;
}

export interface PatternExtractionResult {
  patterns: PatternFinding[];
  meta: {
    topEpisodesAnalyzed: number;
    bottomEpisodesAnalyzed: number;
    genresAnalyzed: string[];
    statisticalDiffs: FeatureDiff[];
  };
}

export interface FeatureDiff {
  feature: string;
  topMean: number;
  bottomMean: number;
  diff: number; // top - bottom
  significant: boolean;
}

// --- A/Bテスト自動設計 ---

export interface ABTestDesign {
  name: string;
  hypothesis: string;
  pattern_id: string;
  variant_a_description: string; // コントロール（パターン未適用）
  variant_b_description: string; // トリートメント（パターン適用）
  target_metric: "completion_rate" | "next_episode_rate";
  required_sample_size: number;
}

export interface ABTestJudgment {
  test_id: string;
  winner: "a" | "b" | "inconclusive";
  p_value: number;
  sample_size_a: number;
  sample_size_b: number;
  metric_a: number;
  metric_b: number;
  pattern_id: string | null;
  new_status: PatternStatus;
}

// --- ループ統計 ---

export interface LoopStats {
  last_signal_computation: string | null;
  last_pattern_extraction: string | null;
  last_pattern_update: string | null;
  total_patterns: number;
  patterns_by_status: Record<PatternStatus, number>;
  active_ab_tests: number;
  avg_quality_signal: number | null;
  quality_signal_trend: { week: string; avg_signal: number }[];
  exploration_vs_normal: {
    exploration_avg: number | null;
    normal_avg: number | null;
  };
}
