/**
 * 漫画パイプライン用 Codex CLI 経由 gpt-image アダプタ
 *
 * 既存 `src/lib/cover/codex-image.ts` の表紙生成パターンを流用し、
 * 漫画パネル・キャラ参照画像・ロケ参照画像など複数用途に対応する汎用ラッパー。
 *
 * 主な拡張:
 *  - サイズ可変（1024x1024 / 1024x1536 / 1536x1024 / 1080x1920 等）
 *  - reference image 注入のヒント文を組み立てる helper
 *  - メタ情報（attempts, durationMs, sizeBytes）を返す
 */

import { spawn } from "child_process";
import { existsSync, statSync } from "fs";
import path from "path";

export type MangaImageSize = {
  width: number;
  height: number;
};

export type GenerateMangaImageOptions = {
  /** 英語推奨の画像生成プロンプト */
  prompt: string;
  /** 出力ファイルの絶対パス（PNG または WebP） */
  outputPath: string;
  /** 画像サイズ。GPT Image系の許容比率に合わせる */
  size: MangaImageSize;
  /** 参照画像のパス（あれば渡し、Codex に「reference として参照」させる） */
  referenceImagePaths?: string[];
  /** Codex を実行する作業ディレクトリ */
  cwd?: string;
  /** subprocess タイムアウト ms */
  timeoutMs?: number;
  /** 期待最低ファイルサイズ */
  minFileSize?: number;
  /** リトライ回数 */
  maxRetries?: number;
};

export type GenerateMangaImageResult = {
  outputPath: string;
  sizeBytes: number;
  width: number;
  height: number;
  attempts: number;
  totalDurationMs: number;
};

function buildTask(args: {
  prompt: string;
  outputPath: string;
  size: MangaImageSize;
  referenceImagePaths?: string[];
}): string {
  const refBlock =
    args.referenceImagePaths && args.referenceImagePaths.length > 0
      ? [
          "",
          "## 参照画像（一貫性のため必ず内容と画風を踏襲）",
          ...args.referenceImagePaths.map((p, i) => `${i + 1}. \`${p}\``),
        ].join("\n")
      : "";

  return [
    "次のタスクを実行してください。報告は最小限で構いません。",
    "",
    "1. `image_gen` ツールを使って下記の英語プロンプトで画像を1枚生成する。",
    `2. サイズは ${args.size.width}x${args.size.height} ピクセル。`,
    `3. 生成した画像を必ず次の絶対パスに保存する: \`${args.outputPath}\``,
    "4. 保存後、ファイルが実際に存在しサイズが 50KB 以上あることを `ls -la` で確認する。",
    "5. 不要な作業（README作成・コミット・テストなど）は一切行わない。画像生成と保存のみ。",
    refBlock,
    "",
    "## 英語プロンプト",
    "```",
    args.prompt,
    "```",
    "",
    "完了したら、生成画像のパスとファイルサイズだけを1行で報告してください。",
  ].join("\n");
}

async function runCodexOnce(opts: {
  task: string;
  cwd: string;
  timeoutMs: number;
}): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const args = [
      "exec",
      "--sandbox",
      "workspace-write",
      "--cd",
      opts.cwd,
      "-",
    ];

    const child = spawn("codex", args, {
      cwd: opts.cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Codex CLI タイムアウト (${opts.timeoutMs}ms)`));
    }, opts.timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code });
    });

    child.stdin.write(opts.task);
    child.stdin.end();
  });
}

/**
 * Codex CLI 経由で漫画用画像を生成する。
 */
export async function generateMangaImage(
  options: GenerateMangaImageOptions
): Promise<GenerateMangaImageResult> {
  const cwd = options.cwd ?? process.cwd();
  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
  const minFileSize = options.minFileSize ?? 50 * 1024;
  const maxRetries = options.maxRetries ?? 1;

  const absOutput = path.isAbsolute(options.outputPath)
    ? options.outputPath
    : path.resolve(cwd, options.outputPath);

  const task = buildTask({
    prompt: options.prompt,
    outputPath: absOutput,
    size: options.size,
    referenceImagePaths: options.referenceImagePaths,
  });

  const startedAt = Date.now();
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const { stdout, stderr, exitCode } = await runCodexOnce({
        task,
        cwd,
        timeoutMs,
      });

      if (exitCode !== 0) {
        throw new Error(
          `Codex CLI が異常終了 (exit=${exitCode}): ${stderr.slice(-500)}`
        );
      }

      if (!existsSync(absOutput)) {
        throw new Error(
          `画像ファイルが生成されていません: ${absOutput}\n--- Codex stdout (末尾) ---\n${stdout.slice(-800)}`
        );
      }

      const stat = statSync(absOutput);
      if (stat.size < minFileSize) {
        throw new Error(
          `画像ファイルが小さすぎます (${stat.size} bytes < ${minFileSize}): ${absOutput}`
        );
      }

      return {
        outputPath: absOutput,
        sizeBytes: stat.size,
        width: options.size.width,
        height: options.size.height,
        attempts: attempt,
        totalDurationMs: Date.now() - startedAt,
      };
    } catch (err) {
      lastError = err as Error;
      if (attempt > maxRetries) break;
      console.warn(
        `[manga-codex-image] 試行 ${attempt} 失敗: ${lastError.message}\n  リトライ中...`
      );
    }
  }

  throw new Error(
    `Codex 画像生成に失敗（${maxRetries + 1}回試行）: ${lastError?.message}`
  );
}

/**
 * 推奨サイズプリセット（プラットフォーム別）
 */
export const MANGA_SIZE_PRESETS = {
  /** 縦読み標準パネル（1080×1920） */
  vertical_standard: { width: 1024, height: 1536 } as MangaImageSize,
  /** 縦長大ゴマ（クライマックス用） */
  vertical_big: { width: 1024, height: 1536 } as MangaImageSize,
  /** スプラッシュ（見開き相当、縦読みでは超大ゴマ） */
  splash: { width: 1024, height: 1536 } as MangaImageSize,
  /** 正方形コマ（タメ・情報パネル） */
  square: { width: 1024, height: 1024 } as MangaImageSize,
  /** キャラ参照立ち絵（縦長） */
  character_ref: { width: 1024, height: 1536 } as MangaImageSize,
  /** ロケ参照（横長） */
  location_ref: { width: 1536, height: 1024 } as MangaImageSize,
  /** SNSサムネ（正方形） */
  thumbnail: { width: 1024, height: 1024 } as MangaImageSize,
} as const;

export type MangaSizePresetKey = keyof typeof MANGA_SIZE_PRESETS;
