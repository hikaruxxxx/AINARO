/**
 * Novelis Console index view (作品一覧)
 *
 * 引数なしで `npm run console` を起動した一覧モードで初期表示される。
 * `data/manga/works/` 配下の slug を /api/bootstrap 経由で受け取り、
 * 各作品カードからエピソードを選んで scope 固定 view (name-gate / revision / layers / works) へ遷移する。
 *
 * 一覧モードでは Server に scope が無いため、エピソードを選んだ瞬間に scope を SPA state に乗せる。
 * Phase 1 では legacy / scope-fixed write API は引き続き 400 を返すので、Phase 2 で
 * 横断 write を解禁するまでは「scope 選択 → 別ターミナルで `npm run console -- --slug X --episode N`」が必要。
 * ただし bootstrap や enumerate は scope なしでも動くので、一覧 → 確認系 (manifest 読み取り等) までは可能。
 */
import { store, type WorkInfo } from "../lib/store";

const CSS = `
.idx-view { display:grid; gap:18px; max-width: 1100px; }
.idx-head { display:flex; align-items:baseline; gap:12px; flex-wrap:wrap; }
.idx-head h2 { margin:0; font-size:22px; }
.idx-head p { margin:0; color:#526076; font-size:13px; }
.idx-grid { display:grid; gap:14px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
.idx-card { background:#fff; border:1px solid #dbe1ea; border-radius:10px; padding:14px; display:grid; gap:10px; }
.idx-card h3 { margin:0; font-size:16px; line-height:1.4; }
.idx-card .idx-slug { color:#64748b; font-size:12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.idx-eps { display:flex; gap:6px; flex-wrap:wrap; }
.idx-ep-btn { min-height:30px; border:1px solid #c7cfdb; border-radius:6px; background:#fff; color:#243044; padding:0 10px; font:inherit; font-size:13px; cursor:pointer; }
.idx-ep-btn:hover { background:#1f5eff; border-color:#1f5eff; color:#fff; }
.idx-empty-eps { color:#64748b; font-size:12px; }
.idx-empty { padding:32px; text-align:center; color:#526076; font-size:14px; background:#fff; border:1px dashed #c7cfdb; border-radius:10px; }
`;

function ensureStyles(): void {
  if (document.getElementById("idx-styles")) return;
  const style = document.createElement("style");
  style.id = "idx-styles";
  style.textContent = CSS;
  document.head.appendChild(style);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function episodeLabel(n: number): string {
  return `ep${String(n).padStart(2, "0")}`;
}

function renderCard(work: WorkInfo): string {
  const title = work.title ? escapeHtml(work.title) : escapeHtml(work.slug);
  const eps = work.episodes.length
    ? `<div class="idx-eps">${work.episodes
        .map(
          (n) =>
            `<button type="button" class="idx-ep-btn" data-slug="${escapeHtml(work.slug)}" data-episode="${n}">${episodeLabel(n)}</button>`
        )
        .join("")}</div>`
    : `<p class="idx-empty-eps">エピソードがまだありません。</p>`;
  return `
    <article class="idx-card">
      <h3>${title}</h3>
      <div class="idx-slug">${escapeHtml(work.slug)}</div>
      ${eps}
    </article>
  `;
}

function render(container: HTMLElement, works: WorkInfo[]): void {
  if (works.length === 0) {
    container.innerHTML = `
      <div class="idx-view">
        <div class="idx-head">
          <h2>作品一覧</h2>
        </div>
        <div class="idx-empty">data/manga/works/ 配下に作品がありません。</div>
      </div>
    `;
    return;
  }
  container.innerHTML = `
    <div class="idx-view">
      <div class="idx-head">
        <h2>作品一覧</h2>
        <p>エピソードを選んで操作 view (name-gate / revision / layers) に遷移します。</p>
      </div>
      <div class="idx-grid">
        ${works.map(renderCard).join("")}
      </div>
    </div>
  `;
}

export function mountIndexView(container: HTMLElement): () => void {
  ensureStyles();
  const controller = new AbortController();

  const renderFromState = () => render(container, store.state.works);
  const unsubscribe = store.subscribe(() => {
    renderFromState();
  });

  container.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const btn = target.closest<HTMLButtonElement>("[data-slug][data-episode]");
      if (!btn) return;
      const slug = btn.dataset.slug;
      const episode = Number(btn.dataset.episode);
      if (!slug || !Number.isInteger(episode) || episode <= 0) return;
      // scope を SPA state に乗せる。URL は main.ts の syncRoute が
      // /works/{slug}/episodes/epNN/#name-gate に書き換える。
      store.update({
        currentSlug: slug,
        currentEpisode: episode,
        currentView: "name-gate",
      });
    },
    { signal: controller.signal }
  );

  return () => {
    controller.abort();
    unsubscribe();
    container.innerHTML = "";
  };
}
