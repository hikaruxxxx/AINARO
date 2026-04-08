// claude -p ヘッドレスCLIラッパー
//
// Claude Max 定額に乗せるため API ではなく claude CLI を subprocess 起動する。
// ローカル認証(~/.claude)を使うので追加課金なし。
//
// 設計:
// - 1呼び出し1プロセス。並列度はデーモン側で制御
// - timeout でハング対策
// - stdout を捕捉して文字列で返す
// - 入力プロンプトは stdin 経由(エスケープ問題回避)
// - 推定トークン数を throttle に記録

import { spawn } from "child_process";
import { recordUsage, estimateTokens } from "./throttle";

export interface ClaudeCallOptions {
  /** ms。デフォルト10分 */
  timeoutMs?: number;
  /** 使用するモデル(省略時はデフォルト) */
  model?: string;
  /** 使用ログのlayer識別子 */
  layer?: string;
  /** ログ識別用slug */
  slug?: string;
}

export class ClaudeCallError extends Error {
  constructor(
    message: string,
    public code: "timeout" | "exit_nonzero" | "spawn_failed",
    public stderr?: string,
    public exitCode?: number,
  ) {
    super(message);
    this.name = "ClaudeCallError";
  }
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * claude -p をsubprocessで起動し、prompt を stdin から渡して stdout を返す。
 * 失敗時は ClaudeCallError を throw。
 */
export function callClaudeCli(
  prompt: string,
  opts: ClaudeCallOptions = {},
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const args: string[] = ["-p"];
  if (opts.model) {
    args.push("--model", opts.model);
  }

  return new Promise((resolve, reject) => {
    const child = spawn("claude", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeoutHandle = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(
        new ClaudeCallError(
          `claude CLI timeout after ${timeoutMs}ms`,
          "timeout",
          stderr,
        ),
      );
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      reject(
        new ClaudeCallError(
          `claude CLI spawn failed: ${err.message}`,
          "spawn_failed",
          stderr,
        ),
      );
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      if (code !== 0) {
        reject(
          new ClaudeCallError(
            `claude CLI exited with code ${code}`,
            "exit_nonzero",
            stderr,
            code ?? undefined,
          ),
        );
        return;
      }
      // 使用量記録(推定値)
      try {
        recordUsage({
          timestamp: Date.now(),
          inputTokens: estimateTokens(prompt),
          outputTokens: estimateTokens(stdout),
          layer: opts.layer ?? "unknown",
          slug: opts.slug,
        });
      } catch {
        // 記録失敗は呼び出しを失敗させない
      }
      resolve(stdout);
    });

    // プロンプトを stdin に流し込む
    child.stdin.write(prompt, "utf-8");
    child.stdin.end();
  });
}

/**
 * テキストレスポンスからJSONブロックを安全に抽出する。
 * LLMが余計な説明を付けた場合の対策。
 */
export function extractJsonBlock(text: string): unknown | null {
  // ```json ... ``` 形式
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]);
    } catch {
      // fallthrough
    }
  }
  // 最初の { から最後の } まで
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  return null;
}
