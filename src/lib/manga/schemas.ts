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
// ショットリスト
// ============================================================

export type ShotlistPanelEntry = {
  /** ショットリスト内ID（panel_idx と一致させる） */
  idx: number;
  role: import("./types").PanelRole;
  aspect: import("./types").PanelAspect;
  /** 自由テキストID（同一エピソード内でユニーク） */
  scene_id: string;
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
};

export type ShotlistData = {
  /** エピソード全体のリズム曲線。各シーンの強度 0-1 */
  rhythm_curve: number[];
  panels: ShotlistPanelEntry[];
  /** 生成時のメタ */
  meta?: {
    total_panels: number;
    total_height_px_estimate: number;
    generated_by: string;  // モデル名
    generation_version: string;
  };
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
