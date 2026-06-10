/**
 * Console 再起動ボタン
 *
 * ヘッダー右に配置。クリック → 確認モーダル → POST /api/restart →
 * overlay 表示 + /api/health を 500ms 毎にポーリング → 200 復活で location.reload()。
 *
 * 用途:
 *   - server 側コード変更を反映したいとき (bundle 再ビルドは起動時に走る)
 *   - process が変な状態 (ジョブが残留 etc) になったときの最後の手段
 *
 * 永続化された scope (.console-scope.json) は再起動後も維持されるので、
 * 同じ作品+話で再開できる。
 */
import { apiPostRestart } from "./lib/api";

const STYLES = `
.nc-restart-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.8);
  display: flex; align-items: center; justify-content: center;
  flex-direction: column; gap: 16px;
  color: white;
  z-index: 2000;
  font-size: var(--fs-lg);
}
.nc-restart-overlay__spinner {
  width: 48px; height: 48px;
  border: 4px solid rgba(255,255,255,0.2);
  border-top-color: white;
  border-radius: 50%;
  animation: nc-restart-spin 0.8s linear infinite;
}
@keyframes nc-restart-spin { to { transform: rotate(360deg); } }
.nc-restart-overlay__hint { font-size: var(--fs-sm); color: rgba(255,255,255,0.7); }
`;

function ensureStyles(): void {
  if (document.getElementById("nc-restart-styles")) return;
  const style = document.createElement("style");
  style.id = "nc-restart-styles";
  style.textContent = STYLES;
  document.head.appendChild(style);
}

async function pollHealth(maxWaitMs = 30000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      if (res.ok) return true;
    } catch {
      // network error = まだ落ちている / 起動途中。継続。
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function performRestart(): Promise<void> {
  ensureStyles();
  const overlay = document.createElement("div");
  overlay.className = "nc-restart-overlay";
  overlay.innerHTML = `
    <div class="nc-restart-overlay__spinner"></div>
    <div>Console を再起動中…</div>
    <div class="nc-restart-overlay__hint">5-10 秒で自動的に再読込されます (port 5174 開放待ち + bundle 再ビルド)</div>
  `;
  document.body.appendChild(overlay);

  try {
    await apiPostRestart();
  } catch (e) {
    overlay.remove();
    alert(`再起動の起動に失敗: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }

  // 旧 process が exit するまで待つ余裕を入れる (server は 200ms 後に exit)。
  await new Promise((r) => setTimeout(r, 1000));

  const back = await pollHealth(30000);
  if (back) {
    location.reload();
  } else {
    overlay.innerHTML = `
      <div style="color: #ef4444; font-weight: 600;">再起動に失敗 (30秒以内に health が返らない)</div>
      <div class="nc-restart-overlay__hint">ターミナルで <code>npm run console</code> を手動で起動し直してください</div>
      <button type="button" class="nc-button nc-button--primary" id="nc-restart-dismiss">閉じる</button>
    `;
    overlay.querySelector("#nc-restart-dismiss")?.addEventListener("click", () => overlay.remove());
  }
}

export function mountRestartButton(root: HTMLElement): () => void {
  const render = (): void => {
    root.innerHTML = `<button type="button" class="nc-button nc-button--ghost nc-button--sm" data-role="restart" title="Console を再起動 (scope 維持)">↻ 再起動</button>`;
  };

  const handler = async (event: Event): Promise<void> => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.closest('[data-role="restart"]')) return;
    if (!confirm("Console を再起動しますか?\n\n進行中のジョブがある場合は中断されます。\nscope (作品+話) は保持されます。")) {
      return;
    }
    await performRestart();
  };

  render();
  root.addEventListener("click", handler);

  return () => {
    root.removeEventListener("click", handler);
    root.innerHTML = "";
  };
}
