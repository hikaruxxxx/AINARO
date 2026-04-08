// Layer 1: ログライン生成
//
// 役割:
// - works/{slug}/_meta.json から seed を読む
// - seed-v2.ts の buildLoglinePrompt でプロンプト構築
// - claude -p で生成
// - パース失敗 or 空文字なら failed
// - 成功したら works/{slug}/layer1_logline.md に保存

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { callClaudeCli, extractJsonBlock } from "../claude-cli";
import { buildLoglinePrompt, type SeedV2 } from "../seed-v2";

export interface Layer1Result {
  ok: boolean;
  logline?: string;
  reason?: string;
}

export interface WorkMetaFile {
  slug: string;
  seed: SeedV2;
  createdAt: string;
}

export async function runLayer1(slug: string, worksDir = "data/generation/works"): Promise<Layer1Result> {
  const workDir = join(worksDir, slug);
  const metaPath = join(workDir, "_meta.json");
  if (!existsSync(metaPath)) {
    return { ok: false, reason: "meta_not_found" };
  }
  const meta = JSON.parse(readFileSync(metaPath, "utf-8")) as WorkMetaFile;
  if (!meta.seed) {
    return { ok: false, reason: "seed_missing_in_meta" };
  }

  const prompt = buildLoglinePrompt(meta.seed);
  let raw: string;
  try {
    raw = await callClaudeCli(prompt, { layer: "layer1", slug });
  } catch (e) {
    return { ok: false, reason: `claude_call_failed: ${(e as Error).message}` };
  }

  const parsed = extractJsonBlock(raw) as { logline?: string } | null;
  const logline = parsed?.logline?.trim();
  if (!logline) {
    return { ok: false, reason: "logline_parse_failed" };
  }
  // 80字制限の事後チェック(緩めに100字までは許容)
  if (logline.length > 100) {
    return { ok: false, reason: `logline_too_long(${logline.length})` };
  }

  const outPath = join(workDir, "layer1_logline.md");
  writeFileSync(outPath, `# ログライン\n\n${logline}\n`);
  return { ok: true, logline };
}
