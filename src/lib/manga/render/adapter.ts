/**
 * RenderAdapter — 画像生成モデルの抽象化
 *
 * プラン (codex-swift-kettle.md) p.49 の RenderAdapter 抽象 + p.105-133 の ModelCapabilityProfile を実装。
 *
 * 目的:
 *   1. gpt-image-2 / Flux 2 / Qwen-Image 2.0 / Niji 7 を共通インターフェースで扱う
 *   2. Week 0 の結果から得る ModelCapabilityProfile を参照し、各モデルの能力を構造化
 *   3. F-1 (panel_composite) と F-2 (page_one_shot) の両方を統一インターフェースで扱う
 *
 * Month 1 では interface のみ。実装は Month 2 で追加。
 *   - src/lib/manga/render/gpt-image-2.ts (Codex CLI 経由)
 *   - src/lib/manga/render/flux-2-pro.ts (Replicate)
 *   - src/lib/manga/render/qwen-image-2.ts (fal.ai)
 */

import { readFile } from "fs/promises";
import path from "path";

// ============================================================
// ModelCapabilityProfile (Week 0 成果物)
// ============================================================

export type ShotScale =
  | "extreme_close"
  | "close"
  | "medium_close"
  | "medium"
  | "medium_wide"
  | "wide"
  | "extreme_wide";

export type ApiStatus = "foundry_preview" | "official_api" | "via_codex" | "self_hosted";

export type PromptStyle = "instruction" | "reasoning_guided" | "both";

export type RecommendedStrategy =
  | "panel_composite" // F-1 のみ
  | "page_one_shot" // F-2 のみ
  | "hybrid"; // F-2 ラフ → F-1 本番 等

/**
 * モデル能力プロファイル (Week 0 で実測して JSON 保存)
 * data/manga/model-capability/{model}.json
 */
export type ModelCapabilityProfile = {
  /** モデル識別子 ("gpt-image-2" / "flux-2-pro" / "qwen-image-2" / "niji-7") */
  model: string;
  /** 計測日時 (ISO8601) */
  measured_at: string;
  /** 利用経路 */
  api_status: ApiStatus;
  /** サポートされる画像サイズ */
  size_options: Array<{
    width: number;
    height: number;
    /** 任意比可なら "free"、固定セットなら "fixed" */
    mode: "fixed" | "free";
  }>;
  /** 参照画像の最大枚数 */
  reference_image_max: number;
  /** 4/8/16のうち推奨参照枚数（多すぎると顔が平均化する） */
  reference_image_optimal: number;
  /** プロンプトスタイル */
  prompt_style: PromptStyle;
  /** 使えるスタイル文字列 (例: ["manga_bw_shounen", "manga_bw_seinen"]) */
  usable_styles: string[];
  /** 上手く出せるショットスケール */
  allowed_shot_scales: ShotScale[];
  /** 苦手なショットスケール */
  weak_shot_scales: ShotScale[];
  /** 1コマの最大キャラ数 */
  max_characters_per_panel: number;
  /** 安定して再現できる演出 */
  reliable_effects: string[];
  /** 後処理が必要な要素 */
  postprocess_required: string[];
  /** 描かせない方が良いタイプ */
  forbidden_panel_types: string[];
  /** ネガティブスペース指示の成功率 (0-1) */
  negative_space_success_rate: number;
  /** キャラ一貫性の成功率 (0-1) */
  character_consistency_success_rate: number;
  /** F-2 ページ一発生成の成功率 (0-1) */
  page_one_shot_success_rate: number;
  /** F-1 コマ単位+SVG合成の成功率 (0-1) */
  panel_composite_success_rate: number;
  /** 推奨戦略 */
  recommended_strategy: RecommendedStrategy;
  /** ページ制約 (RenderConstraints の派生元) */
  recommended_page_constraints: {
    avg_panels_per_page: number;
    max_dialogue_bubbles_per_panel: number;
    max_closeups_per_page: number;
    allow_action_pages: boolean;
  };
  /** 単価見積もり (US$/image) */
  cost_per_image_estimate: {
    medium: number;
    high: number;
  };
};

// ============================================================
// RenderAdapter インターフェース
// ============================================================

/** 1枚の画像生成リクエスト */
export type RenderRequest = {
  /** 英語推奨のプロンプト */
  prompt: string;
  /** 出力サイズ */
  size: { width: number; height: number };
  /** 出力ファイルの絶対パス */
  outputPath: string;
  /** 参照画像のローカルパス (アダプタ側でアップロード or 直接添付) */
  referenceImagePaths?: string[];
  /** リトライ回数 */
  maxRetries?: number;
  /** タイムアウト ms */
  timeoutMs?: number;
};

export type RenderResponse = {
  /** 出力ファイルパス */
  outputPath: string;
  /** ファイルサイズ */
  sizeBytes: number;
  /** 生成サイズ (リクエストと違う場合あり) */
  width: number;
  height: number;
  /** 試行回数 */
  attempts: number;
  /** トータル所要時間 */
  totalDurationMs: number;
  /** プロバイダ固有の生成メタ (Replicate prediction id 等) */
  providerMeta?: Record<string, unknown>;
};

/** RenderAdapter 共通インターフェース */
export interface RenderAdapter {
  /** モデル識別子 */
  readonly model: string;
  /** Profile (load 後にセット) */
  readonly profile: ModelCapabilityProfile;
  /** 1枚生成 */
  render(request: RenderRequest): Promise<RenderResponse>;
}

// ============================================================
// ModelCapabilityProfile ローダ
// ============================================================

const REPO_ROOT = process.env.AINARO_REPO_ROOT ?? process.cwd();
const PROFILE_DIR = path.join(REPO_ROOT, "data", "manga", "model-capability");

export async function loadCapabilityProfile(
  model: string
): Promise<ModelCapabilityProfile> {
  const filePath = path.join(PROFILE_DIR, `${model}.json`);
  const text = await readFile(filePath, "utf-8");
  const json = JSON.parse(text) as ModelCapabilityProfile;
  if (json.model !== model) {
    throw new Error(
      `Profile model mismatch: file=${filePath} expected=${model} actual=${json.model}`
    );
  }
  return json;
}

// ============================================================
// RenderConstraints 派生
// ============================================================

import type { RenderConstraints, PanelSizeClass } from "../page-director/types";

/**
 * Profile から RenderConstraints を派生する。
 * page-director/template-selector が参照する。
 */
export function deriveRenderConstraints(
  profile: ModelCapabilityProfile
): RenderConstraints {
  const c = profile.recommended_page_constraints;

  // size_options から allowed_size_classes を派生
  // (簡易マッピング: 縦長は portrait系, 横長は landscape系, 正方形は square)
  // 現状は全許可。実運用で Profile 取得後に絞る。
  const allowed_size_classes: PanelSizeClass[] = [
    "tiny",
    "small",
    "medium",
    "large",
    "extra_large",
    "splash",
  ];

  return {
    max_panels_per_page: Math.ceil(c.avg_panels_per_page * 1.3),
    avg_panels_per_page: c.avg_panels_per_page,
    max_dialogue_bubbles_per_panel: c.max_dialogue_bubbles_per_panel,
    max_closeups_per_page: c.max_closeups_per_page,
    allow_action_pages: c.allow_action_pages,
    forbidden_panel_types: profile.forbidden_panel_types,
    allowed_size_classes,
  };
}
