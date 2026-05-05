export function mountLayersView(container: HTMLElement): () => void {
  // Phase 3 で spawn + SSE による layer 起動を実装する。
  container.innerHTML = `
    <div class="view-placeholder">
      <h2>生成 layer</h2>
      <p>Phase 3 で実装予定。</p>
    </div>
  `;
  return () => {
    container.innerHTML = "";
  };
}
