import type { ViewName } from "./lib/store";

export type MenuGroup = "judge" | "view" | "exec";

export const MENU: Array<{ view: ViewName; label: string; group: MenuGroup }> = [
  { view: "pipeline", label: "Pipeline", group: "judge" },
  { view: "name-gate", label: "ネーム gate", group: "judge" },
  { view: "revision", label: "Revision", group: "judge" },
  { view: "assets", label: "アセット", group: "view" },
  { view: "layers", label: "生成 layer", group: "exec" },
  { view: "works", label: "作品管理", group: "exec" },
];

export const GROUP_LABELS: Record<MenuGroup, string> = {
  judge: "編集判断",
  view: "閲覧",
  exec: "実行",
};

export function viewLabel(view: ViewName): string {
  if (view === "index") return "Works";
  return MENU.find((item) => item.view === view)?.label ?? view;
}
