// AI生成検出エージェントの結果型

export interface AIDetectionMetric {
  score: number; // 0-100
  detail: string; // 日本語の説明
}

export interface AIDetectionResult {
  overallScore: number; // 0-100 (100=AI生成の可能性が高い)
  confidence: "low" | "medium" | "high";
  metrics: {
    vocabularyDiversity: AIDetectionMetric;
    sentenceLengthVariance: AIDetectionMetric;
    burstiness: AIDetectionMetric;
    conjunctionPattern: AIDetectionMetric;
    repetition: AIDetectionMetric;
    endingPattern: AIDetectionMetric;
    punctuationDensity: AIDetectionMetric;
    paragraphStructure: AIDetectionMetric;
  };
  summary: string; // 日本語の総評
}

// 人気評価エージェントの結果型

export interface PopularityMetric {
  score: number; // 0-100
  detail: string; // 日本語の説明
}

export interface PopularityEvaluationResult {
  overallScore: number; // 0-100 (100=人気が出やすい)
  grade: "S" | "A" | "B" | "C" | "D"; // S=90+ A=80+ B=60+ C=40+ D=40未満
  metrics: {
    hookStrength: PopularityMetric; // 冒頭の引き込み力
    pacing: PopularityMetric; // テンポ
    dialogueRatio: PopularityMetric; // 会話比率
    innerMonologue: PopularityMetric; // 内面独白比率
    cliffhanger: PopularityMetric; // 引き（クリフハンガー）
    emotionalArc: PopularityMetric; // 感情起伏
    sensoryDescription: PopularityMetric; // 五感描写
    readability: PopularityMetric; // 読みやすさ
  };
  strengths: string[]; // 強み（日本語）
  improvements: string[]; // 改善提案（日本語）
  summary: string; // 日本語の総評
}

// 人気評価のジャンル
export type PopularityGenre =
  | "fantasy"
  | "romance"
  | "horror"
  | "mystery"
  | "scifi"
  | "slice_of_life";

// NG表現検出エージェントの結果型

export interface BlacklistMatch {
  expression: string; // 検出されたNG表現
  category: string; // カテゴリ（AI臭い常套句、陳腐な感情表現、冗長な修飾）
  positions: number[]; // テキスト内の出現位置（文字インデックス）
  suggestion?: string; // 改善提案（あれば）
  context: string; // 検出箇所の前後テキスト
}

export interface BlacklistDetectionResult {
  totalMatches: number; // 検出総数
  severity: "clean" | "minor" | "warning" | "critical"; // clean=0, minor=1-2, warning=3-5, critical=6+
  matches: BlacklistMatch[];
  summary: string;
}

// 文体一貫性チェックエージェントの結果型

export interface StyleParam {
  name: string; // パラメータ名
  target: string | number; // _style.mdの設定値
  actual: string | number; // 実測値
  deviation: number; // 乖離度 0-100（0=完全一致）
  detail: string;
}

export interface StyleConsistencyResult {
  overallScore: number; // 0-100（100=完全一致）
  grade: "S" | "A" | "B" | "C" | "D";
  params: {
    sentenceLength: StyleParam; // 平均文長
    dialogueRatio: StyleParam; // 会話比率
    innerMonologueRatio: StyleParam; // 内面独白比率
    tempo: StyleParam; // テンポ
    lineBreakFrequency: StyleParam; // 改行頻度
  };
  guidelineViolations: string[]; // base_guidelines.md違反
  summary: string;
}

// 設定整合性チェックエージェントの結果型

export interface CharacterConsistency {
  name: string; // キャラ名
  found: boolean; // テキスト内に登場するか
  speechPatternMatch: number; // 口調一致度 0-100
  issues: string[]; // 検出された問題
}

export interface SettingsConsistencyResult {
  overallScore: number; // 0-100（100=完全整合）
  characters: CharacterConsistency[];
  worldBuildingIssues: string[]; // 世界観設定との矛盾
  plotConsistencyIssues: string[]; // プロット指示との乖離
  summary: string;
}

// 校正エージェント（統合）の結果型

export interface ProofreadingResult {
  overallScore: number; // 0-100（100=問題なし）
  grade: "S" | "A" | "B" | "C" | "D";
  blacklist: BlacklistDetectionResult;
  style: StyleConsistencyResult;
  settings: SettingsConsistencyResult;
  summary: string;
}
