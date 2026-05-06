import type { ViewName } from "./lib/store";

export type MenuGroup = "judge" | "view" | "work" | "exec";

export const MENU: Array<{ view: ViewName; label: string; group: MenuGroup }> = [
  { view: "pipeline", label: "Pipeline", group: "judge" },
  { view: "name-gate", label: "ネーム gate", group: "judge" },
  { view: "revision", label: "Revision", group: "judge" },
  { view: "assets", label: "アセット", group: "view" },
  { view: "bible", label: "Bible", group: "work" },
  { view: "volume-plot", label: "Volume Plot", group: "work" },
  { view: "layers", label: "生成 layer", group: "exec" },
  { view: "works", label: "作品管理", group: "exec" },
];

export const GROUP_LABELS: Record<MenuGroup, string> = {
  judge: "編集判断",
  view: "閲覧",
  work: "この work",
  exec: "実行",
};

export function viewLabel(view: ViewName): string {
  if (view === "index") return "Works";
  return MENU.find((item) => item.view === view)?.label ?? view;
}
