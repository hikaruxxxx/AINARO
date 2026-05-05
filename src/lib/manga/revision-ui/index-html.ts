/**
 * 修正指示 UI HTML builder (Phase A〜D)
 *
 * 1 ページの SPA。grid / panel-detail / compare の 3 モード。
 * Phase A 時点では grid + filter のみ機能。Phase B/C/D で機能段階追加。
 *
 * 設計:
 * - 静的 HTML 1 枚 + inline JS で完結 (依存最小)
 * - server fixed scope (slug / episode) を inline で埋め込む
 * - 画像は server に対して相対 URL (`/episodes/...`) で参照
 * - panel rect (page_plan.json) は overlay 表示には使わず、画像クリックで panel_id を引く
 */
import type {
  BibleSnapshotV2,
  EpisodeStoryboardV2,
  PagePlanV2,
  AuditReport,
} from "../schemas-v2";
import type {
  AdoptedVersions,
  RenderManifestEntry,
  RevisionEntry,
} from "./types";

export type RevisionUiManifest = {
  schema_version: 1;
  slug: string;
  episode: number;
  episode_id: string;
  generated_at: string;
  page_plan: PagePlanV2;
  storyboard: EpisodeStoryboardV2;
  audit: AuditReport | null;
  /** render_manifest.jsonl 全件 */
  render_manifest: RenderManifestEntry[];
  /** _revision_queue.jsonl 全件 (Phase B 以降) */
  revision_queue: RevisionEntry[];
  /** adopted_versions.json (Phase D 以降。なければ panels 空) */
  adopted: AdoptedVersions;
  /** keys are character_id, value is "bible/refs/characters/{id}/face_front.png" 風 */
  bible_characters: Array<{ id: string; name: string }>;
};

export function renderRevisionUiHtml(slug: string, episode: number, episodeId: string): string {
  const epStr = String(episode).padStart(2, "0");
  const slugJson = JSON.stringify(slug);
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>Revision UI — ${escapeHtml(slug)} ep${epStr}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin:0; font-family:'Hiragino Sans','Yu Gothic','Noto Sans JP',system-ui,sans-serif; background:#f3f4f6; color:#111; }
    header.top { position:sticky; top:0; background:#1f2937; color:#fff; padding:10px 20px; display:flex; gap:16px; align-items:center; z-index:10; flex-wrap:wrap; }
    header.top h1 { margin:0; font-size:16px; font-weight:700; }
    header.top .info { color:#9ca3af; font-size:12px; }
    header.top nav { display:flex; gap:6px; margin-left:auto; }
    header.top nav button { background:#374151; color:#fff; border:1px solid #4b5563; border-radius:6px; padding:6px 14px; font-size:12px; cursor:pointer; font-weight:600; }
    header.top nav button.active { background:#2563eb; border-color:#2563eb; }
    header.top .summary { color:#9ca3af; font-size:12px; }
    header.top .summary strong { color:#fff; font-weight:700; margin:0 4px; }
    header.top .badge { background:#dc2626; color:#fff; border-radius:10px; padding:1px 8px; font-size:11px; font-weight:700; margin-left:6px; display:none; }
    header.top .badge.visible { display:inline-block; }
    main { padding:14px; }
    /* grid mode */
    .grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(420px, 1fr)); gap:14px; }
    .page-card { background:#fff; border:2px solid #e5e7eb; border-radius:8px; padding:10px; }
    .page-card h2 { margin:0 0 8px; font-size:14px; display:flex; gap:8px; align-items:center; }
    .page-card h2 .role { color:#6b7280; font-weight:400; font-size:12px; }
    .page-card h2 .audit-fail { color:#dc2626; font-size:11px; font-weight:700; margin-left:auto; }
    .panel-grid { display:grid; gap:6px; grid-template-columns:repeat(auto-fill, minmax(140px, 1fr)); }
    .panel { position:relative; border:1px solid #d1d5db; border-radius:4px; overflow:hidden; cursor:pointer; background:#fafafa; aspect-ratio:1; }
    .panel.failed { border-color:#dc2626; box-shadow:0 0 0 2px rgba(220,38,38,0.3); }
    .panel.has-revision { border-color:#f59e0b; }
    .panel.adopted-v2plus { border-color:#16a34a; }
    .panel img { width:100%; height:100%; object-fit:contain; display:block; }
    .panel .label { position:absolute; left:4px; top:4px; background:rgba(31,41,55,0.85); color:#fff; padding:1px 6px; border-radius:3px; font-size:10px; font-weight:600; }
    .panel .ver { position:absolute; right:4px; top:4px; background:rgba(37,99,235,0.85); color:#fff; padding:1px 6px; border-radius:3px; font-size:10px; font-weight:600; }
    .panel .miss { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:#9ca3af; font-size:11px; }
    .filters { display:flex; gap:10px; margin:10px 14px 0; padding:8px 12px; background:#fff; border-radius:6px; align-items:center; flex-wrap:wrap; font-size:13px; }
    .filters label { display:flex; align-items:center; gap:4px; cursor:pointer; }
    .filters .pill { padding:3px 10px; border-radius:12px; background:#e5e7eb; font-size:11px; }
    /* dialog */
    dialog { border:none; border-radius:8px; padding:0; max-width:680px; width:90vw; box-shadow:0 10px 40px rgba(0,0,0,0.3); }
    dialog::backdrop { background:rgba(0,0,0,0.4); }
    dialog .modal-body { padding:16px 20px; }
    dialog .modal-body h2 { margin:0 0 8px; font-size:15px; }
    dialog .modal-body .meta { color:#6b7280; font-size:12px; margin-bottom:12px; }
    dialog .modal-body img { max-width:100%; max-height:50vh; border:1px solid #d1d5db; border-radius:4px; display:block; margin-bottom:12px; }
    dialog .modal-body .tags { display:flex; flex-wrap:wrap; gap:6px 10px; margin-bottom:10px; font-size:12px; }
    dialog .modal-body .tags label { display:flex; align-items:center; gap:4px; cursor:pointer; padding:3px 8px; border:1px solid #d1d5db; border-radius:4px; }
    dialog .modal-body textarea { width:100%; min-height:80px; padding:8px; font-size:13px; border:1px solid #d1d5db; border-radius:4px; font-family:inherit; resize:vertical; }
    dialog .modal-body .actions { display:flex; gap:8px; justify-content:flex-end; margin-top:12px; }
    dialog button.primary { background:#2563eb; color:#fff; border:none; border-radius:4px; padding:7px 16px; font-size:13px; cursor:pointer; font-weight:600; }
    dialog button.secondary { background:#fff; color:#374151; border:1px solid #d1d5db; border-radius:4px; padding:7px 16px; font-size:13px; cursor:pointer; }
    /* compare mode */
    .compare-list { display:flex; flex-direction:column; gap:14px; }
    .compare-row { background:#fff; border:1px solid #e5e7eb; border-radius:8px; padding:12px; }
    .compare-row h3 { margin:0 0 8px; font-size:13px; }
    .compare-row .versions { display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:10px; }
    .compare-row .ver-card { border:2px solid #e5e7eb; border-radius:6px; padding:6px; cursor:pointer; transition:border-color .15s; background:#fafafa; }
    .compare-row .ver-card.adopted { border-color:#16a34a; background:#f0fdf4; }
    .compare-row .ver-card img { width:100%; aspect-ratio:1; object-fit:contain; background:#fff; border:1px solid #d1d5db; }
    .compare-row .ver-card .ver-meta { font-size:11px; color:#6b7280; margin-top:4px; display:flex; justify-content:space-between; align-items:center; }
    .compare-row .ver-card button { background:#2563eb; color:#fff; border:none; border-radius:3px; padding:2px 8px; font-size:10px; cursor:pointer; }
    .compare-row .ver-card.adopted button { background:#16a34a; }
    .empty { padding:40px; text-align:center; color:#6b7280; font-size:14px; }
    .help { position:fixed; bottom:10px; right:10px; background:rgba(31,41,55,0.95); color:#fff; padding:8px 12px; border-radius:6px; font-size:11px; line-height:1.5; }
    .help code { background:rgba(255,255,255,0.15); padding:1px 4px; border-radius:2px; font-family:ui-monospace,monospace; }
  </style>
</head>
<body>
  <header class="top">
    <h1>Revision UI</h1>
    <span class="info">${escapeHtml(slug)} / ep${epStr} (${escapeHtml(episodeId)})</span>
    <span class="summary">queue <strong id="cnt-queue">0</strong> / adopted <strong id="cnt-adopted">0</strong> / failed <strong id="cnt-failed">0</strong> <span class="badge" id="badge-resolved"></span></span>
    <nav>
      <button data-mode="grid" class="active">Grid</button>
      <button data-mode="compare">Compare</button>
      <button data-layer="renders" class="active" id="btn-layer-renders">Renders</button>
      <button data-layer="bubbles" id="btn-layer-bubbles">Bubbles</button>
    </nav>
  </header>
  <div class="filters">
    <label><input type="checkbox" id="filter-failed"> 監査失敗のみ</label>
    <label><input type="checkbox" id="filter-revision"> 修正指示済みのみ</label>
    <label><input type="checkbox" id="filter-not-adopted"> 未採用のみ</label>
    <span class="pill" id="filter-summary"></span>
  </div>
  <main id="main"><div class="empty">読み込み中…</div></main>

  <dialog id="modal-revision">
    <div class="modal-body">
      <h2>修正指示</h2>
      <div class="meta" id="modal-meta"></div>
      <img id="modal-img" alt="panel">
      <div class="tags">
        <label><input type="checkbox" data-tag="face"> 顔</label>
        <label><input type="checkbox" data-tag="composition"> 構図</label>
        <label><input type="checkbox" data-tag="tone"> トーン</label>
        <label><input type="checkbox" data-tag="bubble"> 吹き出し</label>
        <label><input type="checkbox" data-tag="ref"> ref不一致</label>
        <label><input type="checkbox" data-tag="anatomy"> 体格/手足</label>
        <label><input type="checkbox" data-tag="background"> 背景</label>
        <label><input type="checkbox" data-tag="other"> その他</label>
      </div>
      <textarea id="modal-instruction" placeholder="自由記述 (≤ 1000 字)"></textarea>
      <div class="actions">
        <button class="secondary" id="modal-cancel">キャンセル</button>
        <button class="primary" id="modal-submit">指示を送信</button>
      </div>
    </div>
  </dialog>

  <div class="help"><code>1</code> renders <code>2</code> bubbles <code>g</code> grid <code>c</code> compare <code>esc</code> close</div>

  <script>
  (function () {
    const slug = ${slugJson};
    const episode = ${episode};
    const state = {
      manifest: null,
      mode: "grid",  // "grid" | "compare"
      layer: "renders", // "renders" | "bubbles"
      filters: { failed: false, revision: false, notAdopted: false },
    };
    const main = document.getElementById("main");

    async function loadManifest() {
      const res = await fetch('/api/manifest?slug=' + encodeURIComponent(slug) + '&episode=' + episode);
      if (!res.ok) { main.innerHTML = '<div class="empty">manifest 取得失敗 (' + res.status + ')</div>'; return; }
      state.manifest = await res.json();
      refresh();
    }

    function buildPanelLookup() {
      // map: page_no → array of { panel_id, panel_no, reading_order, importance }
      const m = new Map();
      for (const sb of state.manifest.storyboard.pages) {
        const list = sb.panels.map(p => ({
          panel_id: p.panel_id,
          panel_no: p.panel_no,
          reading_order: p.reading_order,
          importance: p.importance,
          shot_type: p.shot_type,
        })).sort((a, b) => a.reading_order - b.reading_order);
        m.set(sb.page_no, list);
      }
      return m;
    }

    function buildVersionMap(layer) {
      // map: panel_id → [{ version, image_path, ts, origin }] sorted by version asc
      const m = new Map();
      for (const e of state.manifest.render_manifest || []) {
        if (e.layer !== layer) continue;
        const arr = m.get(e.panel_id) ?? [];
        arr.push({ version: e.version, image_path: e.image_path, ts: e.ts, origin: e.origin });
        m.set(e.panel_id, arr);
      }
      for (const arr of m.values()) {
        arr.sort((a, b) => parseVer(a.version) - parseVer(b.version));
      }
      return m;
    }

    function parseVer(v) { const m = String(v).match(/^v(\\d+)$/); return m ? Number(m[1]) : 0; }

    function defaultImagePath(layer, pageNo) {
      const pn = String(pageNo).padStart(2, '0');
      // v1 は既存命名 (p{NN}.png)
      if (layer === 'renders') return 'episodes/ep' + String(episode).padStart(2,'0') + '/renders/p' + pn + '.png';
      return 'episodes/ep' + String(episode).padStart(2,'0') + '/bubbles/p' + pn + '.png';
    }

    function failedPanelSet() {
      const s = new Set();
      const a = state.manifest.audit;
      if (!a) return s;
      for (const id of (a.failed_panel_ids || [])) s.add(id);
      return s;
    }

    function revisedPanelSet() {
      const s = new Set();
      for (const r of state.manifest.revision_queue || []) s.add(r.panel_id);
      return s;
    }

    function adoptedPanels() {
      return state.manifest.adopted?.panels || {};
    }

    function refresh() {
      updateSummary();
      if (state.mode === 'grid') renderGrid();
      else renderCompare();
    }

    function updateSummary() {
      const queue = (state.manifest.revision_queue || []).length;
      const adopted = Object.keys(state.manifest.adopted?.panels || {}).length;
      const failed = (state.manifest.audit?.failed_panel_ids || []).length;
      document.getElementById('cnt-queue').textContent = queue;
      document.getElementById('cnt-adopted').textContent = adopted;
      document.getElementById('cnt-failed').textContent = failed;
      document.querySelectorAll('header.top nav button[data-mode]').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === state.mode);
      });
      document.querySelectorAll('header.top nav button[data-layer]').forEach(b => {
        b.classList.toggle('active', b.dataset.layer === state.layer);
      });
      document.getElementById('filter-failed').checked = state.filters.failed;
      document.getElementById('filter-revision').checked = state.filters.revision;
      document.getElementById('filter-not-adopted').checked = state.filters.notAdopted;
    }

    function renderGrid() {
      const lookup = buildPanelLookup();
      const versions = buildVersionMap(state.layer);
      const failed = failedPanelSet();
      const revised = revisedPanelSet();
      const adopted = adoptedPanels();

      const pages = state.manifest.page_plan.pages.slice().sort((a, b) => a.page_no - b.page_no);
      const html = [];
      for (const page of pages) {
        const panels = lookup.get(page.page_no) || [];
        const pageFailedCount = panels.filter(p => failed.has(p.panel_id)).length;
        const cards = [];
        for (const p of panels) {
          const passFilters = checkFilters(p, failed, revised, adopted);
          if (!passFilters) continue;
          const vs = versions.get(p.panel_id) || [];
          const pageOneShotKey = 'page_' + page.page_no;
          // page_one_shot 戦略の場合、panel ごとに画像を持たない → page 画像を panel ごとに表示
          const pageVs = versions.get(pageOneShotKey) || [];
          const display = vs.length > 0 ? vs : pageVs;
          const latest = display[display.length - 1];
          const adoptedChoice = adopted[p.panel_id] || adopted[pageOneShotKey];
          const showVersion = adoptedChoice?.chosen ? adoptedChoice.chosen : (latest?.version ?? 'v1');
          const imgPath = adoptedChoice?.image_path
            ?? latest?.image_path
            ?? defaultImagePath(state.layer, page.page_no);
          const cls = ['panel'];
          if (failed.has(p.panel_id)) cls.push('failed');
          if (revised.has(p.panel_id)) cls.push('has-revision');
          if (showVersion && showVersion !== 'v1') cls.push('adopted-v2plus');
          cards.push(
            '<div class="' + cls.join(' ') + '" data-panel-id="' + escapeHtml(p.panel_id) + '" data-page-no="' + page.page_no + '" data-panel-no="' + p.panel_no + '" data-image-path="' + escapeHtml(imgPath) + '" data-for-version="' + escapeHtml(showVersion) + '">' +
            '<span class="label">#' + p.reading_order + ' ' + escapeHtml(p.shot_type) + '</span>' +
            '<span class="ver">' + escapeHtml(showVersion) + '</span>' +
            '<img src="/' + escapeHtml(imgPath) + '" loading="lazy" onerror="this.style.display=\\'none\\'; this.parentElement.insertAdjacentHTML(\\'beforeend\\', \\'<div class=miss>未生成</div>\\')">' +
            '</div>'
          );
        }
        if (cards.length === 0) continue;
        html.push(
          '<div class="page-card">' +
          '<h2>P.' + page.page_no + ' <span class="role">[' + escapeHtml(page.page_role) + ']</span>' +
            (pageFailedCount > 0 ? '<span class="audit-fail">⚠ audit failed: ' + pageFailedCount + '</span>' : '') +
          '</h2>' +
          '<div class="panel-grid">' + cards.join('') + '</div>' +
          '</div>'
        );
      }
      main.innerHTML = '<div class="grid">' + (html.join('') || '<div class="empty">該当パネルなし</div>') + '</div>';
      // panel click → modal (Phase B 以降)
      main.querySelectorAll('.panel').forEach(el => {
        el.addEventListener('click', () => openRevisionModal(el.dataset));
      });
      const summary = countFiltered(lookup, failed, revised, adopted);
      document.getElementById('filter-summary').textContent = summary;
    }

    function checkFilters(panel, failed, revised, adopted) {
      const f = state.filters;
      if (f.failed && !failed.has(panel.panel_id)) return false;
      if (f.revision && !revised.has(panel.panel_id)) return false;
      if (f.notAdopted && adopted[panel.panel_id]?.chosen && adopted[panel.panel_id].chosen !== 'v1') return false;
      return true;
    }

    function countFiltered(lookup, failed, revised, adopted) {
      let total = 0, shown = 0;
      for (const arr of lookup.values()) {
        for (const p of arr) {
          total++;
          if (checkFilters(p, failed, revised, adopted)) shown++;
        }
      }
      return shown + ' / ' + total + ' panels';
    }

    function renderCompare() {
      // Phase D で実装。Phase A 時点では「Grid に戻ってください」表示
      const versions = buildVersionMap(state.layer);
      const items = [];
      for (const [panelId, vs] of versions.entries()) {
        if (vs.length < 2) continue;
        items.push({ panelId, versions: vs });
      }
      if (items.length === 0) {
        main.innerHTML = '<div class="empty">複数 version のあるパネルはまだありません (Phase C で生成後に表示)</div>';
        return;
      }
      const adopted = adoptedPanels();
      const html = items.map(it => {
        const cards = it.versions.map(v => {
          const isAdopted = adopted[it.panelId]?.chosen === v.version;
          return '<div class="ver-card' + (isAdopted ? ' adopted' : '') + '">' +
            '<img src="/' + escapeHtml(v.image_path) + '" loading="lazy">' +
            '<div class="ver-meta"><span>' + escapeHtml(v.version) + ' (' + escapeHtml(v.origin || 'initial') + ')</span>' +
            '<button data-panel-id="' + escapeHtml(it.panelId) + '" data-version="' + escapeHtml(v.version) + '" data-image-path="' + escapeHtml(v.image_path) + '">' + (isAdopted ? '採用中' : '採用') + '</button>' +
            '</div></div>';
        }).join('');
        return '<div class="compare-row"><h3>' + escapeHtml(it.panelId) + '</h3><div class="versions">' + cards + '</div></div>';
      }).join('');
      main.innerHTML = '<div class="compare-list">' + html + '</div>';
      main.querySelectorAll('.ver-card button').forEach(b => {
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          adoptVersion(b.dataset.panelId, b.dataset.version, b.dataset.imagePath);
        });
      });
    }

    async function adoptVersion(panelId, version, imagePath) {
      const res = await fetch('/api/adopted-versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, episode, panel_id: panelId, chosen_version: version, image_path: imagePath }),
      });
      if (res.ok) { await loadManifest(); }
      else { alert('採用に失敗 ' + res.status); }
    }

    // ===== modal (Phase B) =====
    const modal = document.getElementById('modal-revision');
    let modalContext = null;
    function openRevisionModal(ds) {
      modalContext = { panel_id: ds.panelId, page_no: Number(ds.pageNo), panel_no: Number(ds.panelNo), image_path: ds.imagePath, for_version: ds.forVersion };
      document.getElementById('modal-meta').textContent = 'panel=' + ds.panelId + ' / page=' + ds.pageNo + ' / version=' + ds.forVersion;
      document.getElementById('modal-img').src = '/' + ds.imagePath;
      document.getElementById('modal-instruction').value = '';
      modal.querySelectorAll('.tags input').forEach(i => i.checked = false);
      if (typeof modal.showModal === 'function') modal.showModal();
    }
    document.getElementById('modal-cancel').addEventListener('click', () => modal.close());
    document.getElementById('modal-submit').addEventListener('click', async () => {
      const instruction = document.getElementById('modal-instruction').value.slice(0, 1000);
      const checked_tags = Array.from(modal.querySelectorAll('.tags input:checked')).map(i => i.dataset.tag);
      if (!instruction && checked_tags.length === 0) { alert('指示文かタグを最低1つ入れてください'); return; }
      const res = await fetch('/api/revision-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, episode, ...modalContext, instruction, checked_tags }),
      });
      if (res.ok) {
        modal.close();
        await loadManifest();
      } else {
        alert('送信失敗 ' + res.status);
      }
    });

    // ===== nav / filter listeners =====
    document.querySelectorAll('header.top nav button[data-mode]').forEach(b => {
      b.addEventListener('click', () => { state.mode = b.dataset.mode; refresh(); });
    });
    document.querySelectorAll('header.top nav button[data-layer]').forEach(b => {
      b.addEventListener('click', () => { state.layer = b.dataset.layer; refresh(); });
    });
    document.getElementById('filter-failed').addEventListener('change', e => { state.filters.failed = e.target.checked; refresh(); });
    document.getElementById('filter-revision').addEventListener('change', e => { state.filters.revision = e.target.checked; refresh(); });
    document.getElementById('filter-not-adopted').addEventListener('change', e => { state.filters.notAdopted = e.target.checked; refresh(); });

    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === '1') { state.layer = 'renders'; refresh(); }
      else if (e.key === '2') { state.layer = 'bubbles'; refresh(); }
      else if (e.key === 'g') { state.mode = 'grid'; refresh(); }
      else if (e.key === 'c') { state.mode = 'compare'; refresh(); }
    });

    function escapeHtml(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    loadManifest();
  })();
  </script>
</body>
</html>
`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
