/**
 * 修正指示 UI スキーマ (Phase A〜D 共通)
 *
 * SSoT: ~/.claude/plans/manga-pipeline-v2.md (上位戦略 docs/plans/manga/strategy.md)
 *
 * 設計原則:
 * - L12 repair に判定ロジックを組み込まない (UI 完結)
 * - render_manifest.jsonl は append-only。1 行 = 1 generation event
 * - revision_queue.jsonl は append-only。1 行 = 1 ユーザー指示
 * - adopted_versions.json は episode 単位で「どの version を採用したか」のみ保持
 * - L13 KDP は adopted_versions.json を参照して manuscript を組む
 *
 * 課金経路: Codex CLI (image_gen) のみ。Anthropic / OpenAI 直叩き禁止
 */

/**
 * codex-image.ts (L09) で 1 枚画像を生成した時に追記する manifest エントリ。
 * append-only な JSONL で、Phase D の比較 UI が読み取る。
 */
export type RenderManifestEntry = {
  schema_version: 1;
  /** ISO 8601 */
  ts: string;
  slug: string;
  episode: number;
  page_no: number;
  /** panel_id (storyboard.panel_id)。page_one_shot の場合は `page_${page_no}` を入れる */
  panel_id: string;
  /** "v1" | "v2" | ... バージョン文字列。同一 panel_id で 2回目以降は v2, v3, ... */
  version: string;
  /** "render" — 出力種別 */
  layer: "render";
  /** workdir 起点の相対パス (例: "episodes/ep01/renders/p01.png") */
  image_path: string;
  /** L09 の generation 戦略 */
  render_strategy?: "page_one_shot" | "panel_composite" | "hybrid";
  /** repair / revision 起源か (空なら通常生成) */
  origin?: "initial" | "audit_repair" | "revision_queue";
  /** revision_queue 由来時に紐づける revision_entry.id (UUID) */
  triggered_by_revision_id?: string;
};

/**
 * Phase B: ユーザー修正指示の append-only キュー
 */
export type RevisionTag =
  | "face"        // 顔の崩れ
  | "composition" // 構図/カメラ
  | "tone"        // トーン/濃淡
  | "ref"         // ref 一致しない
  | "anatomy"     // 体格/手足
  | "background" // 背景
  | "other";

export type RevisionEntry = {
  schema_version: 1;
  /** queue 内ユニーク (UUID v4 推奨)。append のみ、変更不可 */
  id: string;
  /** ISO 8601 */
  ts: string;
  slug: string;
  episode: number;
  page_no: number;
  /** 対象 panel_id (page_one_shot で page 全体指示なら `page_${page_no}`) */
  panel_id: string;
  panel_no?: number;
  /** ユーザー自由記述 (≤ 1000 字) */
  instruction: string;
  /** チェックボックスタグ */
  checked_tags: RevisionTag[];
  /** UI で見ていた image (render_manifest.image_path 同形式) */
  image_path: string;
  /** UI 表示時点での version (この version への不満を表す) */
  for_version: string;
  /** Phase C 消化時に書き込まれる: 生成された次 version */
  resolved_version?: string;
  /** Phase C 消化時刻 */
  resolved_at?: string;
};

/**
 * Phase D: episode 単位「どの version を採用したか」
 *
 * scope=episode で記録する (確定済み)。`adopted_versions.json` (1 ファイル/episode)。
 * L13 KDP がここを参照して manuscript を組む。
 */
export type AdoptedPanelChoice = {
  /** chosen version 文字列 ("v1" / "v2" / ...) */
  chosen: string;
  /** 採用画像の workdir 相対パス */
  image_path: string;
  /** ISO 8601 */
  chosen_at: string;
  /** 任意の人間メモ */
  note?: string;
};

export type AdoptedVersions = {
  schema_version: 1;
  slug: string;
  episode: number;
  episode_id: string;
  updated_at: string;
  /** key = panel_id (page_one_shot は `page_${page_no}`)。未採用は keys から除外 */
  panels: Record<string, AdoptedPanelChoice>;
};

export function emptyAdoptedVersions(slug: string, episode: number, episodeId: string): AdoptedVersions {
  return {
    schema_version: 1,
    slug,
    episode,
    episode_id: episodeId,
    updated_at: new Date().toISOString(),
    panels: {},
  };
}

export const REVISION_TAGS: ReadonlyArray<RevisionTag> = [
  "face",
  "composition",
  "tone",
  "ref",
  "anatomy",
  "background",
  "other",
];

export function isRevisionTag(s: unknown): s is RevisionTag {
  return typeof s === "string" && (REVISION_TAGS as readonly string[]).includes(s);
}
