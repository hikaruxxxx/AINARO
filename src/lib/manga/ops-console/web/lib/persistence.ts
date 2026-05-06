import type { FavoriteEntry, RecentEntry } from "./store";

const RECENT_KEY = "nc.recent";
const FAVORITES_KEY = "nc.favorites";
const MAX_RECENT = 10;

function readList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function writeList<T>(key: string, list: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // localStorage が使えない環境では履歴なしで動かす。
  }
}

function sameScope(a: { slug: string; episode: number }, b: { slug: string; episode: number }): boolean {
  return a.slug === b.slug && a.episode === b.episode;
}

export function loadRecent(): RecentEntry[] {
  return readList<RecentEntry>(RECENT_KEY)
    .filter((entry) => entry.slug && Number.isInteger(entry.episode))
    .slice(0, MAX_RECENT);
}

export function saveRecent(list: RecentEntry[]): void {
  writeList(RECENT_KEY, list.slice(0, MAX_RECENT));
}

export function pushRecent(slug: string, episode: number): RecentEntry[] {
  const next: RecentEntry = { slug, episode, ts: new Date().toISOString() };
  const list = [next, ...loadRecent().filter((entry) => !sameScope(entry, next))].slice(0, MAX_RECENT);
  saveRecent(list);
  return list;
}

export function loadFavorites(): FavoriteEntry[] {
  return readList<FavoriteEntry>(FAVORITES_KEY).filter((entry) => entry.slug && Number.isInteger(entry.episode));
}

export function saveFavorites(list: FavoriteEntry[]): void {
  writeList(FAVORITES_KEY, list);
}

export function toggleFavorite(slug: string, episode: number, label?: string): FavoriteEntry[] {
  const current = loadFavorites();
  const scope = { slug, episode };
  const exists = current.some((entry) => sameScope(entry, scope));
  const next = exists
    ? current.filter((entry) => !sameScope(entry, scope))
    : [...current, { slug, episode, label }];
  saveFavorites(next);
  return next;
}
