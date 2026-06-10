/**
 * Console scope store
 *
 * 「操作対象 (slug + episode)」を server プロセス全体で共有する mutable シングルトン。
 * 永続化先は data/manga/.console-scope.json。
 *
 * 設計根拠:
 *   - 旧設計: CLI 引数 (--slug/--episode) でしか scope を pin できず、別作品に切り替えるたびに
 *     console プロセス再起動が必要だった (今日のユーザー指摘)。
 *   - 新設計: UI から POST /api/scope で動的に切替。永続化により再起動後も復元される。
 *   - 事故防止は UI 側の確認モーダル + writes の slug/episode 一致チェックで担保。
 *
 * 起動時の優先順位:
 *   1. CLI 引数 (--slug X --episode N) → ある場合は最優先で適用
 *   2. 永続化された .console-scope.json → 1 が無いときに適用
 *   3. どちらも無い場合 → null (= write 禁止、UI から選択を促す)
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { isValidSlug, isValidEpisode } from "./lib/path-guards";

const REPO_ROOT = process.env.AINARO_REPO_ROOT ?? path.resolve(__dirname, "../../../../..");
const SCOPE_FILE = path.join(REPO_ROOT, "data/manga/.console-scope.json");

export type ConsoleScope = {
  slug: string | null;
  episode: number | null;
};

let current: ConsoleScope = { slug: null, episode: null };

export function getScope(): ConsoleScope {
  return { ...current };
}

/**
 * scope を更新 + 永続化。slug/episode 両方 null なら永続ファイルを削除。
 * 不正な slug/episode は ValidationError を投げる。
 */
export async function setScope(slug: string | null, episode: number | null): Promise<ConsoleScope> {
  if (slug !== null) {
    if (!isValidSlug(slug)) throw new Error(`invalid slug: ${slug}`);
  }
  if (episode !== null) {
    if (!isValidEpisode(episode)) throw new Error(`invalid episode: ${episode}`);
  }
  // slug/episode の片方だけ null は禁止 (誤用)。両方 null = 解除のみ許可。
  if ((slug === null) !== (episode === null)) {
    throw new Error("slug と episode は両方指定するか両方 null にしてください");
  }
  current = { slug, episode };
  if (slug && episode !== null) {
    await fs.mkdir(path.dirname(SCOPE_FILE), { recursive: true });
    await fs.writeFile(
      SCOPE_FILE,
      JSON.stringify({ slug, episode, updated_at: new Date().toISOString() }, null, 2),
      "utf-8",
    );
  } else {
    await fs.unlink(SCOPE_FILE).catch(() => {});
  }
  return getScope();
}

/**
 * 永続化された scope を読み込んで current に反映。ファイル不在なら no-op。
 * server 起動時に一度だけ呼ぶ。
 */
export async function loadPersistedScope(): Promise<void> {
  try {
    const text = await fs.readFile(SCOPE_FILE, "utf-8");
    const json = JSON.parse(text);
    if (typeof json.slug === "string" && typeof json.episode === "number") {
      if (isValidSlug(json.slug) && isValidEpisode(json.episode)) {
        current = { slug: json.slug, episode: json.episode };
      }
    }
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return;
    // 破損ファイルは無視 (起動を止めない)。次の setScope で上書きされる。
    console.warn(`[scope-store] failed to load ${SCOPE_FILE}:`, err.message);
  }
}

/**
 * CLI 引数 (--slug/--episode) を current に反映。両方指定された場合のみ。
 * 永続化はしない (CLI は一時的指定の意図と解釈)。永続化が必要なら setScope を別途呼ぶ。
 */
export function initScopeFromArgs(slug: string | null, episode: number | null): void {
  if (slug !== null && episode !== null) {
    if (isValidSlug(slug) && isValidEpisode(episode)) {
      current = { slug, episode };
    }
  }
}
