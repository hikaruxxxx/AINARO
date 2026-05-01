/**
 * BibleSnapshot — 作品設計書を画像生成パイプラインに渡すための正規化IR
 *
 * 目的:
 *   docs/strategy/work_X_*.md のような人間向け設計書を、
 *   build-bible-images.ts / generate-storyboard.ts / page-director に
 *   そのまま流せる構造化データへ変換する。
 *
 * 配置:
 *   - 既存 character-builder / location-builder / style-sheet が単独で
 *     扱っていた素材を、作品単位で1束にまとめる集約型
 *   - DB の character_bibles / location_bibles に投入する前段の中間表現
 *
 * SSoT: ~/.claude/plans/codex-swift-kettle.md (Month 2 Continuity Packet 設計の前段)
 */

import type {
  ArtStyle,
  CharacterRole,
  LocationType,
} from "../types";
import type {
  CharacterSpec,
  LocationSpec,
  AttributeClassifierLabels,
  CharacterReferenceImages,
  LocationReferenceImages,
} from "../schemas";

// ============================================================
// 作品メタ
// ============================================================

export type BibleWorkMeta = {
  /** 作品 slug (例: "tokyo-meikyu") */
  slug: string;
  /** 仮タイトル */
  title: string;
  /** 英題 (任意) */
  title_en?: string;
  /** ジャンル識別 (例: "modern_dungeon", "isekai_noble", "dungeon_explorer") */
  genre: string;
  /** 画風 (prompt-composer.ts の styleDirective キー) */
  art_style: ArtStyle;
  /** 想定 1 巻ページ数 */
  target_pages_per_volume: number;
  /** 想定 1 巻話数 */
  target_episodes_per_volume: number;
  /** 想定 1 話ページ数 (中央値) */
  target_pages_per_episode: number;
  /** 想定読者層 (LLM プロンプトでトーン調整に使う、自由記述) */
  target_audience?: string;
  /** 連載予想巻数 (LLM への長期一貫性の参考情報) */
  estimated_volumes?: number;
};

// ============================================================
// キャラクター束
// ============================================================

export type BibleCharacterEntry = {
  character_name: string;
  /** ローマ字読み (LLM が英語プロンプトで参照する場合に使用) */
  character_name_romaji?: string;
  character_role: CharacterRole;
  spec: CharacterSpec;
  attribute_classifier: AttributeClassifierLabels;
  /** 参照画像が既に生成済みの場合のみ埋まる (build-bible-images.ts 後に注入) */
  reference_images?: CharacterReferenceImages;
  /** 1 巻での登場頻度・役割の自由記述 (storyboard 生成時のヒント) */
  appearance_notes?: string;
  /**
   * 巻またぎで保ちたい不変要素 (continuity_group_id の元になる識別子セット)
   * 例: ["always_black_hood_jacket", "scar_left_eyebrow_after_ep3"]
   */
  continuity_anchors?: string[];
};

// ============================================================
// ロケーション束
// ============================================================

export type BibleLocationEntry = {
  location_name: string;
  location_type: LocationType;
  spec: LocationSpec;
  reference_images?: LocationReferenceImages;
  /** どの話で出てくるか (1, 2, 7 等) */
  appears_in_episodes?: number[];
  /** 巻またぎで保ちたい構造的特徴 */
  continuity_anchors?: string[];
};

// ============================================================
// 画風統制
// ============================================================

export type BibleStyleDirectives = {
  /** 全話通底の画風 (1-2 文) */
  global: string;
  /** シーン種別ごとの線・トーン指示 */
  scene_overrides?: {
    daily?: string;     // 日常パート
    dungeon?: string;   // 異世界・ダンジョン
    battle?: string;    // 戦闘・アクション
    flashback?: string; // 回想
  };
  /** UI/オーバーレイ要素の禁則 (例: HUD は矩形枠のみ、SVGで後注入) */
  overlay_rules?: string[];
};

// ============================================================
// 視覚モチーフ
// ============================================================

export type BibleVisualMotif = {
  /** モチーフ名 (例: "派遣会社の蛍光灯と時計") */
  name: string;
  /** いつ・なぜ繰り返し出すか */
  meaning: string;
  /** 描画指示 (画像プロンプトに直接挿入できる短文) */
  draw_directive: string;
};

// ============================================================
// 連続性 (continuity) シード
// ============================================================

export type BibleContinuitySeed = {
  /** group_id (PagePlan IR の continuity_group_id に対応) */
  group_id: string;
  /** 何の連続性か (例: "protagonist_face", "shinjuku_station_east_exit") */
  kind: "character_face" | "character_outfit" | "location_layout" | "prop";
  /** 紐付け対象 (character_name または location_name) */
  target_name: string;
  /** 不変条件の自由記述 */
  invariant_description: string;
};

// ============================================================
// 全体スナップショット
// ============================================================

export type BibleSnapshot = {
  /** スキーマバージョン (将来の破壊的変更時に使用) */
  schema_version: 1;
  /** 生成元設計書のパス (例: "docs/strategy/work_3_modern_dungeon_design.md") */
  source_doc_path: string;
  /** 生成タイムスタンプ (ISO 8601) */
  generated_at: string;
  meta: BibleWorkMeta;
  characters: BibleCharacterEntry[];
  locations: BibleLocationEntry[];
  style_directives: BibleStyleDirectives;
  visual_motifs: BibleVisualMotif[];
  continuity_seeds: BibleContinuitySeed[];
  /** 1 巻分のあらすじ・テーマ (storyboard 生成時のグローバルコンテキスト) */
  volume_synopsis: {
    theme: string;
    /** 1 巻の総括 (200-400 字) */
    summary: string;
    /** 1 巻の引き (cliffhanger 描写) */
    cliffhanger?: string;
  };
};

// ============================================================
// 型ガード
// ============================================================

export function isBibleSnapshot(value: unknown): value is BibleSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<BibleSnapshot>;
  return (
    v.schema_version === 1 &&
    typeof v.source_doc_path === "string" &&
    typeof v.generated_at === "string" &&
    typeof v.meta === "object" &&
    Array.isArray(v.characters) &&
    Array.isArray(v.locations) &&
    typeof v.style_directives === "object" &&
    Array.isArray(v.visual_motifs) &&
    Array.isArray(v.continuity_seeds) &&
    typeof v.volume_synopsis === "object"
  );
}
