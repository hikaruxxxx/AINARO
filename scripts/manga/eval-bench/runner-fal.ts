/**
 * fal.ai API 経由の画像生成ランナー
 *
 * 主な対象: Qwen-Image 2.0 (`fal-ai/qwen-image-2/text-to-image`)
 * 単価: $0.035/枚 (standard), $0.075/枚 (Pro)
 * Reference image: image_url (image-to-image 系の edit endpoint で利用)
 *
 * 認証: 環境変数 FAL_KEY
 *
 * fal は queue 経由 + polling でも動くが、シンプルな同期エンドポイント https://fal.run/{model} もある。
 * このランナーは https://queue.fal.run/{model} の非同期キュー方式を使う（rate limit 対応のため）。
 */

import "../_env";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

export type FalPromptInput = {
  idx: number;
  label: string;
  prompt: string;
  /** fal の image_size: "square_hd" | "portrait_4_3" | "landscape_16_9" など or {width,height} */
  imageSize?:
    | "square_hd"
    | "portrait_4_3"
    | "portrait_16_9"
    | "landscape_4_3"
    | "landscape_16_9"
    | { width: number; height: number };
  /** 参照画像 URL (edit endpoint 用) */
  imageUrl?: string;
  meta?: Record<string, unknown>;
};

export type FalRunOptions = {
  experiment: string;
  prompts: FalPromptInput[];
  /** モデルパス。デフォルト: fal-ai/qwen-image-2/text-to-image */
  model?: string;
  outputBaseDir?: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
};

export type FalResult = {
  idx: number;
  label: string;
  ok: boolean;
  outputPath?: string;
  requestId?: string;
  durationMs?: number;
  error?: string;
};

const FAL_QUEUE_BASE = "https://queue.fal.run";

async function getToken(): Promise<string> {
  const token = process.env.FAL_KEY;
  if (!token) {
    throw new Error("FAL_KEY が未設定。.env.local に追加してください: FAL_KEY=...");
  }
  return token;
}

async function submitJob(args: {
  token: string;
  model: string;
  input: Record<string, unknown>;
}): Promise<{ request_id: string; status: string }> {
  const res = await fetch(`${FAL_QUEUE_BASE}/${args.model}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${args.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args.input),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`fal POST failed (${res.status}): ${text.slice(0, 500)}`);
  }
  return res.json() as Promise<{ request_id: string; status: string }>;
}

async function getStatus(args: {
  token: string;
  model: string;
  requestId: string;
}): Promise<{ status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED" }> {
  const res = await fetch(
    `${FAL_QUEUE_BASE}/${args.model}/requests/${args.requestId}/status`,
    {
      headers: { Authorization: `Key ${args.token}` },
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`fal status GET failed (${res.status}): ${text.slice(0, 500)}`);
  }
  return res.json() as Promise<{ status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED" }>;
}

async function getResponse(args: {
  token: string;
  model: string;
  requestId: string;
}): Promise<{ images?: Array<{ url: string }>; image?: { url: string } }> {
  const res = await fetch(
    `${FAL_QUEUE_BASE}/${args.model}/requests/${args.requestId}`,
    {
      headers: { Authorization: `Key ${args.token}` },
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`fal response GET failed (${res.status}): ${text.slice(0, 500)}`);
  }
  return res.json();
}

async function downloadFile(url: string, outputPath: string): Promise<number> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`画像ダウンロード失敗: ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, buf);
  return buf.byteLength;
}

export async function runFalExperiment(opts: FalRunOptions): Promise<FalResult[]> {
  const token = await getToken();
  const model = opts.model ?? "fal-ai/qwen-image-2/text-to-image";
  const repoRoot = process.env.AINARO_REPO_ROOT ?? process.cwd();
  const baseDir =
    opts.outputBaseDir ??
    path.join(repoRoot, "data", "manga", "feasibility-week0", "eval-bench", "output");
  const outputDir = path.join(baseDir, "qwen-image-2", opts.experiment);
  await mkdir(outputDir, { recursive: true });
  const pollInterval = opts.pollIntervalMs ?? 2000;
  const timeout = opts.timeoutMs ?? 3 * 60 * 1000;

  console.log(`[fal] model=${model} experiment=${opts.experiment} prompts=${opts.prompts.length}`);
  console.log(`[fal] outputDir=${outputDir}`);

  const results: FalResult[] = [];
  for (const p of opts.prompts) {
    const outputPath = path.join(outputDir, `${String(p.idx).padStart(2, "0")}.png`);
    const startedAt = Date.now();
    console.log(`\n[fal] [${p.idx}] ${p.label}`);

    try {
      const input: Record<string, unknown> = {
        prompt: p.prompt,
        image_size: p.imageSize ?? "square_hd",
      };
      if (p.imageUrl) input.image_url = p.imageUrl;

      const job = await submitJob({ token, model, input });
      console.log(`[fal]   request_id=${job.request_id} status=${job.status}`);

      let status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED" = "IN_QUEUE";
      const deadline = startedAt + timeout;
      while (status !== "COMPLETED" && status !== "FAILED") {
        if (Date.now() > deadline) throw new Error("polling timeout");
        await new Promise((r) => setTimeout(r, pollInterval));
        const cur = await getStatus({ token, model, requestId: job.request_id });
        status = cur.status;
      }
      if (status === "FAILED") throw new Error("fal status=FAILED");

      const response = await getResponse({ token, model, requestId: job.request_id });
      const url =
        response.images?.[0]?.url ?? response.image?.url ?? null;
      if (!url) throw new Error(`response から image url が取れない: ${JSON.stringify(response).slice(0, 300)}`);

      const bytes = await downloadFile(url, outputPath);
      results.push({
        idx: p.idx,
        label: p.label,
        ok: true,
        outputPath,
        requestId: job.request_id,
        durationMs: Date.now() - startedAt,
      });
      console.log(`[fal]   OK (${(bytes / 1024).toFixed(0)}KB, ${((Date.now() - startedAt) / 1000).toFixed(1)}s)`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ idx: p.idx, label: p.label, ok: false, error: message });
      console.error(`[fal]   FAIL: ${message}`);
    }
  }

  const metaPath = path.join(outputDir, "_meta.json");
  await writeFile(
    metaPath,
    JSON.stringify(
      {
        provider: "fal",
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
  console.log(`\n[fal] DONE ${results.filter((r) => r.ok).length}/${opts.prompts.length}`);
  return results;
}
