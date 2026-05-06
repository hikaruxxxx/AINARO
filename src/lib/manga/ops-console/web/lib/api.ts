import type { WorkInfo } from "./store";
import type {
  NameApproval as SourceNameApproval,
  NameManifest as SourceNameManifest,
} from "../../../name-preview/types";
import type {
  AdoptedVersions,
  RenderManifestEntry,
  RevisionEntry,
  RevisionTag,
} from "../../../revision-ui/types";
import type {
  AuditReport,
  EpisodeStoryboardV2,
  PagePlanV2,
} from "../../../schemas-v2";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string
  ) {
    super(`API error ${status}: ${body}`);
  }
}

export type Bootstrap = {
  /** 一覧モード (`npm run console` 引数なし) では null。SPA は index view を表示する。 */
  default_slug: string | null;
  default_episode: number | null;
  works: WorkInfo[];
};

export type Manifest = {
  schema_version: number;
  slug: string;
  episode: number;
  episode_id: string;
  generated_at: string;
  page_plan: PagePlanV2;
  storyboard: EpisodeStoryboardV2;
  audit: AuditReport | null;
  render_manifest: RenderManifestEntry[];
  revision_queue: RevisionEntry[];
  adopted: AdoptedVersions;
  bible_characters?: Array<{ id: string; name: string }>;
};

export type NameManifest = SourceNameManifest;
export type NameApproval = SourceNameApproval;
export type {
  AdoptedPanelChoice,
  AdoptedVersions,
  RenderManifestEntry,
  RevisionEntry,
  RevisionTag,
} from "../../../revision-ui/types";

/**
 * 全エラーを ApiError に正規化する fetch wrapper。
 * 呼び出し側は `instanceof ApiError` だけで分岐できる:
 *  - status === 0: network error (fetch 自体が throw)
 *  - status >= 400: server エラー (body は JSON or plain text)
 *  - status === res.status (200 帯) で JSON parse 失敗: invalid response
 */
async function getJson<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { headers: { Accept: "application/json" } });
  } catch (e) {
    throw new ApiError(0, `network error: ${e instanceof Error ? e.message : String(e)}`);
  }
  const body = await res.text();
  if (!res.ok) throw new ApiError(res.status, body);
  try {
    return JSON.parse(body) as T;
  } catch (e) {
    throw new ApiError(
      res.status,
      `JSON parse failed: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  return sendJson<T>("POST", path, body);
}

export async function putJson<T>(path: string, body: unknown): Promise<T> {
  return sendJson<T>("PUT", path, body);
}

async function sendJson<T>(method: "POST" | "PUT", path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new ApiError(0, `network error: ${e instanceof Error ? e.message : String(e)}`);
  }
  const text = await res.text();
  if (!res.ok) throw new ApiError(res.status, text);
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    throw new ApiError(
      res.status,
      `JSON parse failed: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

export function apiGetBootstrap(): Promise<Bootstrap> {
  return getJson<Bootstrap>("/api/bootstrap");
}

export function apiGetWorks(): Promise<{ works: WorkInfo[] }> {
  return getJson<{ works: WorkInfo[] }>("/api/works");
}

export function apiGetWorkEpisodes(slug: string): Promise<{ slug: string; episodes: number[] }> {
  return getJson<{ slug: string; episodes: number[] }>(
    `/api/works/${encodeURIComponent(slug)}/episodes`
  );
}

export function apiGetManifest(slug: string, episode: number): Promise<Manifest> {
  return getJson<Manifest>(
    `/api/works/${encodeURIComponent(slug)}/episodes/ep${String(episode).padStart(2, "0")}/manifest`
  );
}

export type PipelineStatusLayer = {
  id: string;
  label: string;
  status: "missing" | "ready" | "stale";
  artifacts: string[];
  last_modified?: string;
  next_view?: string;
  next_layer_id?: string | null;
};

export type PipelineStatus = {
  slug: string;
  episode: number;
  layers: PipelineStatusLayer[];
  generated_at: string;
};

export function apiGetPipelineStatus(slug: string, episode: number): Promise<PipelineStatus> {
  return getJson<PipelineStatus>(
    `/api/works/${encodeURIComponent(slug)}/episodes/ep${String(episode).padStart(2, "0")}/pipeline-status`
  );
}

export function apiGetNameApproval(slug: string, episode: number): Promise<NameApproval> {
  return getJson<NameApproval>(
    `/api/works/${encodeURIComponent(slug)}/episodes/ep${String(episode).padStart(2, "0")}/name-approval`
  );
}

export function apiGetNameManifest(slug: string, episode: number): Promise<NameManifest> {
  return getJson<NameManifest>(
    `/api/works/${encodeURIComponent(slug)}/episodes/ep${String(episode).padStart(2, "0")}/name-manifest`
  );
}

export function apiPostNameApproval(
  slug: string,
  episode: number,
  body: { page_no: number; status: string; reasons: string[]; note: string }
): Promise<{ ok: true; page_no: number; status: string; rerun_from: string | null }> {
  return postJson(
    `/api/works/${encodeURIComponent(slug)}/episodes/ep${String(episode).padStart(2, "0")}/name-approval`,
    body
  );
}

export type AuditOverrideAction = "ignore" | "fixed" | "clear";
export type AuditOverrideEntry = {
  panel_id: string;
  check_kind: string;
  action: AuditOverrideAction;
  reason: string;
  created_at: string;
};

export function apiGetAuditOverrides(
  slug: string,
  episode: number
): Promise<{ entries: AuditOverrideEntry[] }> {
  return getJson<{ entries: AuditOverrideEntry[] }>(
    `/api/works/${encodeURIComponent(slug)}/episodes/ep${String(episode).padStart(2, "0")}/audit-overrides`
  );
}

export function apiPostAuditOverride(
  slug: string,
  episode: number,
  body: { panel_id: string; check_kind: string; action: AuditOverrideAction; reason: string }
): Promise<{ ok: true; entry: AuditOverrideEntry }> {
  return postJson(
    `/api/works/${encodeURIComponent(slug)}/episodes/ep${String(episode).padStart(2, "0")}/audit-overrides`,
    body
  );
}

export function apiGetRevisionQueue(
  slug: string,
  episode: number
): Promise<{ entries: RevisionEntry[] }> {
  return getJson<{ entries: RevisionEntry[] }>(
    `/api/works/${encodeURIComponent(slug)}/episodes/ep${String(episode).padStart(2, "0")}/revision-queue`
  );
}

export function apiPostRevisionQueue(
  slug: string,
  episode: number,
  body: {
    panel_id: string;
    page_no: number;
    panel_no?: number;
    instruction: string;
    checked_tags: RevisionTag[];
    image_path: string;
    for_version: string;
  }
): Promise<{ ok: true; id: string; duplicate_warning: string | null }> {
  return postJson(
    `/api/works/${encodeURIComponent(slug)}/episodes/ep${String(episode).padStart(2, "0")}/revision-queue`,
    body
  );
}

export function apiGetAdopted(slug: string, episode: number): Promise<AdoptedVersions> {
  return getJson<AdoptedVersions>(
    `/api/works/${encodeURIComponent(slug)}/episodes/ep${String(episode).padStart(2, "0")}/adopted-versions`
  );
}

export function apiPostAdopted(
  slug: string,
  episode: number,
  body: { panel_id: string; chosen_version: string; image_path: string; note?: string }
): Promise<{ ok: true; panel_id: string; choice: AdoptedVersions["panels"][string] }> {
  return postJson(
    `/api/works/${encodeURIComponent(slug)}/episodes/ep${String(episode).padStart(2, "0")}/adopted-versions`,
    body
  );
}

export type LayerId =
  | "L01"
  | "L01b"
  | "L01c"
  | "L02"
  | "L02b"
  | "L09"
  | "L11"
  | "L12"
  | "L13"
  | "L99"
  | "kdp-dry-run"
  | "scrape-bsr";

export type JobScope = "work" | "episode" | "volume";

export type JobEvent = {
  seq: number;
  ts: string;
  channel: "stdout" | "stderr" | "system";
  line: string;
};

export type JobState = "running" | "succeeded" | "failed" | "aborted";

export type JobSummary = {
  id: string;
  layer: LayerId;
  key: string;
  scope: { slug: string; episode?: number; volume?: number };
  state: JobState;
  startedAt: string;
  finishedAt?: string;
  exitCode?: number;
  events?: JobEvent[];
};

export type JobStartRequest = {
  layer: LayerId;
  slug: string;
  episode?: number;
  volume?: number;
  args?: Record<string, string>;
};

export type WorkQualityOverview = {
  slug: string;
  title?: string;
  episodes: Array<{
    episode: number;
    audit_failed_count: number;
    audit_status: "ready" | "missing" | "stale";
    revision_unresolved_count: number;
    adopted_pending_count: number;
    last_audit_at?: string;
  }>;
  totals: {
    audit_failed: number;
    revision_unresolved: number;
    adopted_pending: number;
  };
};

export type QualityOverview = {
  works: WorkQualityOverview[];
  generated_at: string;
};

export function apiGetQualityOverview(): Promise<QualityOverview> {
  return getJson<QualityOverview>("/api/quality/overview");
}

export function apiPostJob(
  req: JobStartRequest
): Promise<{ job_id: string; layer: LayerId; key: string; state: JobState }> {
  return postJson("/api/jobs", req);
}

export function apiGetJobs(filter?: {
  slug?: string;
  episode?: number;
  volume?: number;
  layer?: LayerId;
  all?: boolean;
}): Promise<{ jobs: JobSummary[] }> {
  const params = new URLSearchParams();
  if (filter?.slug) params.set("slug", filter.slug);
  if (filter?.episode !== undefined) params.set("episode", String(filter.episode));
  if (filter?.volume !== undefined) params.set("volume", String(filter.volume));
  if (filter?.layer) params.set("layer", filter.layer);
  if (filter?.all) params.set("all", "true");
  const qs = params.toString();
  return getJson<{ jobs: JobSummary[] }>(`/api/jobs${qs ? `?${qs}` : ""}`);
}

export function apiAbortJob(jobId: string): Promise<{ ok: true; state: JobState }> {
  return postJson(`/api/jobs/${encodeURIComponent(jobId)}/abort`, {});
}

export function apiAiEditCommit(message: string): Promise<{ ok: true; sha: string }> {
  return postJson("/api/ai-edit/commit", { message });
}

export function apiAiEditDiscard(): Promise<{ ok: true }> {
  return postJson("/api/ai-edit/discard", {});
}

export function apiAiEditDiff(): Promise<{ stat: string; diff: string }> {
  return getJson<{ stat: string; diff: string }>("/api/ai-edit/diff");
}

export function openJobStream(
  jobId: string,
  opts: {
    onEvent: (e: JobEvent) => void;
    onDone: (info: { state: JobState; exitCode: number | null }) => void;
    onError?: (err: Error) => void;
    lastEventId?: number;
  }
): { close: () => void } {
  const qs = opts.lastEventId !== undefined ? `?lastEventId=${opts.lastEventId}` : "";
  const source = new EventSource(`/api/jobs/${encodeURIComponent(jobId)}/stream${qs}`);
  source.addEventListener("data", (event) => {
    opts.onEvent(JSON.parse((event as MessageEvent).data) as JobEvent);
  });
  source.addEventListener("done", (event) => {
    opts.onDone(JSON.parse((event as MessageEvent).data) as { state: JobState; exitCode: number | null });
    source.close();
  });
  source.onerror = () => {
    // EventSource は default で自動再接続するが、ジョブ完了済みや 503 (cap 超過) で
    // 永続的にリトライされるとサーバ負荷とメモリリークの原因になる。
    // ここで close して呼び出し側に通知し、必要なら refetch で復帰させる。
    source.close();
    opts.onError?.(new Error("job stream error"));
  };
  return { close: () => source.close() };
}

export type BibleCharacterRef = { id: string; files: string[] };

export type BibleAssetView = {
  schema_version: number;
  generated_at?: string;
  generated_from?: unknown;
  meta: unknown;
  world: unknown;
  characters: unknown[];
  locations: unknown[];
  props: unknown[];
  costumes?: unknown[];
  relations?: unknown[];
  style_directives?: unknown;
  visual_motifs?: unknown;
  continuity_seeds?: unknown;
  volume_synopsis?: unknown;
  refs: {
    characters: BibleCharacterRef[];
    locations: BibleCharacterRef[];
    props: BibleCharacterRef[];
  };
};

export function apiGetBible(slug: string): Promise<BibleAssetView> {
  return getJson<BibleAssetView>(`/api/works/${encodeURIComponent(slug)}/bible`);
}

export type VolumePlot = {
  slug: string;
  volume: number;
  plot: unknown;
};

export function apiGetVolumePlot(slug: string, volume: number): Promise<VolumePlot> {
  return getJson<VolumePlot>(
    `/api/works/${encodeURIComponent(slug)}/volumes/v${String(volume).padStart(2, "0")}/plot`
  );
}

export function apiPutVolumePlot(
  slug: string,
  volume: number,
  plot: unknown
): Promise<VolumePlot & { saved_at: string }> {
  return putJson<VolumePlot & { saved_at: string }>(
    `/api/works/${encodeURIComponent(slug)}/volumes/v${String(volume).padStart(2, "0")}/plot`,
    { plot }
  );
}

export type VolumeKdpFileStatus = {
  exists: boolean;
  mtime?: string;
  size?: number;
};

export type VolumeKdpStatus = {
  manuscript_pdf: VolumeKdpFileStatus;
  cover_pdf: VolumeKdpFileStatus;
  metadata_json: VolumeKdpFileStatus;
  kdp_input_md: VolumeKdpFileStatus;
};

export type VolumeInfo = {
  volume: number;
  episodes: number[];
  kdp_status: VolumeKdpStatus;
};

export function apiGetVolumes(slug: string): Promise<{ slug: string; volumes: VolumeInfo[] }> {
  return getJson<{ slug: string; volumes: VolumeInfo[] }>(`/api/works/${encodeURIComponent(slug)}/volumes`);
}

export type WorkKdpMetadataBlock = {
  title_candidates?: string[];
  series_name_canonical?: string;
  keyword_picks_7?: string[];
  categories_validated?: string[];
  description_seed?: unknown;
};

export type WorkMeta = {
  schema_version: number;
  slug: string;
  title?: string;
  genre?: string;
  art_style?: string;
  target_audience?: string;
  kdp_metadata?: WorkKdpMetadataBlock;
  [key: string]: unknown;
};

export type KeywordValidationIssue = {
  index?: number;
  code: string;
  message: string;
};

export type KeywordValidationResult = {
  ok: boolean;
  errors: KeywordValidationIssue[];
  warnings: KeywordValidationIssue[];
  unique_word_count: number;
};

export function apiGetWorkMeta(slug: string): Promise<WorkMeta> {
  return getJson<WorkMeta>(`/api/works/${encodeURIComponent(slug)}/meta`);
}

export function apiPutKdpMetadata(
  slug: string,
  body: WorkKdpMetadataBlock
): Promise<{
  ok: true;
  kdp_metadata: WorkKdpMetadataBlock;
  validation?: { keywords?: KeywordValidationResult };
}> {
  return putJson(`/api/works/${encodeURIComponent(slug)}/meta/kdp-metadata`, body);
}

export function apiCreateWork(body: {
  slug: string;
  title: string;
  genre?: string;
  art_style?: string;
  target_audience?: string;
}): Promise<{ ok: true; slug: string; meta: WorkMeta }> {
  return postJson("/api/works", body);
}

// ===== Phase X WX-5: trademark / IP 類似チェック (Console UI) =====

export type TrademarkSearchTargetClient = {
  keyword: string;
  kind: "title" | "subtitle" | "character_name" | "label_name" | "series_title";
  origin?: string;
};

export type TrademarkSearchSourceClient = {
  source: "j_platpat" | "uspto_tess" | "amazon_jp" | "amazon_us";
  url: string;
  intent: string;
};

export type TrademarkCheckResultClient = {
  status: "pending" | "passed" | "flagged";
  targets: TrademarkSearchTargetClient[];
  searches: Array<{
    target: TrademarkSearchTargetClient;
    sources: TrademarkSearchSourceClient[];
  }>;
  checked_at: string;
  human_review_notes?: string;
  auto_flagged?: Array<{
    target: TrademarkSearchTargetClient;
    source: TrademarkSearchSourceClient["source"];
    reason: string;
  }>;
};

export type RightsCheckClient = {
  trademark_passed: boolean;
  ip_similarity_passed: boolean;
  checked_at: string;
  notes?: string;
};

export type TrademarkCheckGetResponse = {
  slug: string;
  volume: number;
  checkResult: TrademarkCheckResultClient;
  currentRightsCheck: RightsCheckClient | null;
  releaseExists: boolean;
};

export function apiGetTrademarkCheck(
  slug: string,
  volume: number,
): Promise<TrademarkCheckGetResponse> {
  const v = String(volume).padStart(2, "0");
  return getJson<TrademarkCheckGetResponse>(
    `/api/works/${encodeURIComponent(slug)}/volumes/v${v}/trademark-check`,
  );
}

export type TrademarkCheckSaveRequest = {
  trademarkPassed: boolean;
  ipSimilarityPassed: boolean;
  flaggedKeywords?: TrademarkSearchTargetClient[];
  notes?: string;
};

export function apiPostTrademarkCheck(
  slug: string,
  volume: number,
  body: TrademarkCheckSaveRequest,
): Promise<{ ok: true; rights_check: RightsCheckClient; message: string }> {
  const v = String(volume).padStart(2, "0");
  return postJson(
    `/api/works/${encodeURIComponent(slug)}/volumes/v${v}/trademark-check`,
    body,
  );
}

// ===== Phase Y WY-7: 品質改善 view =====

export type ImprovementsAuditSummary = {
  pages_total: number;
  findings_total: number;
  counts_by_rule: Record<string, number>;
  counts_by_severity: Record<string, number>;
  findings_top10: Array<{
    page_no: number;
    panel_no?: number;
    rule: string;
    severity: string;
    message: string;
  }>;
};

export type ImprovementsNameAuditSummary = {
  pages_total: number;
  findings_total: number;
  counts_by_rule: Record<string, number>;
  counts_by_severity: Record<string, number>;
  new_rules_findings: Array<{
    page_no: number;
    panel_no?: number;
    rule: string;
    severity: string;
    message: string;
  }>;
};

export type ImprovementsResponse = {
  slug: string;
  episode: number;
  audit_summary: ImprovementsAuditSummary | null;
  name_audit_summary: ImprovementsNameAuditSummary | null;
  opening_hook_proposals: {
    available: boolean;
    latest_file?: string;
    proposals_count?: number;
    candidate_patterns?: string[];
    recommendation?: { pattern_id: string; rationale: string };
  };
  cliffhanger_proposals: {
    available: boolean;
    latest_file?: string;
    proposals_count?: number;
    candidate_patterns?: string[];
    recommendation?: { pattern_id: string; rationale: string };
    pull_link?: {
      current_episode_cliff: string;
      next_opening_hook_hint: string;
      is_volume_end: boolean;
    };
  };
  related_cards: Array<{
    card_id: string;
    title: string;
    scope: string;
    trigger: { layer?: string; flag?: string };
    diagnosis: string;
  }>;
  next_actions: Array<{
    label: string;
    job_layer: string;
    job_flags: Record<string, string | true>;
    description: string;
  }>;
};

export function apiGetImprovements(
  slug: string,
  episode: number,
): Promise<ImprovementsResponse> {
  return getJson<ImprovementsResponse>(
    `/api/works/${encodeURIComponent(slug)}/episodes/ep${String(episode).padStart(2, "0")}/improvements`,
  );
}
