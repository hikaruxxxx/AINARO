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
import { deriveFactId, v2ToV3 } from "./v3-adapter";

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

export type SubSplitArgs = {
  v2: BibleSnapshotV2;
  entity_id: string | null;
  source_path: string;
  body: string;
  default_aspect: Aspect;
  cwd?: string;
  timeoutMs?: number;
};

export type SubSplitResult = {
  facts: FactNode[];
  failed?: boolean;
  error?: string;
};

export type SubSplitOptions = {
  maxParallel?: number;
  cwd?: string;
  timeoutMs?: number;
  onProgress?: (event: {
    source_path: string;
    status: "start" | "ok" | "failed";
    sub_count?: number;
  }) => void;
};

export type MigrationWithSubSplitResult = MigrationResult & {
  sub_split: {
    fields_processed: number;
    sub_facts_total: number;
    failed_fields: number;
    summary: {
      original_facts: number;
      after_sub_split: number;
      expansion_ratio: number;
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
  return refineMigrationWithLlm(runMigration(v2), options);
}

export async function refineMigrationWithLlm(
  migration: MigrationResult,
  options: LlmRefineOptions = {}
): Promise<MigrationWithLlmRefineResult> {
  const rounds = Math.max(1, Math.floor(options.rounds ?? 3));
  const maxParallel = Math.min(
    5,
    Math.max(1, Math.floor(options.maxParallel ?? 5))
  );
  const timeoutMs = options.timeoutMs ?? 60_000;
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

export async function subSplitFieldIntoLayers(
  args: SubSplitArgs
): Promise<SubSplitResult> {
  try {
    const response = await runCodexText<CodexSubSplitJson>({
      task: buildSubSplitPrompt(args),
      format: "json",
      cwd: args.cwd,
      timeoutMs: args.timeoutMs ?? 60_000,
      maxRetries: 0,
    });
    const facts = normalizeSubSplitResult(args, response.parsed);
    if (facts.length === 0) {
      return {
        facts: [],
        failed: true,
        error: "LLM sub-split output had no valid sub_facts",
      };
    }
    return { facts };
  } catch (error) {
    return {
      facts: [],
      failed: true,
      error: `LLM sub-split failed: ${(error as Error).message.slice(0, 200)}`,
    };
  }
}

export async function runMigrationWithSubSplit(
  v2: BibleSnapshotV2,
  options: SubSplitOptions = {}
): Promise<MigrationWithSubSplitResult> {
  const migration = runMigration(v2);
  const originalFacts = migration.v3.facts.length;
  const maxParallel = Math.min(
    10,
    Math.max(1, Math.floor(options.maxParallel ?? 5))
  );
  const timeoutMs = options.timeoutMs ?? 60_000;
  const candidates = collectSubSplitTargets(v2);
  const factBySourcePath = new Map(
    migration.v3.facts.map((fact) => [fact.evidence?.source_path ?? "", fact])
  );
  const targets = candidates.filter((target) => target.body.trim().length > 0);
  const results = new Map<string, SubSplitResult>();

  await runWithConcurrency(targets, maxParallel, async (target) => {
    options.onProgress?.({ source_path: target.source_path, status: "start" });
    const result = await subSplitFieldIntoLayers({
      v2,
      entity_id: target.entity_id,
      source_path: target.source_path,
      body: target.body,
      default_aspect: target.default_aspect,
      cwd: options.cwd,
      timeoutMs,
    });
    const original = factBySourcePath.get(target.source_path);
    result.facts.forEach((fact, index) => {
      fact.priority = (original?.priority ?? originalFacts) + index / 1000;
    });
    results.set(target.source_path, result);
    options.onProgress?.({
      source_path: target.source_path,
      status: result.failed ? "failed" : "ok",
      sub_count: result.facts.length,
    });
  });

  const successfulSourcePaths = new Set(
    [...results.entries()]
      .filter(([, result]) => !result.failed && result.facts.length > 0)
      .map(([sourcePath]) => sourcePath)
  );
  const failedFields = [...results.values()].filter((result) => result.failed)
    .length;
  const subFacts = [...results.values()]
    .filter((result) => !result.failed)
    .flatMap((result) => result.facts);

  const retainedFacts = migration.v3.facts.filter(
    (fact) => !successfulSourcePaths.has(fact.evidence?.source_path ?? "")
  );
  migration.v3.facts = [...retainedFacts, ...subFacts].sort(
    (a, b) => (a.priority ?? 0) - (b.priority ?? 0) || a.fact_id.localeCompare(b.fact_id)
  );
  rebuildEntityFactIds(migration.v3);
  migration.needsReview = migration.v3.facts.filter(
    (fact) => (fact.evidence?.confidence ?? fact.confidence ?? 1.0) < 0.7
  );
  migration.factSourcePathIndex = Object.fromEntries(
    migration.v3.facts.map((fact) => [fact.fact_id, fact.evidence?.source_path ?? ""])
  );

  return {
    ...migration,
    sub_split: {
      fields_processed: results.size,
      sub_facts_total: subFacts.length,
      failed_fields: failedFields,
      summary: {
        original_facts: originalFacts,
        after_sub_split: migration.v3.facts.length,
        expansion_ratio:
          originalFacts === 0 ? 0 : roundTo3(migration.v3.facts.length / originalFacts),
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

type CodexSubSplitJson = {
  sub_facts?: unknown;
};

type CodexSubFactJson = {
  layer?: unknown;
  aspect?: unknown;
  body?: unknown;
  revealed_at_volume?: unknown;
  arc_at_volume?: unknown;
  rationale?: unknown;
};

type SubSplitTarget = {
  entity_id: string | null;
  source_path: string;
  body: string;
  default_aspect: Aspect;
};

function normalizeSubSplitResult(
  args: SubSplitArgs,
  parsed: CodexSubSplitJson | null
): FactNode[] {
  if (!parsed || !Array.isArray(parsed.sub_facts)) return [];
  const now = new Date().toISOString();
  return parsed.sub_facts
    .slice(0, 5)
    .map((raw, index): FactNode | null => {
      if (!isRecord(raw)) return null;
      const sub = raw as CodexSubFactJson;
      if (typeof sub.body !== "string" || sub.body.length === 0) return null;
      const layer =
        typeof sub.layer === "string" && LAYERS.has(sub.layer as Layer)
          ? (sub.layer as Layer)
          : "in_world_belief";
      const aspect =
        typeof sub.aspect === "string" && ASPECTS.has(sub.aspect as Aspect)
          ? (sub.aspect as Aspect)
          : args.default_aspect;
      const source_span = spanOf(args.body, sub.body);
      const fact: FactNode = {
        fact_id: deriveFactId({
          entity_id: args.entity_id,
          aspect,
          layer,
          source_path: args.source_path,
          source_span,
          segment_index: index,
        }),
        entity_id: args.entity_id,
        aspect,
        layer,
        body: sub.body,
        priority: index,
        confidence: 0.85,
        evidence: {
          source_path: args.source_path,
          json_pointer: sourcePathToJsonPointer(args.source_path),
          source_span,
          generated_by: {
            stage: "v9-sub-split",
            model: "codex-cli",
            ts: now,
          },
          confidence: 0.85,
        },
      };
      const revealedAtVolume = asNullablePositiveInt(sub.revealed_at_volume);
      const arcAtVolume = asNullablePositiveInt(sub.arc_at_volume);
      if (revealedAtVolume !== undefined) {
        fact.revealed_at_volume = revealedAtVolume;
      }
      if (arcAtVolume !== undefined && arcAtVolume !== null) {
        fact.arc_at_volume = arcAtVolume;
      }
      return fact;
    })
    .filter((fact): fact is FactNode => fact !== null);
}

function buildSubSplitPrompt(args: SubSplitArgs): string {
  return `あなたは AINARO 漫画 bible V3 fact-based schema の sub-split エージェントです。

## 入力 V2 field
- entity_id: ${args.entity_id ?? "_world"}
- source_path: ${args.source_path}
- default_aspect: ${args.default_aspect}
- body length: ${args.body.length} chars

## body
${args.body}

## タスク
この body を以下の layer 別に「sub-split」して、各 layer の body を抽出してください。

### Layer 定義
- in_world_belief: 第1巻時点の世間常識として開示される情報
- revealed_at_volume: 第N巻で読者に reveal される真相 (revealed_at_volume: N を併記)
- meta_truth: 著者だけが知る最終真理 (cast キャラは知らない)
- system_specification: 機械的仕様・数値・閾値
- character_arc_state: 巻ごとに変わる内的状態 (arc_at_volume: N を併記)

### 指示
1. body 内の文章を意味単位で読み、上記 layer 別に分割
2. 各 layer 1 sub-fact、合計 1-5 sub-facts
3. body は trim 不要、原文の該当部分をそのまま抽出 (重複可)
4. body を見て layer 判定が難しい場合は最初に default_aspect を採用
5. revealed_at_volume / arc_at_volume が body 内に書かれていれば併記、不明なら null
6. aspect は default_aspect から逸れる場合のみ override (例: identity → psychology)

## 出力 JSON
\`\`\`json
{
  "sub_facts": [
    {
      "layer": "in_world_belief",
      "aspect": "${args.default_aspect}",
      "body": "...抽出した body 部分...",
      "revealed_at_volume": null,
      "arc_at_volume": null,
      "rationale": "..."
    }
  ]
}
\`\`\``;
}

function collectSubSplitTargets(v2: BibleSnapshotV2): SubSplitTarget[] {
  const targets: SubSplitTarget[] = [];
  const add = (
    entity_id: string | null,
    source_path: string,
    value: unknown,
    default_aspect: Aspect
  ): void => {
    if (typeof value !== "string" || value.length === 0) return;
    targets.push({ entity_id, source_path, body: value, default_aspect });
  };

  add(null, "world.premise", v2.world.premise, "world_rule");
  v2.world.rules?.forEach((rule, i) =>
    add(null, `world.rules[${i}]`, rule, "world_rule")
  );
  add(null, "world.system", v2.world.system, "system_param");
  add(null, "world.timeline", v2.world.timeline, "history_event");
  add(null, "world.power_system_logic", v2.world.power_system_logic, "world_rule");
  add(null, "world.cosmology", v2.world.cosmology, "world_rule");
  add(null, "world.economic_system", v2.world.economic_system, "world_rule");
  add(null, "world.social_strata", v2.world.social_strata, "faction_dynamics");
  add(null, "world.daily_life_textures", v2.world.daily_life_textures, "faction_dynamics");
  add(null, "world.language_and_naming", v2.world.language_and_naming, "speech");

  v2.characters.forEach((character, i) => {
    const base = `characters[${i}]`;
    add(character.id, `${base}.backstory`, character.backstory, "backstory");
    add(
      character.id,
      `${base}.psychology_deep`,
      character.psychology_deep,
      "psychology"
    );
    add(
      character.id,
      `${base}.defense_mechanisms`,
      character.defense_mechanisms,
      "psychology"
    );
    add(
      character.id,
      `${base}.worldview_filter`,
      character.worldview_filter,
      "psychology"
    );
    add(
      character.id,
      `${base}.appearance_notes`,
      character.appearance_notes,
      "appearance"
    );
    add(
      character.id,
      `${base}.typical_day_in_life`,
      character.typical_day_in_life,
      "backstory"
    );
    character.relationship_per_partner?.forEach((partner, j) =>
      add(
        character.id,
        `${base}.relationship_per_partner[${j}]`,
        unknownRecord(partner).summary ?? partner.description,
        "relationship"
      )
    );
    character.growth_per_volume?.forEach((growth, j) =>
      add(
        character.id,
        `${base}.growth_per_volume[${j}]`,
        unknownRecord(growth).growth ?? growth.description,
        "psychology"
      )
    );
    if (character.role === "antagonist") {
      add(
        character.id,
        `${base}.origin_wound_deep`,
        character.origin_wound_deep,
        "psychology"
      );
      add(
        character.id,
        `${base}.ideology_argument`,
        character.ideology_argument,
        "psychology"
      );
      add(
        character.id,
        `${base}.dark_mirror_to_protagonist`,
        character.dark_mirror_to_protagonist,
        "psychology"
      );
    }
  });

  v2.locations.forEach((location, i) => {
    const spec = unknownRecord(location.spec);
    Object.keys(spec)
      .sort()
      .forEach((key) => {
        const aspect: Aspect =
          key === "who_typically_inhabits"
            ? "location_history"
            : "location_layout";
        add(location.id, `locations[${i}].spec.${key}`, spec[key], aspect);
      });
  });

  return targets;
}

function rebuildEntityFactIds(v3: BibleSnapshotV3): void {
  const byEntity = new Map<string, string[]>();
  for (const fact of v3.facts) {
    if (!fact.entity_id) continue;
    const ids = byEntity.get(fact.entity_id) ?? [];
    ids.push(fact.fact_id);
    byEntity.set(fact.entity_id, ids);
  }
  for (const entity of v3.entities) {
    entity.fact_ids = byEntity.get(entity.id) ?? [];
  }
  for (const relation of v3.relations) {
    relation.fact_ids = relation.fact_ids.filter((factId) =>
      v3.facts.some((fact) => fact.fact_id === factId)
    );
  }
}

function sourcePathToJsonPointer(sourcePath: string): string {
  const parts: string[] = [];
  const re = /([^[.\]]+)|\[(\d+)\]/g;
  for (const match of sourcePath.matchAll(re)) {
    parts.push(match[1] ?? match[2]);
  }
  return `/${parts.map(escapeJsonPointer).join("/")}`;
}

function escapeJsonPointer(part: string): string {
  return part.replace(/~/g, "~0").replace(/\//g, "~1");
}

function spanOf(haystack: string, needle: string): [number, number] {
  const start = haystack.indexOf(needle);
  if (start < 0) return [0, needle.length];
  return [start, start + needle.length];
}

function asNullablePositiveInt(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return undefined;
  }
  return value;
}

function unknownRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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
