/**
 * 漫画パイプライン Phase 1 素材取得: 手動操作 + 自動キャプチャ
 *
 * 使い方:
 *   npx tsx scripts/manga/ingest-manual.ts --url=https://piccoma.com/web/viewer/5523/321910 --name=ore-level-1
 *   npx tsx scripts/manga/ingest-manual.ts --url=https://read.amazon.co.jp/manga/B0DPW3D8PJ --name=kindle-test
 *   npx tsx scripts/manga/ingest-manual.ts --url=... --name=... --debug-dom
 *
 * 設計:
 *   - スクリプトは入力イベントを送らない（bot 検知を回避）
 *   - 人間が普通にスクロールして読む間、スクリプトは canvas/img を継続監視
 *   - 新規ハッシュ要素を即座にバックグラウンド保存（windowing にも対応）
 *   - 一定時間新規が出なければ自動終了 or Ctrl+C で終了
 *
 * 流れ:
 *   1. /tmp/ainaro-kindle-profile クローンで Chrome を CDP 起動
 *   2. URL を開く（ログイン必要なら手動対応）
 *   3. 監視ループ開始: canvas (>= min-size) と img (>= min-size) を毎回スキャン
 *   4. 新 hash 要素を保存。idle が続けば終了
 */

import "./_env";
import { chromium, type Browser, type Page } from "playwright";
import { existsSync, mkdirSync, rmSync } from "fs";
import { writeFile } from "fs/promises";
import { execSync, spawn, type ChildProcess } from "child_process";
import path from "path";
import net from "net";
import crypto from "crypto";

type CliArgs = {
  url: string;
  name: string;
  outDir: string;
  profileCloneDir: string;
  reuseProfileClone: boolean;
  cdpPort: number;
  startWaitMs: number;
  maxMinutes: number;
  idleTimeoutSec: number;
  pollIntervalMs: number;
  minWidth: number;
  minHeight: number;
  debugDom: boolean;
  captureCanvas: boolean;
  captureImg: boolean;
};

function parseArgs(): CliArgs {
  const a: Partial<CliArgs> = {};
  for (const arg of process.argv.slice(2)) {
    if (arg === "--reuse") a.reuseProfileClone = true;
    if (arg === "--debug-dom") a.debugDom = true;
    if (arg === "--no-canvas") a.captureCanvas = false;
    if (arg === "--no-img") a.captureImg = false;
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (!m) continue;
    const [, key, value] = m;
    switch (key) {
      case "url":
        a.url = value;
        break;
      case "name":
        a.name = value;
        break;
      case "out":
        a.outDir = value;
        break;
      case "profile-clone-dir":
        a.profileCloneDir = value;
        break;
      case "cdp-port":
        a.cdpPort = Number(value);
        break;
      case "start-wait-ms":
        a.startWaitMs = Number(value);
        break;
      case "max-minutes":
        a.maxMinutes = Number(value);
        break;
      case "idle-timeout-sec":
        a.idleTimeoutSec = Number(value);
        break;
      case "poll-ms":
        a.pollIntervalMs = Number(value);
        break;
      case "min-width":
        a.minWidth = Number(value);
        break;
      case "min-height":
        a.minHeight = Number(value);
        break;
      case "reuse":
        a.reuseProfileClone = value === "true" || value === "1";
        break;
    }
  }
  if (!a.url) throw new Error("--url=<URL> が必要");
  if (!a.name) throw new Error("--name=<出力ディレクトリ名> が必要（例: ore-level-1）");
  return {
    url: a.url,
    name: a.name,
    outDir: a.outDir ?? "data/manga/raw/manual",
    profileCloneDir: a.profileCloneDir ?? "/tmp/ainaro-kindle-profile",
    reuseProfileClone: a.reuseProfileClone ?? true,
    cdpPort: a.cdpPort ?? 9333,
    startWaitMs: a.startWaitMs ?? 3000,
    maxMinutes: a.maxMinutes ?? 30,
    idleTimeoutSec: a.idleTimeoutSec ?? 60,
    pollIntervalMs: a.pollIntervalMs ?? 500,
    minWidth: a.minWidth ?? 600,
    minHeight: a.minHeight ?? 600,
    debugDom: a.debugDom ?? false,
    captureCanvas: a.captureCanvas ?? true,
    captureImg: a.captureImg ?? true,
  };
}

function cloneChromeProfile(targetUserDataDir: string, reuse: boolean): void {
  const srcRoot = `${process.env.HOME}/Library/Application Support/Google/Chrome`;
  const srcProfile = path.join(srcRoot, "Profile 8");
  if (existsSync(targetUserDataDir)) {
    if (reuse) {
      console.log(`[ingest-manual] reusing existing clone: ${targetUserDataDir}`);
      return;
    }
    console.log(`[ingest-manual] removing stale clone: ${targetUserDataDir}`);
    rmSync(targetUserDataDir, { recursive: true, force: true });
  }
  mkdirSync(targetUserDataDir, { recursive: true });
  const localStateSrc = path.join(srcRoot, "Local State");
  if (existsSync(localStateSrc)) {
    execSync(`cp "${localStateSrc}" "${targetUserDataDir}/Local State"`);
  }
  execSync(`touch "${targetUserDataDir}/First Run"`);
  console.log(`[ingest-manual] cloning Profile 8 -> ${targetUserDataDir}/Default`);
  execSync(`cp -R "${srcProfile}" "${targetUserDataDir}/Default"`);
  execSync(`find "${targetUserDataDir}" -name "Singleton*" -delete`);
}

function waitForPort(port: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tryConnect = () => {
      const sock = net.createConnection(port, "127.0.0.1");
      sock.once("connect", () => {
        sock.destroy();
        resolve();
      });
      sock.once("error", () => {
        sock.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`CDP port ${port} が ${timeoutMs}ms 以内に開きませんでした`));
          return;
        }
        setTimeout(tryConnect, 300);
      });
    };
    tryConnect();
  });
}

function launchSystemChrome(args: CliArgs): ChildProcess {
  const chromeBin = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const argv = [
    `--remote-debugging-port=${args.cdpPort}`,
    "--remote-allow-origins=*",
    `--user-data-dir=${args.profileCloneDir}`,
    "--profile-directory=Default",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-sync",
    args.url,
  ];
  console.log(`[ingest-manual] launching Chrome on CDP port ${args.cdpPort}...`);
  const proc = spawn(chromeBin, argv, {
    detached: false,
    stdio: ["ignore", "ignore", "ignore"],
  });
  proc.on("error", (err) => console.error(`[ingest-manual] chrome spawn error:`, err));
  return proc;
}

async function applyAntiDetection(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
}

/**
 * ブラウザ内に手動キャプチャ用のフローティングボタンとキーバインドを注入する。
 *
 * 通信路:
 *   ブラウザJS → console.log("__AINARO_CAPTURE__:<label>") → Playwright page.on('console')
 *   → Node 側で page.screenshot() を撮って保存
 *
 * ショートカット:
 *   - 右上の赤いボタンクリック
 *   - Cmd+E（Mac）／Ctrl+E（Win）— Chrome のデフォルトと衝突しないキー
 */
async function injectManualCapture(
  page: Page,
  outDir: string,
  counterRef: { value: number },
  manifest: CaptureRecord[],
): Promise<void> {
  // Node 側で console メッセージを受ける
  page.on("console", async (msg) => {
    const text = msg.text();
    if (!text.startsWith("__AINARO_CAPTURE__")) return;
    const label = text.split(":")[1] ?? "manual";
    try {
      const buf = await page.screenshot({ type: "png" });
      counterRef.value++;
      const ts = Date.now();
      const filename = `m_${String(counterRef.value).padStart(4, "0")}_${label}_${ts}.png`;
      await writeFile(path.join(outDir, filename), buf);
      manifest.push({
        type: "manual",
        filename,
        timestamp: ts,
      });
      console.log(`[ingest-manual] manual capture saved: ${filename}`);
    } catch (e) {
      console.warn(`[ingest-manual] manual capture failed: ${(e as Error).message}`);
    }
  });

  // 注入は addInitScript ではなく現在のページに直接（既にロード済みのため）
  await page.evaluate(() => {
    if (document.getElementById("__ainaro-save")) return;
    const btn = document.createElement("button");
    btn.id = "__ainaro-save";
    btn.textContent = "📸 SAVE";
    btn.style.cssText = [
      "position:fixed",
      "top:16px",
      "right:16px",
      "z-index:2147483647",
      "padding:10px 18px",
      "background:#e11d48",
      "color:white",
      "font-weight:700",
      "font-size:14px",
      "cursor:pointer",
      "border:2px solid white",
      "border-radius:10px",
      "box-shadow:0 4px 12px rgba(0,0,0,.35)",
      "font-family:-apple-system,sans-serif",
      "user-select:none",
    ].join(";");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const original = btn.textContent;
      btn.textContent = "✓ SAVED";
      console.log("__AINARO_CAPTURE__:button");
      setTimeout(() => {
        btn.textContent = original;
      }, 1200);
    });
    document.documentElement.appendChild(btn);

    // ホットキー: Cmd+E (Mac) / Ctrl+E (Win)
    window.addEventListener(
      "keydown",
      (e) => {
        if (
          (e.metaKey || e.ctrlKey) &&
          !e.shiftKey &&
          !e.altKey &&
          (e.key === "e" || e.key === "E")
        ) {
          e.preventDefault();
          e.stopPropagation();
          const b = document.getElementById("__ainaro-save");
          if (b) {
            b.textContent = "✓ SAVED";
            setTimeout(() => {
              b.textContent = "📸 SAVE";
            }, 1200);
          }
          console.log("__AINARO_CAPTURE__:hotkey");
        }
      },
      true,
    );
  });
}

async function dumpDom(page: Page): Promise<void> {
  const info = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll("img"));
    const canvases = Array.from(document.querySelectorAll("canvas"));
    return {
      url: location.href,
      title: document.title,
      bodyHeight: document.body?.scrollHeight,
      windowH: window.innerHeight,
      imgCount: imgs.length,
      bigImgs: imgs
        .filter((i) => i.naturalWidth >= 300 && i.naturalHeight >= 300)
        .slice(0, 8)
        .map((i) => ({
          src: i.currentSrc || i.src,
          w: i.naturalWidth,
          h: i.naturalHeight,
        })),
      canvasCount: canvases.length,
      bigCanvases: canvases
        .filter((c) => c.width >= 300 && c.height >= 300)
        .slice(0, 8)
        .map((c) => ({ w: c.width, h: c.height, clientW: c.clientWidth, clientH: c.clientHeight })),
    };
  });
  console.log("[ingest-manual] === DOM DEBUG ===");
  console.log(JSON.stringify(info, null, 2));
  console.log("[ingest-manual] === END DOM DEBUG ===");
}

type CaptureStats = {
  saved: number;
  skipped: number;
};

type CaptureRecord = {
  type: "canvas" | "img" | "manual";
  filename: string;
  hash?: string;
  timestamp: number;
  topAtCapture?: number;
  width?: number;
  height?: number;
  url?: string;
};

async function captureCanvasOnce(
  page: Page,
  seenHashes: Set<string>,
  outDir: string,
  args: CliArgs,
  counterRef: { value: number },
  manifest: CaptureRecord[],
): Promise<CaptureStats> {
  const stats: CaptureStats = { saved: 0, skipped: 0 };
  if (!args.captureCanvas) return stats;
  const canvases = await page.locator("canvas").all();
  for (let i = 0; i < canvases.length; i++) {
    const handle = canvases[i];
    const meta = await handle
      .evaluate((el) => {
        const c = el as HTMLCanvasElement;
        const rect = c.getBoundingClientRect();
        return {
          w: c.width,
          h: c.height,
          top: rect.top,
          rendered: rect.width > 0 && rect.height > 0,
        };
      })
      .catch(() => null);
    if (!meta || !meta.rendered) continue;
    if (meta.w < args.minWidth || meta.h < args.minHeight) continue;
    try {
      const buf = await handle.screenshot({ type: "png" });
      const hash = crypto.createHash("sha1").update(buf).digest("hex");
      if (seenHashes.has(hash)) {
        stats.skipped++;
        continue;
      }
      seenHashes.add(hash);
      counterRef.value++;
      const filename = `c_${String(counterRef.value).padStart(4, "0")}_${hash.slice(0, 8)}.png`;
      await writeFile(path.join(outDir, filename), buf);
      manifest.push({
        type: "canvas",
        filename,
        hash,
        timestamp: Date.now(),
        topAtCapture: Math.round(meta.top),
        width: meta.w,
        height: meta.h,
      });
      stats.saved++;
    } catch {
      // 描画タイミングで失敗することがある。次回拾う
    }
  }
  return stats;
}

async function captureImgOnce(
  page: Page,
  seenSrcs: Set<string>,
  outDir: string,
  args: CliArgs,
  counterRef: { value: number },
  manifest: CaptureRecord[],
): Promise<CaptureStats> {
  const stats: CaptureStats = { saved: 0, skipped: 0 };
  if (!args.captureImg) return stats;
  const imgs = await page.evaluate(
    (params: { minW: number; minH: number }) => {
      return Array.from(document.querySelectorAll("img"))
        .filter(
          (el) =>
            el.naturalWidth >= params.minW &&
            el.naturalHeight >= params.minH &&
            !!(el.currentSrc || el.src) &&
            !(el.currentSrc || el.src).startsWith("data:"),
        )
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            src: el.currentSrc || el.src,
            w: el.naturalWidth,
            h: el.naturalHeight,
            top: rect.top,
          };
        });
    },
    { minW: args.minWidth, minH: args.minHeight },
  );
  for (const img of imgs) {
    if (seenSrcs.has(img.src)) {
      stats.skipped++;
      continue;
    }
    seenSrcs.add(img.src);
    try {
      const resp = await page.context().request.get(img.src, {
        headers: { Referer: page.url() },
      });
      if (!resp.ok()) continue;
      const buf = await resp.body();
      counterRef.value++;
      const ext =
        (img.src.match(/\.(jpe?g|png|webp|gif)(?:\?|$)/i)?.[1] ?? "jpg").toLowerCase();
      const filename = `i_${String(counterRef.value).padStart(4, "0")}.${ext}`;
      await writeFile(path.join(outDir, filename), buf);
      manifest.push({
        type: "img",
        filename,
        timestamp: Date.now(),
        topAtCapture: Math.round(img.top),
        width: img.w,
        height: img.h,
        url: img.src,
      });
      stats.saved++;
    } catch {
      // ignore
    }
  }
  return stats;
}

async function main() {
  const args = parseArgs();
  console.log(
    `[ingest-manual] url=${args.url} name=${args.name} max-min=${args.maxMinutes} idle-sec=${args.idleTimeoutSec}`,
  );

  const outDir = path.join(args.outDir, args.name);
  mkdirSync(outDir, { recursive: true });

  cloneChromeProfile(args.profileCloneDir, args.reuseProfileClone);

  const chromeProc = launchSystemChrome(args);
  await waitForPort(args.cdpPort, 15000);
  console.log(`[ingest-manual] CDP port open, connecting via Playwright...`);
  const browser: Browser = await chromium.connectOverCDP(
    `http://127.0.0.1:${args.cdpPort}`,
  );

  // manifest と統計は main トップで宣言し、finally から参照可能にする
  const manifest: CaptureRecord[] = [];
  let totalCanvas = 0;
  let totalImg = 0;

  let cleanedUp = false;
  const cleanup = async () => {
    if (cleanedUp) return;
    cleanedUp = true;
    try {
      await browser.close();
    } catch {}
    try {
      chromeProc.kill("SIGTERM");
    } catch {}
  };
  const flushManifest = async () => {
    if (manifest.length === 0) return;
    const manifestPath = path.join(outDir, "manifest.json");
    try {
      await writeFile(
        manifestPath,
        JSON.stringify(
          {
            name: args.name,
            url: args.url,
            captured_at: new Date().toISOString(),
            records: manifest,
          },
          null,
          2,
        ),
      );
      console.log(`[ingest-manual] manifest: ${manifestPath}`);
    } catch (e) {
      console.warn(`[ingest-manual] manifest 書き出し失敗: ${(e as Error).message}`);
    }
  };
  process.on("SIGINT", async () => {
    await flushManifest();
    await cleanup();
    process.exit(130);
  });

  try {
    const ctx = browser.contexts()[0];
    if (!ctx) throw new Error("CDP接続後に context が取得できませんでした");

    let page: Page | undefined;
    const start0 = Date.now();
    while (Date.now() - start0 < 10000) {
      page = ctx.pages().find((p) => p.url() && !p.url().startsWith("about:"));
      if (page) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    if (!page) {
      page = ctx.pages()[0] ?? (await ctx.newPage());
      await page.goto(args.url, { waitUntil: "domcontentloaded", timeout: 60000 });
    }

    await applyAntiDetection(page);

    console.log(`[ingest-manual] page: ${page.url()}`);
    console.log(`[ingest-manual] waiting initial render (${args.startWaitMs}ms)...`);
    await page.waitForTimeout(args.startWaitMs);
    await page.bringToFront();

    if (args.debugDom) {
      await dumpDom(page);
      return;
    }

    const seenHashes = new Set<string>();
    const seenSrcs = new Set<string>();
    const counter = { value: 0 };

    // 手動キャプチャ UI を注入
    await injectManualCapture(page, outDir, counter, manifest);

    // ブラウザが閉じられたら正常終了として扱うフラグ
    let pageClosed = false;
    page.on("close", () => {
      pageClosed = true;
    });

    console.log("");
    console.log("=========================================");
    console.log("[ingest-manual] 監視を開始しました。");
    console.log("ブラウザで普通に漫画を読んでください。");
    console.log("  自動: 新しい canvas/img が画面に出るたびに保存");
    console.log("  手動: 右上の📸 SAVE ボタン or Cmd+E でその瞬間を保存");
    console.log(`保存先: ${outDir}`);
    console.log(`最大 ${args.maxMinutes} 分、または ${args.idleTimeoutSec} 秒新規がなければ自動終了。`);
    console.log("Ctrl+C で即時終了。");
    console.log("=========================================");
    console.log("");

    const startMs = Date.now();
    const maxMs = args.maxMinutes * 60_000;
    const idleMs = args.idleTimeoutSec * 1000;
    let lastCaptureMs = Date.now();
    let lastReportMs = Date.now();

    const isPageClosedError = (e: unknown): boolean => {
      const m = (e as Error)?.message ?? "";
      return (
        m.includes("Target page, context or browser has been closed") ||
        m.includes("Target closed") ||
        m.includes("has been closed")
      );
    };

    while (Date.now() - startMs < maxMs) {
      if (pageClosed) {
        console.log("[ingest-manual] ブラウザが閉じられました。正常終了します。");
        break;
      }
      try {
        const c = await captureCanvasOnce(
          page,
          seenHashes,
          outDir,
          args,
          counter,
          manifest,
        );
        const i = await captureImgOnce(
          page,
          seenSrcs,
          outDir,
          args,
          counter,
          manifest,
        );
        totalCanvas += c.saved;
        totalImg += i.saved;
        if (c.saved > 0 || i.saved > 0) {
          lastCaptureMs = Date.now();
          console.log(
            `[ingest-manual] +canvas=${c.saved} +img=${i.saved} (total: canvas=${totalCanvas} img=${totalImg})`,
          );
        } else if (Date.now() - lastReportMs > 10000) {
          const idleSec = Math.round((Date.now() - lastCaptureMs) / 1000);
          console.log(
            `[ingest-manual] 待機中... idle=${idleSec}s (canvas=${totalCanvas} img=${totalImg})`,
          );
          lastReportMs = Date.now();
        }
      } catch (e) {
        if (isPageClosedError(e)) {
          console.log(
            "[ingest-manual] ブラウザ/タブが閉じられました。正常終了します。",
          );
          break;
        }
        throw e;
      }

      if (Date.now() - lastCaptureMs > idleMs) {
        console.log(
          `[ingest-manual] ${args.idleTimeoutSec}秒間 新規がないため終了します`,
        );
        break;
      }
      await new Promise((r) => setTimeout(r, args.pollIntervalMs));
    }

  } finally {
    // manifest 書き出しと cleanup は必ず実行
    await flushManifest();
    await cleanup();
    console.log(
      `[ingest-manual] DONE: canvas=${totalCanvas} img=${totalImg} out=${outDir}`,
    );
    console.log(
      `[ingest-manual] 縦連結: npx tsx scripts/manga/stitch-manual.ts --dir=${outDir}`,
    );
  }
}

main().catch((err) => {
  console.error("[ingest-manual] FAILED:", err);
  process.exit(1);
});
