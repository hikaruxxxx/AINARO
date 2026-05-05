export function mountNameGateView(container: HTMLElement): () => void {
  container.innerHTML = `
    <div class="view-placeholder">
      <h2>ネーム gate</h2>
      <p>Phase 2B で実装予定。現状は <a href="/episodes/ep01/name/index.html">旧 UI</a> を参照してください。</p>
    </div>
  `;
  return () => {
    container.innerHTML = "";
  };
}
