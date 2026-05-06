/**
 * Novelis Console (漫画 ops UI) の HTML shell。
 *
 * Phase 2A では CSS は inline のままにして、挙動だけ TS bundle へ移す。
 */
export function renderOpsConsoleShellHtml(): string {
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Novelis Console</title>
  <style>
    :root {
      color: #172033;
      background: #f6f7f9;
      font-family: -apple-system, BlinkMacSystemFont, "Hiragino Kaku Gothic ProN", sans-serif;
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: #f6f7f9; }
    .top {
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 0 20px;
      border-bottom: 1px solid #d9dee7;
      background: #ffffff;
    }
    .top-title { font-size: 15px; font-weight: 700; letter-spacing: 0; }
    .top-scope { color: #5e6a7f; font-size: 13px; white-space: nowrap; }
    .app {
      min-height: calc(100vh - 48px);
      display: grid;
      grid-template-columns: 240px minmax(0, 1fr);
    }
    #sidebar {
      width: 240px;
      border-right: 1px solid #d9dee7;
      background: #eef2f6;
      padding: 16px 12px;
    }
    #main {
      min-width: 0;
      padding: 24px;
      background: #f8fafc;
    }
    .scope-panel { display: grid; gap: 10px; margin-bottom: 18px; }
    .field { display: grid; gap: 5px; }
    .field label {
      color: #526076;
      font-size: 12px;
      font-weight: 700;
    }
    select {
      width: 100%;
      min-height: 34px;
      border: 1px solid #c7cfdb;
      border-radius: 6px;
      background: #ffffff;
      color: #172033;
      padding: 0 8px;
      font: inherit;
      font-size: 13px;
    }
    .scope-note {
      margin: 0;
      color: #6f7b8f;
      font-size: 12px;
      line-height: 1.5;
    }
    .menu { display: grid; gap: 6px; }
    .menu-button {
      width: 100%;
      min-height: 36px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: #243044;
      padding: 0 10px;
      text-align: left;
      font: inherit;
      font-size: 14px;
      cursor: pointer;
    }
    .menu-button:hover { background: #dfe6ef; }
    .menu-button.is-active {
      background: #1f5eff;
      color: #ffffff;
      font-weight: 700;
    }
    .view-placeholder {
      max-width: 720px;
      padding: 24px;
      border: 1px solid #dbe1ea;
      border-radius: 8px;
      background: #ffffff;
    }
    .view-placeholder h2 {
      margin: 0 0 10px;
      font-size: 22px;
      letter-spacing: 0;
    }
    .view-placeholder p {
      margin: 0;
      color: #526076;
      font-size: 14px;
      line-height: 1.7;
    }
    .view-placeholder a { color: #1f5eff; }
  </style>
</head>
<body>
  <header class="top">
    <div class="top-title">Novelis Console</div>
    <div class="top-scope" id="top-scope">loading...</div>
  </header>
  <div class="app">
    <aside id="sidebar"></aside>
    <main id="main"></main>
  </div>
  <script type="module" src="/_ops/main.js"></script>
</body>
</html>`;
}
