/**
 * Codex CLI 経由のテキスト/JSON 抽出ラッパー
 *
 * グローバルルール「ANTHROPIC_API_KEY 課金前提にしない」に従い、
 * LLM 呼び出しは Codex CLI のサブスクリプション内で行う。
 *
 * 既存 `src/lib/cover/codex-image.ts` の subprocess パターンを流用し、
 * 画像生成ではなくテキスト/JSON 出力を取得する。
 */

import { spawn } from "child_process";

export type CodexTextOptions = {
  /** Codex に渡すタスク（日本語OK） */
  task: string;
  /** 出力に期待する形式: 'text' | 'json' */
  format?: "text" | "json";
  /** Codex を実行する作業ディレクトリ */
  cwd?: string;
  /** タイムアウト ms (デフォルト 5分) */
  timeoutMs?: number;
  /** リトライ回数 (デフォルト 1) */
  maxRetries?: number;
};

export type CodexTextResult<T = unknown> = {
  /** 生のstdout */
  stdout: string;
  /** format='json' の場合パース結果 */
  parsed: T | null;
  attempts: number;
  totalDurationMs: number;
};

/**
 * Codex CLI を1回起動して結果を取得
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
      "read-only",
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
 * stdout から JSON ブロックを抽出（```json ... ``` または最初の `{...}`/`[...]`）
 */
function extractJson(stdout: string): unknown | null {
  // ```json ... ``` ブロック優先
  const codeBlock = stdout.match(/```json\s*([\s\S]*?)\s*```/);
  if (codeBlock) {
    try {
      return JSON.parse(codeBlock[1]);
    } catch {
      // フォールバックへ
    }
  }
  // 最初に出現する完全な JSON object/array を抽出
  const objStart = stdout.search(/[\{\[]/);
  if (objStart < 0) return null;
  // バランスドマッチ
  let depth = 0;
  let inString = false;
  let escape = false;
  const opener = stdout[objStart];
  const closer = opener === "{" ? "}" : "]";
  for (let i = objStart; i < stdout.length; i++) {
    const ch = stdout[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === opener) depth++;
    else if (ch === closer) {
      depth--;
      if (depth === 0) {
        const raw = stdout.slice(objStart, i + 1);
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * Codex CLI を経由してテキスト or JSON を取得する。
 * format='json' の場合、stdout から JSON ブロックを抽出してパースする。
 * パース失敗時は最大 maxRetries 回リトライする。
 */
export async function runCodexText<T = unknown>(
  options: CodexTextOptions
): Promise<CodexTextResult<T>> {
  const cwd = options.cwd ?? process.cwd();
  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
  const maxRetries = options.maxRetries ?? 1;
  const format = options.format ?? "text";

  const startedAt = Date.now();
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const { stdout, stderr, exitCode } = await runCodexOnce({
        task: options.task,
        cwd,
        timeoutMs,
      });

      if (exitCode !== 0) {
        throw new Error(
          `Codex CLI が異常終了 (exit=${exitCode}): ${stderr.slice(-500)}`
        );
      }

      let parsed: T | null = null;
      if (format === "json") {
        const obj = extractJson(stdout);
        if (obj === null) {
          throw new Error(
            `JSON 抽出失敗。stdout 末尾: ${stdout.slice(-300)}`
          );
        }
        parsed = obj as T;
      }

      return {
        stdout,
        parsed,
        attempts: attempt,
        totalDurationMs: Date.now() - startedAt,
      };
    } catch (err) {
      lastError = err as Error;
      if (attempt > maxRetries) break;
      console.warn(
        `[codex-text] 試行 ${attempt} 失敗: ${lastError.message}\n  リトライ中...`
      );
    }
  }

  throw new Error(
    `Codex テキスト取得に失敗（${maxRetries + 1}回試行）: ${lastError?.message}`
  );
}

/**
 * 入力素材（小説本文・設定資料等）+ 構造化指示 → JSON抽出 のヘルパー
 *
 * @example
 *   const result = await extractStructuredJson({
 *     systemContext: "あなたは漫画用キャラ設定の構造化エージェントです",
 *     materials: { synopsis: "...", settings: "..." },
 *     instruction: "下記スキーマに従って JSON を返してください",
 *     outputSchema: '{ name: string, hair: { style, color }, ... }',
 *   });
 */
export async function extractStructuredJson<T = unknown>(args: {
  systemContext: string;
  materials: Record<string, string>;
  instruction: string;
  outputSchema: string;
  cwd?: string;
  timeoutMs?: number;
  maxRetries?: number;
}): Promise<T> {
  const materialsBlock = Object.entries(args.materials)
    .map(([key, value]) => `### ${key}\n\n${value}\n`)
    .join("\n");

  const task = [
    args.systemContext,
    "",
    "## 入力素材",
    "",
    materialsBlock,
    "## タスク",
    "",
    args.instruction,
    "",
    "## 出力スキーマ",
    "",
    "```typescript",
    args.outputSchema,
    "```",
    "",
    "## 出力形式",
    "",
    "上記スキーマに従う JSON のみを返してください。説明文・前置き・後書きは一切不要です。",
    "出力は ```json ... ``` のコードブロックで囲んでください。",
  ].join("\n");

  const result = await runCodexText<T>({
    task,
    format: "json",
    cwd: args.cwd,
    timeoutMs: args.timeoutMs,
    maxRetries: args.maxRetries ?? 2,
  });

  if (result.parsed === null) {
    throw new Error("JSON 抽出に失敗しました");
  }

  return result.parsed;
}
