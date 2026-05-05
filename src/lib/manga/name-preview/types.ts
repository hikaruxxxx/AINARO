/**
 * L8.5 / L8.7 Name Preview & Approval スキーマ
 *
 * SSoT: ~/.claude/plans/codex-logical-waterfall.md
 *
 * v1 スコープ:
 * - L8.5 が SVG ネーム + index.html + name_manifest.json を生成
 * - L8.7 (serve-name.ts) が人間判定を name_approval.json に書き込む
 * - L9 が name_approval.json を読み、approved 以外を skip / hard fail
 */

export type NamePageStatus = "approved" | "rejected" | "pending";

/**
 * 撤回せず再実行すべき layer を示す。`null` は判定不要 (= approved 時) または未指定。
 *
 * - L3: shotlist 段階から (構成全体)
 * - L4: storyboard (panel 内容/カメラ/焦点)
 * - L5: page-director (コマ割り/レイアウトテンプレ)
 * - L6: continuity-resolve (キャラ/場所/小物 group 注入)
 * - L7: refs-resolution (refs 選定)
 */
export type NameRerunFrom = "L3" | "L4" | "L5" | "L6" | "L7" | null;

/**
 * reject 理由。固定 enum で、後段の rerun_from 推奨マッピングに使える。
 *
 * - story_problem: 展開がつまらない/感情が弱い → L3/L4
 * - panel_problem: コマ内容/カメラ/焦点 → L4
 * - layout_problem: コマ割り/重要コマサイズ → L5
 * - dialogue_problem: 台詞長/位置 → L4
 * - continuity_problem: キャラ/場所/小物の選択 → L6/L7
 * - render_risk: ネームは良いが絵で事故りそう → quick render or L9 pilot で spot check
 */
export type NameRejectReason =
  | "story_problem"
  | "panel_problem"
  | "layout_problem"
  | "dialogue_problem"
  | "continuity_problem"
  | "render_risk";

/**
 * approval_source は人間判定と migration 由来を区別する。
 * v2 retrospective report でこの区別を使う。
 */
export type NameApprovalSource = "human" | "migration";

export type NamePageDecision = {
  status: NamePageStatus;
  approval_source: NameApprovalSource;
  reasons: NameRejectReason[];
  rerun_from: NameRerunFrom;
  note: string;
  decided_at: string;
};

export type NameApproval = {
  schema_version: 1;
  episode_id: string;
  updated_at: string;
  /** key = page_no を文字列化したもの ("1", "2", ...) */
  pages: Record<string, NamePageDecision>;
};

/**
 * name_manifest.json — index.html / serve-name.ts が読む。
 * SVG ファイル名や警告サマリーを提供。
 */
export type NameWarning = {
  page_no: number;
  kind:
    | "dialogue_overflow"
    | "panel_overcrowd"
    | "shot_repetition"
    | "focus_entity_missing"
    | "ref_thumbnail_missing";
  message: string;
};

export type NameManifestPage = {
  page_no: number;
  page_role: string;
  panel_count: number;
  svg_filename: string;
  warnings: NameWarning[];
};

export type NameManifest = {
  schema_version: 1;
  slug: string;
  episode: number;
  episode_id: string;
  generated_at: string;
  pages: NameManifestPage[];
};

export const REJECT_REASON_TO_RERUN: Record<NameRejectReason, NameRerunFrom> = {
  story_problem: "L3",
  panel_problem: "L4",
  layout_problem: "L5",
  dialogue_problem: "L4",
  continuity_problem: "L6",
  render_risk: null, // ネーム自体は OK 扱い、 L9 pilot で別確認
};

/** rerun_from の優先順位 (上流ほど先頭)。複数 reason 選択時に最も上流を採用する */
export const RERUN_FROM_ORDER: ReadonlyArray<NonNullable<NameRerunFrom>> = [
  "L3",
  "L4",
  "L5",
  "L6",
  "L7",
];

/**
 * reasons から rerun_from を導出する SSoT 関数。
 * - render_risk のみ → null (ネーム自体は OK 扱い)
 * - 複数 reason → 最も上流の layer
 * 派生値なので、保存境界 (serve-name.ts の POST handler) で server がこの関数で
 * 再計算し、client から送られた rerun_from は無視するべき。
 */
export function deriveRerunFrom(reasons: NameRejectReason[]): NameRerunFrom {
  let best: NameRerunFrom = null;
  for (const r of reasons) {
    const v = REJECT_REASON_TO_RERUN[r];
    if (!v) continue;
    if (best === null || RERUN_FROM_ORDER.indexOf(v) < RERUN_FROM_ORDER.indexOf(best)) {
      best = v;
    }
  }
  return best;
}

/**
 * 全ページを pending で初期化したテンプレ。L8.5 生成時に使う。
 */
export function pendingApproval(
  episodeId: string,
  pageNos: number[]
): NameApproval {
  const pages: Record<string, NamePageDecision> = {};
  const now = new Date().toISOString();
  for (const no of pageNos) {
    pages[String(no)] = {
      status: "pending",
      approval_source: "human",
      reasons: [],
      rerun_from: null,
      note: "",
      decided_at: now,
    };
  }
  return {
    schema_version: 1,
    episode_id: episodeId,
    updated_at: now,
    pages,
  };
}
