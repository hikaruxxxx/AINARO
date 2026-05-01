/**
 * 縦読み漫画パイプライン JSONB 列のスキーマと型ガード
 *
 * DB スキーマと TypeScript 型の境界。
 * Zod は未導入のため、素の TypeScript で型と型ガード関数を定義する。
 */

// ============================================================
// キャラ聖書 spec
// ============================================================

export type HairSpec = {
  /** 'messy_short' | 'long_straight' | 'twin_tails' 等 */
  style: string;
  /** カラーコード or 自然言語 */
  color: string;
  /** 「前髪が右目にかかる」など特徴 */
  specific?: string;
};

export type EyeSpec = {
  shape: string;  // 'almond' | 'round' | 'sharp' 等
  color: string;
  expression_default?: string;
};

export type FaceSpec = {
  jaw?: string;
  skin_tone?: string;
  marks?: string[];  // 「右頬に小さなほくろ」等
};

export type OutfitSpec = {
  top?: string;
  bottom?: string;
  outerwear?: string;
  shoes?: string;
  accessories?: string[];
};

export type CharacterSpec = {
  age_visual?: string;
  gender?: "male" | "female" | "non_binary" | "unspecified";
  height_cm?: number;
  build?: "lean" | "athletic" | "curvy" | "stocky" | "petite";
  hair?: HairSpec;
  eyes?: EyeSpec;
  face?: FaceSpec;
  outfit_default?: OutfitSpec;
  outfit_variants?: Record<string, OutfitSpec>;
  voice_tag?: string;
  personality_visual?: string;
};

// ============================================================
// 衣装 spec
// ============================================================

export type CostumeSpec = OutfitSpec & {
  notes?: string;
  /** どの状態か: '怪我中' '変身後' 等の自由記述 */
  state_description?: string;
};

// ============================================================
// ロケーション spec
// ============================================================

export type LocationLayoutSpec = {
  type?: "rectangular" | "L_shaped" | "open" | "complex";
  size_m?: string;
  doors?: Array<{ position: string; type?: string }>;
  windows?: Array<{ position: string; size?: string }>;
  furniture?: Array<{ type: string; position: string; color?: string }>;
};

export type LocationSpec = {
  era?: string;  // 'modern_japan' | 'medieval_fantasy' 等
  atmosphere?: string;
  layout?: LocationLayoutSpec;
  lighting_default?: string;
  /** カラーパレット */
  color_palette?: string[];
};

// ============================================================
// 小物 spec
// ============================================================

export type PropSpec = {
  kind?: string;  // 'sword' | 'phone' | 'ring' 等
  color?: string;
  material?: string;
  distinguishing_features?: string[];
};

export type PropOwnershipEntry = {
  owner_character_id: string;
  from_episode: number;
  to_episode: number | null;
  notes?: string;
};

// ============================================================
// キャラ関係履歴
// ============================================================

export type RelationHistoryEntry = {
  episode: number;
  change_summary: string;
  intimacy_delta?: number;
};

// ============================================================
// 参照画像セット
// ============================================================

export type CharacterReferenceImages = {
  /** 各キーは assets.cdn_url または storage_key */
  front?: string;
  side?: string;
  diagonal?: string;
  full_body?: string;
  expressions?: Record<string, string>;  // joy/anger/sad/surprise/laugh 等
  outfits?: Record<string, string>;  // casual/battle/uniform 等
};

export type LocationReferenceImages = {
  front?: string;
  wide?: string;
  from_door?: string;
  from_window?: string;
  time_variants?: Record<string, string>;  // morning/afternoon/evening/night
};

export type CostumeReferenceImages = {
  front?: string;
  side?: string;
  back?: string;
  details?: string[];
};

export type PropReferenceImages = {
  default?: string;
  views?: string[];
};

// ============================================================
// 属性分類器ラベル（CV検査の合議制で使用）
// ============================================================

export type AttributeClassifierLabels = {
  hair_color?: string;
  hair_style?: string;
  gender_visual?: string;
  age_band?: string;
  outfit_default?: string;
  /** 追加属性は自由 */
  [key: string]: string | undefined;
};

// ============================================================
// ショットリスト（ネーム層: storyboard_v2）
// ============================================================

/** ネーム層が記述する「コマの物語的役割」 */
export type NarrativeFunction =
  | "inform"        // 情報提示
  | "emote"         // 感情を見せる
  | "pause"         // 間・タメ（無音 or ほぼ無音）
  | "contrast"      // 直前コマとの対比
  | "reveal"        // 隠されていたものの露出（翻し）
  | "silence"       // 完全無音、余韻
  | "establishing"  // 場・状況の確立
  | "beat_button"   // ビート締めの一発（決め台詞 or 決め画）
  | "reaction"      // キャラのリアクションショット
  | "cutaway";      // 別所への切り返し

/** ページ単位の役割（L1.2 で各ページに付与） */
export type StoryboardPageRole =
  | "establishing"  // 場の確立 / シーン頭
  | "dialogue"      // 会話・関係性
  | "action"        // アクション・戦闘
  | "reveal"        // 翻し・新情報
  | "aftermath"     // 余韻・小休止
  | "cliffhanger";  // ページ末・話末の引き

/** ページめくり候補（L1.4 が最終決定するためのヒント） */
export type TurnCandidate =
  | "none"
  | "page_open"     // ページ頭側の引き受け
  | "page_end"      // ページ末（次ページで答えが出る）
  | "episode_end";  // 話末の cliffhanger

/** 1コマあたりの吹き出し予算（SVG重ね前提の文字量制御） */
export type BubbleBudget = {
  /** 吹き出し数 (0=silent) */
  count: number;
  /** 1コマ合計の最大文字数 */
  max_chars: number;
  /** 主たる種別 */
  type?:
    | "narration_box"
    | "dialogue"
    | "thought"
    | "shout"
    | "whisper"
    | "mixed";
};

/** 原文への対応参照（trace 用） */
export type SourceRef = {
  /** scene-splitter 由来 */
  scene_id: string;
  /** 本文中の文字オフセット [start, end]（任意） */
  body_offset?: [number, number];
};

export type ShotlistPanelEntry = {
  /** ショットリスト内ID（panel_idx と一致させる） */
  idx: number;
  role: import("./types").PanelRole;
  aspect: import("./types").PanelAspect;
  /** 自由テキストID（同一エピソード内でユニーク） */
  scene_id: string;
  /** どのプロットビート (EpisodePlotData.beats[*].beat_idx) に属するか */
  beat_idx?: number;
  camera: import("./types").PanelCamera;
  /** スクロール上のテンポ */
  tempo: "fast" | "slow" | "stop";
  /** このパネルに登場するキャラの ID 配列（character_bibles.id） */
  characters: string[];
  /** spatial_position の指定 */
  character_positions?: Record<string, import("./types").PanelSpatialPosition>;
  location: string | null;  // location_bibles.id または null
  narration?: string;
  dialogue?: Array<{
    speaker_id: string;
    text: string;
    intent?: string;
    bubble_type?: import("./types").BubbleType;
  }>;
  emotion?: string;
  /** スクロール時の意図的なポーズ（秒換算） */
  scroll_pause_intent?: number;
  /** Codex指摘: 1コマ最大2人推奨、3人以上は遠景・シルエット */
  multi_character_treatment?: "normal" | "distant" | "silhouette" | "split_panel";

  // === ネーム層フィールド (Phase 1 redesign 2026-04-30) ===
  /** このコマの物語的役割 */
  narrative_function?: NarrativeFunction;
  /** このコマで読者に伝えたいこと（1文） */
  purpose?: string;
  /** 直前コマからの変化（"何が新しく見えるか") */
  change_from_prev?: string;
  /** 次コマへの繋ぎ・期待を作る要素 */
  link_to_next?: string;
  /** 期待する読者反応 */
  reader_reaction_intended?: string;
  /** 絵の中で読者の目を引かせるべき要素（フォーカル） */
  visual_focus?: string;
  /** 直前コマからのカット繋ぎタイプ（漫画用語の言い換え） */
  cut_type?:
    | "match_action"     // 動作の続き
    | "shot_reverse"     // 切り返し（話者A→Bの顔）
    | "scale_jump"       // 引き→寄り、寄り→引き
    | "graphic_match"    // 形・構図の類似で繋ぐ
    | "smash_cut"        // 場面強制切替
    | "reveal_pull"      // 引きで何かが見える
    | "time_skip";       // 時間ジャンプ

  // === ネーム層フィールド (Phase A 1巻管理向け 2026-05-01) ===
  /** どのページに属するか（L1.2 が page階層を出すための紐付け、1-indexed） */
  page_idx?: number;
  /** ネーム作家が意図したコマ重要度 1-5（L1.4 のテンプレ slot 大小に直結） */
  importance?: 1 | 2 | 3 | 4 | 5;
  /** 1コマあたりの吹き出し予算（SVG重ね前提） */
  bubble_budget?: BubbleBudget;
  /** ページめくり候補種別（L1.4 への強制ではないヒント） */
  turn_candidate?: TurnCandidate;
  /** ページめくり強度 0-5（cliffhanger=4-5、reveal前=3-4） */
  turn_strength?: 0 | 1 | 2 | 3 | 4 | 5;
  /** 原文への対応参照（どの本文範囲を絵にしたかの trace） */
  source_ref?: SourceRef;
  /** ネガティブスペースのヒント（生成prompt と SVG吹き出し配置の両方が参照） */
  negative_space_hint?: string;
  /** 描画リスクの自己申告（複雑な手・接触瞬間など、F-2/F-1 戦略選択の入力） */
  render_risk?: "low" | "medium" | "high";
};

/** ページ階層エントリ（L1.2 の出力、L1.4 が消費） */
export type StoryboardPageEntry = {
  /** ページ番号 1-indexed */
  page_idx: number;
  /** RTL 横読みでの開始ページ側（右開きが基本） */
  page_side?: "right" | "left";
  /** ページの主機能 */
  page_role: StoryboardPageRole;
  /** 目標コマ数（L1.4 が最終調整、目安として使用） */
  target_panels: number;
  /** ページ頭の引き受け（前ページ末からの繋ぎ） */
  page_open_hook?: string;
  /** ページ末の引き（次ページで答えが出る or めくらせる動機） */
  page_end_hook?: string;
  /** ページ末の引き強度 0-5（cliffhanger=4-5） */
  turn_strength?: 0 | 1 | 2 | 3 | 4 | 5;
  /** このページに属する panel idx の参照配列（ShotlistPanelEntry.idx） */
  panel_idxs: number[];
};

export type ShotlistData = {
  /** エピソード全体のリズム曲線。各シーンの強度 0-1 */
  rhythm_curve: number[];
  panels: ShotlistPanelEntry[];
  /** ページ階層（L1.2 storyboard-builder が出力、L1.4 page-director が消費） */
  pages?: StoryboardPageEntry[];
  /** 目標ページ数（plot.episode_target_pages のスナップショット） */
  episode_target_pages?: number;
  /** 生成時のメタ */
  meta?: {
    total_panels: number;
    total_height_px_estimate: number;
    generated_by: string;  // モデル名
    generation_version: string;
  };
};

// ============================================================
// エピソードプロット (L0)
// ============================================================

export type PlotBeatLabel =
  | "hook"               // 冒頭の引き
  | "inciting_incident"  // 出来事の発生
  | "rising"             // 緊張上昇
  | "turn"               // 転（裏切り・意外性）
  | "climax"             // 山場
  | "resolution"         // 決着
  | "cliffhanger";       // 末尾の引き

export type PlotBeat = {
  /** 1-indexed の順序 */
  beat_idx: number;
  label: PlotBeatLabel;
  /** ビートの要約（1-2 文） */
  summary: string;
  /** 0-1 の感情強度 */
  emotional_intensity: number;
  /** このビートで「絵で覚えてほしい一場面」の言語化 */
  key_visual: string;
  /** 関連シーンの scene_id（scene-splitter 出力との対応） */
  scene_ids: string[];
  /** このビートに紐づくキャラ名（character_bibles.character_name） */
  characters: string[];
  /** 後の話への伏線種まき（任意） */
  foreshadow_seed?: string;
  /** この話で回収する伏線（任意） */
  foreshadow_payoff?: string;
  /** ページ予算（横読み Phase A、Codex レビュー反映: 1|2|3 では足りないので min/max/target） */
  page_budget?: {
    target_pages: number;
    min_pages: number;
    max_pages: number;
    target_panels?: number;
  };
};

export type EpisodePlotData = {
  /** 1話の主題（読者にとっての面白さの中核） */
  theme: string;
  /** 主人公の感情曲線 */
  protagonist_arc: {
    start: string;   // 開始時の状態・感情
    turn: string;    // 中盤の転換
    end: string;     // 終盤の状態・感情
  };
  /** 起承転結のビート配列 */
  beats: PlotBeat[];
  /** エピソード末尾の引き（次話遷移率の主要因） */
  cliffhanger_hook: string;
  /** 視覚モチーフ（繰り返し使う記号・小物・色） */
  motifs: string[];
  /** このエピソードで読者に与えたい体験（読了時の余韻） */
  intended_reading_experience: string;
  /** 目標パネル数（panel_count 主導の旧入力。横読みでは episode_target_pages が主） */
  episode_target_panels: number;
  /** 目標ページ数（KDP 横読み Phase A の主入力。各 beat に page_budget が付与される） */
  episode_target_pages?: number;
  /** 1巻スケジュールから受け取る必須イベント（Volume Planner 連携、self-judge 入力） */
  must_include_events?: string[];
  /** 目標 ep_num */
  ep_num: number;
};

// ============================================================
// 吹き出し位置
// ============================================================

export type BubblePosition = {
  x: number;
  y: number;
  width: number;
  height: number;
  /** 話者方向の尻尾 */
  tail_x?: number;
  tail_y?: number;
};

// ============================================================
// CV検査結果
// ============================================================

export type CvInspectionResult = {
  /** CLIP 類似度 (0-1)。Phase 1 の主指標 */
  clip_score?: number;
  /** Phase 2 以降に追加 */
  dinov2_score?: number;
  /** Phase 2 以降に追加 */
  arcface_score?: number;
  /** 属性一致率 (0-1) */
  attribute_match?: number;
  /** 各キャラの個別スコア */
  per_character?: Array<{
    character_id: string;
    clip_score: number;
    attribute_match: number;
    decision: import("./types").QaDecision;
  }>;
  /** 検出された手の指本数（検出されたhandごとに5指期待） */
  hand_finger_count?: number[];
  /** OCR で検出されたテキストの「文字化けスコア」(0-1)。0.3超で fail 候補 */
  ocr_garbage_score?: number;
  /** 検出されたOCRテキスト */
  ocr_text?: string;
  /** プラットフォーム別NG表現の検出 */
  regulation_violations?: string[];
  /** 構図品質 */
  composition?: {
    rule_of_thirds_score?: number;
    edge_safety?: number;
  };
};

// ============================================================
// アセット生成メタデータ
// ============================================================

export type GenerationMetadata = {
  reference_image_ids?: string[];
  controlnet_inputs?: Array<{ type: string; weight: number; image_id?: string }>;
  sampler?: string;
  cfg?: number;
  steps?: number;
  latency_ms?: number;
  cost_usd?: number;
  request_id?: string;
  /** モデル提供元 */
  provider?: "openai" | "replicate" | "runpod" | "cloudflare" | "local";
};

// ============================================================
// 権利状況（Codex指摘: 権利・規約層の中核）
// ============================================================

export type RightsStatus = {
  /** 権利保有者 */
  rights_holder?: string;
  /** AI 学習・生成での利用が許諾されているか */
  ai_use_allowed?: boolean;
  /** 商用利用が許諾されているか */
  commercial_allowed?: boolean;
  /** AI明示が要求されているか */
  ai_disclosure_required?: boolean;
  /** 地域別権利 */
  regional_rights?: Array<{
    region: string;  // 'JP'|'US'|'EU' 等
    publish_allowed: boolean;
    notes?: string;
  }>;
  /** 翻訳権 */
  translation_rights?: Array<{
    lang: string;
    allowed: boolean;
  }>;
  /** 契約書・関連文書のURL */
  contract_refs?: string[];
};

// ============================================================
// 投稿パッケージメタ
// ============================================================

export type PublishMeta = {
  title: string;
  description: string;
  tags: string[];
  /** AI生成明示文言 */
  ai_disclosure_text?: string;
  /** プラットフォーム別レーティング */
  content_rating?: "all_ages" | "teen" | "mature" | "adult";
  language?: string;
  /** プラットフォーム固有設定 */
  platform_specific?: Record<string, unknown>;
};

export type ComplianceChecklist = {
  ai_disclosure_confirmed?: boolean;
  content_rating_confirmed?: boolean;
  terms_reviewed_at?: string;
  reviewer?: string;
  /** プラットフォーム規約バージョン */
  terms_version?: string;
  notes?: string;
};

// ============================================================
// 型ガード関数（DB から fetched JSONB の最低限の検証）
// ============================================================

export function isCharacterSpec(value: unknown): value is CharacterSpec {
  return typeof value === "object" && value !== null;
}

export function isLocationSpec(value: unknown): value is LocationSpec {
  return typeof value === "object" && value !== null;
}

export function isShotlistData(value: unknown): value is ShotlistData {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<ShotlistData>;
  return Array.isArray(v.rhythm_curve) && Array.isArray(v.panels);
}

export function isBubblePosition(value: unknown): value is BubblePosition {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<BubblePosition>;
  return (
    typeof v.x === "number" &&
    typeof v.y === "number" &&
    typeof v.width === "number" &&
    typeof v.height === "number"
  );
}

export function isCvInspectionResult(value: unknown): value is CvInspectionResult {
  return typeof value === "object" && value !== null;
}

export function isRightsStatus(value: unknown): value is RightsStatus {
  return typeof value === "object" && value !== null;
}

// ============================================================
// シリアライザ（DB INSERT 時に JSONB として安全な形へ）
// ============================================================

/** undefined を除いて空オブジェクトを返す。JSONB に undefined を入れない */
export function toJsonbObject<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) result[k] = v;
  }
  return result;
}
