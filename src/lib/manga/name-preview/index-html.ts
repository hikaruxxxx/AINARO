/**
 * ネームプレビュー一覧 HTML 生成
 *
 * SVG を grid 表示 + キーボード操作で承認/却下 + reject 理由 select。
 * `serve-name.ts` 経由で開かれる前提だが、file:// で開いた場合も
 * 閲覧 (read-only) はできる。判定書き込みはサーバが必要。
 *
 * キーバインド:
 *   a       : approve (現在 focus 中のページ)
 *   r       : reject  (現在 focus 中のページ)
 *   p       : pending に戻す
 *   ArrowDown / j : 次ページへ移動
 *   ArrowUp / k   : 前ページへ移動
 *   1..6    : reject 理由を toggle
 */
import { REJECT_REASON_TO_RERUN, RERUN_FROM_ORDER, type NameManifest } from "./types";

/**
 * inline JS に JSON 値を埋め込むための helper。
 * `</script>` 終端を防ぐため `</` を `<` にエスケープする。
 * `escapeHtml` (HTML 属性向け) とは責務が違うので統合しない。
 */
function inlineJson(v: unknown): string {
  return JSON.stringify(v).replace(/</g, "\\u003c");
}

export function renderIndexHtml(manifest: NameManifest, slug: string, episode: number): string {
  const epStr = String(episode).padStart(2, "0");
  const episodeId = manifest.episode_id;
  const rerunMapJson = inlineJson(REJECT_REASON_TO_RERUN);
  const rerunOrderJson = inlineJson(RERUN_FROM_ORDER);
  const slugJson = inlineJson(slug);

  const pageCards = manifest.pages
    .map((p) => {
      // 14 ルール全部 (severity 別) を表示。findings 不在の旧 manifest は warnings へ fallback。
      const findings = p.audit_findings ?? [];
      const warningHtml = findings.length === 0
        ? (p.warnings.length === 0
          ? '<span class="ok">✓ 警告なし</span>'
          : p.warnings.slice(0, 5).map((w) => `<span class="warn sev-warn" title="${escapeHtml(w.kind)}">⚠ ${escapeHtml(w.message)}</span>`).join("<br>"))
        : findings.slice(0, 6).map((f) => {
          const icon = f.severity === "error" ? "✖" : f.severity === "warn" ? "⚠" : "ⓘ";
          return `<span class="warn sev-${escapeHtml(f.severity)}" title="${escapeHtml(f.rule)}">${icon} ${escapeHtml(f.message)}</span>`;
        }).join("<br>");
      return `<article class="page-card" data-page-no="${p.page_no}" tabindex="0" id="page-${p.page_no}">
  <header>
    <span class="page-no">P.${p.page_no}</span>
    <span class="page-role">[${escapeHtml(p.page_role)}]</span>
    <span class="panel-count">${p.panel_count}コマ</span>
    <span class="status status-pending" data-page-status="${p.page_no}">pending</span>
  </header>
  <div class="svg-wrap"><object data="${escapeHtml(p.svg_filename)}" type="image/svg+xml" aria-label="page ${p.page_no} preview"></object></div>
  <div class="warnings">${warningHtml}</div>
  <div class="reasons" data-page-reasons="${p.page_no}">
    <label><input type="checkbox" data-reason="story_problem"> [1] story</label>
    <label><input type="checkbox" data-reason="panel_problem"> [2] panel</label>
    <label><input type="checkbox" data-reason="layout_problem"> [3] layout</label>
    <label><input type="checkbox" data-reason="dialogue_problem"> [4] dialogue</label>
    <label><input type="checkbox" data-reason="continuity_problem"> [5] continuity</label>
    <label><input type="checkbox" data-reason="render_risk"> [6] render risk</label>
  </div>
  <textarea class="note" placeholder="(任意) note" data-page-note="${p.page_no}"></textarea>
</article>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>Name Preview — ${escapeHtml(slug)} ep${epStr}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; font-family: 'Hiragino Sans','Yu Gothic','Noto Sans JP',system-ui,sans-serif; background: #f3f4f6; color: #111; }
    header.top { position: sticky; top: 0; background: #1f2937; color: #fff; padding: 12px 24px; display: flex; gap: 24px; align-items: center; z-index: 10; }
    header.top h1 { margin: 0; font-size: 18px; font-weight: 700; }
    header.top .info { color: #9ca3af; font-size: 13px; }
    header.top .summary { margin-left: auto; font-size: 14px; }
    header.top .summary strong { font-weight: 700; }
    main { padding: 16px; display: grid; grid-template-columns: repeat(auto-fill, minmax(540px, 1fr)); gap: 16px; }
    article.page-card { background: #fff; border: 2px solid #e5e7eb; border-radius: 8px; padding: 12px; outline: none; transition: border-color .12s; }
    article.page-card:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.18); }
    article.page-card.approved { border-color: #16a34a; }
    article.page-card.rejected { border-color: #dc2626; }
    article.page-card header { display: flex; gap: 12px; align-items: center; padding-bottom: 8px; border-bottom: 1px solid #e5e7eb; margin-bottom: 8px; font-size: 14px; }
    .page-no { font-weight: 700; font-size: 16px; }
    .page-role { color: #6b7280; }
    .panel-count { color: #6b7280; margin-left: auto; }
    .status { padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 700; text-transform: uppercase; }
    .status-pending { background: #fef3c7; color: #92400e; }
    .status-approved { background: #d1fae5; color: #065f46; }
    .status-rejected { background: #fee2e2; color: #991b1b; }
    .svg-wrap { aspect-ratio: 1748 / 2480; background: #fafafa; border: 1px solid #e5e7eb; }
    .svg-wrap object { width: 100%; height: 100%; pointer-events: none; }
    .warnings { padding: 8px 0; font-size: 12px; line-height: 1.5; }
    .warnings .ok { color: #16a34a; }
    .warnings .warn { display: block; }
    .warnings .sev-error { color: #991b1b; font-weight: 600; }
    .warnings .sev-warn  { color: #b45309; }
    .warnings .sev-info  { color: #6b7280; }
    .reasons { display: flex; flex-wrap: wrap; gap: 8px 12px; padding: 6px 0; font-size: 12px; }
    .reasons label { display: flex; align-items: center; gap: 4px; cursor: pointer; }
    textarea.note { width: 100%; min-height: 36px; padding: 6px 8px; font-size: 12px; border: 1px solid #d1d5db; border-radius: 4px; font-family: inherit; resize: vertical; }
    .help-bar { position: fixed; bottom: 12px; right: 12px; background: rgba(31,41,55,0.95); color: #fff; padding: 10px 14px; border-radius: 8px; font-size: 12px; line-height: 1.6; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
    .help-bar code { background: rgba(255,255,255,0.15); padding: 1px 5px; border-radius: 3px; font-family: ui-monospace, monospace; }
  </style>
</head>
<body>
  <header class="top">
    <h1>Name Preview</h1>
    <span class="info">${escapeHtml(slug)} / ep${epStr} (${escapeHtml(episodeId)})</span>
    <span class="summary">approved <strong id="cnt-approved">0</strong> / rejected <strong id="cnt-rejected">0</strong> / pending <strong id="cnt-pending">${manifest.pages.length}</strong></span>
  </header>
  <main id="grid">
    ${pageCards}
  </main>
  <div class="help-bar">
    <code>a</code> approve <code>r</code> reject <code>p</code> pending<br>
    <code>↑/k</code> 前ページ <code>↓/j</code> 次ページ <code>1..6</code> reject 理由
  </div>
  <script>
  (function () {
    const slug = ${slugJson};
    const episode = ${episode};
    const REJECT_REASON_TO_RERUN = ${rerunMapJson};
    const RERUN_FROM_ORDER = ${rerunOrderJson};

    const cards = Array.from(document.querySelectorAll('article.page-card'));
    const cardByPage = new Map(cards.map(c => [Number(c.dataset.pageNo), c]));
    let focusedPageNo = cards[0] ? Number(cards[0].dataset.pageNo) : 1;

    const decisions = new Map(); // pageNo -> { status, reasons[], note, rerun_from }
    for (const c of cards) {
      const no = Number(c.dataset.pageNo);
      decisions.set(no, { status: 'pending', reasons: [], note: '', rerun_from: null });
    }

    function setFocus(no) {
      const card = cardByPage.get(no);
      if (!card) return;
      focusedPageNo = no;
      card.focus({ preventScroll: false });
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function reasonToRerun(reasons) {
      // 複数 reason 選択時は最も上流の layer。types.ts:deriveRerunFrom と同型。
      let best = null;
      for (const r of reasons) {
        const v = REJECT_REASON_TO_RERUN[r];
        if (!v) continue;
        if (best === null || RERUN_FROM_ORDER.indexOf(v) < RERUN_FROM_ORDER.indexOf(best)) {
          best = v;
        }
      }
      return best;
    }

    function refreshCard(no) {
      const card = cardByPage.get(no);
      const dec = decisions.get(no);
      const stEl = card.querySelector('[data-page-status="' + no + '"]');
      stEl.textContent = dec.status;
      stEl.className = 'status status-' + dec.status;
      card.classList.remove('approved', 'rejected');
      if (dec.status === 'approved') card.classList.add('approved');
      if (dec.status === 'rejected') card.classList.add('rejected');
    }

    function refreshSummary() {
      let a = 0, r = 0, p = 0;
      for (const d of decisions.values()) {
        if (d.status === 'approved') a++;
        else if (d.status === 'rejected') r++;
        else p++;
      }
      document.getElementById('cnt-approved').textContent = a;
      document.getElementById('cnt-rejected').textContent = r;
      document.getElementById('cnt-pending').textContent = p;
    }

    async function persist(no) {
      const dec = decisions.get(no);
      const card = cardByPage.get(no);
      const note = card.querySelector('[data-page-note="' + no + '"]').value;
      const reasons = Array.from(card.querySelectorAll('[data-page-reasons="' + no + '"] input:checked')).map(el => el.dataset.reason);
      dec.reasons = reasons;
      dec.note = note;
      dec.rerun_from = reasonToRerun(reasons);

      try {
        const res = await fetch('/api/name-approval', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug, episode, page_no: no,
            status: dec.status, reasons, rerun_from: dec.rerun_from, note,
          }),
        });
        if (!res.ok) {
          console.warn('persist failed', no, res.status);
        }
      } catch (e) {
        console.warn('persist error', e);
      }
    }

    function setStatus(no, status) {
      decisions.get(no).status = status;
      refreshCard(no);
      refreshSummary();
      persist(no);
    }

    cards.forEach(c => {
      c.addEventListener('focus', () => { focusedPageNo = Number(c.dataset.pageNo); });
      c.addEventListener('click', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        c.focus();
      });
      const no = Number(c.dataset.pageNo);
      c.querySelectorAll('[data-page-reasons="' + no + '"] input').forEach(inp => {
        inp.addEventListener('change', () => {
          if (decisions.get(no).status === 'pending') setStatus(no, 'rejected');
          else persist(no);
        });
      });
      c.querySelector('[data-page-note="' + no + '"]').addEventListener('change', () => persist(no));
    });

    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const no = focusedPageNo;
      if (!cardByPage.has(no)) return;
      if (e.key === 'a' || e.key === 'A') { setStatus(no, 'approved'); e.preventDefault(); }
      else if (e.key === 'r' || e.key === 'R') { setStatus(no, 'rejected'); e.preventDefault(); }
      else if (e.key === 'p' || e.key === 'P') { setStatus(no, 'pending'); e.preventDefault(); }
      else if (e.key === 'ArrowDown' || e.key === 'j') { setFocus(no + 1); e.preventDefault(); }
      else if (e.key === 'ArrowUp' || e.key === 'k') { setFocus(no - 1); e.preventDefault(); }
      else if (/^[1-6]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        const inp = cardByPage.get(no).querySelectorAll('[data-page-reasons="' + no + '"] input')[idx];
        if (inp) { inp.checked = !inp.checked; inp.dispatchEvent(new Event('change')); }
        e.preventDefault();
      }
    });

    // 初期ロード: 既存 name_approval.json を取得して反映
    (async () => {
      try {
        const res = await fetch('/api/name-approval?slug=' + encodeURIComponent(slug) + '&episode=' + episode);
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.pages) {
          for (const [k, v] of Object.entries(data.pages)) {
            const no = Number(k);
            if (!decisions.has(no)) continue;
            const d = decisions.get(no);
            d.status = v.status || 'pending';
            d.reasons = v.reasons || [];
            d.note = v.note || '';
            const card = cardByPage.get(no);
            for (const inp of card.querySelectorAll('[data-page-reasons="' + no + '"] input')) {
              inp.checked = (v.reasons || []).includes(inp.dataset.reason);
            }
            card.querySelector('[data-page-note="' + no + '"]').value = v.note || '';
            refreshCard(no);
          }
          refreshSummary();
        }
      } catch (e) {
        // server なしで開いた (file://) 場合: 無視
      }
    })();

    if (cards[0]) cards[0].focus();
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
