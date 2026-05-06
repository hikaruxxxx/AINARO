export type ViewName =
  | "index"
  | "pipeline"
  | "name-gate"
  | "revision"
  | "assets"
  | "bible"
  | "volume-plot"
  | "layers"
  | "works";

export type WorkInfo = {
  slug: string;
  title?: string | null;
  episodes: number[];
};

export type AppState = {
  currentView: ViewName;
  currentSlug: string;
  currentEpisode: number;
  defaultSlug: string;
  defaultEpisode: number;
  works: WorkInfo[];
};

type Subscriber = (state: AppState) => void;

const initialState: AppState = {
  currentView: "name-gate",
  currentSlug: "",
  currentEpisode: 1,
  defaultSlug: "",
  defaultEpisode: 1,
  works: [],
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
    value === "pipeline" ||
    value === "name-gate" ||
    value === "revision" ||
    value === "assets" ||
    value === "bible" ||
    value === "volume-plot" ||
    value === "layers" ||
    value === "works"
  );
}
