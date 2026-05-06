/**
 * 漫画パイプライン: 横読み (page-flip) screen recording → per-page 画像抽出
 *
 * 既存の extract-from-video.ts は縦読み webtoon (連続スクロール) 用。
 * 本スクリプトは横読み (kindle / KDP / Bookwalker などのページめくり) 用。
 *
 * 抽出ロジック (plateau 検出):
 *   - 横読みでは「各ページに 0.3-2 秒留まる (安定 plateau)」+「めくり時に
 *     0.05-0.2 秒のスライド/フェード遷移」のリズムが繰り返される。
 *   - 高 fps (デフォルト 8) で全フレームを抽出 → dHash 計算
 *   - 連続して dHash が近いフレーム群を「plateau (= 1 ページ)」として束ね、
 *     plateau の中央フレームを 1 ページの代表として採用
 *   - 短すぎる plateau (デフォルト 2 フレーム未満) はめくり遷移とみなして破棄
 *
 * 想定ワークフロー:
 *   1. iPad/Mac で Kindle 等を開いて横読み漫画を表示
 *   2. QuickTime Player で画面録画開始
 *   3. 通常の読書速度 (1 ページあたり 1-3 秒) でめくる
 *   4. 録画停止 → mp4 保存
 *   5. 本スクリプトで mp4 → page_NNNN.jpg + manifest.json
 *
 * 使い方:
 *   npx tsx scripts/manga/extract-pages-from-recording.ts \
 *     --video=~/Downloads/level-gacha-vol1.mp4 \
 *     --name=level-gacha-vol1
 *
 *   オプション:
 *     --fps=10                高 fps 推奨 (めくり速度に応じて 6-12)
 *     --plateau-threshold=4   dHash ハミング距離。4-6 が経験則
 *     --plateau-min-frames=2  これ未満は遷移フレームとして破棄
 *     --start-sec=2           動画冒頭の表紙 dwell をスキップする時用
 *     --end-sec=60            奥付以降をカットする時用
 */

import "./_env";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  copyFileSync,
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
  plateauThreshold: number;
  plateauMinFrames: number;
  keepRaw: boolean;
  startSec?: number;
  endSec?: number;
  width: number;
};

function parseArgs(): CliArgs {
  const a: Partial<CliArgs> = {};
  for (const arg of process.argv.slice(2)) {
    if (arg === "--keep-raw") {
      a.keepRaw = true;
      continue;
    }
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
      case "plateau-threshold":
        a.plateauThreshold = Number(value);
        break;
      case "plateau-min-frames":
        a.plateauMinFrames = Number(value);
        break;
      case "start-sec":
        a.startSec = Number(value);
        break;
      case "end-sec":
        a.endSec = Number(value);
        break;
      case "width":
        a.width = Number(value);
        break;
    }
  }
  if (!a.video) throw new Error("--video=<mp4 path> が必要");
  if (!a.name) throw new Error("--name=<出力ディレクトリ名> が必要");
  return {
    video: a.video.replace(/^~/, os.homedir()),
    name: a.name,
    outDir: a.outDir ?? "data/manga/raw/page-flip",
    fps: a.fps ?? 8,
    plateauThreshold: a.plateauThreshold ?? 4,
    plateauMinFrames: a.plateauMinFrames ?? 2,
    keepRaw: a.keepRaw ?? false,
    startSec: a.startSec,
    endSec: a.endSec,
    width: a.width ?? 1366,
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
  if (args.endSec !== undefined) ffArgs.push("-to", String(args.endSec));
  ffArgs.push("-i", args.video);
  ffArgs.push("-vf", `fps=${args.fps},scale=${args.width}:-2`);
  ffArgs.push("-loglevel", "error", "-stats");
  ffArgs.push(path.join(rawDir, "raw_%05d.jpg"));
  console.log(`[extract] ffmpeg ${ffArgs.join(" ")}`);

  await new Promise<void>((resolve, reject) => {
    const proc = spawn("ffmpeg", ffArgs, {
      stdio: ["ignore", "inherit", "inherit"],
    });
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

type FrameInfo = {
  rawPath: string;
  hash: string;
  index: number;
};

/**
 * 連続フレーム間の dHash を比較して plateau (= 1 ページ滞在期間) を検出する。
 * plateau の中央フレームを「そのページの代表」として返す。
 */
function detectPlateaus(
  frames: FrameInfo[],
  threshold: number,
  minFrames: number,
): FrameInfo[] {
  if (frames.length === 0) return [];

  const plateaus: FrameInfo[][] = [];
  let current: FrameInfo[] = [frames[0]];

  for (let i = 1; i < frames.length; i++) {
    const prev = current[current.length - 1];
    const dist = hammingDistance(prev.hash, frames[i].hash);
    if (dist <= threshold) {
      current.push(frames[i]);
    } else {
      plateaus.push(current);
      current = [frames[i]];
    }
  }
  plateaus.push(current);

  // plateau のサイズフィルタ + 中央フレーム抽出
  const reps: FrameInfo[] = [];
  for (const p of plateaus) {
    if (p.length < minFrames) continue;
    reps.push(p[Math.floor(p.length / 2)]);
  }
  return reps;
}

async function main() {
  const args = parseArgs();
  console.log(
    `[extract-pages] video=${args.video} name=${args.name} fps=${args.fps} ` +
      `plateauThreshold=${args.plateauThreshold} plateauMinFrames=${args.plateauMinFrames}`,
  );
  ensureFfmpeg();
  if (!existsSync(args.video)) {
    throw new Error(`video file not found: ${args.video}`);
  }

  const outDir = path.join(args.outDir, args.name);
  mkdirSync(outDir, { recursive: true });

  const rawDir = path.join(outDir, "_raw_frames");
  if (existsSync(rawDir)) {
    execSync(`find "${rawDir}" -type f -delete`);
  } else {
    mkdirSync(rawDir, { recursive: true });
  }

  // 1) ffmpeg で高 fps 抽出
  console.log("[extract-pages] STEP 1/3: ffmpeg で全フレームを抽出");
  await extractRawFrames(args, rawDir);

  // 2) dHash 計算 + plateau 検出
  console.log("[extract-pages] STEP 2/3: dHash 計算と plateau 検出");
  const files = readdirSync(rawDir)
    .filter((f) => f.endsWith(".jpg"))
    .sort();
  console.log(`[extract-pages] raw frames: ${files.length}`);

  const frames: FrameInfo[] = [];
  let i = 0;
  for (const f of files) {
    const fullPath = path.join(rawDir, f);
    const buf = await readFile(fullPath);
    const h = await dhash(buf);
    frames.push({ rawPath: fullPath, hash: h, index: i });
    i++;
    if (i % 100 === 0) {
      console.log(`[extract-pages]   hashed ${i}/${files.length}`);
    }
  }

  const reps = detectPlateaus(
    frames,
    args.plateauThreshold,
    args.plateauMinFrames,
  );
  console.log(
    `[extract-pages] plateaus = ${reps.length} pages (raw ${files.length} frames)`,
  );

  // 3) 代表フレームを page_NNNN.jpg にコピー + manifest 生成
  console.log("[extract-pages] STEP 3/3: page 画像と manifest を出力");
  const manifest: {
    page: number;
    filename: string;
    hash: string;
    raw_index: number;
    timestamp_sec: number;
    width?: number;
    height?: number;
  }[] = [];

  let pageNum = 0;
  for (const r of reps) {
    pageNum++;
    const filename = `page_${String(pageNum).padStart(4, "0")}.jpg`;
    const dst = path.join(outDir, filename);
    copyFileSync(r.rawPath, dst);
    const meta = await sharp(r.rawPath).metadata();
    manifest.push({
      page: pageNum,
      filename,
      hash: r.hash,
      raw_index: r.index,
      timestamp_sec: r.index / args.fps,
      width: meta.width,
      height: meta.height,
    });
  }

  // 4) raw cleanup
  if (!args.keepRaw) {
    try {
      execSync(`find "${rawDir}" -type f -delete`);
      rmSync(rawDir, { recursive: false, force: true });
    } catch {
      /* ignore */
    }
  }

  const manifestPath = path.join(outDir, "manifest.json");
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        name: args.name,
        url: `video://${path.basename(args.video)}`,
        captured_at: new Date().toISOString(),
        source: "page-flip-recording",
        video_path: args.video,
        fps: args.fps,
        plateau_threshold: args.plateauThreshold,
        plateau_min_frames: args.plateauMinFrames,
        total_pages: pageNum,
        records: manifest,
      },
      null,
      2,
    ),
  );

  console.log("");
  console.log(`[extract-pages] DONE: pages=${pageNum} out=${outDir}`);
  console.log(`[extract-pages] manifest: ${manifestPath}`);
  console.log(
    `[extract-pages] 確認: open "${outDir}" or ls "${outDir}" | head -20`,
  );
}

main().catch((err) => {
  console.error("[extract-pages] FAILED:", err);
  process.exit(1);
});
