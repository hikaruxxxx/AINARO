/**
 * Codex CLI 経由で gpt-image を呼び出すラッパー
 *
 * `codex exec --sandbox workspace-write` を subprocess で起動し、
 * Codex に image_gen ツールで画像を生成・保存させる。
 *
 * 前提:
 * - Codex CLI が PATH に存在する（`which codex`）
 * - Codex が image_gen ツールを利用できる subscription を持っている
 * - 出力ディレクトリが作業ディレクトリ配下、もしくは Codex のサンドボックスで書き込み可能なパス
 */

import { spawn } from "child_process";
import { existsSync, statSync } from "fs";
import path from "path";

export type CodexImageOptions = {
  /** 画像生成プロンプト（英語推奨） */
  prompt: string;
  /** 出力ファイルの絶対パス（PNG） */
  outputPath: string;
  /** Codex を実行する作業ディレクトリ（デフォルト: process.cwd()） */
  cwd?: string;
  /** subprocess のタイムアウト（ms、デフォルト 5分） */
  timeoutMs?: number;
  /** 期待される最低ファイルサイズ（バイト、デフォルト 50KB） */
  minFileSize?: number;
  /** リトライ回数（デフォルト 1） */
  maxRetries?: number;
};

export type CodexImageResult = {
  outputPath: string;
  sizeBytes: number;
  attempts: number;
  totalDurationMs: number;
};

/**
 * Codex CLI に渡すタスク文字列を組み立てる。
 * Codex 側がこれを読んで image_gen を呼び、指定パスに保存する。
 */
function buildCodexTask(prompt: string, outputPath: string): string {
  return [
    "次のタスクを実行してください。報告は最小限で構いません。",
    "",
    "1. `image_gen` ツールを使って下記の英語プロンプトで画像を1枚生成する。",
    "2. サイズは 1024x1536（縦長書籍表紙）。",
    `3. 生成した画像を必ず次の絶対パスに保存する: \`${outputPath}\``,
    "4. 保存後、ファイルが実際に存在しサイズが 50KB 以上あることを `ls -la` で確認する。",
    "5. 不要な作業（README作成・コミット・テストなど）は一切行わない。画像生成と保存のみ。",
    "",
    "## 英語プロンプト",
    "```",
    prompt,
    "```",
    "",
    "完了したら、生成画像のパスとファイルサイズだけを1行で報告してください。",
  ].join("\n");
}

/**
 * Codex CLI を subprocess として起動し、画像生成を待機する。
 */
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

    // タスクを stdin に書き込み
    child.stdin.write(opts.task);
    child.stdin.end();
  });
}

/**
 * Codex 経由で gpt-image を呼び出して画像を生成する。
 * 失敗時は最大 maxRetries 回リトライ。
 */
export async function generateImageViaCodex(
  options: CodexImageOptions
): Promise<CodexImageResult> {
  const cwd = options.cwd ?? process.cwd();
  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
  const minFileSize = options.minFileSize ?? 50 * 1024;
  const maxRetries = options.maxRetries ?? 1;

  // 出力パスは絶対パスにする
  const absOutput = path.isAbsolute(options.outputPath)
    ? options.outputPath
    : path.resolve(cwd, options.outputPath);

  const task = buildCodexTask(options.prompt, absOutput);

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

      // ファイル存在確認
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
        attempts: attempt,
        totalDurationMs: Date.now() - startedAt,
      };
    } catch (err) {
      lastError = err as Error;
      if (attempt > maxRetries) break;
      console.warn(
        `[codex-image] 試行 ${attempt} 失敗: ${lastError.message}\n  リトライ中...`
      );
    }
  }

  throw new Error(
    `Codex 画像生成に失敗（${maxRetries + 1}回試行）: ${lastError?.message}`
  );
}
