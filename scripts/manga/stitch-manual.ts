/**
 * 漫画パイプライン: 手動キャプチャの縦連結
 *
 * ingest-manual.ts が出力した manifest.json と canvas 画像群を読み、
 * 撮影順 + viewport 内 top 値で並べて 1 枚の縦長画像に連結する。
 *
 * 使い方:
 *   npx tsx scripts/manga/stitch-manual.ts --dir=data/manga/raw/manual/ore-level-prologue
 *   npx tsx scripts/manga/stitch-manual.ts --dir=... --thumb-width=1200
 *   npx tsx scripts/manga/stitch-manual.ts --dir=... --type=img  # img を連結する
 *
 * 出力:
 *   <dir>/episode_full.png  — オリジナル解像度の縦連結
 *   <dir>/episode_thumb.png — 幅 thumb-width にリサイズした縮小版（任意）
 */

import "./_env";
import { readFile, writeFile, readdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import sharp from "sharp";

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

type Manifest = {
  name: string;
  url: string;
  captured_at: string;
  records: CaptureRecord[];
};

type CliArgs = {
  dir: string;
  type: "canvas" | "img";
  thumbWidth?: number;
  outName: string;
  dedupThreshold: number;
  chunkHeight: number;
};

/**
 * dHash: 9x8 にリサイズしたグレースケール画像で、隣接ピクセル差分を 64bit ビットで返す。
 * 視覚的に近い画像は同じ or 近いハッシュになる（ハミング距離が小さい）。
 */
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

function parseArgs(): CliArgs {
  const a: Partial<CliArgs> = {};
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (!m) continue;
    const [, key, value] = m;
    switch (key) {
      case "dir":
        a.dir = value;
        break;
      case "type":
        a.type = value as "canvas" | "img";
        break;
      case "thumb-width":
        a.thumbWidth = Number(value);
        break;
      case "out-name":
        a.outName = value;
        break;
      case "dedup-threshold":
        a.dedupThreshold = Number(value);
        break;
      case "chunk-height":
        a.chunkHeight = Number(value);
        break;
    }
  }
  if (!a.dir) throw new Error("--dir=<キャプチャディレクトリ> が必要");
  return {
    dir: a.dir,
    type: a.type ?? "canvas",
    thumbWidth: a.thumbWidth,
    outName: a.outName ?? "episode",
    dedupThreshold: a.dedupThreshold ?? 5,
    // Sharp/libvips の安全圏。Claude Vision の入力にも収まるサイズ
    chunkHeight: a.chunkHeight ?? 8000,
  };
}

/**
 * manifest.json があればそれを読む。無い場合はディレクトリ内の
 * `c_NNNN_*.png` / `i_NNNN.*` 連番ファイルから records を再構築する
 * （ingest-manual.ts がエラー終了した場合のリカバリ）。
 */
async function loadOrBuildManifest(dir: string): Promise<Manifest> {
  const manifestPath = path.join(dir, "manifest.json");
  if (existsSync(manifestPath)) {
    console.log(`[stitch-manual] reading manifest: ${manifestPath}`);
    return JSON.parse(await readFile(manifestPath, "utf-8")) as Manifest;
  }
  console.log(
    `[stitch-manual] manifest.json なし、ファイル名から再構築します`,
  );
  const files = (await readdir(dir))
    .filter((f) => /^[ci]_\d{4}[._]/.test(f))
    .sort();
  const records: CaptureRecord[] = files.map((filename, i) => ({
    type: filename.startsWith("c_") ? "canvas" : "img",
    filename,
    timestamp: i, // 連番をtimestampとして扱う（順序のみ保つ）
    topAtCapture: 0,
  }));
  return {
    name: path.basename(dir),
    url: "",
    captured_at: new Date().toISOString(),
    records,
  };
}

async function main() {
  const args = parseArgs();
  const manifest = await loadOrBuildManifest(args.dir);

  // 対象タイプだけ抽出
  const records = manifest.records.filter((r) => r.type === args.type);
  console.log(
    `[stitch-manual] type=${args.type} records=${records.length} / total=${manifest.records.length}`,
  );
  if (records.length === 0) {
    console.warn("[stitch-manual] 連結対象が0件です。type を確認してください");
    return;
  }

  // 撮影順 → 同じバッチ内では viewport 内 top 値で並べる
  // ピッコマのような windowing でも、撮影順がスクロール順と一致するため正しく並ぶ
  const sorted = [...records].sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    return (a.topAtCapture ?? 0) - (b.topAtCapture ?? 0);
  });

  // 全ファイルをロード
  const allBuffers = await Promise.all(
    sorted.map((r) => readFile(path.join(args.dir, r.filename))),
  );

  // 視覚重複の除去: dHash でハミング距離が閾値以下なら捨てる
  // ピッコマの windowing は同じコマを微小ピクセル差で複数回描画するので、
  // SHA1 重複排除では捨てきれないものをここで除外する
  console.log(`[stitch-manual] computing perceptual hashes for dedup...`);
  const phashes = await Promise.all(allBuffers.map((b) => dhash(b)));
  const keepIndexes: number[] = [];
  const usedHashes: string[] = [];
  let dedupedCount = 0;
  for (let i = 0; i < allBuffers.length; i++) {
    const h = phashes[i];
    const dup = usedHashes.findIndex(
      (u) => hammingDistance(u, h) <= args.dedupThreshold,
    );
    if (dup >= 0) {
      dedupedCount++;
      continue;
    }
    usedHashes.push(h);
    keepIndexes.push(i);
  }
  console.log(
    `[stitch-manual] dedup: ${sorted.length} -> ${keepIndexes.length} (removed ${dedupedCount} visually-similar)`,
  );

  const buffers = keepIndexes.map((i) => allBuffers[i]);
  const keptRecords = keepIndexes.map((i) => sorted[i]);
  const metas = await Promise.all(buffers.map((b) => sharp(b).metadata()));
  const heights = metas.map((m) => m.height ?? 0);
  const widths = metas.map((m) => m.width ?? 0);
  const totalHeight = heights.reduce((s, h) => s + h, 0);
  const maxWidth = Math.max(...widths);

  console.log(
    `[stitch-manual] composing ${buffers.length} pieces -> ${maxWidth}x${totalHeight}, chunk-height=${args.chunkHeight}`,
  );

  // チャンク分割: 1ファイルが args.chunkHeight を超えないよう貪欲に分割
  type Chunk = { startIdx: number; endIdx: number; height: number };
  const chunks: Chunk[] = [];
  let curStart = 0;
  let curHeight = 0;
  for (let i = 0; i < buffers.length; i++) {
    if (curHeight + heights[i] > args.chunkHeight && curStart < i) {
      chunks.push({ startIdx: curStart, endIdx: i, height: curHeight });
      curStart = i;
      curHeight = 0;
    }
    curHeight += heights[i];
  }
  if (curStart < buffers.length) {
    chunks.push({
      startIdx: curStart,
      endIdx: buffers.length,
      height: curHeight,
    });
  }
  console.log(`[stitch-manual] split into ${chunks.length} chunks`);

  // 各チャンクを連結出力
  const chunkFiles: string[] = [];
  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];
    const composite: sharp.OverlayOptions[] = [];
    let yOffset = 0;
    for (let i = chunk.startIdx; i < chunk.endIdx; i++) {
      const w = widths[i];
      const left = Math.floor((maxWidth - w) / 2);
      composite.push({ input: buffers[i], top: yOffset, left });
      yOffset += heights[i];
    }
    const filename = `${args.outName}_part${String(ci + 1).padStart(2, "0")}.png`;
    const outPath = path.join(args.dir, filename);
    await sharp({
      create: {
        width: maxWidth,
        height: chunk.height,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .composite(composite)
      .png({ compressionLevel: 9 })
      .toFile(outPath);
    chunkFiles.push(filename);
    console.log(
      `[stitch-manual]   ${filename}: ${maxWidth}x${chunk.height} (pieces ${chunk.startIdx + 1}-${chunk.endIdx})`,
    );
  }

  // オプション: 1チャンク目をサムネとしてリサイズ
  if (args.thumbWidth && chunkFiles.length > 0) {
    const thumbPath = path.join(args.dir, `${args.outName}_part01_thumb.png`);
    await sharp(path.join(args.dir, chunkFiles[0]))
      .resize({ width: args.thumbWidth })
      .png({ compressionLevel: 9 })
      .toFile(thumbPath);
    console.log(`[stitch-manual] thumb saved: ${thumbPath} (width=${args.thumbWidth})`);
  }

  // 連結結果をmanifestに追記
  const updated = {
    ...manifest,
    stitched: {
      type: args.type,
      chunks: chunkFiles,
      width: maxWidth,
      total_height: totalHeight,
      chunk_height: args.chunkHeight,
      pieces_total: sorted.length,
      pieces_used: keptRecords.length,
      pieces_deduped: dedupedCount,
      stitched_at: new Date().toISOString(),
    },
  };
  await writeFile(
    path.join(args.dir, "manifest.json"),
    JSON.stringify(updated, null, 2),
  );

  console.log("");
  console.log(
    `[stitch-manual] DONE: ${maxWidth}x${totalHeight} -> ${chunks.length} chunks (${keptRecords.length} pieces)`,
  );
}

main().catch((err) => {
  console.error("[stitch-manual] FAILED:", err);
  process.exit(1);
});
