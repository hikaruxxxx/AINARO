/**
 * Week 0 実験用共通ランナー
 *
 * 各 pilot-*.ts / main-*.ts スクリプトから利用される共通基盤。
 * - 実験ごとにプロンプト配列を受け取り、順次 codex-image.ts で生成
 * - 出力先: data/manga/feasibility-week0/{stage}/{experiment}/{idx}.png
 * - メタ JSON: 同ディレクトリの _meta.json (prompt / size / refs / 結果)
 * - 失敗は記録して続行（rate limit や 1枚失敗でバッチ全体を止めない）
 *
 * 実行はユーザーが手動で行う前提（ChatGPT Pro 定額枠を消費するため）。
 */

import "../_env";
import {
  generateMangaImage,
  type MangaImageSize,
} from "@/lib/manga/generate/codex-image";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

export type ExperimentPrompt = {
  /** 連番 (1-indexed)。出力ファイル名 = `${idx}.png` */
  idx: number;
  /** プロンプトの目的を1行で（メタJSONに記録） */
  label: string;
  /** 英語推奨の画像生成プロンプト */
  prompt: string;
  /** 出力サイズ */
  size: MangaImageSize;
  /** 参照画像のローカルパス（あれば） */
  referenceImagePaths?: string[];
  /** メタJSONに残す任意情報 */
  meta?: Record<string, unknown>;
};

export type ExperimentResult = {
  idx: number;
  label: string;
  ok: boolean;
  outputPath?: string;
  sizeBytes?: number;
  attempts?: number;
  durationMs?: number;
  error?: string;
};

export type RunExperimentOptions = {
  /** "pilot" | "main" など */
  stage: "pilot" | "main";
  /** 実験名（ディレクトリ名にも使う）例: "style-pilot" */
  experiment: string;
  /** プロンプト一覧 */
  prompts: ExperimentPrompt[];
  /** 出力ベース。デフォルト: data/manga/feasibility-week0 */
  outputBaseDir?: string;
  /** Codex タイムアウト (ms)。デフォルト 5分 */
  timeoutMs?: number;
};

export async function runExperiment(
  opts: RunExperimentOptions
): Promise<ExperimentResult[]> {
  const repoRoot = process.env.AINARO_REPO_ROOT ?? process.cwd();
  const baseDir =
    opts.outputBaseDir ?? path.join(repoRoot, "data", "manga", "feasibility-week0");
  const outputDir = path.join(baseDir, opts.stage, opts.experiment);
  await mkdir(outputDir, { recursive: true });

  console.log(
    `[runner] stage=${opts.stage} experiment=${opts.experiment} prompts=${opts.prompts.length}`
  );
  console.log(`[runner] outputDir=${outputDir}`);

  const results: ExperimentResult[] = [];
  for (const p of opts.prompts) {
    const outputPath = path.join(outputDir, `${String(p.idx).padStart(2, "0")}.png`);
    console.log(
      `\n[runner] [${p.idx}/${opts.prompts.length}] ${p.label} → ${path.basename(outputPath)}`
    );

    try {
      const startedAt = Date.now();
      const result = await generateMangaImage({
        prompt: p.prompt,
        outputPath,
        size: p.size,
        referenceImagePaths: p.referenceImagePaths,
        timeoutMs: opts.timeoutMs ?? 5 * 60 * 1000,
      });
      results.push({
        idx: p.idx,
        label: p.label,
        ok: true,
        outputPath: result.outputPath,
        sizeBytes: result.sizeBytes,
        attempts: result.attempts,
        durationMs: Date.now() - startedAt,
      });
      console.log(
        `[runner]   OK (${(result.sizeBytes / 1024).toFixed(0)}KB, ${result.attempts}回試行, ${((Date.now() - startedAt) / 1000).toFixed(1)}s)`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ idx: p.idx, label: p.label, ok: false, error: message });
      console.error(`[runner]   FAIL: ${message}`);
    }
  }

  // メタ JSON 保存
  const metaPath = path.join(outputDir, "_meta.json");
  const meta = {
    stage: opts.stage,
    experiment: opts.experiment,
    generated_at: new Date().toISOString(),
    total: opts.prompts.length,
    success: results.filter((r) => r.ok).length,
    fail: results.filter((r) => !r.ok).length,
    prompts: opts.prompts.map((p) => ({
      idx: p.idx,
      label: p.label,
      prompt: p.prompt,
      size: p.size,
      referenceImagePaths: p.referenceImagePaths ?? [],
      meta: p.meta ?? {},
    })),
    results,
  };
  await writeFile(metaPath, JSON.stringify(meta, null, 2));
  console.log(`\n[runner] メタJSON保存: ${metaPath}`);

  const ok = results.filter((r) => r.ok).length;
  console.log(`[runner] DONE ${ok}/${opts.prompts.length} 成功`);
  return results;
}
