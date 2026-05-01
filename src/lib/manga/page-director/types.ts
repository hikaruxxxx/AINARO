/**
 * L1.4 Page Direction 層の型定義
 *
 * プラン (codex-swift-kettle.md) p.190-222 の MangaPagePlan スキーマを実装。
 * ネーム (L1.2 storyboard) → ページレイアウト IR → 画像生成 (L2) の中間。
 *
 * F-1 (panel_composite): コマ単位生成 + SVG 合成
 * F-2 (page_one_shot): gpt-image-2 等でページ一発生成
 * hybrid: F-2 でラフ → F-1 で本番、または重要ページのみ F-2
 *
 * このファイルは型定義のみ。layout-templates.ts / template-selector.ts /
 * page-mapper.ts / validator.ts と組み合わせる。
 */

// ============================================================
// ページレベル
// ============================================================

/** 1ページの物語的役割。テンプレ選択の主要因 */
export type PageRole =
  | "setup" // 状況確立、低テンション
  | "dialogue" // 会話中心、コマ多め
  | "action" // 動感ピーク、大ゴマ含む
  | "reveal" // 隠されていたものの露出、転換点
  | "aftermath" // ピーク後の余韻、感情処理
  | "cliffhanger"; // 末尾の引き、次ページへの期待

/** どの戦略で画像生成するか。ModelCapabilityProfile で決定 */
export type RenderStrategy =
  | "panel_composite" // F-1: コマ単位生成 + SVG合成
  | "page_one_shot" // F-2: ページ一発生成
  | "hybrid"; // F-2 ラフ → F-1 本番 等

/** 視覚密度の高低。ページ内のコマ密度・情報量 */
export type VisualDensity = "light" | "normal" | "heavy";

/** セリフ密度の高低。吹き出し配置量に直結 */
export type DialogueDensity = "low" | "normal" | "high";

/** ページのターン強度。0=タメ、5=最高潮 */
export type TurnStrength = 0 | 1 | 2 | 3 | 4 | 5;

/** 見開き内の左右どちら側のページか */
export type PageSide = "right" | "left";

/** 読み方向。日本漫画は rtl、海外版で ltr へ mirror 変換する場合あり */
export type ReadingDirection = "rtl" | "ltr";

// ============================================================
// パネル (コマ) レベル
// ============================================================

/** コマの矩形（ページ座標、normalized 0-1 または絶対 px。本実装は絶対 px 推奨） */
export type PanelRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

/** コマの相対サイズ分類（テンプレ slot に紐づく） */
export type PanelSizeClass =
  | "tiny"
  | "small"
  | "medium"
  | "large"
  | "extra_large"
  | "splash";

/** 重要度。1-5 の段階。テンプレ選択 + 失敗時 repair 優先度に使う */
export type PanelImportance = 1 | 2 | 3 | 4 | 5;

/** 視覚的フォーカル領域。読者の目が最初に落ちる位置 */
export type FocalRegion =
  | "top_right"
  | "top_left"
  | "center"
  | "bottom_right"
  | "bottom_left";

/** ページ内の panels[] 配列の各要素 */
export type PagePanel = {
  /** ページ内 0-indexed */
  panel_idx: number;
  /** テンプレの slot ID（layout-templates.ts 参照） */
  slot_id: string;
  /** ページ座標での矩形 */
  rect: PanelRect;
  /** 画像生成用のサイズ分類（ModelCapabilityProfile.size_options との照合に使う） */
  render_size_class: PanelSizeClass;
  /** 読み順（rtl の場合: 右上→左→次の段→…） */
  reading_order: number;
  /** 重要度 1-5 */
  importance: PanelImportance;
  /** 吹き出し配置候補ゾーン (slot 内の region 文字列。例: "upper_right" "lower_center") */
  balloon_zones: string[];
  /** 視覚的フォーカル領域 */
  focal_region?: FocalRegion;
};

// ============================================================
// F-2 (page_one_shot) 用追加情報
// ============================================================

/** ページ一発生成のためのページプロンプト構築用ヒント */
export type PagePromptBlueprint = {
  /** このページの総コマ数 */
  panel_count: number;
  /** コマの読み順 (panel_idx の順序配列) */
  panel_order: number[];
  /** 各 panel_idx に対応する役割文字列 (例: "establishing", "close_up_emotion") */
  panel_roles: string[];
  /** ページ内で支配的なコマの位置 (例: "top_full_width", "bottom_right") */
  dominant_panel_position: string;
  /** 吹き出しを後から重ねる予約領域 (slot 内の region 文字列の配列) */
  reserved_bubble_regions: string[];
  /** 画像内に文字を絶対描かせない (true 必須) */
  must_not_draw_text: boolean;
};

// ============================================================
// ページプラン本体
// ============================================================

export type MangaPagePlan = {
  /** エピソード内の 0-indexed ページ番号 */
  page_idx: number;
  /** 見開き番号（2ページで1 spread）。spread_idx = floor(page_idx/2) */
  spread_idx?: number;
  /** 見開き内の左右 */
  page_side?: PageSide;
  /** 読み方向 */
  reading_direction: ReadingDirection;
  /** 採用したテンプレID (layout-templates.ts の TEMPLATES[*].id) */
  layout_template_id: string;
  /** ページ全体の役割 */
  page_role: PageRole;
  /** 実際のコマ数（テンプレ最大コマ数以下） */
  actual_panel_count: number;
  /** 視覚密度 */
  visual_density: VisualDensity;
  /** セリフ密度 */
  dialogue_density: DialogueDensity;
  /** ターン強度 0-5 */
  turn_strength: TurnStrength;
  /** F-1 / F-2 / hybrid */
  render_strategy: RenderStrategy;
  /** ページ内のコマ配列 */
  panels: PagePanel[];
  /** F-2 ページ一発生成用 (render_strategy が "page_one_shot" or "hybrid" のとき必須) */
  page_prompt_blueprint?: PagePromptBlueprint;
};

// ============================================================
// テンプレート定義
// ============================================================

/**
 * ページ寸法。B6判 (128×182mm) 350dpi 相当を採用。
 *  - 1748×2480 px = B6トリムサイズ (本文ページの最終出力解像度)
 *  - KDP 漫画入稿想定 (Phase A: KDP+KU 1巻160-200ページ MVP)
 *  - 塗り足し3mm 込みなら 1843×2587 px だが、layout-templates の slot 計算は
 *    トリムサイズを基準とする (塗り足しは出力時に外側へ拡張)
 */
export const PAGE_DIMENSIONS = {
  width: 1748,
  height: 2480,
} as const;

/** テンプレの slot 定義 */
export type TemplateSlot = {
  /** スロット ID（テンプレ内ユニーク） */
  id: string;
  /** ページ座標での矩形 */
  rect: PanelRect;
  /** 想定サイズ分類 */
  size_class: PanelSizeClass;
  /** デフォルト読み順（テンプレで rtl 想定） */
  default_reading_order: number;
  /** 吹き出し配置候補ゾーン */
  balloon_zones: string[];
  /** 役割ヒント（テンプレ作成者の意図） */
  role_hint?: string;
};

/** テンプレ定義 */
export type LayoutTemplate = {
  /** テンプレID（globally unique） */
  id: string;
  /** テンプレ名 (人間可読) */
  name: string;
  /** 想定コマ数 */
  panel_count: number;
  /** 主用途のページ役割 */
  fits_page_roles: PageRole[];
  /** 推奨 visual_density */
  fits_visual_density: VisualDensity[];
  /** 推奨 dialogue_density */
  fits_dialogue_density: DialogueDensity[];
  /** slot 配列（panel_count と同じ長さ） */
  slots: TemplateSlot[];
  /** 任意のメモ */
  notes?: string;
};

// ============================================================
// 検証結果
// ============================================================

export type ValidationError = {
  rule: string;
  message: string;
  panel_idx?: number;
  slot_id?: string;
};

export type ValidationResult = {
  ok: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
};

// ============================================================
// レンダー制約 (ModelCapabilityProfile から派生)
// ============================================================

/**
 * Profile → 制約変換の出力。template-selector / page-mapper が参照する。
 * 詳細は render-constraints.ts で実装（ModelCapabilityProfile 確定後）。
 */
export type RenderConstraints = {
  /** 1ページの最大コマ数 (Profile.recommended_page_constraints.avg_panels_per_page から) */
  max_panels_per_page: number;
  /** 推奨平均コマ数 */
  avg_panels_per_page: number;
  /** 1コマの最大吹き出し数 */
  max_dialogue_bubbles_per_panel: number;
  /** 1ページの最大クローズアップコマ数 */
  max_closeups_per_page: number;
  /** action ページを許すか */
  allow_action_pages: boolean;
  /** 使えない panel role / shot scale */
  forbidden_panel_types: string[];
  /** 使える size class */
  allowed_size_classes: PanelSizeClass[];
};
