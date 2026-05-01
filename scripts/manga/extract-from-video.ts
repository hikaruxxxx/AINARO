/**
 * 漫画パイプライン: 動画ファイルから漫画コマフレームを抽出
 *
 * 想定ワークフロー:
 *   1. iPad/iPhone で Kindle や ピッコマ等を開いて漫画を読む
 *   2. Mac に Lightning/USB-C 接続
 *   3. QuickTime Player → 新規ムービー収録 → カメラを iPad に切替で画面録画
 *   4. iPad で漫画を最後までスクロール（普通の読書速度）
 *   5. 録画停止 → mp4 保存
 *   6. 本スクリプトで mp4 → コマ画像 + manifest.json
 *   7. scripts/manga/stitch-manual.ts で縦連結
 *
 * 抽出ロジック:
 *   - ffmpeg で一定 FPS で全フレームを PNG 抽出（一時ディレクトリ）
 *   - 連続フレーム間で dHash ハミング距離 ≤ 閾値なら「動いてない」とみなして捨てる
 *   - 残ったフレームを `c_NNNN_<hash>.png` に rename → stitch-manual.ts と互換
 *
 * 使い方:
 *   npx tsx scripts/manga/extract-from-video.ts --video=~/Movies/ore-level-1.mp4 --name=ore-level-vol-1
 *   npx tsx scripts/manga/extract-from-video.ts --video=... --name=... --fps=2 --dedup-threshold=4
 */

import "./_env";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  renameSync,
} from "fs";
import { readFile, writeFile } from "fs/promises";
import { execSync, spawn } from "child_process";
import path from "path";
import os from "os";
import sharp from "sharp";

type CliArgs = {
  video: string;
  name: string;
  outDir: string;
  fps: number;
  dedupThreshold: number;
  keepRaw: boolean;
  startSec?: number;
  endSec?: number;
  minWidth: number;
  minHeight: number;
};

function parseArgs(): CliArgs {
  const a: Partial<CliArgs> = {};
  for (const arg of process.argv.slice(2)) {
    if (arg === "--keep-raw") a.keepRaw = true;
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (!m) continue;
    const [, key, value] = m;
    switch (key) {
      case "video":
        a.video = value;
        break;
      case "name":
        a.name = value;
        break;
      case "out":
        a.outDir = value;
        break;
      case "fps":
        a.fps = Number(value);
        break;
      case "dedup-threshold":
        a.dedupThreshold = Number(value);
        break;
      case "start-sec":
        a.startSec = Number(value);
        break;
      case "end-sec":
        a.endSec = Number(value);
        break;
      case "min-width":
        a.minWidth = Number(value);
        break;
      case "min-height":
        a.minHeight = Number(value);
        break;
    }
  }
  if (!a.video) throw new Error("--video=<mp4 path> が必要");
  if (!a.name) throw new Error("--name=<出力ディレクトリ名> が必要");
  return {
    video: a.video.replace(/^~/, os.homedir()),
    name: a.name,
    outDir: a.outDir ?? "data/manga/raw/manual",
    // デフォルト fps=4: ユーザーがスクロール速度を意識せず読めるように高めに設定。
    // 1ページが 0.25 秒以上滞在すれば確実に拾える（人間の認知速度的に十分）。
    // 抽出フレーム数は増えるが、後段の dHash dedup で同等に収束する。
    fps: a.fps ?? 4,
    dedupThreshold: a.dedupThreshold ?? 4,
    keepRaw: a.keepRaw ?? false,
    startSec: a.startSec,
    endSec: a.endSec,
    minWidth: a.minWidth ?? 200,
    minHeight: a.minHeight ?? 200,
  };
}

function ensureFfmpeg(): void {
  try {
    execSync("ffmpeg -version", { stdio: "ignore" });
  } catch {
    throw new Error(
      "ffmpeg が見つかりません。`brew install ffmpeg` でインストールしてください",
    );
  }
}

async function extractRawFrames(args: CliArgs, rawDir: string): Promise<void> {
  const ffArgs = ["-y"];
  if (args.startSec !== undefined) ffArgs.push("-ss", String(args.startSec));
  if (args.endSec !== undefined)
    ffArgs.push("-to", String(args.endSec));
  ffArgs.push("-i", args.video);
  ffArgs.push("-vf", `fps=${args.fps}`);
  ffArgs.push("-loglevel", "error", "-stats");
  ffArgs.push(path.join(rawDir, "raw_%05d.png"));
  console.log(`[extract] ffmpeg ${ffArgs.join(" ")}`);

  await new Promise<void>((resolve, reject) => {
    const proc = spawn("ffmpeg", ffArgs, { stdio: ["ignore", "inherit", "inherit"] });
    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}`));
    });
  });
}

async function dhash(buf: Buffer): Promise<string> {
  const small = await sharp(buf)
    .resize({ width: 9, height: 8, fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer();
  let hash = "";
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const l = small[row * 9 + col];
      const r = small[row * 9 + col + 1];
      hash += l > r ? "1" : "0";
    }
  }
  return hash;
}

function hammingDistance(a: string, b: string): number {
  let d = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) if (a[i] !== b[i]) d++;
  return d;
}

type KeptFrame = {
  rawPath: string;
  hash: string;
  ts: number;
};

async function dedupFrames(
  rawDir: string,
  threshold: number,
): Promise<KeptFrame[]> {
  const files = readdirSync(rawDir)
    .filter((f) => f.endsWith(".png"))
    .sort();
  console.log(`[extract] raw frames: ${files.length}, dedup threshold=${threshold}`);

  const kept: KeptFrame[] = [];
  // 連続フレーム間で近すぎるものを捨てる + 既に採用した直近 N 個との距離もチェック
  // 直近 5 フレームと比較するくらいで充分（webtoon は単方向スクロールが大半）
  const recent: string[] = [];
  let i = 0;
  for (const f of files) {
    const fullPath = path.join(rawDir, f);
    const buf = await readFile(fullPath);
    const h = await dhash(buf);
    const dup = recent.some((r) => hammingDistance(r, h) <= threshold);
    if (!dup) {
      kept.push({ rawPath: fullPath, hash: h, ts: i });
      recent.push(h);
      if (recent.length > 5) recent.shift();
    }
    i++;
    if (i % 50 === 0) {
      console.log(`[extract] processed ${i}/${files.length} (kept=${kept.length})`);
    }
  }
  console.log(`[extract] dedup done: ${files.length} -> ${kept.length}`);
  return kept;
}

async function main() {
  const args = parseArgs();
  console.log(
    `[extract] video=${args.video} name=${args.name} fps=${args.fps} dedup=${args.dedupThreshold}`,
  );
  ensureFfmpeg();
  if (!existsSync(args.video)) {
    throw new Error(`video file not found: ${args.video}`);
  }

  const outDir = path.join(args.outDir, args.name);
  mkdirSync(outDir, { recursive: true });

  // 一時的にraw frameを置くディレクトリ
  const rawDir = path.join(outDir, "_raw_frames");
  if (existsSync(rawDir)) {
    // 古い rawDir をクリア（rm -rf 禁止のため find -delete）
    execSync(`find "${rawDir}" -type f -delete`);
  } else {
    mkdirSync(rawDir, { recursive: true });
  }

  // 1) ffmpeg で抽出
  await extractRawFrames(args, rawDir);

  // 2) dHash dedup
  const kept = await dedupFrames(rawDir, args.dedupThreshold);

  // 3) サイズフィルタ + 連番 rename + manifest 生成
  const manifest: {
    type: "canvas";
    filename: string;
    hash: string;
    timestamp: number;
    topAtCapture: number;
    width?: number;
    height?: number;
  }[] = [];

  let counter = 0;
  for (const k of kept) {
    const meta = await sharp(k.rawPath).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w < args.minWidth || h < args.minHeight) continue;

    counter++;
    const filename = `c_${String(counter).padStart(4, "0")}_${k.hash.slice(0, 8)}.png`;
    const dest = path.join(outDir, filename);
    renameSync(k.rawPath, dest);
    manifest.push({
      type: "canvas",
      filename,
      hash: k.hash,
      timestamp: k.ts,
      topAtCapture: 0,
      width: w,
      height: h,
    });
  }

  // 4) raw ディレクトリ片付け
  if (!args.keepRaw) {
    try {
      execSync(`find "${rawDir}" -type f -delete`);
      rmSync(rawDir, { recursive: false, force: true });
    } catch {}
  }

  // 5) manifest 書き出し
  const manifestPath = path.join(outDir, "manifest.json");
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        name: args.name,
        url: `video://${path.basename(args.video)}`,
        captured_at: new Date().toISOString(),
        source: "video",
        video_path: args.video,
        fps: args.fps,
        records: manifest,
      },
      null,
      2,
    ),
  );

  console.log("");
  console.log(`[extract] DONE: kept=${counter} out=${outDir}`);
  console.log(`[extract] manifest: ${manifestPath}`);
  console.log(
    `[extract] 縦連結: npx tsx scripts/manga/stitch-manual.ts --dir=${outDir}`,
  );
}

main().catch((err) => {
  console.error("[extract] FAILED:", err);
  process.exit(1);
});
