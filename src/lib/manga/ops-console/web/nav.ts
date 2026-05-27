import type { ViewName } from "./lib/store";

export type MenuGroup = "global" | "work" | "episode" | "utility";

export const MENU: Array<{ view: ViewName; label: string; group: MenuGroup }> = [
  { view: "index", label: "ホーム", group: "global" },
  { view: "jobs-hub", label: "全作品ジョブ", group: "global" },
  { view: "quality-hub", label: "全作品品質", group: "global" },
  { view: "work-overview", label: "作品概要", group: "work" },
  { view: "bible", label: "設定資料 (Bible)", group: "work" },
  { view: "series-plan", label: "本作プロット (Series)", group: "work" },
  { view: "volume-plot", label: "巻プロット", group: "work" },
  { view: "volumes", label: "巻管理", group: "work" },
  { view: "kdp-metadata", label: "KDP 入稿メタ", group: "work" },
  { view: "trademark-gate", label: "商標 / IP チェック", group: "work" },
  { view: "pipeline", label: "パイプライン進捗", group: "episode" },
  { view: "name-gate", label: "ネーム", group: "episode" },
  { view: "revision", label: "ページ修正", group: "episode" },
  { view: "quality", label: "品質監査", group: "episode" },
  { view: "improvements", label: "読者維持改善", group: "episode" },
  { view: "reader-journey", label: "読者ジャーニー", group: "episode" },
  { view: "layers", label: "個別の工程を起動", group: "utility" },
];

export const GROUP_LABELS: Record<MenuGroup, string> = {
  global: "GLOBAL",
  work: "WORK",
  episode: "EPISODE",
  utility: "Utility",
};

// work scope のみで動作する view (episode 不要)。`/works/<slug>/` の URL に対応。
export const WORK_SCOPE_VIEWS = new Set<ViewName>([
  "bible",
  "series-plan",
  "volume-plot",
  "kdp-metadata",
  "trademark-gate",
  "volumes",
  "work-overview",
]);

// scope を持たない view (slug/episode 不要)。
export const NO_SCOPE_VIEWS = new Set<ViewName>([
  "index",
  "jobs-hub",
  "quality-hub",
]);

/** episode-scope の view か (それ以外は work-scope または scope なし)。 */
export function requiresEpisode(view: ViewName): boolean {
  return !WORK_SCOPE_VIEWS.has(view) && !NO_SCOPE_VIEWS.has(view);
}

export function viewLabel(view: ViewName): string {
  if (view === "index") return "Works";
  return MENU.find((item) => item.view === view)?.label ?? view;
}
