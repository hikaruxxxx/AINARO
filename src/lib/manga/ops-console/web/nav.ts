import type { ViewName } from "./lib/store";

export type MenuGroup = "global" | "work" | "episode" | "utility";

export const MENU: Array<{ view: ViewName; label: string; group: MenuGroup }> = [
  { view: "index", label: "ホーム", group: "global" },
  { view: "jobs-hub", label: "全作品ジョブ", group: "global" },
  { view: "quality-hub", label: "全作品品質", group: "global" },
  { view: "work-overview", label: "作品概要", group: "work" },
  { view: "bible", label: "Bible / 参照素材", group: "work" },
  { view: "volume-plot", label: "巻プロット", group: "work" },
  { view: "volumes", label: "巻管理", group: "work" },
  { view: "kdp-metadata", label: "KDP メタ情報", group: "work" },
  { view: "trademark-gate", label: "商標 / IP チェック", group: "work" },
  { view: "pipeline", label: "パイプライン進捗", group: "episode" },
  { view: "storyboard", label: "ネーム原案", group: "episode" },
  { view: "name-gate", label: "ネーム判定", group: "episode" },
  { view: "revision", label: "ページ承認", group: "episode" },
  { view: "revision-effects", label: "修正効果分析", group: "episode" },
  { view: "quality", label: "品質監査", group: "episode" },
  { view: "improvements", label: "読者維持改善", group: "episode" },
  { view: "layers", label: "個別 layer 起動", group: "utility" },
  { view: "ai-edit", label: "AI 編集", group: "utility" },
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
  "ai-edit",
]);

/** episode-scope の view か (それ以外は work-scope または scope なし)。 */
export function requiresEpisode(view: ViewName): boolean {
  return !WORK_SCOPE_VIEWS.has(view) && !NO_SCOPE_VIEWS.has(view);
}

export function viewLabel(view: ViewName): string {
  if (view === "index") return "Works";
  return MENU.find((item) => item.view === view)?.label ?? view;
}
