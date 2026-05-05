export function mountRevisionView(container: HTMLElement): () => void {
  container.innerHTML = `
    <div class="view-placeholder">
      <h2>Revision</h2>
      <p>Phase 2B で実装予定。現状は <a href="/legacy-revision">旧 revision UI</a> を参照してください。</p>
    </div>
  `;
  return () => {
    container.innerHTML = "";
  };
}
