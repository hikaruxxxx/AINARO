import type { ViewName } from "./lib/store";

export type MenuGroup = "home" | "inventory" | "judge" | "browse" | "publish";

export const MENU: Array<{ view: ViewName; label: string; group: MenuGroup }> = [
  { view: "jobs-hub", label: "全作品ジョブ", group: "inventory" },
  { view: "quality-hub", label: "全作品品質", group: "inventory" },
  { view: "pipeline", label: "パイプライン進捗", group: "judge" },
  { view: "name-gate", label: "ネーム判定", group: "judge" },
  { view: "revision", label: "修正・採用", group: "judge" },
  { view: "quality", label: "品質監査", group: "judge" },
  { view: "improvements", label: "品質改善 (Hook / Cliff)", group: "judge" },
  { view: "storyboard", label: "ネーム原案", group: "browse" },
  { view: "bible", label: "世界観・設定", group: "browse" },
  { view: "volume-plot", label: "巻プロット", group: "browse" },
  { view: "work-overview", label: "作品概要", group: "browse" },
  { view: "layers", label: "個別 layer 起動", group: "browse" },
  { view: "volumes", label: "巻管理", group: "publish" },
  { view: "kdp-metadata", label: "KDP メタ情報", group: "publish" },
  { view: "trademark-gate", label: "商標 / IP チェック", group: "publish" },
  { view: "ai-edit", label: "AI 編集", group: "publish" },
];

export const GROUP_LABELS: Record<MenuGroup, string> = {
  home: "ホーム",
  inventory: "棚卸し",
  judge: "判定する",
  browse: "中身を見る",
  publish: "公開する",
};

export function viewLabel(view: ViewName): string {
  if (view === "index") return "Works";
  return MENU.find((item) => item.view === view)?.label ?? view;
}
