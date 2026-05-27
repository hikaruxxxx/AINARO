import {
  ApiError,
  apiGetAdoptedVolumePlot,
  apiGetVolumePlot,
  apiGetVolumes,
  apiPostAdoptedVolumePlot,
  apiPostJob,
  apiPutVolumePlot,
  openJobStream,
  type AdoptedVolumePlot,
  type JobEvent,
  type VolumeInfo,
  type VolumePlot,
} from "../lib/api";
import {
  asKeyValueTable,
  asRecord,
  detailsRaw,
  escapeHtml,
  jsonHtml,
} from "../lib/data-display";
import { store } from "../lib/store";
import { navigateToAiEdit } from "../lib/layer-actions";
import { openAiEditModal } from "../components/ai-edit-modal";

type DisplayMode = "reader" | "edit" | "raw";

type ViewState = {
  slug: string;
  volume: number;
  plot: VolumePlot | null;
  displayMode: DisplayMode;
  loading: boolean;
  error: string | null;
  modalOpen: boolean;
  running: boolean;
  log: string[];
  toast: { message: string; kind: "success" | "warning" | "danger" | "info" } | null;
  /** edit モードで draft を保持。dirty 判定に使う。 */
  editDraft: unknown | null;
  saving: boolean;
  /** Phase C-3: volume plot 採用記録 (chosen_proposal_id="current" は plot.json を指す) */
  adoptedPlot: AdoptedVolumePlot | null;
  adoptingPlot: boolean;
  /** 作品が持つ巻一覧 (apiGetVolumes 経由)。複数巻切替ピルの描画に使う */
  volumes: VolumeInfo[];
  volumesLoading: boolean;
};

const CSS = `
.vplot-view { display: grid; gap: var(--space-3); }
.vplot-spacer { flex: 1 1 auto; }
.vplot-info { color: var(--text-secondary); font-size: var(--fs-sm); }
.vplot-body { display: grid; gap: var(--space-3); max-width: 980px; }
.vplot-section { display: grid; gap: var(--space-2); }
.vplot-section h3 { margin: 0; font-size: var(--fs-lg); }
.vplot-mode { display: flex; gap: var(--space-1); flex-wrap: wrap; }
.vplot-vols { display: inline-flex; gap: var(--space-1); align-items: center; }
.vplot-vols__label { color: var(--text-tertiary); font-size: var(--fs-xs); }
.vplot-vols__select {
  padding: 4px 28px 4px 10px;
  font-size: var(--fs-sm);
  font-weight: var(--fw-bold);
  font-family: var(--font-mono);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-default);
  background: var(--surface-elevated);
  color: var(--text-primary);
  cursor: pointer;
  min-width: 72px;
  /* select の矢印を統一感のあるカスタム▾に */
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'><path d='M1 3l4 4 4-4' stroke='%23888' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>");
  background-repeat: no-repeat;
  background-position: right 8px center;
}
.vplot-vols__select:hover { border-color: var(--color-primary); }
.vplot-vols__select:focus { outline: none; border-color: var(--color-primary); box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2); }
.vplot-vols__missing { color: var(--text-tertiary); font-size: var(--fs-xs); }
.vp-volume-card { display: grid; gap: var(--space-3); }
.vp-volume-head { display: flex; gap: var(--space-2); align-items: baseline; flex-wrap: wrap; }
.vp-volume-head h3 { margin: 0; font-size: var(--fs-xl); }
.vp-chapters { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-2); }
.vp-chapter { display: grid; gap: var(--space-1); padding: var(--space-2); border: 1px solid var(--border-default); border-radius: var(--radius-md); background: var(--surface-sunken); }
.vp-chapter__label { font-weight: var(--fw-bold); color: var(--text-primary); }
.vp-chapter__summary { color: var(--text-secondary); line-height: 1.5; }
.vp-episodes { display: grid; gap: var(--space-3); }
.vp-episode-card { display: grid; gap: var(--space-3); }
.vp-episode-head { display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap; }
.vp-episode-head h3 { margin: 0; font-size: var(--fs-lg); }
.vp-arc { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-2); }
.vp-arc__step { border: 1px solid var(--border-default); border-radius: var(--radius-md); padding: var(--space-2); background: var(--surface-sunken); }
.vp-arc__label { display: block; color: var(--text-tertiary); font-size: var(--fs-sm); font-weight: var(--fw-bold); margin-bottom: var(--space-1); }
.vp-beats { display: grid; gap: var(--space-2); }
.vp-beat { display: grid; gap: var(--space-1); padding: var(--space-2); border: 1px solid var(--border-default); border-radius: var(--radius-md); }
.vp-beat__head { display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap; }
.vp-beat__summary { line-height: 1.6; color: var(--text-primary); }
.vp-beat__visual { color: var(--text-secondary); font-size: var(--fs-sm); }
.vp-beat__episodes { color: var(--text-tertiary); font-size: var(--fs-sm); }
.vp-intensity { height: 6px; border-radius: var(--radius-pill); background: var(--surface-sunken); overflow: hidden; }
.vp-intensity__bar { height: 100%; border-radius: inherit; background: var(--color-primary); }
/* L2b 物語OS再設計 (2026-05-13): belongs_to_arcs / arc_position / scenes / directing_intent */
.vp-arcs-belong { display: flex; flex-wrap: wrap; gap: var(--space-1); align-items: center; }
.vp-arc-pill { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: var(--radius-pill); background: var(--surface-sunken); font-size: var(--fs-xs); border: 1px solid var(--border-default); }
.vp-arc-pill__coverage { font-size: 10px; color: var(--text-tertiary); }
.vp-ep-tags { display: flex; flex-wrap: wrap; gap: var(--space-1); margin-top: var(--space-1); }
.vp-ep-tag { padding: 2px 8px; border-radius: var(--radius-pill); font-size: var(--fs-xs); border: 1px solid var(--border-default); }
.vp-ep-tag--arc { background: #eef2ff; color: #3730a3; border-color: #c7d2fe; }
.vp-ep-tag--volume { background: #f0fdf4; color: #166534; border-color: #bbf7d0; }
.vp-scenes { display: grid; gap: var(--space-2); margin-top: var(--space-2); }
.vp-scenes h4 { margin: 0; font-size: var(--fs-md); color: var(--text-secondary); }
.vp-scene { padding: var(--space-2); border: 1px solid var(--border-default); border-radius: var(--radius-md); background: var(--surface-sunken); }
.vp-scene__head { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; margin-bottom: 4px; }
.vp-scene__id { font-family: var(--font-mono); font-size: var(--fs-xs); color: var(--text-tertiary); }
.vp-scene__pages { font-weight: var(--fw-bold); }
.vp-scene__purpose { line-height: 1.5; color: var(--text-primary); margin: 0; }
.vp-scene__meta { display: flex; flex-wrap: wrap; gap: var(--space-1); margin-top: 4px; color: var(--text-tertiary); font-size: var(--fs-xs); }
.vp-di-badge { padding: 2px 8px; border-radius: var(--radius-pill); font-size: var(--fs-xs); font-weight: var(--fw-bold); border: 1px solid transparent; }
.vp-di--opening_hook { background: #fef3c7; color: #92400e; border-color: #fde68a; }
.vp-di--world_anchor { background: #dbeafe; color: #1e40af; border-color: #bfdbfe; }
.vp-di--midpoint_turn { background: #fce7f3; color: #9d174d; border-color: #fbcfe8; }
.vp-di--cliffhanger_setup { background: #fed7aa; color: #9a3412; border-color: #fdba74; }
.vp-di--final_pull { background: #fecaca; color: #991b1b; border-color: #fca5a5; }
.vp-di--normal { background: var(--surface-default); color: var(--text-tertiary); border-color: var(--border-default); }
.vp-di-detail { margin-top: 4px; font-size: var(--fs-xs); color: var(--text-secondary); line-height: 1.5; }
.vp-di-narration { margin: 4px 0 0; padding-left: 1.4em; }
.vp-di-narration li { font-style: italic; color: var(--text-secondary); font-size: var(--fs-xs); }
.vplot-modal-body { display: grid; gap: var(--space-3); padding: var(--space-4); }
.vplot-modal-head { display: flex; align-items: center; gap: var(--space-2); }
.vplot-modal-title { margin: 0; font-size: var(--fs-xl); }
.vplot-actions { display: flex; gap: var(--space-2); justify-content: flex-end; }
.vplot-log { min-height: 160px; white-space: pre-wrap; }
.vp-edit-form { display: grid; gap: var(--space-3); }
.vp-edit-card { display: grid; gap: var(--space-2); }
.vp-edit-row { display: grid; grid-template-columns: 110px 1fr; gap: var(--space-2); align-items: start; }
.vp-edit-row > label { color: var(--text-secondary); font-size: var(--fs-sm); padding-top: 6px; }
.vp-edit-beat { display: grid; gap: var(--space-1); padding: var(--space-2); border: 1px solid var(--border-default); border-radius: var(--radius-md); }
.vp-edit-beat__head { display: flex; gap: var(--space-2); align-items: center; }
.vp-edit-save-bar { position: sticky; top: 0; z-index: 5; padding: var(--space-2); background: var(--surface-elevated); border-bottom: 1px solid var(--border-default); display: flex; gap: var(--space-2); align-items: center; }
.vp-edit-save-bar__hint { color: var(--text-tertiary); font-size: var(--fs-xs); margin-left: auto; }
.vp-edit-dirty { color: var(--color-warning); font-weight: var(--fw-medium); }
/* Phase C-3: 採用ボタン / 採用中バッジ */
.vp-adopt-btn {
  background: #2563eb;
  color: #fff;
  border: 0;
  border-radius: 4px;
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.vp-adopt-btn:hover { filter: brightness(1.06); }
.vp-adopt-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.vp-adopt-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 12px;
  background: #16a34a;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}
`;

function ensureStyles(): void {
  if (document.getElementById("vplot-styles")) return;
  const style = document.createElement("style");
  style.id = "vplot-styles";
  style.textContent = CSS;
  document.head.appendChild(style);
}

function errorText(error: unknown): string {
  if (error instanceof ApiError) return `API ${error.status}: ${error.body}`;
  return error instanceof Error ? error.message : String(error);
}

function renderDisplayMode(active: DisplayMode): string {
  return `<div class="vplot-mode">
    <button type="button" class="nc-pill${active === "reader" ? " nc-pill--active" : ""}" data-display-mode="reader">Reader</button>
    <button type="button" class="nc-pill${active === "edit" ? " nc-pill--active" : ""}" data-display-mode="edit" title="文言・emotional_intensity を inline 編集">編集</button>
    <button type="button" class="nc-pill${active === "raw" ? " nc-pill--active" : ""}" data-display-mode="raw">生 JSON</button>
  </div>`;
}

/**
 * 巻切替ドロップダウン。volumes が空でも現在の volume を 1 つだけ含む select を返す。
 * volumes に現在の volume が含まれていない (新規構築直後など) 場合は補完して active 選択する。
 */
function renderVolumeSwitcher(state: ViewState): string {
  if (state.volumesLoading) {
    return `<div class="vplot-vols"><span class="vplot-vols__label">巻</span><span class="vplot-vols__missing">読み込み中…</span></div>`;
  }
  const known = state.volumes.map((v) => v.volume);
  const list = known.includes(state.volume) ? known : [...known, state.volume].sort((a, b) => a - b);
  const ensured = list.length === 0 ? [state.volume] : list;
  const options = ensured
    .map((vol) => {
      const selected = vol === state.volume ? " selected" : "";
      return `<option value="${vol}"${selected}>v${String(vol).padStart(2, "0")}</option>`;
    })
    .join("");
  return `<div class="vplot-vols">
    <label class="vplot-vols__label" for="vplot-volume-select">巻</label>
    <select id="vplot-volume-select" class="vplot-vols__select" data-vp-volume-select aria-label="巻を切り替え">${options}</select>
  </div>`;
}

function intensity(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function renderBeats(beats: unknown): string {
  const items = Array.isArray(beats) ? beats : [];
  if (items.length === 0) return `<div class="nc-empty">beat がありません。</div>`;
  return `<div class="vp-beats">${items.map((beat) => {
    const b = asRecord(beat);
    const value = intensity(b.emotional_intensity);
    const related = Array.isArray(b.episodes) ? b.episodes : Array.isArray(b.related_episodes) ? b.related_episodes : [];
    return `<div class="vp-beat">
      <div class="vp-beat__head">
        <span class="nc-code">#${escapeHtml(String(b.beat_idx ?? "-"))}</span>
        ${b.label ? `<span class="nc-badge nc-badge--info">${escapeHtml(String(b.label))}</span>` : ""}
      </div>
      <div class="vp-beat__summary">${escapeHtml(String(b.summary ?? ""))}</div>
      ${related.length > 0 ? `<div class="vp-beat__episodes">関連 episode: ${escapeHtml(related.map(String).join(", "))}</div>` : ""}
      <div class="vp-intensity" title="emotional_intensity ${value}"><div class="vp-intensity__bar" style="width:${Math.round(value * 100)}%"></div></div>
      ${b.key_visual ? `<div class="vp-beat__visual">絵の核: ${escapeHtml(String(b.key_visual))}</div>` : ""}
      <details><summary>raw</summary><pre class="nc-code-block">${jsonHtml(beat)}</pre></details>
    </div>`;
  }).join("")}</div>`;
}

function renderChapters(value: unknown): string {
  const chapters = Array.isArray(value) ? value : [];
  if (chapters.length === 0) return "";
  return `<section class="vplot-section">
    <h3>章構成</h3>
    <div class="vp-chapters">${chapters.map((chapter, index) => {
      const c = asRecord(chapter);
      const label = c.label ?? c.title ?? c.name ?? `chapter ${index + 1}`;
      const summary = c.summary ?? c.description ?? c.role ?? "";
      return `<article class="vp-chapter">
        <div class="vp-chapter__label">${escapeHtml(String(label))}</div>
        ${summary ? `<div class="vp-chapter__summary">${escapeHtml(String(summary))}</div>` : ""}
        <details><summary>raw</summary><pre class="nc-code-block">${jsonHtml(chapter)}</pre></details>
      </article>`;
    }).join("")}</div>
  </section>`;
}

function renderDirectingIntent(di: unknown): string {
  if (!di || typeof di !== "object") return "";
  const d = di as Record<string, unknown>;
  const kind = typeof d.kind === "string" ? d.kind : "normal";
  const badge = `<span class="vp-di-badge vp-di--${escapeHtml(kind)}">${escapeHtml(kind)}</span>`;
  let detail = "";
  if (kind === "opening_hook") {
    const lines = Array.isArray(d.narration_lines) ? d.narration_lines : [];
    detail = `<div class="vp-di-detail">pattern: <strong>${escapeHtml(String(d.hook_pattern ?? "?"))}</strong>${
      d.key_visual ? ` / 絵: ${escapeHtml(String(d.key_visual))}` : ""
    }</div>${
      lines.length > 0
        ? `<ol class="vp-di-narration">${lines.map((n) => `<li>${escapeHtml(String(n))}</li>`).join("")}</ol>`
        : ""
    }`;
  } else if (kind === "world_anchor") {
    const facts = Array.isArray(d.target_facts) ? d.target_facts : [];
    detail = `<div class="vp-di-detail">delivery: <strong>${escapeHtml(String(d.delivery ?? "?"))}</strong> / facts: ${facts.length} 個</div>${
      facts.length > 0
        ? `<ol class="vp-di-narration">${facts.map((f) => `<li>${escapeHtml(String(f))}</li>`).join("")}</ol>`
        : ""
    }`;
  } else if (kind === "midpoint_turn") {
    detail = `<div class="vp-di-detail">reveal: ${escapeHtml(String(d.reveal ?? ""))}<br>shift: ${escapeHtml(String(d.emotional_shift ?? ""))}</div>`;
  } else if (kind === "cliffhanger_setup") {
    detail = `<div class="vp-di-detail">${escapeHtml(String(d.build_up ?? ""))}</div>`;
  } else if (kind === "final_pull") {
    detail = `<div class="vp-di-detail">引きの絵: ${escapeHtml(String(d.pull_visual ?? ""))}<br>次話 hook: ${escapeHtml(String(d.next_episode_hook ?? ""))}</div>`;
  }
  return `<div>${badge}${detail}</div>`;
}

function renderScenes(scenes: unknown): string {
  const list = Array.isArray(scenes) ? scenes : [];
  if (list.length === 0) return "";
  return `<section class="vp-scenes">
    <h4>scene skeleton (L2b)</h4>
    ${list
      .map((sc) => {
        const s = asRecord(sc);
        const range = Array.isArray(s.page_range) ? s.page_range : [];
        const pages =
          range.length === 2 ? `p${escapeHtml(String(range[0]))}-p${escapeHtml(String(range[1]))}` : "p?";
        const cast = Array.isArray(s.cast_ids) ? s.cast_ids : [];
        return `<article class="vp-scene">
          <div class="vp-scene__head">
            <span class="vp-scene__id">${escapeHtml(String(s.scene_id ?? `s${s.scene_no ?? "?"}`))}</span>
            <span class="vp-scene__pages">${pages}</span>
            ${s.time_of_day ? `<span class="nc-badge nc-badge--neutral">${escapeHtml(String(s.time_of_day))}</span>` : ""}
            ${s.location_id ? `<span class="nc-code">@${escapeHtml(String(s.location_id))}</span>` : ""}
            ${renderDirectingIntent(s.directing_intent)}
          </div>
          <p class="vp-scene__purpose">${escapeHtml(String(s.purpose ?? ""))}</p>
          <div class="vp-scene__meta">
            ${cast.length > 0 ? `cast: ${cast.map((c) => escapeHtml(String(c))).join(", ")}` : ""}
            ${s.emotional_beat ? ` · 感情 beat: ${escapeHtml(String(s.emotional_beat))}` : ""}
          </div>
          ${
            s.key_action
              ? `<div class="vp-scene__meta">key_action: ${escapeHtml(String(s.key_action))}</div>`
              : ""
          }
          ${
            s.connection_to_next
              ? `<div class="vp-scene__meta">→ next: ${escapeHtml(String(s.connection_to_next))}</div>`
              : ""
          }
        </article>`;
      })
      .join("")}
  </section>`;
}

function renderEpisode(ep: unknown): string {
  const item = asRecord(ep);
  const episodeNo = Number(item.episode_no);
  const arc = asRecord(item.protagonist_arc);
  const arcPosition = asRecord(item.arc_position);
  const tags: string[] = [];
  if (arcPosition.arc_id) {
    tags.push(
      `<span class="vp-ep-tag vp-ep-tag--arc">arc: ${escapeHtml(String(arcPosition.arc_id))} (${escapeHtml(String(arcPosition.role_in_arc ?? "?"))})</span>`,
    );
  }
  if (item.volume_position) {
    tags.push(
      `<span class="vp-ep-tag vp-ep-tag--volume">巻内位置: ${escapeHtml(String(item.volume_position))}</span>`,
    );
  }
  return `<article class="nc-card vp-episode-card">
    <div class="vp-episode-head">
      <span class="nc-badge nc-badge--neutral">ep${String(Number.isInteger(episodeNo) ? episodeNo : 0).padStart(2, "0")}</span>
      <h3>${escapeHtml(String(item.title_working ?? "タイトル未設定"))}</h3>
    </div>
    ${tags.length > 0 ? `<div class="vp-ep-tags">${tags.join("")}</div>` : ""}
    ${asKeyValueTable({
      "テーマ": item.theme,
      "ページ目安": item.page_target,
    })}
    <div class="vp-arc">
      <div class="vp-arc__step"><span class="vp-arc__label">start</span>${escapeHtml(String(arc.start ?? ""))}</div>
      <div class="vp-arc__step"><span class="vp-arc__label">turn</span>${escapeHtml(String(arc.turn ?? ""))}</div>
      <div class="vp-arc__step"><span class="vp-arc__label">end</span>${escapeHtml(String(arc.end ?? ""))}</div>
    </div>
    ${renderScenes(item.scenes)}
    ${renderBeats(item.beats)}
    <details class="nc-card nc-card--sunken vplot-section">
      <summary>詳細 (must_include_events / cliffhanger_hook / brief_for_L3)</summary>
      ${asKeyValueTable({
        "必須イベント": item.must_include_events,
        "引き": item.cliffhanger_hook,
        "L3 入力ブリーフ": item.brief_for_L3,
      })}
    </details>
  </article>`;
}

function renderBelongsToArcs(value: unknown): string {
  const arcs = Array.isArray(value) ? value : [];
  if (arcs.length === 0) return "";
  const pills = arcs
    .map((arc) => {
      const a = asRecord(arc);
      return `<span class="vp-arc-pill" title="${escapeHtml(String(a.arc_progression ?? ""))}">${escapeHtml(String(a.arc_id ?? ""))} <span class="vp-arc-pill__coverage">(${escapeHtml(String(a.coverage ?? ""))})</span></span>`;
    })
    .join("");
  return `<section class="vplot-section">
    <h3 style="font-size:var(--fs-md);color:var(--text-secondary);">この巻が属する arc (SeriesPlan)</h3>
    <div class="vp-arcs-belong">${pills}</div>
  </section>`;
}

function renderReader(plot: unknown): string {
  const obj = asRecord(plot);
  const episodes = Array.isArray(obj.episodes) ? obj.episodes : [];
  const chapters = obj.chapter_structure ?? obj.chapters ?? obj.acts;
  const summary = obj.summary ?? obj.volume_summary ?? obj.synopsis ?? obj.volume_theme;
  const schemaVersion = Number(obj.schema_version ?? 1);
  return `
    <div class="vplot-body">
      <section class="nc-card vp-volume-card">
        <div class="vp-volume-head">
          <span class="nc-badge nc-badge--neutral">v${String(Number(obj.volume_no ?? obj.volume ?? 1)).padStart(2, "0")}</span>
          <h3>${escapeHtml(String(obj.title_working ?? "巻プロット"))}</h3>
          <span class="nc-badge nc-badge--info">${episodes.length} episodes</span>
          ${schemaVersion >= 2 ? '<span class="nc-badge nc-badge--success">schema v2 (物語OS)</span>' : '<span class="nc-badge nc-badge--neutral">schema v1 (legacy)</span>'}
        </div>
        ${asKeyValueTable({
          "巻あらすじ": summary,
          "テーマ": obj.volume_theme,
          "推定ページ数": obj.estimated_pages,
        })}
        ${renderBelongsToArcs(obj.belongs_to_arcs)}
        ${renderChapters(chapters)}
        <section class="vp-episodes">
          <h3>beat list / エピソード一覧</h3>
          ${episodes.map(renderEpisode).join("") || '<div class="nc-empty">episode がありません。</div>'}
        </section>
        <details class="vplot-section">
          <summary>巻プロット raw</summary>
          <pre class="nc-code-block">${jsonHtml(plot)}</pre>
        </details>
      </section>
    </div>`;
}

function escapeAttr(value: unknown): string {
  return escapeHtml(String(value ?? ""));
}

/**
 * Edit mode: 巻全体 + 各 episode の theme/title + beats (label/summary/intensity/key_visual) を
 * inline で編集できる form。draft はクライアント側 state に保持し、保存ボタンで PUT する。
 * 編集対象は文言と数値のみ。新規 beat 追加・削除は AI で修正 or 全体再生成に委ねる。
 */
function renderEditForm(plot: unknown): string {
  const obj = asRecord(plot);
  const episodes = Array.isArray(obj.episodes) ? obj.episodes : [];
  const epForms = episodes
    .map((ep, epIdx) => {
      const epObj = asRecord(ep);
      const epNo = Number(epObj.episode_no ?? epIdx + 1);
      const beats = Array.isArray(epObj.beats) ? epObj.beats : [];
      const beatForms = beats
        .map((beat, beatIdx) => {
          const b = asRecord(beat);
          return `<div class="vp-edit-beat">
            <div class="vp-edit-beat__head">
              <span class="nc-code">#${escapeHtml(String(b.beat_idx ?? beatIdx))}</span>
              <input class="nc-field__input" data-vp-path="episodes.${epIdx}.beats.${beatIdx}.label" value="${escapeAttr(b.label)}" placeholder="label" style="max-width: 200px;">
            </div>
            <textarea class="nc-field__textarea" data-vp-path="episodes.${epIdx}.beats.${beatIdx}.summary" rows="2" placeholder="summary">${escapeHtml(String(b.summary ?? ""))}</textarea>
            <div class="vp-edit-row">
              <label>emotional_intensity</label>
              <input class="nc-field__input" type="number" min="0" max="1" step="0.05" data-vp-path="episodes.${epIdx}.beats.${beatIdx}.emotional_intensity" value="${escapeAttr(intensity(b.emotional_intensity))}">
            </div>
            <div class="vp-edit-row">
              <label>key_visual</label>
              <input class="nc-field__input" data-vp-path="episodes.${epIdx}.beats.${beatIdx}.key_visual" value="${escapeAttr(b.key_visual)}" placeholder="(任意)">
            </div>
          </div>`;
        })
        .join("");
      return `<section class="nc-card vp-edit-card">
        <h3 style="margin: 0;">ep${String(epNo).padStart(2, "0")}</h3>
        <div class="vp-edit-row">
          <label>title (working)</label>
          <input class="nc-field__input" data-vp-path="episodes.${epIdx}.title_working" value="${escapeAttr(epObj.title_working)}">
        </div>
        <div class="vp-edit-row">
          <label>テーマ</label>
          <input class="nc-field__input" data-vp-path="episodes.${epIdx}.theme" value="${escapeAttr(epObj.theme)}">
        </div>
        <div class="vp-edit-row">
          <label>cliffhanger_hook</label>
          <input class="nc-field__input" data-vp-path="episodes.${epIdx}.cliffhanger_hook" value="${escapeAttr(epObj.cliffhanger_hook)}">
        </div>
        ${beats.length > 0 ? `<div style="margin-top: var(--space-2);">beats</div><div class="vp-edit-form">${beatForms}</div>` : ""}
      </section>`;
    })
    .join("");
  return `<div class="vp-edit-form">
    <section class="nc-card vp-edit-card">
      <h3 style="margin: 0;">巻全体</h3>
      <div class="vp-edit-row">
        <label>title (working)</label>
        <input class="nc-field__input" data-vp-path="title_working" value="${escapeAttr(obj.title_working)}">
      </div>
      <div class="vp-edit-row">
        <label>volume_theme</label>
        <textarea class="nc-field__textarea" data-vp-path="volume_theme" rows="2">${escapeHtml(String(obj.volume_theme ?? ""))}</textarea>
      </div>
      <div class="vp-edit-row">
        <label>estimated_pages</label>
        <input class="nc-field__input" type="number" min="1" data-vp-path="estimated_pages" value="${escapeAttr(obj.estimated_pages)}">
      </div>
    </section>
    ${epForms}
  </div>`;
}

function renderModal(state: ViewState): string {
  if (!state.modalOpen) return "";
  const disabled = state.running ? " disabled" : "";
  return `
    <div class="nc-modal is-open" id="vplot-modal">
      <form class="nc-modal__card nc-modal__card--md vplot-modal-body" data-vplot-form="1">
        <div class="vplot-modal-head">
          <h3 class="vplot-modal-title">巻プロットを構築</h3>
          <span class="vplot-info">${escapeHtml(state.slug)}</span>
          <span class="vplot-spacer"></span>
          <button type="button" class="nc-button nc-button--ghost nc-button--sm" data-close-modal${disabled}>閉じる</button>
        </div>
        <label class="nc-field">
          <span class="nc-field__label">巻番号</span>
          <input class="nc-field__input" name="volume" type="number" min="1" step="1" value="${state.volume}" required>
        </label>
        <label class="nc-field">
          <span class="nc-field__label">企画書ファイル</span>
          <input class="nc-field__input" name="concept" required placeholder="data/manga/...json">
        </label>
        <div class="vplot-actions">
          <button type="submit" class="nc-button nc-button--primary"${disabled}>${state.running ? "起動中" : "起動"}</button>
        </div>
        <pre class="nc-code-block vplot-log">${escapeHtml(state.log.join("\n"))}</pre>
      </form>
    </div>`;
}

function render(container: HTMLElement, state: ViewState): void {
  const scope = `${state.slug} / v${String(state.volume).padStart(2, "0")}`;
  const dirty = state.editDraft !== null;
  const body = (() => {
    if (state.loading) return `<div class="nc-empty">読み込み中...</div>`;
    if (state.plot) {
      if (state.displayMode === "raw") return `<pre class="nc-code-block">${jsonHtml(state.plot.plot)}</pre>`;
      if (state.displayMode === "edit") {
        const source = state.editDraft ?? state.plot.plot;
        const saveBar = `<div class="vp-edit-save-bar">
          <button type="button" class="nc-button nc-button--primary nc-button--sm" data-vp-save ${state.saving || !dirty ? "disabled" : ""}>${state.saving ? "保存中..." : "変更を保存"}</button>
          <button type="button" class="nc-button nc-button--secondary nc-button--sm" data-vp-revert ${state.saving || !dirty ? "disabled" : ""}>変更を破棄</button>
          <span class="vp-edit-save-bar__hint">${dirty ? '<span class="vp-edit-dirty">未保存の変更があります</span>' : "編集なし"}</span>
        </div>`;
        return `${saveBar}${renderEditForm(source)}`;
      }
      return renderReader(state.plot.plot);
    }
    if (state.error) return `<div class="nc-empty">巻プロットは未作成です。「巻プロットを構築」ボタンから生成してください。</div>`;
    return `<div class="nc-empty">巻プロットは未作成です。「巻プロットを構築」ボタンから生成してください。</div>`;
  })();
  container.innerHTML = `
    <div class="vplot-view">
      <div class="nc-toolbar">
        <h2 class="nc-toolbar__title">巻プロット (巻あらすじ・章構成)</h2>
        <span class="vplot-info">${escapeHtml(scope)}</span>
        ${renderVolumeSwitcher(state)}
        <span class="vplot-spacer"></span>
        ${(() => {
          const adopted = state.adoptedPlot;
          const isAdopted = adopted?.chosen_proposal_id === "current";
          if (!state.plot) return "";
          if (isAdopted) {
            return `<span class="vp-adopt-badge" title="${escapeHtml(`採用日時: ${adopted?.chosen_at ?? ""}`)}">★ 採用中</span>`;
          }
          return `<button type="button" class="vp-adopt-btn"
            data-vp-adopt
            data-vp-proposal-id="current"
            ${state.adoptingPlot ? " disabled" : ""}>${state.adoptingPlot ? "採用中…" : "この案を採用"}</button>`;
        })()}
        ${renderDisplayMode(state.displayMode)}
        <button type="button" class="nc-button nc-button--primary" data-open-modal>巻プロットを構築 <span class="nc-layer-label__sub" style="margin-left:4px">L02b</span></button>
        <button type="button" class="nc-button nc-button--ghost nc-button--sm" data-open-ai-edit>AI で修正</button>
        <button type="button" class="nc-button nc-button--ghost" data-ai-edit-layer="L02b" title="巻プロット (L02b) を AI で修正">L02b を AI で修正</button>
      </div>
      ${body}
    </div>
    ${renderModal(state)}
    ${state.toast ? `<div class="nc-toast nc-toast--${state.toast.kind}">${escapeHtml(state.toast.message)}</div>` : ""}
  `;
}

async function refresh(state: ViewState, container: HTMLElement): Promise<void> {
  state.loading = true;
  state.error = null;
  render(container, state);
  try {
    const [plot, adoptedResult] = await Promise.all([
      apiGetVolumePlot(state.slug, state.volume),
      apiGetAdoptedVolumePlot(state.slug, state.volume).then(
        (value) => ({ ok: true as const, value }),
        () => ({ ok: false as const })
      ),
    ]);
    state.plot = plot;
    state.adoptedPlot = adoptedResult.ok ? adoptedResult.value : null;
  } catch (error) {
    state.plot = null;
    state.adoptedPlot = null;
    state.error = errorText(error);
  }
  state.loading = false;
  render(container, state);
}

function setToast(state: ViewState, container: HTMLElement, message: string, kind: NonNullable<ViewState["toast"]>["kind"]): void {
  state.toast = { message, kind };
  render(container, state);
  window.setTimeout(() => {
    if (state.toast?.message !== message) return;
    state.toast = null;
    render(container, state);
  }, 3000);
}

export function mountVolumePlotView(container: HTMLElement): () => void {
  ensureStyles();
  const controller = new AbortController();
  const app = store.state;
  const state: ViewState = {
    slug: app.currentSlug || app.defaultSlug,
    volume: 1,
    plot: null,
    displayMode: "reader",
    loading: false,
    error: null,
    modalOpen: false,
    running: false,
    log: [],
    toast: null,
    editDraft: null,
    saving: false,
    adoptedPlot: null,
    adoptingPlot: false,
    volumes: [],
    volumesLoading: false,
  };

  /**
   * 作品の巻一覧を取得し、切替ピル描画に使う。失敗は無視 (ピルが現在巻のみになる)。
   * 巻リストは作品単位なので refresh ごとに再取得せず、slug 変更時のみ呼ぶ。
   */
  const loadVolumes = async (): Promise<void> => {
    state.volumesLoading = true;
    render(container, state);
    try {
      const result = await apiGetVolumes(state.slug);
      state.volumes = result.volumes;
    } catch {
      state.volumes = [];
    }
    state.volumesLoading = false;
    render(container, state);
  };

  /**
   * data-vp-path で指定されたドット区切り path に基づき、editDraft の対応 field を更新する。
   * draft が空なら現在の plot をディープコピーして起点にする。
   */
  const setDraftValue = (pathStr: string, raw: string, isNumber: boolean): void => {
    if (state.editDraft === null && state.plot) {
      state.editDraft = JSON.parse(JSON.stringify(state.plot.plot));
    }
    if (!state.editDraft) return;
    const segments = pathStr.split(".").map((s) => (/^\d+$/.test(s) ? Number(s) : s));
    let cursor: any = state.editDraft;
    for (let i = 0; i < segments.length - 1; i++) {
      const key = segments[i];
      if (cursor[key] === undefined || cursor[key] === null) {
        const nextKey = segments[i + 1];
        cursor[key] = typeof nextKey === "number" ? [] : {};
      }
      cursor = cursor[key];
    }
    const lastKey = segments[segments.length - 1];
    if (isNumber) {
      const n = Number(raw);
      cursor[lastKey] = Number.isFinite(n) ? n : raw;
    } else {
      cursor[lastKey] = raw;
    }
  };
  let stream: { close: () => void } | null = null;

  void refresh(state, container);
  void loadVolumes();

  container.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest<HTMLButtonElement>("[data-open-ai-edit]")) {
      void openAiEditModal({ scope: state.slug ?? "_console" });
      return;
    }
    // Phase C-3: 「この案を採用」 button
    const adoptBtn = target.closest<HTMLButtonElement>("[data-vp-adopt]");
    if (adoptBtn) {
      const proposalId = adoptBtn.dataset.vpProposalId ?? "current";
      if (state.adoptingPlot) return;
      state.adoptingPlot = true;
      render(container, state);
      void apiPostAdoptedVolumePlot(state.slug, state.volume, { chosen_proposal_id: proposalId })
        .then((result) => {
          state.adoptedPlot = result.adopted;
          state.adoptingPlot = false;
          render(container, state);
          setToast(state, container, "巻プロットを採用しました", "success");
        })
        .catch((err) => {
          state.adoptingPlot = false;
          render(container, state);
          setToast(state, container, `採用に失敗: ${errorText(err)}`, "danger");
        });
      return;
    }
    const mode = target.closest<HTMLButtonElement>("[data-display-mode]")?.dataset.displayMode as DisplayMode | undefined;
    if (mode === "reader" || mode === "edit" || mode === "raw") {
      // 編集モードを離れる時、未保存変更があれば確認。
      if (state.displayMode === "edit" && mode !== "edit" && state.editDraft !== null) {
        if (!window.confirm("未保存の変更があります。破棄してモード切替えしますか？")) return;
        state.editDraft = null;
      }
      state.displayMode = mode;
      render(container, state);
      return;
    }
    if (target.closest<HTMLButtonElement>("[data-vp-revert]")) {
      state.editDraft = null;
      render(container, state);
      return;
    }
    if (target.closest<HTMLButtonElement>("[data-vp-save]")) {
      if (!state.editDraft) return;
      state.saving = true;
      render(container, state);
      void apiPutVolumePlot(state.slug, state.volume, state.editDraft)
        .then((result) => {
          state.plot = { slug: result.slug, volume: result.volume, plot: result.plot };
          state.editDraft = null;
          state.saving = false;
          setToast(state, container, "巻プロットを保存しました", "success");
        })
        .catch((error) => {
          state.saving = false;
          setToast(state, container, `保存に失敗: ${errorText(error)}`, "danger");
        });
      return;
    }
    const aiLayer = target.closest<HTMLButtonElement>("[data-ai-edit-layer]")?.dataset.aiEditLayer;
    if (aiLayer) {
      navigateToAiEdit(aiLayer, { slug: state.slug, episode: store.state.currentEpisode || 1, volume: state.volume });
      return;
    }
    if (target.closest("[data-open-modal]")) {
      state.modalOpen = true;
      state.log = [];
      render(container, state);
      return;
    }
    if (target.closest("[data-close-modal]") && !state.running) {
      state.modalOpen = false;
      state.log = [];
      render(container, state);
    }
  }, { signal: controller.signal });

  // 巻切替ドロップダウン: change で state.volume を更新して refresh
  const onVolumeChange = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    if (!("vpVolumeSelect" in target.dataset)) return;
    const nextVol = Number(target.value);
    if (!Number.isInteger(nextVol) || nextVol < 1 || nextVol === state.volume) return;
    if (state.displayMode === "edit" && state.editDraft !== null) {
      if (!window.confirm("未保存の変更があります。破棄して巻を切り替えますか？")) {
        // キャンセル時は select の値を元に戻す
        target.value = String(state.volume);
        return;
      }
      state.editDraft = null;
    }
    state.volume = nextVol;
    void refresh(state, container);
  };
  container.addEventListener("change", onVolumeChange, { signal: controller.signal });

  // edit モードの input change を draft へ反映。再 render はせず draft state のみ書き換える
  // (フォーカスが外れないように)。 dirty 表示は次回 render で更新される。
  const onFieldInput = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) return;
    const path = target.dataset.vpPath;
    if (!path) return;
    const isNumber = target instanceof HTMLInputElement && target.type === "number";
    setDraftValue(path, target.value, isNumber);
    // 保存ボタンの disabled 状態だけ更新したいので局所的に DOM を触る。
    const saveBtn = container.querySelector<HTMLButtonElement>("[data-vp-save]");
    const revertBtn = container.querySelector<HTMLButtonElement>("[data-vp-revert]");
    const hint = container.querySelector<HTMLElement>(".vp-edit-save-bar__hint");
    if (saveBtn) saveBtn.disabled = state.saving === true;
    if (revertBtn) revertBtn.disabled = state.saving === true;
    if (hint) hint.innerHTML = '<span class="vp-edit-dirty">未保存の変更があります</span>';
  };
  container.addEventListener("input", onFieldInput, { signal: controller.signal });
  container.addEventListener("change", onFieldInput, { signal: controller.signal });

  container.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.dataset.vplotForm) return;
    const data = new FormData(form);
    const volume = Number(data.get("volume"));
    const concept = String(data.get("concept") ?? "").trim();
    state.volume = Number.isInteger(volume) && volume > 0 ? volume : 1;
    state.running = true;
    state.log = ["starting L02b..."];
    render(container, state);
    void apiPostJob({ layer: "L02b", slug: state.slug, volume: state.volume, args: { "--concept": concept } })
      .then((job) => {
        stream = openJobStream(job.job_id, {
          onEvent: (entry: JobEvent) => {
            state.log.push(`[${entry.channel}] ${entry.line}`);
            render(container, state);
          },
          onDone: (info) => {
            state.log.push(`[system] done: ${info.state}`);
            state.running = false;
            stream?.close();
            stream = null;
            void refresh(state, container);
            // 新規構築後は巻一覧も再取得 (新規 v02 等が pills に出る)
            void loadVolumes();
          },
          onError: (error) => {
            state.running = false;
            setToast(state, container, error.message, "danger");
          },
        });
      })
      .catch((error) => {
        state.running = false;
        setToast(state, container, `起動に失敗: ${errorText(error)}`, "danger");
      });
  }, { signal: controller.signal });

  return () => {
    controller.abort();
    stream?.close();
    container.innerHTML = "";
  };
}
