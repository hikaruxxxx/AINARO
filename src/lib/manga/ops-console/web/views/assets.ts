export function mountAssetsView(container: HTMLElement): () => void {
  // Phase 4 でアセット閲覧の中身を実装する。
  container.innerHTML = `
    <div class="view-placeholder">
      <h2>アセット</h2>
      <p>Phase 4 で実装予定。</p>
    </div>
  `;
  return () => {
    container.innerHTML = "";
  };
}
