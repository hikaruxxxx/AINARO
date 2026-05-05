export function mountWorksView(container: HTMLElement): () => void {
  // Phase 3 以降で work/episode 横断操作を解禁する。
  container.innerHTML = `
    <div class="view-placeholder">
      <h2>作品管理</h2>
      <p>Phase 3 以降で実装予定。</p>
    </div>
  `;
  return () => {
    container.innerHTML = "";
  };
}
