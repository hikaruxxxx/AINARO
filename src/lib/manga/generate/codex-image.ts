/**
 * 漫画パイプライン用 Codex CLI 経由 gpt-image アダプタ
 *
 * 既存 `src/lib/cover/codex-image.ts` の表紙生成パターンを流用し、
 * 漫画パネル・キャラ参照画像・ロケ参照画像など複数用途に対応する汎用ラッパー。
 *
 * 主な拡張:
 *  - サイズ可変（1024x1024 / 1024x1536 / 1536x1024 / 1080x1920 等）
 *  - reference image 注入のヒント文を組み立てる helper
 *  - メタ情報（attempts, durationMs, sizeBytes）を返す
 */

import { spawn } from "child_process";
import { existsSync, statSync, mkdtempSync, rmSync, copyFileSync } from "fs";
import os from "os";
import path from "path";

import { checkAndReserveQuota, recordGeneration } from "../_ledger/quota";

export type MangaImageSize = {
  width: number;
  height: number;
};

export type GenerateMangaImageOptions = {
  /** 英語推奨の画像生成プロンプト */
  prompt: string;
  /** 出力ファイルの絶対パス（PNG または WebP） */
  outputPath: string;
  /** 画像サイズ。GPT Image系の許容比率に合わせる */
  size: MangaImageSize;
  /** 参照画像のパス（あれば渡し、Codex に「reference として参照」させる） */
  referenceImagePaths?: string[];
  /** Codex を実行する作業ディレクトリ */
  cwd?: string;
  /** subprocess タイムアウト ms */
  timeoutMs?: number;
  /** 期待最低ファイルサイズ */
  minFileSize?: number;
  /** リトライ回数 */
  maxRetries?: number;
  /** ChatGPT Pro 枠 ledger 用コンテキスト */
  ledgerContext?: {
    slug: string;
    episode?: number;
    layer: string;
    page?: number;
  };
};

export type GenerateMangaImageResult = {
  outputPath: string;
  sizeBytes: number;
  width: number;
  height: number;
  attempts: number;
  totalDurationMs: number;
};

function buildTask(args: {
  prompt: string;
  outputPath: string;
  size: MangaImageSize;
  referenceImagePaths?: string[];
}): string {
  const refBlock =
    args.referenceImagePaths && args.referenceImagePaths.length > 0
      ? [
          "",
          "## 参照画像（このプロンプトに添付済み = `-i` でマルチモーダル入力されている）",
          `添付された ${args.referenceImagePaths.length} 枚の画像を **必ず** \`image_gen\` ツールの reference として使い、`,
          "キャラの顔・髪型・衣装・ロケのレイアウト・プロップのデザイン・画風(線/トーン)を一致させること。",
          "添付順とロール対応:",
          ...args.referenceImagePaths.map((p, i) => `  ${i + 1}. \`${p}\``),
        ].join("\n")
      : "";

  return [
    "次のタスクを実行してください。報告は最小限で構いません。",
    "",
    "1. `image_gen` ツールを使って下記の英語プロンプトで画像を1枚生成する。**添付画像を reference として image_gen に必ず渡すこと**。",
    `2. サイズは ${args.size.width}x${args.size.height} ピクセル。`,
    `3. 生成した画像を必ず次の絶対パスに保存する: \`${args.outputPath}\``,
    "4. 保存後、ファイルが実際に存在しサイズが 50KB 以上あることを `ls -la` で確認する。",
    "5. 不要な作業（README作成・コミット・テストなど）は一切行わない。画像生成と保存のみ。",
    refBlock,
    "",
    "## 英語プロンプト",
    "```",
    args.prompt,
    "```",
    "",
    "完了したら、生成画像のパスとファイルサイズだけを1行で報告してください。",
  ].join("\n");
}

async function runCodexOnce(opts: {
  task: string;
  cwd: string;
  timeoutMs: number;
  referenceImagePaths?: string[];
}): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    // codex CLI 0.125+ では cwd が git repo であっても session 経由で
    // "Not inside a trusted directory" を返すケースがあるため、
    // 明示的に --skip-git-repo-check を渡す (Pro 定額枠で課金ゼロ、安全)。
    const args: string[] = [
      "exec",
      "--sandbox",
      "workspace-write",
      "--skip-git-repo-check",
      "--cd",
      opts.cwd,
    ];
    // -i FILE で参照画像をマルチモーダル添付。codex agent (gpt-5.5) が
    // image_gen ツールに reference として渡すよう prompt 内で明示。
    for (const p of opts.referenceImagePaths ?? []) {
      args.push("-i", p);
    }
    args.push("-");

    // detached: true で新しい process group を作る → タイムアウト時に
    // process group 全体を kill して grandchild (codex バイナリ) が
    // orphan 化するのを防ぐ (orphan が残ると同一 ChatGPT セッションで衝突する)。
    const child = spawn("codex", args, {
      cwd: opts.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      detached: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));

    const timer = setTimeout(() => {
      if (child.pid) {
        try {
          // 負の PID で process group 全体に SIGKILL
          process.kill(-child.pid, "SIGKILL");
        } catch {
          // process group が既に消えていれば無視
          try { child.kill("SIGKILL"); } catch {}
        }
      }
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
 * Codex CLI 経由で漫画用画像を生成する。
 */
export async function generateMangaImage(
  options: GenerateMangaImageOptions
): Promise<GenerateMangaImageResult> {
  // 2026-06-11: 並列実行時の成果物衝突対策。cwd 未指定時は呼び出しごとに専用の
  // 一時ディレクトリを作る。従来は process.cwd() を全並列コールで共有しており、
  // codex agent の image_gen 中間生成物が衝突して別ページに同一画像が保存される
  // race が発生した (a07 ep01 v59 一括 render で p05 と p06 がバイト同一)。
  const ownsCwd = !options.cwd;
  const cwd = options.cwd ?? mkdtempSync(path.join(os.tmpdir(), "manga-imgen-"));
  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
  // codex は --sandbox workspace-write のため cwd 配下にしか書き込めない。
  // tmpdir 隔離時は agent には tmpdir 内の一時ファイルへ保存させ、最終的な
  // outputPath への配置は Node 側 (sandbox 外) でコピーする。これにより
  // 「最終書込は必ず呼び出し元プロセスが行う」構造になり、agent 側の挙動に
  // 依存しない衝突排除になる。
  const minFileSize = options.minFileSize ?? 50 * 1024;
  const maxRetries = options.maxRetries ?? 1;

  const absOutput = path.isAbsolute(options.outputPath)
    ? options.outputPath
    : path.resolve(cwd, options.outputPath);
  // agent に書かせるパス: tmpdir 隔離時は sandbox 内 (cwd/out.png)、cwd 指定時は従来通り直接
  const agentOutput = ownsCwd ? path.join(cwd, "out.png") : absOutput;

  const ledgerDecision = options.ledgerContext
    ? await checkAndReserveQuota({
        ...options.ledgerContext,
        estimatedCalls: 1,
      })
    : null;
  const ledgerAccount = ledgerDecision?.account ?? "pro";
  if (ledgerAccount === "api" && process.env.OPENAI_API_KEY_BACKUP) {
    process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY_BACKUP;
  }

  const task = buildTask({
    prompt: options.prompt,
    outputPath: agentOutput,
    size: options.size,
    referenceImagePaths: options.referenceImagePaths,
  });

  const startedAt = Date.now();
  let lastError: Error | null = null;

  // 専用 tmpdir を作った場合のみ後始末する (cwd 指定時は触らない)
  const cleanupTempCwd = () => {
    if (!ownsCwd) return;
    try { rmSync(cwd, { recursive: true, force: true }); } catch { /* 後始末失敗は無視 */ }
  };

  async function recordLedgerSuccess(durationMs: number, retryCount: number): Promise<void> {
    if (!options.ledgerContext) return;
    await recordGeneration({
      ...options.ledgerContext,
      account: ledgerAccount,
      durationMs,
      outputPath: absOutput,
      retry_count: retryCount,
    });
  }

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const { stdout, stderr, exitCode } = await runCodexOnce({
        task,
        cwd,
        timeoutMs,
        referenceImagePaths: options.referenceImagePaths,
      });

      if (exitCode !== 0) {
        throw new Error(
          `Codex CLI が異常終了 (exit=${exitCode}): ${stderr.slice(-500)}`
        );
      }

      if (!existsSync(agentOutput)) {
        throw new Error(
          `画像ファイルが生成されていません: ${agentOutput}\n--- Codex stdout (末尾) ---\n${stdout.slice(-800)}`
        );
      }

      const stat = statSync(agentOutput);
      if (stat.size < minFileSize) {
        throw new Error(
          `画像ファイルが小さすぎます (${stat.size} bytes < ${minFileSize}): ${agentOutput}`
        );
      }

      if (agentOutput !== absOutput) copyFileSync(agentOutput, absOutput);
      const totalDurationMs = Date.now() - startedAt;
      await recordLedgerSuccess(totalDurationMs, attempt - 1);
      cleanupTempCwd();
      return {
        outputPath: absOutput,
        sizeBytes: stat.size,
        width: options.size.width,
        height: options.size.height,
        attempts: attempt,
        totalDurationMs,
      };
    } catch (err) {
      lastError = err as Error;

      // ファイル救済: タイムアウト時など codex CLI が exit しなくても
      // image_gen 自体は完了して PNG が保存されているケースがある。
      // 出力ファイルが存在し最低サイズを満たしていれば成功扱いにする。
      if (existsSync(agentOutput)) {
        try {
          const stat = statSync(agentOutput);
          if (stat.size >= minFileSize) {
            console.warn(
              `[manga-codex-image] 試行 ${attempt} が "${lastError.message}" で失敗したが、` +
                `出力ファイルは保存済 (${(stat.size / 1024).toFixed(0)}KB)。成功扱いで返却。`
            );
            if (agentOutput !== absOutput) copyFileSync(agentOutput, absOutput);
            const totalDurationMs = Date.now() - startedAt;
            await recordLedgerSuccess(totalDurationMs, attempt - 1);
            cleanupTempCwd();
            return {
              outputPath: absOutput,
              sizeBytes: stat.size,
              width: options.size.width,
              height: options.size.height,
              attempts: attempt,
              totalDurationMs,
            };
          }
        } catch {
          // statSync 失敗は無視 → 通常のリトライへ
        }
      }

      if (attempt > maxRetries) break;
      console.warn(
        `[manga-codex-image] 試行 ${attempt} 失敗: ${lastError.message}\n  リトライ中...`
      );
    }
  }

  cleanupTempCwd();
  throw new Error(
    `Codex 画像生成に失敗（${maxRetries + 1}回試行）: ${lastError?.message}`
  );
}

/**
 * 推奨サイズプリセット
 * 横読み (2026-04-30 ピボット後): page_b5 / spread / panel_*
 * 縦読み (旧): vertical_* / splash / square (互換のため残置)
 */
export const MANGA_SIZE_PRESETS = {
  // === 横読み (現行) ===
  /** B5縦ページ単位（gpt-image-2 で full manga page を出す場合） */
  page_b5: { width: 1024, height: 1536 } as MangaImageSize,
  /** 見開き横長（扉絵・クライマックス） */
  spread: { width: 1536, height: 1024 } as MangaImageSize,
  /** 横長コマ（3段組の上段、establishing） */
  panel_landscape: { width: 1536, height: 1024 } as MangaImageSize,
  /** 縦長コマ（T字割りの縦軸、感情ショット） */
  panel_portrait: { width: 1024, height: 1536 } as MangaImageSize,
  /** 正方形コマ（情報・タメ・リアクション） */
  panel_square: { width: 1024, height: 1024 } as MangaImageSize,
  /** 縦長大ゴマ（見せ場、扉絵） */
  panel_tall: { width: 1024, height: 1536 } as MangaImageSize,

  // === 縦読み (旧、互換のため残置) ===
  /** 縦読み標準パネル */
  vertical_standard: { width: 1024, height: 1536 } as MangaImageSize,
  /** 縦長大ゴマ（クライマックス用） */
  vertical_big: { width: 1024, height: 1536 } as MangaImageSize,
  /** スプラッシュ（縦読みでは超大ゴマ） */
  splash: { width: 1024, height: 1536 } as MangaImageSize,
  /** 正方形コマ */
  square: { width: 1024, height: 1024 } as MangaImageSize,

  // === 共通 ===
  /** キャラ参照立ち絵（縦長） */
  character_ref: { width: 1024, height: 1536 } as MangaImageSize,
  /** ロケ参照（横長） */
  location_ref: { width: 1536, height: 1024 } as MangaImageSize,
  /** SNSサムネ（正方形） */
  thumbnail: { width: 1024, height: 1024 } as MangaImageSize,
} as const;

export type MangaSizePresetKey = keyof typeof MANGA_SIZE_PRESETS;
