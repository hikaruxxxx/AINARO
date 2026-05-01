/**
 * 漫画パイプライン Phase 1 素材取得: ピッコマのビューアからの縦読み素材取得
 *
 * 使い方:
 *   npx tsx scripts/manga/ingest-piccoma.ts --url=https://piccoma.com/web/viewer/5523/321910
 *   npx tsx scripts/manga/ingest-piccoma.ts --product=5523 --episode=321910
 *   npx tsx scripts/manga/ingest-piccoma.ts --url=... --debug-dom  # DOM 構造の調査のみ
 *   npx tsx scripts/manga/ingest-piccoma.ts --url=... --max-scrolls=80 --reuse
 *
 * 流れ:
 *   1. /tmp/ainaro-kindle-profile (Kindleと共有) のクローンプロファイルで Chrome を CDP 起動
 *   2. ピッコマ viewer URL を開く（ログイン必須なら手動ログイン待機）
 *   3. --debug-dom: DOM 構造をダンプして終了（imgタグ・canvas・iframe 等の状況を出力）
 *   4. 通常モード: 人間ぽいランダム間隔で縦スクロール、img.src を収集
 *   5. 各 img を Referer 付き fetch でダウンロード（canvas のみで img なしの場合は viewport キャプチャにフォールバック）
 *
 * バン対策:
 *   - スクロール間隔は 1.5〜4.5 秒のランダム
 *   - navigator.webdriver を消す（自動化フラグの検知回避）
 *   - 1セッションあたり最大スクロール回数を制限
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
  productId: string;
  episodeId: string;
  outDir: string;
  profileCloneDir: string;
  reuseProfileClone: boolean;
  cdpPort: number;
  startWaitMs: number;
  maxScrolls: number;
  scrollPx: number;
  minDelayMs: number;
  maxDelayMs: number;
  debugDom: boolean;
};

function parseArgs(): CliArgs {
  const a: Partial<CliArgs> = {};
  let url: string | undefined;
  for (const arg of process.argv.slice(2)) {
    if (arg === "--reuse") a.reuseProfileClone = true;
    if (arg === "--debug-dom") a.debugDom = true;
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (!m) continue;
    const [, key, value] = m;
    switch (key) {
      case "url":
        url = value;
        break;
      case "product":
        a.productId = value;
        break;
      case "episode":
        a.episodeId = value;
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
      case "max-scrolls":
        a.maxScrolls = Number(value);
        break;
      case "scroll-px":
        a.scrollPx = Number(value);
        break;
      case "min-delay-ms":
        a.minDelayMs = Number(value);
        break;
      case "max-delay-ms":
        a.maxDelayMs = Number(value);
        break;
      case "reuse":
        a.reuseProfileClone = value === "true" || value === "1";
        break;
    }
  }
  if (url) {
    const m = url.match(/\/viewer\/(\d+)\/(\d+)/);
    if (m) {
      a.productId = a.productId ?? m[1];
      a.episodeId = a.episodeId ?? m[2];
    }
  }
  if (!a.productId || !a.episodeId) {
    throw new Error("--url=<viewer URL> または --product=<id> --episode=<id> が必要");
  }
  return {
    productId: a.productId,
    episodeId: a.episodeId,
    outDir: a.outDir ?? "data/manga/raw",
    profileCloneDir: a.profileCloneDir ?? "/tmp/ainaro-kindle-profile",
    reuseProfileClone: a.reuseProfileClone ?? true, // デフォルト再利用（Kindleログインを保つ）
    cdpPort: a.cdpPort ?? 9333,
    startWaitMs: a.startWaitMs ?? 5000,
    maxScrolls: a.maxScrolls ?? 80,
    scrollPx: a.scrollPx ?? 700,
    minDelayMs: a.minDelayMs ?? 1500,
    maxDelayMs: a.maxDelayMs ?? 4500,
    debugDom: a.debugDom ?? false,
  };
}

function cloneChromeProfile(targetUserDataDir: string, reuse: boolean): void {
  const srcRoot = `${process.env.HOME}/Library/Application Support/Google/Chrome`;
  const srcProfile = path.join(srcRoot, "Profile 8");

  if (existsSync(targetUserDataDir)) {
    if (reuse) {
      console.log(`[ingest-piccoma] reusing existing clone: ${targetUserDataDir}`);
      return;
    }
    console.log(`[ingest-piccoma] removing stale clone: ${targetUserDataDir}`);
    rmSync(targetUserDataDir, { recursive: true, force: true });
  }
  mkdirSync(targetUserDataDir, { recursive: true });
  const localStateSrc = path.join(srcRoot, "Local State");
  if (existsSync(localStateSrc)) {
    execSync(`cp "${localStateSrc}" "${targetUserDataDir}/Local State"`);
  }
  execSync(`touch "${targetUserDataDir}/First Run"`);
  console.log(`[ingest-piccoma] cloning Profile 8 -> ${targetUserDataDir}/Default`);
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

function launchSystemChrome(args: CliArgs, url: string): ChildProcess {
  const chromeBin = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const argv = [
    `--remote-debugging-port=${args.cdpPort}`,
    "--remote-allow-origins=*",
    `--user-data-dir=${args.profileCloneDir}`,
    "--profile-directory=Default",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-sync",
    url,
  ];
  console.log(`[ingest-piccoma] launching Chrome on CDP port ${args.cdpPort}...`);
  const proc = spawn(chromeBin, argv, {
    detached: false,
    stdio: ["ignore", "ignore", "ignore"],
  });
  proc.on("error", (err) => console.error(`[ingest-piccoma] chrome spawn error:`, err));
  return proc;
}

async function applyAntiDetection(page: Page): Promise<void> {
  // navigator.webdriver を消す（自動化検知の最低限の回避）
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
}

function humanDelay(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min));
}

async function dumpDom(page: Page): Promise<void> {
  console.log("[ingest-piccoma] === DOM DEBUG ===");
  const info = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll("img"));
    const canvases = Array.from(document.querySelectorAll("canvas"));
    const iframes = Array.from(document.querySelectorAll("iframe"));
    return {
      url: location.href,
      title: document.title,
      bodyHeight: document.body?.scrollHeight,
      windowH: window.innerHeight,
      imgCount: imgs.length,
      imgSamples: imgs.slice(0, 10).map((i) => ({
        src: i.currentSrc || i.src,
        w: i.naturalWidth,
        h: i.naturalHeight,
        alt: i.alt,
      })),
      canvasCount: canvases.length,
      canvasSamples: canvases.slice(0, 5).map((c) => ({
        w: c.width,
        h: c.height,
        clientW: c.clientWidth,
        clientH: c.clientHeight,
        cls: c.className,
      })),
      iframeCount: iframes.length,
      iframeSrcs: iframes.slice(0, 5).map((f) => f.src),
    };
  });
  console.log(JSON.stringify(info, null, 2));
  console.log("[ingest-piccoma] === END DOM DEBUG ===");
}

/**
 * ピッコマは漫画コマを canvas にレンダリングする（DRM相当の保護）。
 * `canvas.toDataURL()` は Tainted 例外で失敗するため、Playwright の locator.screenshot で
 * 要素単位に CDP の Page.captureScreenshot を使ってキャプチャする。
 *
 * lazy load 対応:
 *   - スクロールするごとに、ビューポート内に入った canvas を順次キャプチャ
 *   - canvas のドキュメント上絶対 Y 座標を順序キーにしてファイル名に反映
 *   - サイズが小さい canvas は UI 装飾とみなしてスキップ（720x1200 などの本コマのみ採用）
 */
async function scrollAndCaptureCanvases(
  page: Page,
  args: CliArgs,
  outDir: string,
): Promise<{ saved: number; reachedBottom: boolean }> {
  // ピッコマは canvas を 11 枚程度の windowing で使い回すため、
  // DOM index ではなく画像内容のハッシュでユニーク判定する
  const capturedHashes = new Set<string>();
  let saved = 0;
  let stuckStreak = 0; // scrollTop が動かなかった回数

  // viewer の実際のサイズを確認
  const viewerRect = await page.evaluate(() => {
    const c = document.querySelector("canvas") as HTMLCanvasElement | null;
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });

  for (let scrolls = 0; scrolls < args.maxScrolls; scrolls++) {
    // canvas を全取得し、ビューポート内 or 通過済みのものをキャプチャ
    const canvases = await page.locator("canvas").all();

    for (let i = 0; i < canvases.length; i++) {
      const handle = canvases[i];
      const meta = await handle
        .evaluate((el) => {
          const rect = (el as HTMLCanvasElement).getBoundingClientRect();
          return {
            width: (el as HTMLCanvasElement).width,
            height: (el as HTMLCanvasElement).height,
            top: Math.round(rect.top),
            visible: rect.bottom > 0 && rect.top < window.innerHeight,
            passed: rect.bottom < 0,
          };
        })
        .catch(() => null);
      if (!meta) continue;
      if (meta.width < 600 || meta.height < 800) continue;
      if (!meta.visible && !meta.passed) continue;

      // 画像内容を撮影 → ハッシュで重複検出（windowing 対応）
      try {
        const buf = await handle.screenshot({ type: "png" });
        const hash = crypto.createHash("sha1").update(buf).digest("hex");
        if (capturedHashes.has(hash)) continue;
        capturedHashes.add(hash);

        const filename = `${String(saved + 1).padStart(4, "0")}_${hash.slice(0, 8)}.png`;
        const fullPath = path.join(outDir, filename);
        await writeFile(fullPath, buf);
        saved++;
        console.log(
          `[ingest-piccoma] captured: idx=${i} ${meta.width}x${meta.height} top=${meta.top} -> ${filename}`,
        );
      } catch (e) {
        console.warn(`[ingest-piccoma] capture failed at idx=${i}: ${(e as Error).message}`);
      }
    }

    // キーボード ArrowDown で viewer を進める。webtoon の標準操作
    // フォーカスを body に当ててからキー押下
    await page.evaluate(() => document.body?.focus?.());

    const before = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll("canvas")).filter(
        (c) => (c as HTMLCanvasElement).width >= 600,
      );
      if (all.length === 0) return 0;
      const last = all[all.length - 1] as HTMLCanvasElement;
      return last.getBoundingClientRect().top;
    });

    // 1〜2 回ランダム連打（人間の操作っぽさ）
    const presses = 1 + Math.floor(Math.random() * 2);
    for (let p = 0; p < presses; p++) {
      await page.keyboard.press("ArrowDown");
      await page.waitForTimeout(150 + Math.floor(Math.random() * 200));
    }

    const after = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll("canvas")).filter(
        (c) => (c as HTMLCanvasElement).width >= 600,
      );
      if (all.length === 0) return 0;
      const last = all[all.length - 1] as HTMLCanvasElement;
      return last.getBoundingClientRect().top;
    });

    // 「最後コマの top」が変わらなければスクロールが効いてない
    if (Math.abs(after - before) < 5) {
      stuckStreak++;
    } else {
      stuckStreak = 0;
    }

    console.log(
      `[ingest-piccoma] scroll ${scrolls + 1}: canvases=${canvases.length} lastTop=${Math.round(before)}→${Math.round(after)} stuck=${stuckStreak} captured=${saved}`,
    );

    if (stuckStreak >= 4) {
      return { saved, reachedBottom: true };
    }

    const delay = humanDelay(args.minDelayMs, args.maxDelayMs);
    await page.waitForTimeout(delay);
  }
  return { saved, reachedBottom: false };
}

async function main() {
  const args = parseArgs();
  console.log(
    `[ingest-piccoma] product=${args.productId} episode=${args.episodeId} max-scrolls=${args.maxScrolls} debug-dom=${args.debugDom}`,
  );

  const outDir = path.join(args.outDir, "piccoma", args.productId, args.episodeId);
  mkdirSync(outDir, { recursive: true });

  cloneChromeProfile(args.profileCloneDir, args.reuseProfileClone);

  const url = `https://piccoma.com/web/viewer/${args.productId}/${args.episodeId}`;
  const chromeProc = launchSystemChrome(args, url);
  await waitForPort(args.cdpPort, 15000);
  console.log(`[ingest-piccoma] CDP port open, connecting via Playwright...`);
  const browser: Browser = await chromium.connectOverCDP(
    `http://127.0.0.1:${args.cdpPort}`,
  );

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
  process.on("SIGINT", () => cleanup().then(() => process.exit(130)));

  try {
    const ctx = browser.contexts()[0];
    if (!ctx) throw new Error("CDP接続後に context が取得できませんでした");

    let page: Page | undefined;
    const start = Date.now();
    while (Date.now() - start < 10000) {
      page = ctx.pages().find((p) => p.url().includes("piccoma.com"));
      if (page) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    if (!page) {
      page = ctx.pages()[0] ?? (await ctx.newPage());
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    }

    await applyAntiDetection(page);

    // ログイン画面 or 年齢確認画面に飛ばされていれば手動対応を待つ
    if (
      page.url().includes("/login") ||
      page.url().includes("/account") ||
      page.url().includes("/age_check")
    ) {
      console.log("");
      console.log("=========================================");
      console.log("[ingest-piccoma] ログイン or 確認が必要です");
      console.log("ブラウザで対応してください。viewer ページに到達すると自動で続行します。");
      console.log("(最大10分待機。Ctrl+Cで中断)");
      console.log("=========================================");
      console.log("");
      await page.waitForURL((u) => u.toString().includes("/web/viewer/"), {
        timeout: 10 * 60 * 1000,
      });
      console.log(`[ingest-piccoma] viewer到達: ${page.url()}`);
    }

    console.log(`[ingest-piccoma] viewer page: ${page.url()}`);
    console.log(`[ingest-piccoma] waiting for viewer init (${args.startWaitMs}ms)...`);
    await page.waitForTimeout(args.startWaitMs);

    await page.bringToFront();

    if (args.debugDom) {
      await dumpDom(page);
      console.log("[ingest-piccoma] debug-dom モードのため終了");
      return;
    }

    const { saved, reachedBottom } = await scrollAndCaptureCanvases(page, args, outDir);
    console.log(
      `[ingest-piccoma] DONE: saved=${saved} reached-bottom=${reachedBottom} out=${outDir}`,
    );
    if (saved === 0) {
      console.warn(
        "[ingest-piccoma] 1コマも保存できませんでした。--debug-dom で構造を確認してください",
      );
    }
  } finally {
    await cleanup();
  }
}

main().catch((err) => {
  console.error("[ingest-piccoma] FAILED:", err);
  process.exit(1);
});
