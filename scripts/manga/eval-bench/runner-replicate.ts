/**
 * Replicate API 経由の画像生成ランナー
 *
 * 主な対象: Flux 2 Pro (`black-forest-labs/flux-2-pro`)
 * 単価: $0.015 + $0.015/megapixel (input + output)
 * Reference image: 最大8枚
 *
 * 認証: 環境変数 REPLICATE_API_TOKEN
 *
 * Replicate API は async (POST → polling) なので polling で完了を待つ。
 */

import "../_env";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

export type ReplicatePromptInput = {
  idx: number;
  label: string;
  prompt: string;
  /** Replicate の aspect_ratio 文字列。例: "16:9", "9:16", "1:1" */
  aspectRatio?: string;
  /** Reference 画像 URL (最大8枚)。ローカルパスは別途アップロード必要 */
  imageInputs?: string[];
  meta?: Record<string, unknown>;
};

export type ReplicateRunOptions = {
  experiment: string;
  prompts: ReplicatePromptInput[];
  /** モデル名。デフォルト: black-forest-labs/flux-2-pro */
  model?: string;
  /** 出力ベースディレクトリ */
  outputBaseDir?: string;
  /** polling interval ms */
  pollIntervalMs?: number;
  /** タイムアウト ms */
  timeoutMs?: number;
};

export type ReplicateResult = {
  idx: number;
  label: string;
  ok: boolean;
  outputPath?: string;
  predictionId?: string;
  durationMs?: number;
  error?: string;
};

const REPLICATE_API_BASE = "https://api.replicate.com/v1";

async function getToken(): Promise<string> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    throw new Error(
      "REPLICATE_API_TOKEN が未設定。.env.local に追加してください: REPLICATE_API_TOKEN=r8_xxxxx"
    );
  }
  return token;
}

async function createPrediction(args: {
  token: string;
  model: string;
  input: Record<string, unknown>;
}): Promise<{ id: string; status: string }> {
  const res = await fetch(`${REPLICATE_API_BASE}/models/${args.model}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.token}`,
      "Content-Type": "application/json",
      Prefer: "wait=60",
    },
    body: JSON.stringify({ input: args.input }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Replicate POST failed (${res.status}): ${text.slice(0, 500)}`);
  }
  const json = (await res.json()) as { id: string; status: string };
  return json;
}

async function getPrediction(args: {
  token: string;
  id: string;
}): Promise<{
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | string[] | null;
  error?: string | null;
}> {
  const res = await fetch(`${REPLICATE_API_BASE}/predictions/${args.id}`, {
    headers: { Authorization: `Bearer ${args.token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Replicate GET failed (${res.status}): ${text.slice(0, 500)}`);
  }
  return res.json() as Promise<{
    id: string;
    status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
    output?: string | string[] | null;
    error?: string | null;
  }>;
}

async function downloadFile(url: string, outputPath: string): Promise<number> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`画像ダウンロード失敗: ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, buf);
  return buf.byteLength;
}

export async function runReplicateExperiment(
  opts: ReplicateRunOptions
): Promise<ReplicateResult[]> {
  const token = await getToken();
  const model = opts.model ?? "black-forest-labs/flux-2-pro";
  const repoRoot = process.env.AINARO_REPO_ROOT ?? process.cwd();
  const baseDir =
    opts.outputBaseDir ??
    path.join(repoRoot, "data", "manga", "feasibility-week0", "eval-bench", "output");
  const outputDir = path.join(baseDir, "flux-2-pro", opts.experiment);
  await mkdir(outputDir, { recursive: true });
  const pollInterval = opts.pollIntervalMs ?? 2000;
  const timeout = opts.timeoutMs ?? 5 * 60 * 1000;

  console.log(`[replicate] model=${model} experiment=${opts.experiment} prompts=${opts.prompts.length}`);
  console.log(`[replicate] outputDir=${outputDir}`);

  const results: ReplicateResult[] = [];
  for (const p of opts.prompts) {
    const outputPath = path.join(outputDir, `${String(p.idx).padStart(2, "0")}.webp`);
    const startedAt = Date.now();
    console.log(`\n[replicate] [${p.idx}] ${p.label}`);

    try {
      const input: Record<string, unknown> = {
        prompt: p.prompt,
        aspect_ratio: p.aspectRatio ?? "1:1",
        output_format: "webp",
        output_quality: 90,
      };
      if (p.imageInputs && p.imageInputs.length > 0) {
        input.image_inputs = p.imageInputs.slice(0, 8); // Flux 2 Pro は最大8枚
      }

      const prediction = await createPrediction({ token, model, input });
      console.log(`[replicate]   prediction id=${prediction.id} status=${prediction.status}`);

      // Prefer:wait=60 で60秒以内に完了することが多いが、polling で念のため
      let status = prediction.status;
      let output: string | string[] | null | undefined;
      const deadline = startedAt + timeout;
      while (status !== "succeeded" && status !== "failed" && status !== "canceled") {
        if (Date.now() > deadline) throw new Error("polling timeout");
        await new Promise((r) => setTimeout(r, pollInterval));
        const cur = await getPrediction({ token, id: prediction.id });
        status = cur.status;
        output = cur.output;
        if (status === "failed") throw new Error(cur.error ?? "prediction failed");
      }

      if (status !== "succeeded") {
        throw new Error(`status=${status}`);
      }

      const cur = await getPrediction({ token, id: prediction.id });
      output = cur.output;
      const url = Array.isArray(output) ? output[0] : output;
      if (typeof url !== "string") throw new Error(`output url が取れない: ${JSON.stringify(output)}`);

      const bytes = await downloadFile(url, outputPath);
      results.push({
        idx: p.idx,
        label: p.label,
        ok: true,
        outputPath,
        predictionId: prediction.id,
        durationMs: Date.now() - startedAt,
      });
      console.log(`[replicate]   OK (${(bytes / 1024).toFixed(0)}KB, ${((Date.now() - startedAt) / 1000).toFixed(1)}s)`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ idx: p.idx, label: p.label, ok: false, error: message });
      console.error(`[replicate]   FAIL: ${message}`);
    }
  }

  // メタ JSON
  const metaPath = path.join(outputDir, "_meta.json");
  await writeFile(
    metaPath,
    JSON.stringify(
      {
        provider: "replicate",
        model,
        experiment: opts.experiment,
        generated_at: new Date().toISOString(),
        total: opts.prompts.length,
        success: results.filter((r) => r.ok).length,
        prompts: opts.prompts,
        results,
      },
      null,
      2
    )
  );
  console.log(`\n[replicate] DONE ${results.filter((r) => r.ok).length}/${opts.prompts.length}`);
  return results;
}
