// 下位作品（hit確率<20%）を学習データとして data/training/negative/ に保存
// Step 4 で「下位の学習データ化を本当に実行」を保証する。

import { mkdirSync, copyFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

export interface NegativeSample {
  slug: string;
  episodeMdPath: string;
  screeningResult: unknown;
}

export function saveNegativeSamples(
  batchId: string,
  samples: readonly NegativeSample[],
  rootDir = "data/training/negative",
): number {
  const dest = join(rootDir, batchId);
  mkdirSync(dest, { recursive: true });
  let saved = 0;
  for (const s of samples) {
    const slugDir = join(dest, s.slug);
    mkdirSync(slugDir, { recursive: true });
    if (existsSync(s.episodeMdPath)) {
      copyFileSync(s.episodeMdPath, join(slugDir, "ep001.md"));
    }
    writeFileSync(
      join(slugDir, "screening_result.json"),
      JSON.stringify(s.screeningResult, null, 2),
    );
    saved++;
  }
  return saved;
}

/** 期待件数と一致するか検証（assert失敗は致命扱い） */
export function assertNegativeCount(saved: number, expected: number): void {
  if (saved !== expected) {
    throw new Error(
      `negative学習データ保存件数が一致しません: 期待${expected}件 / 実際${saved}件`,
    );
  }
}
