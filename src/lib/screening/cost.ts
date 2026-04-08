// Anthropic Claude のコスト試算（USD）
// 価格は2026-04時点。価格改定時はここを更新する。

export interface ModelPricing {
  /** 1M input tokens あたりUSD */
  inputPerMTok: number;
  /** 1M output tokens あたりUSD */
  outputPerMTok: number;
}

export const PRICING: Record<string, ModelPricing> = {
  "claude-opus-4-6": { inputPerMTok: 15, outputPerMTok: 75 },
  "claude-sonnet-4-6": { inputPerMTok: 3, outputPerMTok: 15 },
  "claude-haiku-4-5": { inputPerMTok: 1, outputPerMTok: 5 },
};

export interface UsageEntry {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface CostSummary {
  totalUSD: number;
  byModel: Record<string, { inputTokens: number; outputTokens: number; usd: number }>;
  inputTokens: number;
  outputTokens: number;
}

/** 使用記録を集計してUSD換算 */
export function summarizeCost(entries: readonly UsageEntry[]): CostSummary {
  const byModel: CostSummary["byModel"] = {};
  let totalUSD = 0;
  let totalIn = 0;
  let totalOut = 0;

  for (const e of entries) {
    const p = PRICING[e.model];
    if (!p) continue;
    const usd = (e.inputTokens * p.inputPerMTok + e.outputTokens * p.outputPerMTok) / 1_000_000;
    if (!byModel[e.model]) {
      byModel[e.model] = { inputTokens: 0, outputTokens: 0, usd: 0 };
    }
    byModel[e.model].inputTokens += e.inputTokens;
    byModel[e.model].outputTokens += e.outputTokens;
    byModel[e.model].usd += usd;
    totalUSD += usd;
    totalIn += e.inputTokens;
    totalOut += e.outputTokens;
  }

  return { totalUSD, byModel, inputTokens: totalIn, outputTokens: totalOut };
}

/** Phase 2候補1件あたりの推定コスト */
export function perPromotedUSD(totalUSD: number, promotedCount: number): number {
  if (promotedCount === 0) return 0;
  return totalUSD / promotedCount;
}
