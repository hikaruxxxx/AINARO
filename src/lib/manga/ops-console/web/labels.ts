/**
 * パイプライン layer の表示用ラベル辞書。
 * 日本語ベース、技術 ID は補助表示で残す。
 */
export type LayerKey =
  | "L01"
  | "L02"
  | "L02b"
  | "L03"
  | "L04"
  | "L05"
  | "L06"
  | "L07"
  | "L08"
  | "L08.5"
  | "L08.6"
  | "L08.7"
  | "L09"
  | "L10"
  | "L11"
  | "L12"
  | "L13";

export const LAYER_LABELS: Record<LayerKey, { title: string; subtitle: string }> = {
  L01: { title: "世界観・キャラ設定 (Bible)", subtitle: "L01" },
  L02: { title: "キャラ・背景の参考画像", subtitle: "L02 Bible Images" },
  L02b: { title: "巻あらすじ・章構成 (Volume Plot)", subtitle: "L02b" },
  L03: { title: "シーン分割 (Shotlist)", subtitle: "L03" },
  L04: { title: "コンテ (Storyboard)", subtitle: "L04" },
  L05: { title: "ページ配置 (Page Plan)", subtitle: "L05" },
  L06: { title: "整合性チェック (Continuity)", subtitle: "L06" },
  L07: { title: "参照画像の自動選択 (Refs)", subtitle: "L07" },
  L08: { title: "不足参照画像の追加生成", subtitle: "L08" },
  "L08.5": { title: "ネーム (SVG プレビュー)", subtitle: "L08.5 Name Preview" },
  "L08.6": { title: "ネーム監査 (ルール)", subtitle: "L08.6 Name Audit" },
  "L08.7": { title: "ネーム判定 (人間 a/r)", subtitle: "L08.7 Name Approval" },
  L09: { title: "本番画像生成 (Render)", subtitle: "L09" },
  L10: { title: "吹き出し合成 (Bubble)", subtitle: "L10" },
  L11: { title: "品質監査 (Audit)", subtitle: "L11" },
  L12: { title: "修正再生成 (Repair)", subtitle: "L12" },
  L13: { title: "KDP 入稿パッケージ", subtitle: "L13 KDP" },
};

export function layerLabel(id: string): { title: string; subtitle: string } {
  return LAYER_LABELS[id as LayerKey] ?? { title: id, subtitle: "" };
}

/**
 * 「AI で修正」ボタン押下時に ai-edit view へ渡す per-layer 既定値。
 * target は repo root からの相対 path、`{slug}` `{ep}` `{vol}` を resolveAiEditHint で展開する。
 */
export type LayerAiEditHint = {
  target?: string;
  promptTemplate: string;
};

export const LAYER_AI_EDIT_HINTS: Partial<Record<LayerKey, LayerAiEditHint>> = {
  L01: {
    target: "data/manga/works/{slug}/bible/",
    promptTemplate:
      "L01 Bible (世界観・キャラ設定) の {character|world|location|prop|style} を {変更内容} に修正してください。snapshot.json と該当 yaml を整合させてください。",
  },
  L02: {
    target: "data/manga/works/{slug}/bible/refs/",
    promptTemplate:
      "L02 Bible Images の {キャラ名|背景名} の参照画像 (refs 配下) を {変更内容} に置き換えてください。",
  },
  L02b: {
    target: "data/manga/works/{slug}/volumes/v01/plot.json",
    promptTemplate:
      "L02b Volume Plot の episode {ep} の beats / emotional_intensity / protagonist_arc を {変更内容} に調整してください。",
  },
  L03: {
    target: "data/manga/works/{slug}/episodes/ep{ep}/shotlist.json",
    promptTemplate:
      "L03 Shotlist の panel #{N} の {dialogue|shot_type|importance} を {変更内容} に変更してください。",
  },
  L04: {
    target: "data/manga/works/{slug}/episodes/ep{ep}/storyboard.json",
    promptTemplate:
      "L04 Storyboard の panel #{N} の構図・動きを {変更内容} に変更してください。",
  },
  L05: {
    target: "data/manga/works/{slug}/episodes/ep{ep}/page_plan.json",
    promptTemplate:
      "L05 Page Plan の page {N} の panel 配置 / 大小バランスを {変更内容} に調整してください。",
  },
  L06: {
    target: "data/manga/works/{slug}/episodes/ep{ep}/page_plan.json",
    promptTemplate:
      "L06 Continuity check で検出した整合性違反 ({詳細}) を {変更内容} で解消してください。",
  },
  L07: {
    target: "data/manga/works/{slug}/episodes/ep{ep}/resolved_refs.json",
    promptTemplate:
      "L07 で解決された参照画像のうち、panel #{N} の {キャラ|背景} を {変更内容} に差し替えてください。",
  },
  L08: {
    target: "data/manga/works/{slug}/episodes/ep{ep}/incremental_refs/",
    promptTemplate:
      "L08 で追加生成された参照画像 (panel #{N}) を {変更内容} で再生成してください。",
  },
  "L08.5": {
    target: "data/manga/works/{slug}/episodes/ep{ep}/name/",
    promptTemplate:
      "L08.5 Name Preview (SVG ネーム) の page {N} の {コマ割り|台詞|構図} を {変更内容} に修正してください。",
  },
  "L08.6": {
    target: "data/manga/works/{slug}/episodes/ep{ep}/name_audit.json",
    promptTemplate:
      "L08.6 Name Audit で検出された違反 ({詳細}) を {変更内容} で解消してください。",
  },
  L09: {
    target: "data/manga/works/{slug}/episodes/ep{ep}/renders/",
    promptTemplate:
      "L09 Render の panel #{N} を {変更内容} で再生成する指示を revision_queue.jsonl に追加してください。",
  },
  L10: {
    target: "data/manga/works/{slug}/episodes/ep{ep}/bubbles/",
    promptTemplate:
      "L10 Bubble Overlay の panel #{N} の吹き出し位置 / サイズ / 形状を {変更内容} に調整してください。",
  },
  L11: {
    target: "data/manga/works/{slug}/episodes/ep{ep}/audit.json",
    promptTemplate:
      "L11 Audit の panel #{N} の {check_kind} finding を override (false positive 扱い) してください。理由: {変更内容}",
  },
  L12: {
    target: "data/manga/works/{slug}/episodes/ep{ep}/_revision_resolved.jsonl",
    promptTemplate:
      "L12 Repair の適用結果 (revision id #{N}) を {変更内容} で再適用してください。",
  },
  L13: {
    target: "data/manga/works/{slug}/volumes/v01/kdp/",
    promptTemplate:
      "L13 KDP の {タイトル|description|キーワード|cover|manuscript} を {変更内容} に修正してください。",
  },
};

/**
 * `{slug}` `{ep}` `{vol}` を実値に展開する。`vol` は episode → 巻 mapping が
 * 厳密にできないので暫定で v01 固定 (将来 work meta から導出予定)。
 */
export function resolveAiEditHint(
  layerId: string,
  ctx: { slug: string; episode: number; volume?: number }
): LayerAiEditHint | null {
  const hint = LAYER_AI_EDIT_HINTS[layerId as LayerKey];
  if (!hint) return null;
  const epPad = String(ctx.episode).padStart(2, "0");
  const volPad = String(ctx.volume ?? 1).padStart(2, "0");
  const expand = (template: string): string =>
    template
      .replaceAll("{slug}", ctx.slug)
      .replaceAll("{ep}", epPad)
      .replaceAll("{vol}", volPad);
  return {
    target: hint.target ? expand(hint.target) : undefined,
    promptTemplate: expand(hint.promptTemplate),
  };
}
