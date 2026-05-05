/**
 * (slug, episode, kind) 単位の write lock
 *
 * read-modify-write を直列化するための素朴な mutex。
 * 単一プロセス前提 (server は 1 listen のみ)。
 *
 * 旧 serve-name.ts / serve-revision.ts に重複していた withFileLock を集約。
 * 既存実装と挙動互換: 前段の throw を握り潰して順序を維持し、
 * tracked.then で末尾エントリを Map から消して mem leak を防ぐ。
 */
const writeQueues = new Map<string, Promise<unknown>>();

export function withFileLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = writeQueues.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  const tracked = next.catch(() => undefined);
  writeQueues.set(key, tracked);
  tracked.then(() => {
    if (writeQueues.get(key) === tracked) writeQueues.delete(key);
  });
  return next;
}
