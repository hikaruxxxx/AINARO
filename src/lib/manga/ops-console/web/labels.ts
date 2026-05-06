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
