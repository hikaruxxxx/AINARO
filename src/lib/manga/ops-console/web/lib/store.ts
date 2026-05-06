export type ViewName =
  | "index"
  | "ai-edit"
  | "jobs-hub"
  | "quality-hub"
  | "pipeline"
  | "name-gate"
  | "revision"
  | "quality"
  | "storyboard"
  | "bible"
  | "volume-plot"
  | "kdp-metadata"
  | "trademark-gate"
  | "work-overview"
  | "volumes"
  | "layers";

export type WorkInfo = {
  slug: string;
  title?: string | null;
  episodes: number[];
};

export type RecentEntry = {
  slug: string;
  episode: number;
  ts: string;
};

export type FavoriteEntry = {
  slug: string;
  episode: number;
  label?: string;
};

/**
 * AI 編集 view へ pipeline / 各 view から context を渡すための一時 preset。
 * ai-edit view が mount 時に読み取って form を prefill し、その場で undefined に戻す。
 *
 * originLayer + originView は「どこから AI 編集を開いたか」を記憶し、編集完了後に
 * 「元の view に戻る」ナビゲーションを提供するためのもの。
 */
export type AiEditPreset = {
  scope?: string;
  target?: string;
  prompt?: string;
  originLayer?: string;
  originView?: ViewName;
};

export type AppState = {
  currentView: ViewName;
  currentSlug: string;
  currentEpisode: number;
  defaultSlug: string;
  defaultEpisode: number;
  works: WorkInfo[];
  recent: RecentEntry[];
  favorites: FavoriteEntry[];
  aiEditPreset?: AiEditPreset;
};

type Subscriber = (state: AppState) => void;

const initialState: AppState = {
  currentView: "name-gate",
  currentSlug: "",
  currentEpisode: 1,
  defaultSlug: "",
  defaultEpisode: 1,
  works: [],
  recent: [],
  favorites: [],
};

const subscribers = new Set<Subscriber>();

export const store = {
  state: initialState,
  subscribe(fn: Subscriber): () => void {
    subscribers.add(fn);
    fn(this.state);
    return () => subscribers.delete(fn);
  },
  update(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of subscribers) fn(this.state);
  },
};

export function isViewName(value: string | null | undefined): value is ViewName {
  return (
    value === "index" ||
    value === "ai-edit" ||
    value === "jobs-hub" ||
    value === "quality-hub" ||
    value === "pipeline" ||
    value === "name-gate" ||
    value === "revision" ||
    value === "quality" ||
    value === "storyboard" ||
    value === "bible" ||
    value === "volume-plot" ||
    value === "kdp-metadata" ||
    value === "trademark-gate" ||
    value === "work-overview" ||
    value === "volumes" ||
    value === "layers"
  );
}
