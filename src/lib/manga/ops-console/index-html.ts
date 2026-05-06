/**
 * Novelis Console (漫画 ops UI) の HTML shell。
 *
 * Wave 1B-1 では shell を共通 stylesheet へ移し、旧 view 用の最小 fallback だけ残す。
 */
export function renderOpsConsoleShellHtml(): string {
  const favicon =
    "data:image/svg+xml;utf8,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2016%2016'%3E%3Ctext%20x='8'%20y='13'%20text-anchor='middle'%20font-family='-apple-system,sans-serif'%20font-weight='700'%20font-size='13'%20fill='%232563eb'%3EN%3C/text%3E%3C/svg%3E";

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Novelis Console</title>
  <link rel="icon" type="image/svg+xml" href="${favicon}">
  <script>
    (function(){
      try {
        var t = localStorage.getItem("nc.theme") || "system";
        document.documentElement.dataset.theme = t;
      } catch(e) {
        document.documentElement.dataset.theme = "system";
      }
    })();
  </script>
  <link rel="stylesheet" href="/_ops/styles.css">
  <style>
    /* Wave 1B-2 までの過渡期: 旧 view 内の生 selector を残す */
    select {
      width: 100%;
      min-height: 34px;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-md);
      background: var(--surface-elevated);
      color: var(--text-primary);
      padding: 0 8px;
      font: inherit;
      font-size: var(--fs-base);
    }
    .menu { display: grid; gap: var(--space-1); }
    .menu-button {
      width: 100%;
      min-height: 36px;
      border: 0;
      border-radius: var(--radius-md);
      background: transparent;
      color: var(--text-primary);
      padding: 0 var(--space-2);
      text-align: left;
      font: inherit;
      font-size: var(--fs-md);
      cursor: pointer;
    }
    .menu-button:hover { background: var(--surface-sunken); }
    .menu-button.is-active {
      background: var(--color-primary);
      color: var(--color-primary-fg);
      font-weight: var(--fw-medium);
    }
  </style>
</head>
<body>
  <header class="nc-header">
    <span class="nc-header__brand">Novelis Console</span>
    <span class="nc-header__divider" aria-hidden="true"></span>
    <nav class="nc-breadcrumb nc-header__breadcrumb-slot" id="top-breadcrumb" aria-label="breadcrumb"></nav>
    <div class="nc-header__actions">
      <span id="nc-scope-switcher"></span>
      <span id="nc-restart-button"></span>
      <span class="nc-header__env" id="nc-env-badge"></span>
      <span id="nc-theme-toggle"></span>
    </div>
  </header>
  <div class="nc-app">
    <aside class="nc-sidebar" id="sidebar"></aside>
    <main class="nc-main" id="main"></main>
  </div>
  <script type="module" src="/_ops/main.js"></script>
</body>
</html>`;
}
