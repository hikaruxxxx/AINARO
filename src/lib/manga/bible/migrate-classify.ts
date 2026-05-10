import { detectUndefinedReferences } from "../qa-v2/undefined-reference-detector";
import type {
  Aspect,
  BibleSnapshotV2,
  BibleSnapshotV3,
  CharacterEntryV2,
  FactNode,
  Layer,
} from "../schemas-v2";
import { runCodexText } from "../llm/codex-text";
import { v2ToV3 } from "./v3-adapter";

export type RoleEnumViolation = {
  character_id: string;
  character_name: string;
  current_role: string;
  recommended_role:
    | "supporting"
    | "deuteragonist"
    | "antagonist"
    | "love_interest";
  recommended_subrole?: "heroine" | "villain_lieutenant" | "comic_relief";
  reason: string;
};

export type MigrationResult = {
  v3: BibleSnapshotV3;
  needsReview: FactNode[];
  unresolvedReferences: ReturnType<typeof detectUndefinedReferences>;
  roleEnumViolations: RoleEnumViolation[];
  factSourcePathIndex: Record<string, string>;
};

export type LlmRefineRoundResult = {
  round: number;
  suggested_layer: Layer | null;
  suggested_aspect: Aspect | null;
  confidence: number;
  rationale: string;
  failed?: boolean;
};

export type LlmRefineFactResult = {
  fact_id: string;
  rounds: LlmRefineRoundResult[];
  /** 周回間の不一致が大きいほど低くなる集計 confidence */
  aggregated_confidence: number;
  /** 全 round で同じ layer/aspect なら true、ばらつきあれば false */
  stable: boolean;
};

export type LlmRefineProgressRecord = {
  fact_id: string;
  round: number;
  result: LlmRefineRoundResult;
  ts: string;
};

export type LlmRefineOptions = {
  rounds?: number;
  maxParallel?: number;
  cwd?: string;
  timeoutMs?: number;
  /** progress callback for CLI logging */
  onProgress?: (event: {
    fact_id: string;
    round: number;
    status: "start" | "ok" | "failed";
    result?: LlmRefineRoundResult;
  }) => void;
  /** CLI resume 用: progress JSONL から復元した完了済み round */
  existingProgress?: LlmRefineProgressRecord[];
  /** CLI progress JSONL 追記用 */
  onRoundResult?: (record: LlmRefineProgressRecord) => void | Promise<void>;
};

export type MigrationWithLlmRefineResult = MigrationResult & {
  llm_refine: {
    rounds: number;
    fact_results: LlmRefineFactResult[];
    summary: {
      total_facts: number;
      stable_facts: number;
      unstable_facts: number;
      avg_confidence: number;
      median_confidence: number;
    };
  };
};

export function runMigration(v2: BibleSnapshotV2): MigrationResult {
  const v3 = v2ToV3(v2);
  const unresolvedReferences = detectUndefinedReferences(v2);
  const roleEnumViolations = findRoleEnumViolations(v2);
  const needsReview = v3.facts.filter(
    (fact) => (fact.evidence?.confidence ?? fact.confidence ?? 1.0) < 0.7
  );
  const factSourcePathIndex = Object.fromEntries(
    v3.facts.map((fact) => [fact.fact_id, fact.evidence?.source_path ?? ""])
  );

  return {
    v3,
    needsReview,
    unresolvedReferences,
    roleEnumViolations,
    factSourcePathIndex,
  };
}

export async function runMigrationWithLlmRefine(
  v2: BibleSnapshotV2,
  options: LlmRefineOptions = {}
): Promise<MigrationWithLlmRefineResult> {
  const rounds = Math.max(1, Math.floor(options.rounds ?? 3));
  const maxParallel = Math.min(
    5,
    Math.max(1, Math.floor(options.maxParallel ?? 5))
  );
  const timeoutMs = options.timeoutMs ?? 60_000;
  const migration = runMigration(v2);
  const existingByKey = new Map<string, LlmRefineRoundResult>();

  for (const record of options.existingProgress ?? []) {
    if (record.round < 1 || record.round > rounds) continue;
    existingByKey.set(roundKey(record.fact_id, record.round), record.result);
  }

  const factRoundResults = new Map<string, LlmRefineRoundResult[]>();

  for (let round = 1; round <= rounds; round++) {
    const pending = migration.v3.facts.filter(
      (fact) => !existingByKey.has(roundKey(fact.fact_id, round))
    );

    for (const fact of migration.v3.facts) {
      const existing = existingByKey.get(roundKey(fact.fact_id, round));
      if (!existing) continue;
      appendRoundResult(factRoundResults, fact.fact_id, existing);
    }

    await runWithConcurrency(pending, maxParallel, async (fact) => {
      options.onProgress?.({ fact_id: fact.fact_id, round, status: "start" });
      const result = await refineFactWithCodex(fact, {
        round,
        cwd: options.cwd,
        timeoutMs,
      });
      appendRoundResult(factRoundResults, fact.fact_id, result);
      const status = result.failed ? "failed" : "ok";
      options.onProgress?.({
        fact_id: fact.fact_id,
        round,
        status,
        result,
      });
      await options.onRoundResult?.({
        fact_id: fact.fact_id,
        round,
        result,
        ts: new Date().toISOString(),
      });
    });
  }

  const factResults = migration.v3.facts.map((fact) => {
    const factRounds = (factRoundResults.get(fact.fact_id) ?? [])
      .slice()
      .sort((a, b) => a.round - b.round);
    const aggregate = aggregateFactResult(fact, factRounds);
    fact.evidence.confidence = aggregate.aggregated_confidence;
    fact.confidence = aggregate.aggregated_confidence;
    return aggregate;
  });

  migration.needsReview = migration.v3.facts.filter(
    (fact) => (fact.evidence?.confidence ?? fact.confidence ?? 1.0) < 0.7
  );

  const confidences = factResults.map((fact) => fact.aggregated_confidence);
  const stableFacts = factResults.filter((fact) => fact.stable).length;

  return {
    ...migration,
    llm_refine: {
      rounds,
      fact_results: factResults,
      summary: {
        total_facts: factResults.length,
        stable_facts: stableFacts,
        unstable_facts: factResults.length - stableFacts,
        avg_confidence: average(confidences),
        median_confidence: median(confidences),
      },
    },
  };
}

export function findRoleEnumViolations(
  v2: BibleSnapshotV2
): RoleEnumViolation[] {
  const validRoles = new Set([
    "protagonist",
    "deuteragonist",
    "antagonist",
    "supporting",
    "mentor",
    "rival",
    "love_interest",
  ]);
  const out: RoleEnumViolation[] = [];

  for (const character of v2.characters) {
    const role = String((character as CharacterEntryV2).role);
    if (validRoles.has(role)) continue;

    let recommendedRole: RoleEnumViolation["recommended_role"] = "supporting";
    let recommendedSubrole:
      | RoleEnumViolation["recommended_subrole"]
      | undefined;
    let reason = `role="${role}" is not in valid enum`;

    if (role === "heroine") {
      recommendedRole = "supporting";
      recommendedSubrole = "heroine";
      reason = "role=heroine は enum 違反。supporting + subrole=heroine を推奨";
    }

    out.push({
      character_id: character.id,
      character_name: character.name,
      current_role: role,
      recommended_role: recommendedRole,
      recommended_subrole: recommendedSubrole,
      reason,
    });
  }

  return out;
}

export function countFactsByLayer(v3: BibleSnapshotV3): Record<Layer, number> {
  return v3.facts.reduce(
    (acc, fact) => {
      acc[fact.layer] += 1;
      return acc;
    },
    {
      in_world_belief: 0,
      revealed_at_volume: 0,
      meta_truth: 0,
      system_specification: 0,
      character_arc_state: 0,
    } satisfies Record<Layer, number>
  );
}

const LAYERS = new Set<Layer>([
  "in_world_belief",
  "revealed_at_volume",
  "meta_truth",
  "system_specification",
  "character_arc_state",
]);

const ASPECTS = new Set<Aspect>([
  "identity",
  "appearance",
  "psychology",
  "backstory",
  "speech",
  "relationship",
  "location_layout",
  "location_history",
  "prop_function",
  "prop_provenance",
  "world_rule",
  "system_param",
  "history_event",
  "faction_dynamics",
  "motif_meaning",
  "motif_directive",
]);

type CodexClassificationJson = {
  suggested_layer?: unknown;
  suggested_aspect?: unknown;
  confidence?: unknown;
  rationale?: unknown;
};

async function refineFactWithCodex(
  fact: FactNode,
  opts: { round: number; cwd?: string; timeoutMs: number }
): Promise<LlmRefineRoundResult> {
  try {
    const response = await runCodexText<CodexClassificationJson>({
      task: buildRefinePrompt(fact),
      format: "json",
      cwd: opts.cwd,
      timeoutMs: opts.timeoutMs,
      maxRetries: 0,
    });
    return normalizeCodexResult(opts.round, response.parsed);
  } catch (error) {
    return {
      round: opts.round,
      suggested_layer: null,
      suggested_aspect: null,
      confidence: 0,
      rationale: `LLM refine failed: ${(error as Error).message.slice(0, 160)}`,
      failed: true,
    };
  }
}

function normalizeCodexResult(
  round: number,
  parsed: CodexClassificationJson | null
): LlmRefineRoundResult {
  if (!parsed) {
    return {
      round,
      suggested_layer: null,
      suggested_aspect: null,
      confidence: 0,
      rationale: "LLM output JSON was empty",
      failed: true,
    };
  }

  const confidence =
    typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
      ? clamp(parsed.confidence, 0, 1)
      : 0;
  const rationale =
    typeof parsed.rationale === "string" ? parsed.rationale.slice(0, 200) : "";
  const suggestedLayer =
    typeof parsed.suggested_layer === "string" && LAYERS.has(parsed.suggested_layer as Layer)
      ? (parsed.suggested_layer as Layer)
      : null;
  const suggestedAspect =
    typeof parsed.suggested_aspect === "string" && ASPECTS.has(parsed.suggested_aspect as Aspect)
      ? (parsed.suggested_aspect as Aspect)
      : null;

  return {
    round,
    suggested_layer: suggestedLayer,
    suggested_aspect: suggestedAspect,
    confidence,
    rationale,
  };
}

function aggregateFactResult(
  fact: FactNode,
  rounds: LlmRefineRoundResult[]
): LlmRefineFactResult {
  const avg = average(rounds.map((round) => round.confidence));
  const classifications = rounds.map((round) => ({
    layer: round.suggested_layer ?? fact.layer,
    aspect: round.suggested_aspect ?? fact.aspect,
  }));
  const stable =
    classifications.length > 0 &&
    classifications.every(
      (classification) =>
        classification.layer === classifications[0].layer &&
        classification.aspect === classifications[0].aspect
    );
  const hasFailure = rounds.some((round) => round.failed);
  let aggregated = avg;
  if (!stable) aggregated *= 0.5;
  if (hasFailure) aggregated -= 0.2;

  return {
    fact_id: fact.fact_id,
    rounds,
    aggregated_confidence: clamp(roundTo3(aggregated), 0, 1),
    stable,
  };
}

function buildRefinePrompt(fact: FactNode): string {
  return `あなたは AINARO 漫画 bible の V3 fact-based schema 分類検証エージェントです。

## fact の現状分類
- fact_id: ${fact.fact_id}
- entity_id: ${fact.entity_id ?? "_world"}
- aspect: ${fact.aspect}
- layer: ${fact.layer}
- evidence.source_path: ${fact.evidence?.source_path}

## fact body (200-2000 字)
${fact.body}

## 判定観点

### Layer (5 値)
- in_world_belief: 世間が信じている、第1巻時点の常識
- revealed_at_volume: 第N巻で読者に開示される真相
- meta_truth: 著者だけ知る最終真理
- system_specification: 機械的仕様 (数値・閾値)
- character_arc_state: 巻ごとの内的状態

### Aspect (16 値)
identity / appearance / psychology / backstory / speech / relationship /
location_layout / location_history / prop_function / prop_provenance /
world_rule / system_param / history_event / faction_dynamics /
motif_meaning / motif_directive

## 指示
1. 上記 fact の layer/aspect が妥当か判定
2. 妥当でなければ正しい layer/aspect を提案
3. confidence を 0.0-1.0 で返す (高いほど現状分類が正しい)
4. rationale を 200 字以内で

## 出力 JSON
\`\`\`json
{
  "suggested_layer": "in_world_belief",
  "suggested_aspect": "psychology",
  "confidence": 0.85,
  "rationale": "..."
}
\`\`\``;
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const item = items[next++];
        await worker(item);
      }
    }
  );
  await Promise.all(workers);
}

function appendRoundResult(
  map: Map<string, LlmRefineRoundResult[]>,
  factId: string,
  result: LlmRefineRoundResult
): void {
  const results = map.get(factId) ?? [];
  if (!results.some((existing) => existing.round === result.round)) {
    results.push(result);
  }
  map.set(factId, results);
}

function roundKey(factId: string, round: number): string {
  return `${factId}\u0000${round}`;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTo3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
