/**
 * 漫画パイプライン: 横読み漫画ページ正規化
 *
 * extract-from-video.ts の出力（c_NNNN_*.png のフレーム連番）を入力として、
 * 横読み漫画の学習素材として使える状態に正規化する。
 *
 * 処理:
 *   1. 黒帯/白帯の自動トリミング（iPad 表示の余白除去）
 *   2. 任意のクロップ（iPad UI 領域がある場合）
 *   3. 見開き2ページ→左右分割（横長フレームの場合）
 *   4. カラー判定で扉絵/表紙を別キューに振り分け
 *   5. 共通幅にリサイズ → 学習素材としての解像度を統一
 *
 * 使い方:
 *   npx tsx scripts/manga/normalize-pages.ts --dir=data/manga/raw/manual/kindle-test-1
 *   npx tsx scripts/manga/normalize-pages.ts --dir=... --target-width=1500 --right-to-left
 *   npx tsx scripts/manga/normalize-pages.ts --dir=... --no-split  # 1ページ表示モードの動画
 *
 * 出力:
 *   <dir>/pages/page_NNNN.png        本文ページ（白黒）
 *   <dir>/pages_color/color_NNNN.png 扉絵/カラーページ（別管理）
 *   <dir>/manifest.json              records.normalized に追記
 */

import "./_env";
import { readdirSync, mkdirSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";

type CliArgs = {
  dir: string;
  outName: string;
  cropLeft: number;
  cropRight: number;
  cropTop: number;
  cropBottom: number;
  autoTrim: boolean;
  trimThreshold: number;
  splitSpread: boolean;
  splitAspectThreshold: number;
  rightToLeft: boolean;
  separateColor: boolean;
  colorDeltaThreshold: number;
  targetWidth: number;
  noResize: boolean;
};

function parseArgs(): CliArgs {
  const a: Partial<CliArgs> = {};
  for (const arg of process.argv.slice(2)) {
    if (arg === "--no-trim") a.autoTrim = false;
    if (arg === "--no-split") a.splitSpread = false;
    if (arg === "--no-rtl") a.rightToLeft = false;
    if (arg === "--right-to-left") a.rightToLeft = true;
    if (arg === "--no-separate-color") a.separateColor = false;
    if (arg === "--no-resize") a.noResize = true;
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (!m) continue;
    const [, key, value] = m;
    const num = (v: string) => Number(v);
    switch (key) {
      case "dir":
        a.dir = value;
        break;
      case "out-name":
        a.outName = value;
        break;
      case "crop-left":
        a.cropLeft = num(value);
        break;
      case "crop-right":
        a.cropRight = num(value);
        break;
      case "crop-top":
        a.cropTop = num(value);
        break;
      case "crop-bottom":
        a.cropBottom = num(value);
        break;
      case "trim-threshold":
        a.trimThreshold = num(value);
        break;
      case "split-aspect-threshold":
        a.splitAspectThreshold = num(value);
        break;
      case "color-delta-threshold":
        a.colorDeltaThreshold = num(value);
        break;
      case "target-width":
        a.targetWidth = num(value);
        break;
    }
  }
  if (!a.dir) throw new Error("--dir=<extract出力ディレクトリ> が必要");
  return {
    dir: a.dir,
    outName: a.outName ?? "page",
    cropLeft: a.cropLeft ?? 0,
    cropRight: a.cropRight ?? 0,
    cropTop: a.cropTop ?? 0,
    cropBottom: a.cropBottom ?? 0,
    autoTrim: a.autoTrim ?? true,
    trimThreshold: a.trimThreshold ?? 10,
    splitSpread: a.splitSpread ?? true,
    // アスペクト比 width/height がこの値以上なら「見開き2ページ」と判定
    splitAspectThreshold: a.splitAspectThreshold ?? 1.2,
    // 日本漫画は右綴じ。見開きの右側ページを先に読む
    rightToLeft: a.rightToLeft ?? true,
    separateColor: a.separateColor ?? true,
    // RGBチャネル平均値の最大差。これ超えたらカラーと判定（白黒は3ch平均が概ね一致）
    colorDeltaThreshold: a.colorDeltaThreshold ?? 8,
    targetWidth: a.targetWidth ?? 1500,
    noResize: a.noResize ?? false,
  };
}

/**
 * RGB チャネル平均値の最大差からカラー度を推定。
 * 白黒/グレースケール画像はR/G/Bチャネルの平均がほぼ一致する。
 * カラー画像はチャネルごとの平均が大きくズレる。
 */
async function detectColor(buf: Buffer, threshold: number): Promise<boolean> {
  const stats = await sharp(buf).stats();
  if (stats.channels.length < 3) return false;
  const [r, g, b] = stats.channels;
  const rgDelta = Math.abs(r.mean - g.mean);
  const gbDelta = Math.abs(g.mean - b.mean);
  const rbDelta = Math.abs(r.mean - b.mean);
  const maxDelta = Math.max(rgDelta, gbDelta, rbDelta);
  return maxDelta > threshold;
}

type NormalizedRecord = {
  type: "page" | "color_page";
  filename: string;
  source: string;
  is_color: boolean;
  width: number;
  height: number;
  was_split: boolean;
  split_side?: "left" | "right";
};

async function main() {
  const args = parseArgs();
  console.log(
    `[normalize] dir=${args.dir} split=${args.splitSpread} rtl=${args.rightToLeft} target-width=${args.targetWidth}`,
  );

  const pagesDir = path.join(args.dir, "pages");
  const colorDir = path.join(args.dir, "pages_color");
  mkdirSync(pagesDir, { recursive: true });
  if (args.separateColor) mkdirSync(colorDir, { recursive: true });

  // c_NNNN_*.png のフレーム連番を入力に
  const sourceFiles = readdirSync(args.dir)
    .filter((f) => /^c_\d{4}_/.test(f))
    .sort();
  console.log(`[normalize] sources: ${sourceFiles.length}`);

  let pageCounter = 0;
  let colorCounter = 0;
  const records: NormalizedRecord[] = [];

  for (const sourceFile of sourceFiles) {
    const srcPath = path.join(args.dir, sourceFile);
    const srcBuf = await readFile(srcPath);

    try {
      // 1. trim 自動
      let pipeline = sharp(srcBuf);
      if (args.autoTrim) {
        pipeline = pipeline.trim({ threshold: args.trimThreshold });
      }

      // 2. 任意の手動クロップ（追加マージン除去）
      if (
        args.cropLeft ||
        args.cropRight ||
        args.cropTop ||
        args.cropBottom
      ) {
        const trimmedBuf = await pipeline.toBuffer();
        const m = await sharp(trimmedBuf).metadata();
        const w = (m.width ?? 0) - args.cropLeft - args.cropRight;
        const h = (m.height ?? 0) - args.cropTop - args.cropBottom;
        if (w > 0 && h > 0) {
          pipeline = sharp(trimmedBuf).extract({
            left: args.cropLeft,
            top: args.cropTop,
            width: w,
            height: h,
          });
        }
      }
      const trimmedBuf = await pipeline.toBuffer();
      const meta = await sharp(trimmedBuf).metadata();
      const cw = meta.width ?? 0;
      const ch = meta.height ?? 0;
      if (cw < 100 || ch < 100) {
        console.warn(`[normalize] skip too-small ${sourceFile} (${cw}x${ch})`);
        continue;
      }

      // 3. カラー判定
      const isColor = await detectColor(trimmedBuf, args.colorDeltaThreshold);

      // 4. 見開き判定 + 左右分割
      const aspect = cw / ch;
      const shouldSplit =
        args.splitSpread && aspect >= args.splitAspectThreshold;

      type PiecePlan = {
        buf: Buffer;
        wasSplit: boolean;
        side?: "left" | "right";
      };
      const pieces: PiecePlan[] = [];

      if (shouldSplit) {
        const half = Math.floor(cw / 2);
        const leftBuf = await sharp(trimmedBuf)
          .extract({ left: 0, top: 0, width: half, height: ch })
          .toBuffer();
        const rightBuf = await sharp(trimmedBuf)
          .extract({ left: half, top: 0, width: cw - half, height: ch })
          .toBuffer();
        // 日本漫画(右綴じ): 右ページ→左ページの順
        if (args.rightToLeft) {
          pieces.push({ buf: rightBuf, wasSplit: true, side: "right" });
          pieces.push({ buf: leftBuf, wasSplit: true, side: "left" });
        } else {
          pieces.push({ buf: leftBuf, wasSplit: true, side: "left" });
          pieces.push({ buf: rightBuf, wasSplit: true, side: "right" });
        }
      } else {
        pieces.push({ buf: trimmedBuf, wasSplit: false });
      }

      // 5. 各ピースを保存
      for (const piece of pieces) {
        let finalBuf = piece.buf;
        if (!args.noResize) {
          const m = await sharp(piece.buf).metadata();
          if ((m.width ?? 0) > args.targetWidth) {
            finalBuf = await sharp(piece.buf)
              .resize({ width: args.targetWidth, withoutEnlargement: true })
              .png({ compressionLevel: 9 })
              .toBuffer();
          }
        }
        const finalMeta = await sharp(finalBuf).metadata();

        const useColorDir = isColor && args.separateColor;
        const outDir = useColorDir ? colorDir : pagesDir;
        const counter = useColorDir ? ++colorCounter : ++pageCounter;
        const prefix = useColorDir ? "color" : args.outName;
        const filename = `${prefix}_${String(counter).padStart(4, "0")}.png`;
        await writeFile(path.join(outDir, filename), finalBuf);
        records.push({
          type: useColorDir ? "color_page" : "page",
          filename,
          source: sourceFile,
          is_color: isColor,
          width: finalMeta.width ?? 0,
          height: finalMeta.height ?? 0,
          was_split: piece.wasSplit,
          split_side: piece.side,
        });
      }
    } catch (e) {
      console.warn(`[normalize] ${sourceFile} failed: ${(e as Error).message}`);
    }
  }

  // manifest 更新（追記）
  const manifestPath = path.join(args.dir, "manifest.json");
  let manifest: Record<string, unknown> = {};
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf-8"));
  } catch {
    manifest = {};
  }
  manifest.normalized = {
    pages_count: pageCounter,
    color_pages_count: colorCounter,
    target_width: args.targetWidth,
    split_spread: args.splitSpread,
    right_to_left: args.rightToLeft,
    auto_trim: args.autoTrim,
    normalized_at: new Date().toISOString(),
    records,
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  console.log("");
  console.log(
    `[normalize] DONE: pages=${pageCounter} color=${colorCounter}`,
  );
  console.log(`[normalize] pages: ${pagesDir}`);
  if (args.separateColor) console.log(`[normalize] color: ${colorDir}`);
  console.log(`[normalize] manifest: ${manifestPath}`);
}

main().catch((err) => {
  console.error("[normalize] FAILED:", err);
  process.exit(1);
});
