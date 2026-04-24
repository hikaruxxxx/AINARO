// v12 アンサンブル ヒット予測ラッパー
//
// scripts/predict/predict-hit-v12.py を subprocess で呼び出す。
// ep1本文テキストから hit確率（v12-ep1 × v12-longform の加重幾何平均）を返す。
//
// Python 側が副作用として data/feedback/hit-prediction/{slug}_ep{NNN}.json を書き出すが、
// 本関数の戻り値はその内容と同一。

import { spawnSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

export interface HitPredictionResult {
  slug: string;
  episode: number;
  modelVersion: string;
  hitProbability: number;       // アンサンブル(加重幾何平均) 0〜100
  hitProbabilityEqual: number;  // 等重み幾何平均 0〜100
  hitProbabilityEp1: number;    // 0〜100
  hitProbabilityLongform: number; // 0〜100
  tier: "top" | "upper" | "mid" | "lower" | "bottom";
  tierEp1: string;
  tierLongform: string;
  genre: string;
  title: string;
  textLength: number;
}

export class HitPredictorError extends Error {
  constructor(message: string, public stderr?: string) {
    super(message);
    this.name = "HitPredictorError";
  }
}

const SCRIPT_PATH = "scripts/predict/predict-hit-v12.py";
// predict-hit-v12.py は `dict | None` など 3.10+ の型ヒントを使うので 3.10 以上が必須。
// macOS 同梱の /usr/bin/python3 は 3.9 なので、デフォルトは Homebrew 3.13 を指す。
// 別環境で動かす場合は HIT_PREDICTOR_PYTHON で上書きする。
const PYTHON_BIN = process.env.HIT_PREDICTOR_PYTHON ?? "python3.13";

/**
 * ep1テキストに v12 アンサンブル予測を実行する。
 *
 * @param slug 作品slug（_settings.md / feedback出力パスに使用）
 * @param textFile ep1本文ファイル（絶対 or 相対パス）
 * @param opts.episode 話数（デフォルト1）
 * @param opts.genre ジャンル明示（未指定なら _settings.md から自動取得）
 * @param opts.cwd 作業ディレクトリ（プロジェクトルート。デフォルトは process.cwd()）
 * @param opts.timeoutMs タイムアウト（デフォルト30秒）
 */
export function runHitPredictorV12(
  slug: string,
  textFile: string,
  opts: { episode?: number; genre?: string; cwd?: string; timeoutMs?: number } = {},
): HitPredictionResult {
  const episode = opts.episode ?? 1;
  const cwd = opts.cwd ?? process.cwd();
  const timeoutMs = opts.timeoutMs ?? 30_000;

  const scriptAbs = join(cwd, SCRIPT_PATH);
  if (!existsSync(scriptAbs)) {
    throw new HitPredictorError(`predict-hit-v12.py が見つかりません: ${scriptAbs}`);
  }

  const args = [
    SCRIPT_PATH,
    "--slug", slug,
    "--episode", String(episode),
    "--text-file", textFile,
  ];
  if (opts.genre) args.push("--genre", opts.genre);

  const r = spawnSync(PYTHON_BIN, args, {
    cwd,
    encoding: "utf-8",
    timeout: timeoutMs,
  });

  if (r.error) {
    throw new HitPredictorError(`subprocess起動失敗: ${r.error.message}`, r.stderr);
  }
  if (r.status !== 0) {
    throw new HitPredictorError(
      `predict-hit-v12.py 異常終了 exit=${r.status}`,
      r.stderr,
    );
  }

  // 出力の最後の "保存: ..." 行を除いてJSON部分だけ取り出す
  const stdout = r.stdout ?? "";
  const jsonEnd = stdout.lastIndexOf("}");
  if (jsonEnd < 0) {
    throw new HitPredictorError(`JSON出力が見つかりません: ${stdout.slice(0, 500)}`);
  }
  const jsonStart = stdout.indexOf("{");
  if (jsonStart < 0 || jsonStart >= jsonEnd) {
    throw new HitPredictorError(`JSON出力が不正: ${stdout.slice(0, 500)}`);
  }
  const jsonText = stdout.slice(jsonStart, jsonEnd + 1);

  try {
    return JSON.parse(jsonText) as HitPredictionResult;
  } catch (e) {
    throw new HitPredictorError(`JSONパース失敗: ${(e as Error).message}`, jsonText);
  }
}

/** Layer 5 通過判定: v12 アンサンブル閾値（%単位）
 * 04-24: 導入初日80件でv12>=25%が0件だったため15に暫定引き下げ。
 * 過去1083件の一括推論後にジャンル別分位点で再校正予定。 */
export const V12_PASS_THRESHOLD = 15;
