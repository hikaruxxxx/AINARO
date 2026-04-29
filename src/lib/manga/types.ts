/**
 * 縦読み漫画パイプライン Phase 0 型定義
 *
 * 対応マイグレーション: supabase/migrations/20260501000000_manga_pipeline.sql
 * 対応プラン: ~/.claude/plans/codex-encapsulated-knuth.md
 *
 * DB の row 型と TypeScript 型を 1:1 で対応させる。
 * JSONB 列のスキーマは ./schemas.ts に分離する。
 */

import type {
  CharacterSpec,
  LocationSpec,
  PropSpec,
  CostumeSpec,
  CharacterReferenceImages,
  LocationReferenceImages,
  CostumeReferenceImages,
  PropReferenceImages,
  AttributeClassifierLabels,
  ShotlistData,
  BubblePosition,
  CvInspectionResult,
  GenerationMetadata,
  RightsStatus,
  PublishMeta,
  ComplianceChecklist,
  RelationHistoryEntry,
  PropOwnershipEntry,
} from "./schemas";

// ============================================================
// 列挙型
// ============================================================

export type MangaWorkStatus =
  | "screening"
  | "bible_build"
  | "generating"
  | "qa"
  | "published"
  | "archived";

export type MangaEpisodeStatus =
  | "draft"
  | "shotlisting"
  | "generating"
  | "qa"
  | "ready"
  | "published"
  | "archived";

export type PrimaryModel =
  | "gpt-image-1.5"
  | "gpt-image-1"
  | "gpt-image-1-mini"
  | "flux-pro-ultra"
  | "sdxl-local";

/** 漫画版配信プラットフォーム */
export type MangaPlatform =
  | "self"
  | "webtoon_canvas"
  | "pixiv"
  | "line_indies"
  | "piccoma_indies"
  | "comico_plus"
  | "jump_rookie"
  | "youtube_shorts"
  | "tiktok"
  | "instagram_reels";

/** パネルの縦読み演出役割（Codex指摘: 縦読み演出設計） */
export type PanelRole =
  | "opening"
  | "emotion"
  | "information"
  | "action"
  | "transition"
  | "cliffhanger";

/** パネルのアスペクト */
export type PanelAspect = "vertical" | "square" | "big" | "splash";

export type PanelCamera =
  | "face_close"
  | "full_body"
  | "over_shoulder"
  | "birds_eye"
  | "hands"
  | "wide"
  | "side";

export type PanelSpatialPosition =
  | "left"
  | "center"
  | "right"
  | "foreground"
  | "background";

export type CharacterRole =
  | "protagonist"
  | "heroine"
  | "antagonist"
  | "supporting";

export type LocationType =
  | "school"
  | "home"
  | "cafe"
  | "fantasy_castle"
  | "office"
  | "outdoor"
  | "other";

export type RelationType =
  | "family"
  | "friend"
  | "rival"
  | "lover"
  | "enemy"
  | "mentor"
  | "subordinate";

export type AssetKind =
  | "panel"
  | "character_ref"
  | "location_ref"
  | "costume_ref"
  | "cover"
  | "thumbnail"
  | "video"
  | "package";

export type AssetVisibility = "internal" | "authenticated" | "public";

export type ModerationStatus = "pending" | "pass" | "warn" | "fail";

export type QaStatus = "pending" | "pass" | "warn" | "fail" | "manual_override";

export type QaDecision =
  | "pass"
  | "warn"
  | "reroll"
  | "manual_review"
  | "override";

export type BubbleType = "normal" | "thought" | "shout" | "whisper" | "narration";

export type KpiMetricType =
  | "view"
  | "completion"
  | "next_ep"
  | "bookmark"
  | "comment"
  | "drop_position"
  | "sns_ctr";

export type PublishStatus =
  | "pending"
  | "ready"
  | "published"
  | "rejected"
  | "archived";

export type ArtStyle = "shounen" | "shoujo" | "webtoon" | "realistic" | "chibi";

// ============================================================
// テーブル行型
// ============================================================

export type MangaWorkRow = {
  id: string;
  novel_id: string;
  title: string;
  title_en: string | null;
  status: MangaWorkStatus;
  art_style: ArtStyle;
  primary_model: PrimaryModel;
  target_platforms: MangaPlatform[];
  manga_aptitude_score: number | null;
  rights_status: RightsStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type MangaEpisodeRow = {
  id: string;
  work_id: string;
  ep_num: number;
  title: string | null;
  source_episode_id: string | null;
  status: MangaEpisodeStatus;
  panel_count: number;
  total_height_px: number;
  scheduled_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CharacterBibleRow = {
  id: string;
  work_id: string;
  character_name: string;
  character_role: CharacterRole | null;
  spec: CharacterSpec;
  reference_images: CharacterReferenceImages;
  embedding_clip: Buffer | null;
  embedding_dinov2: Buffer | null;
  embedding_arcface: Buffer | null;
  attribute_classifier: AttributeClassifierLabels;
  master_seed: number | null;
  created_at: string;
  updated_at: string;
};

export type CostumeStateRow = {
  id: string;
  character_id: string;
  state_name: string;
  spec: CostumeSpec;
  reference_images: CostumeReferenceImages;
  valid_from_episode: number | null;
  valid_to_episode: number | null;
  notes: string | null;
  created_at: string;
};

export type LocationBibleRow = {
  id: string;
  work_id: string;
  location_name: string;
  location_type: LocationType | null;
  spec: LocationSpec;
  reference_images: LocationReferenceImages;
  master_seed: number | null;
  three_d_model_path: string | null;
  created_at: string;
};

export type PropRow = {
  id: string;
  work_id: string;
  prop_name: string;
  spec: PropSpec;
  reference_images: PropReferenceImages;
  ownership_history: PropOwnershipEntry[];
  created_at: string;
};

export type CharacterRelationRow = {
  id: string;
  work_id: string;
  char_a_id: string;
  char_b_id: string;
  relation_type: RelationType | null;
  address_a_to_b: string | null;
  address_b_to_a: string | null;
  intimacy_level: number | null;
  current_status: string | null;
  history: RelationHistoryEntry[];
  created_at: string;
};

export type ShotlistRow = {
  id: string;
  episode_id: string;
  data: ShotlistData;
  generated_at: string;
};

export type AssetRow = {
  id: string;
  asset_kind: AssetKind;
  parent_id: string | null;
  version: number;
  derived_from_asset_id: string | null;
  storage_key: string;
  cdn_url: string | null;
  hash_sha256: string;
  width_px: number | null;
  height_px: number | null;
  file_size_bytes: number | null;
  mime_type: string;
  prompt: string | null;
  negative_prompt: string | null;
  seed: number | null;
  model_used: string | null;
  generation_metadata: GenerationMetadata;
  visibility: AssetVisibility;
  moderation_status: ModerationStatus;
  created_at: string;
};

export type MangaPanelRow = {
  id: string;
  episode_id: string;
  panel_idx: number;
  role: PanelRole;
  aspect: PanelAspect;
  width_px: number;
  height_px: number;
  scene_id: string | null;
  location_id: string | null;
  camera: PanelCamera | null;
  emotion_tag: string | null;
  current_asset_id: string | null;
  qa_status: QaStatus;
  qa_reason: string | null;
  generation_attempts: number;
  consistency_score: number | null;
  created_at: string;
  updated_at: string;
};

export type PanelCharacterRow = {
  panel_id: string;
  character_id: string;
  costume_state_id: string | null;
  emotion: string | null;
  spatial_position: PanelSpatialPosition | null;
};

export type BubbleRow = {
  id: string;
  panel_id: string;
  bubble_idx: number;
  speaker_id: string | null;
  text: string;
  text_lang: string;
  bubble_type: BubbleType;
  position: BubblePosition;
  font_family: string | null;
  font_size: number | null;
  z_index: number;
  reading_order: number;
  created_at: string;
};

export type MangaKpiRow = {
  id: string;
  episode_id: string | null;
  panel_id: string | null;
  platform: MangaPlatform;
  metric_type: KpiMetricType;
  metric_value: number;
  measured_at: string;
  raw_data: Record<string, unknown>;
};

export type QaLogRow = {
  id: string;
  panel_id: string;
  asset_id: string | null;
  attempt_num: number;
  cv_results: CvInspectionResult;
  decision: QaDecision;
  failure_reasons: string[];
  human_override: boolean;
  reviewer_id: string | null;
  reviewed_at: string;
};

export type PublishPackageRow = {
  id: string;
  episode_id: string;
  platform: MangaPlatform;
  package_asset_id: string | null;
  meta: PublishMeta;
  status: PublishStatus;
  human_published_at: string | null;
  external_url: string | null;
  compliance_checklist: ComplianceChecklist;
  created_at: string;
  updated_at: string;
};

// ============================================================
// 集計ビュー型
// ============================================================

export type MangaEpisodeKpiSummary = {
  episode_id: string;
  work_id: string;
  ep_num: number;
  published_at: string | null;
  total_views: number;
  avg_completion_rate: number | null;
  avg_next_ep_rate: number | null;
  avg_bookmark_rate: number | null;
};

// ============================================================
// 結合型（よく使う JOIN 結果）
// ============================================================

/** パネル + 現在アセット + 登場キャラ */
export type PanelWithAssetAndCharacters = MangaPanelRow & {
  current_asset: AssetRow | null;
  characters: Array<PanelCharacterRow & { character: CharacterBibleRow }>;
  bubbles: BubbleRow[];
};

/** エピソード + 全パネル */
export type EpisodeWithPanels = MangaEpisodeRow & {
  panels: PanelWithAssetAndCharacters[];
  shotlist: ShotlistRow | null;
};

/** 作品 + 全聖書 */
export type WorkWithBibles = MangaWorkRow & {
  characters: CharacterBibleRow[];
  locations: LocationBibleRow[];
  costumes: CostumeStateRow[];
  props: PropRow[];
  relations: CharacterRelationRow[];
};
