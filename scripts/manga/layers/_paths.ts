/**
 * パイプライン v2 共通パスヘルパー
 *
 * data/manga/works/{slug}/... の標準レイアウトを集約
 */
import path from "node:path";

export const REPO_ROOT = process.env.AINARO_REPO_ROOT ?? "/Users/hikarumori/Developer/AINARO";

export const MANGA_DATA_ROOT = path.join(REPO_ROOT, "data/manga");
export const CAPABILITY_DIR = path.join(MANGA_DATA_ROOT, "capability");
export const STYLE_PLATES_DIR = path.join(MANGA_DATA_ROOT, "style-plates");
export const WORKS_DIR = path.join(MANGA_DATA_ROOT, "works");

export function workDir(slug: string): string {
  return path.join(WORKS_DIR, slug);
}

export function workMetaPath(slug: string): string {
  return path.join(workDir(slug), "meta.json");
}

export function bibleDir(slug: string): string {
  return path.join(workDir(slug), "bible");
}

/** Phase A: bible variant 採用記録 (character / location / prop ごとに 1 chosen variant) */
export function bibleAdoptedVariantsPath(slug: string): string {
  return path.join(workDir(slug), "bible", "adopted_variants.json");
}

export function bibleSnapshotPath(slug: string): string {
  return path.join(bibleDir(slug), "snapshot.json");
}

export function bibleRefsDir(slug: string): string {
  return path.join(bibleDir(slug), "refs");
}

export function bibleRefsCharactersDir(slug: string, characterId: string): string {
  return path.join(bibleRefsDir(slug), "characters", characterId);
}

export function bibleRefsLocationsDir(slug: string, locationId: string): string {
  return path.join(bibleRefsDir(slug), "locations", locationId);
}

export function bibleRefsPropsDir(slug: string, propId: string): string {
  return path.join(bibleRefsDir(slug), "props", propId);
}

export function episodeDir(slug: string, ep: number): string {
  const epStr = String(ep).padStart(2, "0");
  return path.join(workDir(slug), "episodes", `ep${epStr}`);
}

export function shotlistPath(slug: string, ep: number): string {
  return path.join(episodeDir(slug, ep), "shotlist.json");
}

export function storyboardPath(slug: string, ep: number): string {
  return path.join(episodeDir(slug, ep), "storyboard.json");
}

/** L3.5 出力 (Phase β B2 で追加): scene-graph 中間表現 */
export function sceneGraphPath(slug: string, ep: number): string {
  return path.join(episodeDir(slug, ep), "scene_graph.json");
}

/** episodes/epNN/_brief.v2.md (L02b 出力) */
export function episodeBriefV2Path(slug: string, ep: number): string {
  return path.join(episodeDir(slug, ep), "_brief.v2.md");
}

export function pagePlanPath(slug: string, ep: number): string {
  return path.join(episodeDir(slug, ep), "page_plan.json");
}

export function resolvedRefsPath(slug: string, ep: number): string {
  return path.join(episodeDir(slug, ep), "resolved_refs.json");
}

export function rendersDir(slug: string, ep: number): string {
  return path.join(episodeDir(slug, ep), "renders");
}

export function nameDir(slug: string, ep: number): string {
  return path.join(episodeDir(slug, ep), "name");
}

export function nameManifestPath(slug: string, ep: number): string {
  return path.join(nameDir(slug, ep), "name_manifest.json");
}

export function nameIndexHtmlPath(slug: string, ep: number): string {
  return path.join(nameDir(slug, ep), "index.html");
}

export function nameApprovalPath(slug: string, ep: number): string {
  return path.join(episodeDir(slug, ep), "name_approval.json");
}

export function nameAuditPath(slug: string, ep: number): string {
  return path.join(nameDir(slug, ep), "name_audit.json");
}

/**
 * L11 audit findings の override (false positive / fixed マーク)。
 * Console quality view から append される append-only JSONL。
 * audit 自体は決定論的に判定するが、人間の判断結果をここに残して UI 上で隠す。
 */
export function auditOverridesPath(slug: string, ep: number): string {
  return path.join(episodeDir(slug, ep), "audit_overrides.jsonl");
}

// ===== 修正指示 UI (Phase A〜D) =====

/** L09 が generation 毎に append する render manifest (JSONL, append-only) */
export function renderManifestPath(slug: string, ep: number): string {
  return path.join(episodeDir(slug, ep), "render_manifest.jsonl");
}

/** Phase B: ユーザー修正指示の queue (JSONL, append-only) */
export function revisionQueuePath(slug: string, ep: number): string {
  return path.join(episodeDir(slug, ep), "_revision_queue.jsonl");
}

/** Phase D: 採用 version の json (episode 単位、L13 が読む) */
export function adoptedVersionsPath(slug: string, ep: number): string {
  return path.join(episodeDir(slug, ep), "adopted_versions.json");
}

export function auditPath(slug: string, ep: number): string {
  return path.join(episodeDir(slug, ep), "audit.json");
}

/** Phase Y WY-11: 退屈ページ・ドロップオフリスク監査 */
export function engagementAuditPath(slug: string, ep: number): string {
  return path.join(episodeDir(slug, ep), "engagement_audit.json");
}

/** Phase C-1β: storyboard.json (現存単一案) を「採用」記録する file */
export function adoptedStoryboardPath(slug: string, ep: number): string {
  return path.join(episodeDir(slug, ep), "adopted_storyboard.json");
}

/** Phase C-1β/γ: storyboard 複数案保存ディレクトリ (proposals-YYYY-MM-DD.json) */
export function storyboardAltsDir(slug: string, ep: number): string {
  return path.join(episodeDir(slug, ep), "_storyboard_alts");
}

export function repairLogPath(slug: string, ep: number): string {
  return path.join(episodeDir(slug, ep), "repair_log.json");
}

export function incrementalRefsDir(slug: string, ep: number): string {
  return path.join(episodeDir(slug, ep), "_incremental_refs");
}

export function volumeDir(slug: string, vol: number): string {
  const volStr = String(vol).padStart(2, "0");
  return path.join(workDir(slug), "volumes", `v${volStr}`);
}

export function volumePlotPath(slug: string, vol: number): string {
  return path.join(volumeDir(slug, vol), "plot.json");
}

export function kdpDir(slug: string, vol: number): string {
  return path.join(volumeDir(slug, vol), "kdp");
}

export function capabilityProfilePath(model: string): string {
  return path.join(CAPABILITY_DIR, `${model}.json`);
}

/** A07 デフォルト */
export const DEFAULT_CAPABILITY_MODEL = "gpt-image-2";
