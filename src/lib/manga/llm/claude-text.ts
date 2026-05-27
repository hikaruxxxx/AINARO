/**
 * Claude CLI 経由のテキスト/JSON 抽出ラッパー
 *
 * グローバルルール (feedback_no_anthropic_api):
 *   - LLM 生成は Claude Code 内のサブエージェント or 会話本体 (=Claude CLI subprocess) で行う
 *   - ANTHROPIC_API_KEY での直接 SDK 課金は前提にしない
 *   - Codex CLI は「例外」として許容されていたが、2026-05-13 ユーザー指示により
 *     text 生成は Claude CLI を default にする (Codex は narration_lines 指示を守らない事例があった)
 *
 * 実装パターンは `src/lib/manga/qa-v2/audit-vision.ts:spawnClaudeVisionAudit` を踏襲。
 *   claude --print --output-format=json --model=<model> -- <prompt>
 *
 * vision を使わない pure text/JSON 用なので --allowedTools / --add-dir は不要。
 */

import { spawn } from "node:child_process";

const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";
/** デフォルトモデル: sonnet (品質と速度のバランス)。env で上書き可 */
const DEFAULT_MODEL = process.env.AINARO_TEXT_MODEL || "sonnet";

export type ClaudeTextOptions = {
  /** Claude に渡すタスク本文 (日本語OK) */
  task: string;
  /** 出力に期待する形式: 'text' | 'json' (json なら ```json ... ``` を抽出して parse) */
  format?: "text" | "json";
  /** モデル指定: haiku / sonnet / opus。デフォルトは sonnet */
  model?: string;
  /** Claude を実行する作業ディレクトリ (cwd 引数として渡す) */
  cwd?: string;
  /** タイムアウト ms (デフォルト 5分) */
  timeoutMs?: number;
  /** JSON parse 失敗時のリトライ回数 (デフォルト 1) */
  maxRetries?: number;
};

export type ClaudeTextResult<T = unknown> = {
  /** 生 stdout (claude --output-format=json なので JSON 1 行) */
  stdout: string;
  /** format='json' の場合、result から抽出した本体 JSON のパース結果 */
  parsed: T | null;
  attempts: number;
  totalDurationMs: number;
};

type ClaudeRunOutput = { stdout: string; stderr: string; exitCode: number | null };

async function runClaudeOnce(opts: {
  task: string;
  model: string;
  cwd: string;
  timeoutMs: number;
}): Promise<ClaudeRunOutput> {
  return new Promise((resolve, reject) => {
    const argv = [
      "--print",
      "--output-format=json",
      `--model=${opts.model}`,
      "--permission-mode=bypassPermissions",
      "--disable-slash-commands",
      "--",
      opts.task,
    ];

    const child = spawn(CLAUDE_BIN, argv, {
      cwd: opts.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Claude CLI タイムアウト (${opts.timeoutMs}ms)`));
    }, opts.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code });
    });
  });
}

/**
 * `claude --print --output-format=json` の出力から model の生成本文 (top-level `result`) を取り出し、
 * その中の ```json ... ``` ブロック or 最初の JSON object/array を抽出して parse する。
 */
function extractInnerResult(claudeStdout: string): string | null {
  let top: { result?: unknown; is_error?: unknown };
  try {
    top = JSON.parse(claudeStdout) as { result?: unknown; is_error?: unknown };
  } catch {
    return null;
  }
  if (top.is_error || typeof top.result !== "string") return null;
  return top.result;
}

/**
 * 文字列内の **全ての** balanced JSON object/array を見つけて返す。
 * 最大長 (= 最も完全な構造を持つ可能性が高い) のものを優先する。
 */
function findAllBalancedJsonBlocks(body: string): string[] {
  const blocks: string[] = [];
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (ch !== "{" && ch !== "[") {
      i++;
      continue;
    }
    // balanced match 開始
    const opener = ch;
    const closer = opener === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escape = false;
    let end = -1;
    for (let j = i; j < body.length; j++) {
      const c = body[j];
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (c === opener) depth++;
      else if (c === closer) {
        depth--;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    if (end < 0) {
      // 閉じない (truncation): 次の opener から再試行
      i++;
      continue;
    }
    blocks.push(body.slice(i, end + 1));
    // 内側のネストもスキャン対象だが、外側 block を優先するため i を end の次に飛ばす
    i = end + 1;
  }
  return blocks;
}

function extractJsonBlock(body: string): unknown | null {
  // 1) ```json ... ``` ブロックの全候補から、parse 可能で最大長のものを返す
  const fenceRegex = /```json\s*([\s\S]*?)\s*```/g;
  const fenceMatches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = fenceRegex.exec(body)) !== null) {
    fenceMatches.push(m[1]);
  }
  const fenceParsed = fenceMatches
    .map((s) => {
      try {
        return { raw: s, value: JSON.parse(s) as unknown };
      } catch {
        return null;
      }
    })
    .filter((v): v is { raw: string; value: unknown } => v !== null)
    .sort((a, b) => b.raw.length - a.raw.length);
  if (fenceParsed.length > 0) return fenceParsed[0].value;

  // 2) フェンスなしの場合: balanced JSON 全候補から最大長を選ぶ
  const blocks = findAllBalancedJsonBlocks(body);
  const blockParsed = blocks
    .map((s) => {
      try {
        return { raw: s, value: JSON.parse(s) as unknown };
      } catch {
        return null;
      }
    })
    .filter((v): v is { raw: string; value: unknown } => v !== null)
    .sort((a, b) => b.raw.length - a.raw.length);
  if (blockParsed.length > 0) return blockParsed[0].value;

  return null;
}

/**
 * Claude CLI を経由してテキスト or JSON を取得する。
 * format='json' の場合、stdout を一度パースして `result` 文字列を取得し、その中の JSON を抽出する。
 */
export async function runClaudeText<T = unknown>(
  options: ClaudeTextOptions,
): Promise<ClaudeTextResult<T>> {
  const cwd = options.cwd ?? process.cwd();
  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
  const maxRetries = options.maxRetries ?? 1;
  const format = options.format ?? "text";
  const model = options.model ?? DEFAULT_MODEL;

  const startedAt = Date.now();
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const { stdout, stderr, exitCode } = await runClaudeOnce({
        task: options.task,
        model,
        cwd,
        timeoutMs,
      });

      if (exitCode !== 0) {
        throw new Error(
          `Claude CLI が異常終了 (exit=${exitCode}): ${stderr.slice(-500)}`,
        );
      }

      let parsed: T | null = null;
      const inner = extractInnerResult(stdout);
      if (inner === null) {
        throw new Error(
          `Claude CLI 応答 (result) の取得に失敗。stdout 末尾: ${stdout.slice(-300)}`,
        );
      }

      if (format === "json") {
        const obj = extractJsonBlock(inner);
        if (obj === null) {
          // デバッグ: raw inner を /tmp に保存して再現性を確保
          try {
            const dumpPath = `/tmp/claude-text-fail-${Date.now()}-${Math.floor(Math.random() * 1e6)}.txt`;
            const { writeFileSync } = await import("node:fs");
            writeFileSync(dumpPath, inner, "utf-8");
            console.warn(`[claude-text] JSON抽出失敗 raw inner dumped: ${dumpPath}`);
          } catch {
            // ignore dump failure
          }
          throw new Error(
            `JSON 抽出失敗。result 末尾: ${inner.slice(-300)}`,
          );
        }
        parsed = obj as T;
      } else {
        // format=text の場合、stdout (raw) ではなく inner text を返す方が直感的なので置換
        return {
          stdout: inner,
          parsed: null,
          attempts: attempt,
          totalDurationMs: Date.now() - startedAt,
        };
      }

      return {
        stdout: inner,
        parsed,
        attempts: attempt,
        totalDurationMs: Date.now() - startedAt,
      };
    } catch (err) {
      lastError = err as Error;
      if (attempt > maxRetries) break;
      console.warn(
        `[claude-text] 試行 ${attempt} 失敗: ${lastError.message}\n  リトライ中...`,
      );
    }
  }

  throw new Error(
    `Claude テキスト取得に失敗 (${maxRetries + 1}回試行): ${lastError?.message}`,
  );
}

/**
 * 入力素材 + 構造化指示 → JSON 抽出 のヘルパー (codex-text.ts の extractStructuredJson と同じ API)
 */
export async function extractStructuredJson<T = unknown>(args: {
  systemContext: string;
  materials: Record<string, string>;
  instruction: string;
  outputSchema: string;
  model?: string;
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

  const result = await runClaudeText<T>({
    task,
    format: "json",
    model: args.model,
    cwd: args.cwd,
    timeoutMs: args.timeoutMs,
    maxRetries: args.maxRetries ?? 2,
  });

  if (result.parsed === null) {
    throw new Error("JSON 抽出に失敗しました");
  }

  return result.parsed;
}
