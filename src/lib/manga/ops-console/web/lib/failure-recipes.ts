import type { ViewName } from "./store";

export type FailureReason =
  | "unresolved_entity"
  | "bible_ref_missing"
  | "name_gate_pending"
  | "panel_render_timeout"
  | "page_render_timeout"
  | "audit_failed"
  | "kdp_pdf_validation"
  | "kdp_keyword_invalid"
  | "spawn_failed"
  | "timeout"
  | "aborted"
  | "unknown";

export type FailureCta =
  | { kind: "rerun"; label: string }
  | { kind: "open-view"; label: string; view: ViewName }
  | { kind: "ai-edit"; label: string; prompt: string; target?: string }
  | { kind: "open-log"; label: string };

export type FailureRecipe = {
  summary: string;
  ctas: FailureCta[];
};

export const FAILURE_RECIPES: Record<FailureReason, FailureRecipe> = {
  unresolved_entity: {
    summary: "参照しているキャラクターや素材 ID が設定に存在しないため停止しています。",
    ctas: [
      { kind: "open-view", label: "Bible を開く", view: "bible" },
      { kind: "ai-edit", label: "AI で修正", prompt: "失敗ログの unresolved entity を特定し、参照元か Bible 側の ID を整合させてください。" },
      { kind: "rerun", label: "再実行" },
      { kind: "open-log", label: "ログ" },
    ],
  },
  bible_ref_missing: {
    summary: "Bible 参照ファイルが見つからず、生成に必要な設定を読めていません。",
    ctas: [
      { kind: "open-view", label: "Bible を開く", view: "bible" },
      { kind: "ai-edit", label: "AI で修正", prompt: "失敗ログの missing bible ref を確認し、必要な refs ファイルまたは参照パスを修正してください。" },
      { kind: "rerun", label: "再実行" },
      { kind: "open-log", label: "ログ" },
    ],
  },
  name_gate_pending: {
    summary: "ネーム承認が未完了のため、後続レイヤーへ進めません。",
    ctas: [
      { kind: "open-view", label: "ネーム判定", view: "name-gate" },
      { kind: "rerun", label: "再実行" },
      { kind: "open-log", label: "ログ" },
    ],
  },
  panel_render_timeout: {
    summary: "パネル描画が時間内に終わらず、レンダー工程が停止しました。",
    ctas: [
      { kind: "open-view", label: "ページ承認", view: "revision" },
      { kind: "ai-edit", label: "AI で修正", prompt: "タイムアウトした panel/page をログから特定し、プロンプトや再実行範囲を軽くしてください。" },
      { kind: "rerun", label: "再実行" },
      { kind: "open-log", label: "ログ" },
    ],
  },
  page_render_timeout: {
    summary: "ページ単位の one-shot 描画が時間切れで停止しています。",
    ctas: [
      { kind: "open-view", label: "ページ承認", view: "revision" },
      { kind: "ai-edit", label: "AI で修正", prompt: "page_one_shot timeout のページを確認し、ページ構成またはレンダー指示を分割してください。" },
      { kind: "rerun", label: "再実行" },
      { kind: "open-log", label: "ログ" },
    ],
  },
  audit_failed: {
    summary: "品質監査で失敗項目が残っており、修正または採用判断が必要です。",
    ctas: [
      { kind: "open-view", label: "品質監査", view: "quality" },
      { kind: "open-view", label: "品質改善", view: "improvements" },
      { kind: "rerun", label: "再実行" },
      { kind: "open-log", label: "ログ" },
    ],
  },
  kdp_pdf_validation: {
    summary: "KDP 用 PDF のページ数、判型、PDF/X 条件の検証で止まっています。",
    ctas: [
      { kind: "open-view", label: "巻管理", view: "volumes" },
      { kind: "open-view", label: "KDP メタ", view: "kdp-metadata" },
      { kind: "rerun", label: "再実行" },
      { kind: "open-log", label: "ログ" },
    ],
  },
  kdp_keyword_invalid: {
    summary: "KDP キーワードに禁止語、NG 表現、形式不正の可能性があります。",
    ctas: [
      { kind: "open-view", label: "KDP メタ", view: "kdp-metadata" },
      { kind: "ai-edit", label: "AI で修正", prompt: "KDP keyword invalid のログを確認し、禁止語や重複を避けたキーワード案へ修正してください。" },
      { kind: "rerun", label: "再実行" },
      { kind: "open-log", label: "ログ" },
    ],
  },
  spawn_failed: {
    summary: "ジョブプロセスの起動に失敗しており、環境かコマンド設定の確認が必要です。",
    ctas: [
      { kind: "rerun", label: "再実行" },
      { kind: "ai-edit", label: "AI で確認", prompt: "ops-console の spawn failed ログを読み、tsx path、環境変数、layer registry の不整合を調査してください。", target: "src/lib/manga/ops-console/server/jobs" },
      { kind: "open-log", label: "ログ" },
    ],
  },
  timeout: {
    summary: "ジョブ全体の制限時間を超えたため停止しています。",
    ctas: [
      { kind: "rerun", label: "再実行" },
      { kind: "ai-edit", label: "AI で分割案", prompt: "タイムアウトしたジョブをログから分析し、再実行範囲の分割または入力削減案を出してください。" },
      { kind: "open-log", label: "ログ" },
    ],
  },
  aborted: {
    summary: "ユーザー操作または監視処理によりジョブが中断されました。",
    ctas: [
      { kind: "rerun", label: "再実行" },
      { kind: "open-log", label: "ログ" },
    ],
  },
  unknown: {
    summary: "既知パターンに分類できない停止です。ログ確認から始めてください。",
    ctas: [
      { kind: "open-log", label: "ログ" },
      { kind: "rerun", label: "再実行" },
      { kind: "ai-edit", label: "AI で調査", prompt: "失敗ジョブのログを読み、原因と修正候補を短く整理してください。" },
    ],
  },
};

export function isFailureReason(value: string | undefined): value is FailureReason {
  return value !== undefined && value in FAILURE_RECIPES;
}
