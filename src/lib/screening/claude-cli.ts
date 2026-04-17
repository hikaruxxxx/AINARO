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

import { spawn, spawnSync } from "child_process";
import { recordUsage, estimateTokens } from "./throttle";

/**
 * claude CLI が消失した場合に1回だけ自動再インストールする。
 * Phase C2 で /opt/homebrew/lib/node_modules/@anthropic-ai/ が
 * 空になる事故が観測されたため。
 * 成功時 true を返す。
 */
let recoveryAttempted = false;
function tryRecoverClaudeCli(): boolean {
  if (recoveryAttempted) return false;
  recoveryAttempted = true;
  console.error("[claude-cli] CLI not found. attempting auto-recovery: npm i -g @anthropic-ai/claude-code");
  const r = spawnSync("npm", ["i", "-g", "@anthropic-ai/claude-code"], {
    stdio: "inherit",
  });
  if (r.status === 0) {
    const check = spawnSync("claude", ["-p", "ping"], { encoding: "utf-8" });
    if (check.status === 0) {
      console.error("[claude-cli] recovery succeeded");
      return true;
    }
  }
  console.error("[claude-cli] recovery failed");
  return false;
}

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
    public code: "timeout" | "exit_nonzero" | "spawn_failed" | "rate_limited",
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
export async function callClaudeCli(
  prompt: string,
  opts: ClaudeCallOptions = {},
): Promise<string> {
  try {
    return await callClaudeCliOnce(prompt, opts);
  } catch (e) {
    if (e instanceof ClaudeCallError && e.code === "spawn_failed" && /ENOENT/.test(e.message)) {
      if (tryRecoverClaudeCli()) {
        return await callClaudeCliOnce(prompt, opts);
      }
    }
    // レート制限検出: stderrに "rate limit" や "429" が含まれる場合
    if (e instanceof ClaudeCallError && e.stderr && /rate.limit|429|too.many/i.test(e.stderr)) {
      // 現在の5h窓消費量をログに記録（実上限の手がかり）
      const { getUsageIn5h } = await import("./throttle");
      const usage = getUsageIn5h();
      console.error(`[claude-cli] レート制限検出。5h窓消費: ${(usage.total / 1_000_000).toFixed(2)}M tok (${usage.recordCount}回) — この値が実上限の目安`);
      // rate_limited コードで再throw（呼び出し元で待機判断できるように）
      throw new ClaudeCallError(
        `rate limited (5h usage: ${(usage.total / 1_000_000).toFixed(2)}M tok)`,
        "rate_limited",
        e.stderr,
        e.exitCode,
      );
    }
    throw e;
  }
}

/** --output-format json のレスポンス型 */
interface ClaudeJsonResponse {
  result?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

function callClaudeCliOnce(
  prompt: string,
  opts: ClaudeCallOptions = {},
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const args: string[] = ["-p", "--output-format", "json"];
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

      // JSON出力をパースして実トークン数を取得
      let resultText = stdout;
      let inputTokens = estimateTokens(prompt);   // フォールバック
      let outputTokens = estimateTokens(stdout);   // フォールバック
      try {
        const json = JSON.parse(stdout) as ClaudeJsonResponse;
        if (json.result != null) {
          resultText = json.result;
        }
        if (json.usage) {
          // 実トークン数（cache含む全入力トークン）
          inputTokens = (json.usage.input_tokens ?? 0)
            + (json.usage.cache_read_input_tokens ?? 0)
            + (json.usage.cache_creation_input_tokens ?? 0);
          outputTokens = json.usage.output_tokens ?? 0;
        }
      } catch {
        // JSONパース失敗時はstdoutをそのまま使う（旧互換）
      }

      // 使用量記録（実測値）
      try {
        recordUsage({
          timestamp: Date.now(),
          inputTokens,
          outputTokens,
          layer: opts.layer ?? "unknown",
          slug: opts.slug,
        });
      } catch {
        // 記録失敗は呼び出しを失敗させない
      }
      resolve(resultText);
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
