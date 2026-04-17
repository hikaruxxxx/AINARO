// 流量制御: Claude Max の5時間窓トークン上限を意識して呼び出しレートを制御する
//
// Claude Max は 5h ローリング窓でトークン上限がある(プランによって変動)。
// 上限に達するとセッションが切れて待機が必要になるため、
// デーモンは「使用量を時間平均で観測しながら自動スロットル」する。
//
// 設計:
// - 各 LLM 呼び出し直後に推定トークン数を記録(JSONLログ)
// - 5h窓で集計し、上限の80%超過で1秒sleepを挟む、95%超で長時間待機
// - 上限値は env で設定(SCREEN_MASS_TOKEN_LIMIT_5H)
// - トークン推定は claude -p の出力から取れない場合は文字数 ÷ 4 で近似

import { appendFileSync, existsSync, readFileSync, writeFileSync, mkdirSync, openSync, closeSync, flockSync } from "fs";
import { dirname } from "path";

// ファイルロック: 複数プロセス間の排他制御
function withFileLock<T>(lockPath: string, fn: () => T): T {
  const lockFile = lockPath + ".lock";
  const dir = dirname(lockFile);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  // 簡易スピンロック（ファイルの存在でロック判定）
  const maxWait = 5000;
  const start = Date.now();
  while (existsSync(lockFile)) {
    if (Date.now() - start > maxWait) {
      // タイムアウト: staleロックを除去
      try { require("fs").unlinkSync(lockFile); } catch {}
      break;
    }
    // 10ms待機
    const end = Date.now() + 10;
    while (Date.now() < end) { /* busy wait */ }
  }
  try {
    writeFileSync(lockFile, String(process.pid));
    return fn();
  } finally {
    try { require("fs").unlinkSync(lockFile); } catch {}
  }
}

export interface UsageRecord {
  timestamp: number; // ms
  inputTokens: number;
  outputTokens: number;
  layer: string; // "layer1" など
  slug?: string;
}

export interface ThrottleConfig {
  /** 5h窓のトークン上限 */
  tokenLimit5h: number;
  /** 上限の何割を超えたら警戒モードに入るか */
  warnRatio: number;
  /** 上限の何割を超えたら長時間待機するか */
  pauseRatio: number;
  /** 警戒モードでの sleep ms */
  warnSleepMs: number;
  /** 長時間待機の sleep ms */
  pauseSleepMs: number;
  /** 使用量ログのパス */
  logPath: string;
}

export const DEFAULT_THROTTLE_CONFIG: ThrottleConfig = {
  // 実測データ収集後に正確な値に調整する。
  // claude -p --output-format json で実トークン数を記録するようにしたので、
  // 数日分のデータが溜まったら getUsageIn5h() のピーク値から逆算する。
  tokenLimit5h: Number(process.env.SCREEN_MASS_TOKEN_LIMIT_5H ?? 15_000_000),
  warnRatio: 0.8,
  pauseRatio: 0.95,
  warnSleepMs: 1_000,
  pauseSleepMs: 60_000,
  logPath: "data/generation/_usage.jsonl",
};

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;

/** 使用量を1件記録（ファイルロック付き） */
export function recordUsage(rec: UsageRecord, cfg: ThrottleConfig = DEFAULT_THROTTLE_CONFIG): void {
  withFileLock(cfg.logPath, () => {
    const dir = dirname(cfg.logPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(cfg.logPath, JSON.stringify(rec) + "\n");
  });
}

/** 直近5h窓の合計トークン数を集計（ファイルロック付き） */
export function getUsageIn5h(cfg: ThrottleConfig = DEFAULT_THROTTLE_CONFIG): {
  total: number;
  input: number;
  output: number;
  recordCount: number;
} {
  return withFileLock(cfg.logPath, () => {
    if (!existsSync(cfg.logPath)) {
      return { total: 0, input: 0, output: 0, recordCount: 0 };
    }
    const cutoff = Date.now() - FIVE_HOURS_MS;
    const lines = readFileSync(cfg.logPath, "utf-8").split("\n").filter(Boolean);
    let input = 0;
    let output = 0;
    let recordCount = 0;
    for (const line of lines) {
      try {
        const rec = JSON.parse(line) as UsageRecord;
        if (rec.timestamp >= cutoff) {
          input += rec.inputTokens;
          output += rec.outputTokens;
          recordCount++;
        }
      } catch {
        // 壊れた行はスキップ
      }
    }
    return { total: input + output, input, output, recordCount };
  });
}

/** 必要に応じて sleep する。次の呼び出し前に await すること */
export async function throttleBeforeCall(
  cfg: ThrottleConfig = DEFAULT_THROTTLE_CONFIG,
): Promise<{ slept: number; reason: string }> {
  const usage = getUsageIn5h(cfg);
  const ratio = usage.total / cfg.tokenLimit5h;

  if (ratio >= cfg.pauseRatio) {
    // 上限近接、長時間待機
    await sleep(cfg.pauseSleepMs);
    return { slept: cfg.pauseSleepMs, reason: `pause(ratio=${ratio.toFixed(2)})` };
  }
  if (ratio >= cfg.warnRatio) {
    await sleep(cfg.warnSleepMs);
    return { slept: cfg.warnSleepMs, reason: `warn(ratio=${ratio.toFixed(2)})` };
  }
  return { slept: 0, reason: "ok" };
}

/** トークン数を文字数から推定(近似値) */
export function estimateTokens(text: string): number {
  // 日本語は1文字≒1.5トークン、英数字混在で平均1文字≒1トークン
  // 安全側に倒して文字数 × 1.2 で見積もる
  return Math.ceil(text.length * 1.2);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
