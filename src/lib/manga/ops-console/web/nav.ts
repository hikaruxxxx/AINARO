import type { ViewName } from "./lib/store";

export type MenuGroup = "global" | "judge" | "view" | "work" | "exec";

export const MENU: Array<{ view: ViewName; label: string; group: MenuGroup }> = [
  { view: "jobs-hub", label: "全作品ジョブ", group: "global" },
  { view: "quality-hub", label: "全作品品質", group: "global" },
  { view: "ai-edit", label: "AI 編集", group: "global" },
  { view: "pipeline", label: "パイプライン進捗", group: "judge" },
  { view: "name-gate", label: "ネーム判定", group: "judge" },
  { view: "revision", label: "修正・採用", group: "judge" },
  { view: "quality", label: "品質監査", group: "judge" },
  { view: "storyboard", label: "コンテ", group: "view" },
  { view: "bible", label: "世界観・設定", group: "work" },
  { view: "volume-plot", label: "巻プロット", group: "work" },
  { view: "kdp-metadata", label: "KDP メタ情報", group: "work" },
  { view: "work-overview", label: "作品概要", group: "work" },
  { view: "layers", label: "個別 layer 起動", group: "exec" },
  { view: "volumes", label: "巻管理", group: "exec" },
];

export const GROUP_LABELS: Record<MenuGroup, string> = {
  global: "全体",
  judge: "編集・判断",
  view: "閲覧",
  work: "作品設定",
  exec: "ジョブ実行",
};

export function viewLabel(view: ViewName): string {
  if (view === "index") return "Works";
  return MENU.find((item) => item.view === view)?.label ?? view;
}
