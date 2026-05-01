/**
 * 漫画パイプライン Phase 1 素材取得: Kindle Cloud Reader からのページキャプチャ
 *
 * 使い方:
 *   npx tsx scripts/manga/ingest-kindle.ts --asin=B0DPW3D8PJ
 *   npx tsx scripts/manga/ingest-kindle.ts --url=https://read.amazon.co.jp/manga/B0DPW3D8PJ
 *   npx tsx scripts/manga/ingest-kindle.ts --asin=B0DPW3D8PJ --max-pages=50 --direction=ltr
 *
 * 流れ:
 *   1. Chrome の Profile 8（Amazon ログイン済み）を /tmp 配下にコピー
 *   2. Playwright で persistent context として起動
 *   3. https://read.amazon.co.jp/manga/<ASIN> を開く
 *   4. 漫画ビューアの読み込み完了を待つ
 *   5. viewport スクリーンショットを連番で保存
 *   6. キーボードでページめくり、ハッシュ一致が連続したら終了
 *
 * 注意:
 *   - 学習素材としての構造抽出を目的とする。スクショは data/manga/raw/<asin>/ 配下に保存
 *   - 抽出後は元画像の破棄を推奨（生成物に特定作品の痕跡を残さない方針）
 *   - 個人実験用。本番事業の学習データには合法ルートに切り替える
 */

import "./_env";
import { chromium, type Browser, type Page } from "playwright";
import { existsSync, mkdirSync, rmSync } from "fs";
import { execSync, spawn, type ChildProcess } from "child_process";
import path from "path";
import crypto from "crypto";
import net from "net";

type Direction = "rtl" | "ltr";

type CliArgs = {
  asin: string;
  maxPages: number;
  outDir: string;
  pageWaitMs: number;
  profileCloneDir: string;
  reuseProfileClone: boolean;
  direction: Direction;
  startWaitMs: number;
  cdpPort: number;
};

function parseArgs(): CliArgs {
  const a: Partial<CliArgs> = {};
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (!m) {
      // bool フラグ
      if (arg === "--reuse") a.reuseProfileClone = true;
      continue;
    }
    const [, key, value] = m;
    switch (key) {
      case "asin":
        a.asin = value;
        break;
      case "url": {
        const m2 = value.match(/\/manga\/([A-Z0-9]+)/);
        if (m2) a.asin = m2[1];
        break;
      }
      case "max-pages":
        a.maxPages = Number(value);
        break;
      case "out":
        a.outDir = value;
        break;
      case "page-wait-ms":
        a.pageWaitMs = Number(value);
        break;
      case "profile-clone-dir":
        a.profileCloneDir = value;
        break;
      case "direction":
        a.direction = value as Direction;
        break;
      case "start-wait-ms":
        a.startWaitMs = Number(value);
        break;
      case "reuse":
        a.reuseProfileClone = value === "true" || value === "1";
        break;
      case "cdp-port":
        a.cdpPort = Number(value);
        break;
    }
  }
  if (!a.asin) {
    throw new Error("--asin=<ASIN> または --url=<URL> が必要");
  }
  return {
    asin: a.asin,
    maxPages: a.maxPages ?? 600,
    outDir: a.outDir ?? "data/manga/raw",
    pageWaitMs: a.pageWaitMs ?? 900,
    profileCloneDir: a.profileCloneDir ?? "/tmp/ainaro-kindle-profile",
    reuseProfileClone: a.reuseProfileClone ?? false,
    direction: a.direction ?? "rtl", // 日本の漫画は右綴じ＝次ページは左キー
    startWaitMs: a.startWaitMs ?? 5000,
    cdpPort: a.cdpPort ?? 9333,
  };
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
  // メモリ feedback_browser_automation_cdp.md より:
  // - --password-store=basic --use-mock-keychain は付けない（Keychain依存httpOnly cookieが復号できなくなる）
  // - --remote-allow-origins=* は zsh で glob 展開されないようクォート（ここは spawn 配列渡しなので不要）
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
  console.log(`[ingest-kindle] launching Chrome on CDP port ${args.cdpPort}...`);
  const proc = spawn(chromeBin, argv, {
    detached: false,
    stdio: ["ignore", "ignore", "ignore"],
  });
  proc.on("error", (err) => {
    console.error(`[ingest-kindle] chrome spawn error:`, err);
  });
  return proc;
}

/**
 * Profile 8 を /tmp 配下に複製。
 * Chrome は --user-data-dir 内のサブフォルダ名を --profile-directory で参照するため、
 * ディレクトリ構造を Default 配下に合わせて配置する。
 */
function cloneChromeProfile(targetUserDataDir: string, reuse: boolean): void {
  const srcRoot = `${process.env.HOME}/Library/Application Support/Google/Chrome`;
  const srcProfile = path.join(srcRoot, "Profile 8");

  if (existsSync(targetUserDataDir)) {
    if (reuse) {
      console.log(`[ingest-kindle] reusing existing clone: ${targetUserDataDir}`);
      return;
    }
    console.log(`[ingest-kindle] removing stale clone: ${targetUserDataDir}`);
    rmSync(targetUserDataDir, { recursive: true, force: true });
  }

  mkdirSync(targetUserDataDir, { recursive: true });

  // Local State はトップレベルに必須（プロファイル一覧やKey storeを含む）
  const localStateSrc = path.join(srcRoot, "Local State");
  if (existsSync(localStateSrc)) {
    execSync(`cp "${localStateSrc}" "${targetUserDataDir}/Local State"`);
  }
  // First Run マーカー（任意）
  execSync(`touch "${targetUserDataDir}/First Run"`);

  console.log(`[ingest-kindle] cloning Profile 8 -> ${targetUserDataDir}/Default`);
  // Chrome は --profile-directory=Default をデフォルトで参照する。
  // クローン側でも Default として配置する方が args が単純になる。
  execSync(`cp -R "${srcProfile}" "${targetUserDataDir}/Default"`);
  execSync(`find "${targetUserDataDir}" -name "Singleton*" -delete`);
}

async function waitMangaViewerReady(page: Page, timeoutMs: number): Promise<void> {
  // 漫画ビューアは canvas で描画される。canvas が出現＋実画素を持つことを待つ。
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle").catch(() => {});

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ready = await page
      .evaluate(() => {
        const canvases = Array.from(document.querySelectorAll("canvas"));
        return canvases.some((c) => {
          const rect = c.getBoundingClientRect();
          return rect.width > 200 && rect.height > 200;
        });
      })
      .catch(() => false);
    if (ready) return;
    await page.waitForTimeout(500);
  }
  throw new Error("漫画ビューアの canvas が見つかりません。ログイン状態 or ASIN を確認してください");
}

function hashBuffer(buf: Buffer): string {
  return crypto.createHash("sha1").update(buf).digest("hex");
}

async function captureLoop(
  page: Page,
  args: CliArgs,
  outDir: string,
): Promise<{ pages: number; ended: "max" | "duplicate" }> {
  const nextKey = args.direction === "rtl" ? "ArrowLeft" : "ArrowRight";
  let lastHash = "";
  let dupStreak = 0;
  let i = 0;

  for (i = 0; i < args.maxPages; i++) {
    const buf = await page.screenshot({ type: "png", fullPage: false });
    const h = hashBuffer(buf);

    if (h === lastHash) {
      dupStreak++;
      console.log(`[ingest-kindle] page ${i + 1}: duplicate hash (streak=${dupStreak})`);
      if (dupStreak >= 2) {
        // 同じ画面が3連続 = 末尾到達
        console.log(`[ingest-kindle] reached end (duplicate streak)`);
        return { pages: i, ended: "duplicate" };
      }
    } else {
      dupStreak = 0;
      const filename = String(i + 1).padStart(4, "0") + ".png";
      const fullPath = path.join(outDir, filename);
      // 重複でない時だけ保存
      const fs = await import("fs/promises");
      await fs.writeFile(fullPath, buf);
      console.log(`[ingest-kindle] saved: ${filename} (${buf.length} bytes)`);
    }
    lastHash = h;

    await page.keyboard.press(nextKey);
    await page.waitForTimeout(args.pageWaitMs);
  }
  return { pages: i, ended: "max" };
}

async function main() {
  const args = parseArgs();
  console.log(
    `[ingest-kindle] asin=${args.asin} max=${args.maxPages} dir=${args.direction} reuse=${args.reuseProfileClone}`,
  );

  const outDir = path.join(args.outDir, args.asin);
  mkdirSync(outDir, { recursive: true });

  cloneChromeProfile(args.profileCloneDir, args.reuseProfileClone);

  const url = `https://read.amazon.co.jp/manga/${args.asin}`;
  const chromeProc = launchSystemChrome(args, url);

  // CDPポート開放待ち
  await waitForPort(args.cdpPort, 15000);
  console.log(`[ingest-kindle] CDP port open, connecting via Playwright...`);

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

    // 起動時 URL で開いたタブを取得（数秒待つ）
    let page: Page | undefined;
    const start = Date.now();
    while (Date.now() - start < 10000) {
      page = ctx.pages().find((p) => p.url().includes("amazon"));
      if (page) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    if (!page) {
      // フォールバック: 最初のタブ
      page = ctx.pages()[0] ?? (await ctx.newPage());
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    }

    // ログインに飛ばされていれば、ユーザーの手動ログインを待つ
    if (page.url().includes("/ap/signin") || page.url().includes("/ap/cvf")) {
      console.log("");
      console.log("=========================================");
      console.log("[ingest-kindle] 初回ログインが必要です");
      console.log("ブラウザでAmazonにログインしてください。");
      console.log("完了して漫画ビューアが開いたら、このスクリプトが自動で続行します。");
      console.log("(最大10分待機。Ctrl+Cで中断)");
      console.log("=========================================");
      console.log("");
      await page.waitForURL(
        (u) => {
          const s = u.toString();
          return s.includes("/manga/") && !s.includes("/ap/");
        },
        { timeout: 10 * 60 * 1000 },
      );
      console.log(`[ingest-kindle] ログイン完了を検知: ${page.url()}`);
    }

    console.log(`[ingest-kindle] viewer page: ${page.url()}`);
    console.log(`[ingest-kindle] waiting for viewer init (${args.startWaitMs}ms)...`);
    await page.waitForTimeout(args.startWaitMs);
    await waitMangaViewerReady(page, 30000);
    console.log(`[ingest-kindle] viewer ready, starting capture...`);

    // ビューアにフォーカス
    await page.bringToFront();
    await page.evaluate(() => {
      const c = document.querySelector("canvas") as HTMLCanvasElement | null;
      if (c) (c as unknown as HTMLElement).focus?.();
      document.body?.focus?.();
    });

    const result = await captureLoop(page, args, outDir);
    console.log(
      `[ingest-kindle] DONE: pages=${result.pages} ended=${result.ended} out=${outDir}`,
    );
  } finally {
    await cleanup();
  }
}

main().catch((err) => {
  console.error("[ingest-kindle] FAILED:", err);
  process.exit(1);
});
