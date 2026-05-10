/**
 * Bible Lint (怠惰検出)
 *
 * BibleSnapshotV2 を 3 段階でレビュー:
 *   段階A (deterministic): TODO/null/長さ/テンプレ反復/anchor 数 を機械的検出
 *   段階B (Codex CLI judge): セマンティックな浅さを LLM judge に依頼
 *   段階C (compliance): 商標・実在名などの混入を辞書検出
 *   段階D (depth): 商業作家資料集レベルの記述深度に対する coverage 計測
 *
 * 出力: BibleLintReport (致命/警告/情報の3レベル)
 */
import { runCodexText } from "../llm/codex-text";
import { loadBlocklist, loadFalsePositives, scanBible } from "../compliance/scanner";
import type { ComplianceFinding } from "../compliance/types";
import type { BibleSnapshotV2 } from "../schemas-v2";
import { depthLint } from "../bible/depth-lint";
import { createHash } from "node:crypto";
import { detectUndefinedReferences } from "./undefined-reference-detector";

export type LintSeverity = "fatal" | "warn" | "info";
export type LintScope =
  | "world"
  | "character"
  | "location"
  | "prop"
  | "costume"
  | "relation"
  | "motif"
  | "continuity_seed"
  | "volume_synopsis"
  | "depth"
  | "cli_runtime"
  | "atomic_write"
  | "global"
  | "compliance";

export type LintFinding = {
  severity: LintSeverity;
  scope: LintScope;
  target_id?: string;
  rule: string;
  message: string;
  hint?: string;
};

export type LintExecutor = "L01c-bible-deepen" | "run-world-aspect" | "run-deepen-all" | "standalone";
export type LintStagePosition = "pre" | "post" | "standalone";

export type LintProvenance = {
  skipLlm: boolean;
  executor: LintExecutor;
  snapshotHash: string;
  judgeModel: string;
  stagePosition: LintStagePosition;
};

export type BibleLintReport = {
  schema_version: 2;
  audited_at: string;
  bible_slug: string;
  fatal_count: number;
  warn_count: number;
  info_count: number;
  findings: LintFinding[];
  summary: string;
  provenance: LintProvenance;
};

// ============================================================
// 段階A: Static rules
// ============================================================

const TEMPLATE_TEXTS = ["TODO_post_bible_review", "TODO", "TBD", "未定", "後で書く"];
const DUNGEON_MODERN_SUBTYPES = new Set(["external_social", "gacha_ui", "hybrid"]);
const CORE_HOOK_TYPES = new Set(["A", "B", "C"]);
const APPEAL_AXES = new Set([
  "mentor_disciple",
  "rivalry",
  "loyalty",
  "protector_protected",
  "forbidden_bond",
  "co_conspirator",
  "unrequited_love",
  "mutual_rescue",
  "banter_tension",
  "status_gap",
  "found_family",
  "sibling_like",
  "betrayal_repair",
  "admiration_envy",
]);
const CRITICAL_APPEAL_MODES = new Set(["romance", "ensemble_relation"]);

function isModernDungeonGenre(genre: string | undefined): boolean {
  return genre === "modern_dungeon" || genre === "modern-dungeon" || genre === "dungeon-modern";
}

function staticLint(bible: BibleSnapshotV2): LintFinding[] {
  const f: LintFinding[] = [];

  // core_hook はメガヒット下層狙いの gateway。未設定時は missing のみ出し、詳細検証は飛ばす。
  if (!bible.meta.core_hook) {
    f.push({
      severity: "fatal",
      scope: "global",
      rule: "core_hook_missing",
      message: "bible.meta.core_hook が未設定です。中核ギミック1文、類型、参照ヒット作を明示してください。",
    });
  } else {
    const coreHook = bible.meta.core_hook as {
      one_liner?: unknown;
      type?: unknown;
      hit_references?: unknown;
    };
    const oneLiner = typeof coreHook.one_liner === "string" ? coreHook.one_liner : "";
    const oneLinerLength = Array.from(oneLiner).length;
    const hitReferences = Array.isArray(coreHook.hit_references) ? coreHook.hit_references : [];

    if (oneLinerLength > 30) {
      f.push({
        severity: "fatal",
        scope: "global",
        rule: "core_hook_one_liner_too_long",
        message: `meta.core_hook.one_liner が ${oneLinerLength}字です (30字以内必須)`,
      });
    }
    if (oneLinerLength < 5) {
      f.push({
        severity: "warn",
        scope: "global",
        rule: "core_hook_one_liner_too_short",
        message: `meta.core_hook.one_liner が ${oneLinerLength}字です (最低5字推奨)`,
      });
    }
    if (!CORE_HOOK_TYPES.has(String(coreHook.type))) {
      f.push({
        severity: "fatal",
        scope: "global",
        rule: "core_hook_type_invalid",
        message: `meta.core_hook.type="${String(coreHook.type)}" は未定義です。A/B/C から選んでください。`,
      });
    }
    if (hitReferences.length === 0) {
      f.push({
        severity: "fatal",
        scope: "global",
        rule: "core_hook_hit_references_empty",
        message: "meta.core_hook.hit_references が空です。同類の既存ヒット作を1-3作入れてください。",
      });
    }
    if (hitReferences.length > 3) {
      f.push({
        severity: "warn",
        scope: "global",
        rule: "core_hook_hit_references_too_many",
        message: `meta.core_hook.hit_references が ${hitReferences.length}作です (最大3作推奨)`,
      });
    }
  }

  if (isModernDungeonGenre(bible.meta.genre)) {
    if (!bible.meta.subtype) {
      f.push({
        severity: "warn",
        scope: "global",
        rule: "modern_dungeon_subtype_missing",
        message:
          "bible.meta.subtype が未設定です。modern_dungeon は external_social / gacha_ui / hybrid のいずれかを明示推奨。",
        hint: "docs/plans/manga/subtype-support.md 参照",
      });
    } else if (!DUNGEON_MODERN_SUBTYPES.has(bible.meta.subtype)) {
      f.push({
        severity: "warn",
        scope: "global",
        rule: "modern_dungeon_subtype_unknown",
        message: `bible.meta.subtype="${bible.meta.subtype}" は未定義です。external_social / gacha_ui / hybrid から選んでください。`,
        hint: "docs/strategy/manga_craft/40_genres/modern_dungeon.md 参照",
      });
    }
  }

  const recommendedPairingCount = bible.relations.filter((r) => r.is_recommended_pairing === true).length;
  const primaryAppealMode = bible.meta.primary_appeal_mode;
  if (recommendedPairingCount < 2) {
    if (primaryAppealMode && CRITICAL_APPEAL_MODES.has(primaryAppealMode)) {
      f.push({
        severity: "fatal",
        scope: "global",
        rule: "recommended_pairing_count_low_critical",
        message: `meta.primary_appeal_mode=${primaryAppealMode} ですが、is_recommended_pairing=true の関係が ${recommendedPairingCount} 個です (最低 2 個必須)`,
      });
    } else {
      f.push({
        severity: "warn",
        scope: "global",
        rule: "recommended_pairing_count_low",
        message: `is_recommended_pairing=true の関係が ${recommendedPairingCount} 個です (推し導線として最低 2 個推奨)`,
      });
    }
  }

  // world
  if (bible.world.premise.length < 100) {
    f.push({ severity: "warn", scope: "world", rule: "premise_too_short", message: `premise が ${bible.world.premise.length}字 (最低 100字推奨)` });
  }
  if (bible.world.rules.length < 5) {
    f.push({ severity: "warn", scope: "world", rule: "rules_count_low", message: `rules が ${bible.world.rules.length}件 (最低 5件、ヒット作なら 10-30件)` });
  }
  if (bible.world.factions.length < 3) {
    f.push({ severity: "warn", scope: "world", rule: "factions_count_low", message: `factions が ${bible.world.factions.length}件` });
  }
  for (const fac of bible.world.factions) {
    if (fac.summary.length < 30) {
      f.push({ severity: "warn", scope: "world", target_id: fac.name, rule: "faction_summary_too_short", message: `faction "${fac.name}" の summary が ${fac.summary.length}字` });
    }
  }

  // characters
  if (bible.characters.length < 5) {
    f.push({ severity: "warn", scope: "global", rule: "characters_count_low", message: `characters が ${bible.characters.length}人 (主要+脇役で最低 5-7人)` });
  }
  for (const c of bible.characters) {
    // anchors
    if (c.continuity_anchors.length === 0) {
      f.push({ severity: "fatal", scope: "character", target_id: c.id, rule: "anchors_empty", message: `${c.name}: continuity_anchors が空` });
    }
    for (const a of c.continuity_anchors) {
      if (TEMPLATE_TEXTS.some((t) => a.includes(t))) {
        f.push({ severity: "fatal", scope: "character", target_id: c.id, rule: "anchor_placeholder", message: `${c.name}: anchor に placeholder "${a}"` });
      }
    }
    if (c.continuity_anchors.length < 3) {
      f.push({ severity: "warn", scope: "character", target_id: c.id, rule: "anchors_too_few", message: `${c.name}: anchors ${c.continuity_anchors.length}個 (最低 3個推奨)` });
    }
    // spec depth
    if (!c.spec.hair?.specific) {
      f.push({ severity: "warn", scope: "character", target_id: c.id, rule: "hair_specific_missing", message: `${c.name}: spec.hair.specific が空 (特徴的な髪型描写なし)` });
    }
    if (!c.spec.outfit_default?.top && !c.spec.outfit_default?.bottom && !c.spec.outfit_default?.outerwear) {
      f.push({ severity: "warn", scope: "character", target_id: c.id, rule: "outfit_minimal", message: `${c.name}: outfit_default の項目がほぼ空` });
    }
    if (!c.appearance_notes || c.appearance_notes.length < 100) {
      f.push({ severity: "warn", scope: "character", target_id: c.id, rule: "appearance_notes_short", message: `${c.name}: appearance_notes が ${c.appearance_notes?.length ?? 0}字 (最低 100字推奨)` });
    }
  }

  // locations
  if (bible.locations.length < 5) {
    f.push({ severity: "warn", scope: "global", rule: "locations_count_low", message: `locations が ${bible.locations.length}件 (最低 5件、ジャンル特性場所が無い)` });
  }
  for (const l of bible.locations) {
    if (l.continuity_anchors.length < 2) {
      f.push({ severity: "warn", scope: "location", target_id: l.id, rule: "loc_anchors_few", message: `${l.name}: anchors ${l.continuity_anchors.length}個` });
    }
    if (!l.spec.layout || (!l.spec.layout.furniture || l.spec.layout.furniture.length === 0)) {
      f.push({ severity: "warn", scope: "location", target_id: l.id, rule: "loc_layout_thin", message: `${l.name}: layout.furniture が空` });
    }
  }

  // props / costumes / relations / motifs / synopsis
  if (bible.props.length < 5) {
    f.push({ severity: "warn", scope: "global", rule: "props_count_low", message: `props が ${bible.props.length}件 (最低 5件、ジャンル象徴アイテムが不足)` });
  }
  if (bible.costumes.length < 3) {
    f.push({ severity: "warn", scope: "global", rule: "costumes_count_low", message: `costumes が ${bible.costumes.length}件 (巻またぎの衣装変化が無い)` });
  }
  if (bible.visual_motifs.length < 5) {
    f.push({ severity: "warn", scope: "global", rule: "motifs_count_low", message: `visual_motifs が ${bible.visual_motifs.length}件 (最低 5件、反復記号が不足)` });
  }
  if (bible.volume_synopsis.summary.length < 200) {
    f.push({ severity: "warn", scope: "volume_synopsis", rule: "synopsis_short", message: `volume_synopsis.summary が ${bible.volume_synopsis.summary.length}字 (最低 200字)` });
  }

  for (const rel of bible.relations) {
    const runtimeRel = rel as {
      from_character_id?: unknown;
      to_character_id?: unknown;
      appeal_axis?: unknown;
      appeal_score_manual?: unknown;
      appeal_score_auto?: unknown;
      is_recommended_pairing?: unknown;
    };
    const targetId = `${String(runtimeRel.from_character_id ?? "?")}->${String(runtimeRel.to_character_id ?? "?")}`;
    if (
      runtimeRel.appeal_score_manual !== undefined &&
      (!Number.isInteger(runtimeRel.appeal_score_manual) ||
        (runtimeRel.appeal_score_manual as number) < 0 ||
        (runtimeRel.appeal_score_manual as number) > 5)
    ) {
      f.push({
        severity: "fatal",
        scope: "relation",
        target_id: targetId,
        rule: "appeal_score_manual_invalid_range",
        message: `appeal_score_manual=${String(runtimeRel.appeal_score_manual)} は範囲外です (0-5 の整数のみ)`,
      });
    }
    if (
      typeof runtimeRel.appeal_axis === "string" &&
      runtimeRel.appeal_axis.length > 0 &&
      !APPEAL_AXES.has(runtimeRel.appeal_axis)
    ) {
      f.push({
        severity: "warn",
        scope: "relation",
        target_id: targetId,
        rule: "appeal_axis_unknown",
        message: `appeal_axis="${runtimeRel.appeal_axis}" は定義済み14種の enum 外です。free-form として許容しますが運用語彙の追加候補です。`,
      });
    }
    if (
      runtimeRel.is_recommended_pairing === true &&
      typeof runtimeRel.appeal_score_manual !== "number" &&
      typeof runtimeRel.appeal_score_auto !== "number"
    ) {
      f.push({
        severity: "warn",
        scope: "relation",
        target_id: targetId,
        rule: "appeal_score_missing_on_recommended",
        message: "推奨ペアですが appeal_score_manual / appeal_score_auto がどちらも未設定です。",
      });
    }
    if (
      typeof runtimeRel.appeal_score_manual === "number" &&
      typeof runtimeRel.appeal_score_auto === "number" &&
      Math.abs(runtimeRel.appeal_score_manual - runtimeRel.appeal_score_auto) >= 2
    ) {
      f.push({
        severity: "warn",
        scope: "relation",
        target_id: targetId,
        rule: "appeal_score_divergence",
        message: `appeal_score_manual=${runtimeRel.appeal_score_manual} と appeal_score_auto=${runtimeRel.appeal_score_auto} の差が 2 以上です。`,
      });
    }
  }

  // テンプレ反復チェック (同じ outfit_default を2人以上のキャラが持つ等)
  const outfitMap = new Map<string, string[]>();
  for (const c of bible.characters) {
    const k = JSON.stringify(c.spec.outfit_default ?? {});
    const arr = outfitMap.get(k) ?? [];
    arr.push(c.name);
    outfitMap.set(k, arr);
  }
  for (const [k, names] of outfitMap.entries()) {
    if (names.length >= 2 && k !== "{}") {
      f.push({ severity: "warn", scope: "character", rule: "outfit_duplicate", message: `${names.join(", ")} が同じ outfit_default を共有` });
    }
  }

  return f;
}

// ============================================================
// 段階B: LLM judge (Codex CLI text)
// ============================================================

const LLM_JUDGE_SCHEMA = `
type LlmJudgeOutput = {
  overall_assessment: "professional" | "passable" | "shallow" | "lazy";
  rationale: string;          // 200字以内
  shallowness_findings: Array<{
    severity: "fatal" | "warn" | "info";
    scope: "world" | "character" | "location" | "prop" | "costume" | "relation" | "motif" | "continuity_seed" | "volume_synopsis" | "global";
    target_id?: string;
    rule:
      | "generic_personality"
      | "no_unique_motif"
      | "world_rule_lacks_edge_cases"
      | "core_hook_one_liner_blurry"
      | "core_hook_type_misclassified"
      | "core_hook_differentiation_unclear"
      | "core_hook_long_term_viability"
      | string;
    message: string;          // 何が浅いか具体的に
    hint?: string;            // どう改善するか
  }>;
};
`;

type LlmJudgeParsed = {
  overall_assessment: string;
  rationale: string;
  shallowness_findings: Array<{
    severity: LintSeverity;
    scope: LintFinding["scope"];
    target_id?: string;
    rule: string;
    message: string;
    hint?: string;
  }>;
};

type LlmJudgeChunk = {
  chunkId: string;
  scope: LintScope;
  targetId?: string;
  focus: string;
  payload: unknown;
};

export type ChunkResult = {
  chunkId: string;
  status: "ok" | "failed" | "timeout";
  findings: LintFinding[];
  durationMs: number;
};

export async function llmLintBible(args: {
  bible: BibleSnapshotV2;
  cwd?: string;
  timeoutMs?: number;
}): Promise<LintFinding[]> {
  const result = await llmLintBibleChunked({
    bible: args.bible,
    cwd: args.cwd,
    chunkTimeoutMs: args.timeoutMs,
  });
  return result.findings;
}

export async function llmLintBibleChunked(args: {
  bible: BibleSnapshotV2;
  cwd?: string;
  chunkTimeoutMs?: number;
  maxParallel?: number;
}): Promise<{
  findings: LintFinding[];
  chunkResults: ChunkResult[];
  judgeModel: string;
}> {
  const chunks = buildLlmJudgeChunks(args.bible);
  const chunkTimeoutMs = args.chunkTimeoutMs ?? 60 * 1000;
  const maxParallel = Math.max(1, args.maxParallel ?? 3);
  const chunkResults = await runWithConcurrency(chunks, maxParallel, (chunk) =>
    lintJudgeChunk({
      bible: args.bible,
      chunk,
      cwd: args.cwd,
      timeoutMs: chunkTimeoutMs,
    }),
  );
  const findings = chunkResults.flatMap((result) => result.findings);
  const failedCount = chunkResults.filter((result) => result.status !== "ok").length;

  if (chunkResults.length > 0 && failedCount === chunkResults.length) {
    findings.push({
      severity: "warn",
      scope: "global",
      rule: "lint_judge_unavailable",
      message: `LLM judge の全 chunk が失敗しました (${failedCount}/${chunkResults.length})。static/depth/compliance lint のみ採用します。`,
    });
  }

  return {
    findings,
    chunkResults,
    judgeModel: "codex",
  };
}

function buildLlmJudgeChunks(bible: BibleSnapshotV2): LlmJudgeChunk[] {
  const chunks: LlmJudgeChunk[] = [];
  const add = (chunk: LlmJudgeChunk): void => {
    if (JSON.stringify(chunk.payload).length > 2) chunks.push(chunk);
  };

  bible.characters.forEach((character) => {
    add({
      chunkId: `characters[${character.id}]`,
      scope: "character",
      targetId: character.id,
      focus: "このキャラが商業漫画の主要人物として浅くないか。心理、外見記号、生い立ち、関係、成長導線を重点確認。",
      payload: { character },
    });
  });

  const world = bible.world as Record<string, unknown>;
  for (const key of ["premise", "rules", "system", "timeline", "history", "power_system_logic", "cosmology", "economic_system", "social_strata", "daily_life_textures", "language_and_naming", "forbidden_lore", "factions"]) {
    if (world[key] === undefined) continue;
    add({
      chunkId: `world.${key}`,
      scope: "world",
      focus: `world.${key} が作品固有のフック、edge case、長期連載の伸びしろを持つか。`,
      payload: { [key]: world[key] },
    });
  }

  bible.locations.forEach((location) => {
    add({
      chunkId: `locations[${location.id}]`,
      scope: "location",
      targetId: location.id,
      focus: "この場所が章舞台以上の固有性、画面記号、物語機能を持つか。",
      payload: { location },
    });
  });
  bible.props.forEach((prop) => {
    add({
      chunkId: `props[${prop.id}]`,
      scope: "prop",
      targetId: prop.id,
      focus: "この小道具が単なる所持品でなく、関係・伏線・画面記号として機能するか。",
      payload: { prop },
    });
  });
  bible.costumes.forEach((costume) => {
    add({
      chunkId: `costumes[${costume.id}]`,
      scope: "costume",
      targetId: costume.id,
      focus: "この衣装がキャラ性、時系列、視認性を支える設計になっているか。",
      payload: { costume },
    });
  });
  bible.visual_motifs.forEach((motif, index) => {
    add({
      chunkId: `visual_motifs[${motif.name || index}]`,
      scope: "motif",
      targetId: motif.name,
      focus: "この視覚モチーフが意味付けと反復設計を持ち、列挙で終わっていないか。",
      payload: { motif },
    });
  });
  add({
    chunkId: "volume_synopsis",
    scope: "volume_synopsis",
    focus: "巻全体のテーマ、感情ライン、cliffhanger が出来事の列挙で終わっていないか。",
    payload: { volume_synopsis: bible.volume_synopsis },
  });

  return chunks;
}

async function lintJudgeChunk(args: {
  bible: BibleSnapshotV2;
  chunk: LlmJudgeChunk;
  cwd?: string;
  timeoutMs: number;
}): Promise<ChunkResult> {
  const startedAt = Date.now();
  try {
    const result = await runCodexText<LlmJudgeParsed>({
      task: [
        "あなたは商業漫画の編集者として、bible (作品設計書 JSON) の一部だけをレビューします。",
        "入力 chunk に限定して、浅い/怠惰/矛盾して見える箇所を具体的に指摘してください。お世辞は不要です。",
        `対象 chunk: ${args.chunk.chunkId}`,
        `観点: ${args.chunk.focus}`,
        "",
        "## 作品全体の最小文脈",
        "```json",
        JSON.stringify({
          title: args.bible.meta.title,
          genre: args.bible.meta.genre,
          core_hook: args.bible.meta.core_hook,
          primary_appeal_mode: args.bible.meta.primary_appeal_mode,
        }, null, 2),
        "```",
        "",
        "## 入力 chunk",
        "```json",
        JSON.stringify(args.chunk.payload, null, 2),
        "```",
        "",
        "## 出力スキーマ",
        "```typescript",
        LLM_JUDGE_SCHEMA,
        "```",
        "",
        "## 出力形式",
        "上記スキーマに従う JSON のみを返してください。説明文・前置き・後書きは不要。",
        "出力は ```json ... ``` のコードブロックで囲んでください。",
      ].join("\n"),
      format: "json",
      cwd: args.cwd,
      timeoutMs: args.timeoutMs,
      maxRetries: 0,
    });

    const parsed = result.parsed;
    const findings: LintFinding[] = parsed
      ? [
          {
            severity: "info",
            scope: args.chunk.scope,
            ...(args.chunk.targetId ? { target_id: args.chunk.targetId } : {}),
            rule: "llm_chunk_assessment",
            message: `LLM chunk ${args.chunk.chunkId}: ${parsed.overall_assessment} — ${parsed.rationale}`,
          },
          ...parsed.shallowness_findings.map((finding) => ({
            ...finding,
            target_id: finding.target_id ?? args.chunk.targetId,
          })),
        ]
      : [];

    return {
      chunkId: args.chunk.chunkId,
      status: "ok",
      findings,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    const message = errorMessage(error);
    const status: ChunkResult["status"] = /timeout|タイムアウト/i.test(message) ? "timeout" : "failed";
    return {
      chunkId: args.chunk.chunkId,
      status,
      findings: [
        {
          severity: "info",
          scope: args.chunk.scope,
          ...(args.chunk.targetId ? { target_id: args.chunk.targetId } : {}),
          rule: status === "timeout" ? "llm_judge_timeout" : "llm_judge_failed",
          message: `LLM judge chunk ${args.chunk.chunkId} をスキップしました: ${message}`,
        },
      ],
      durationMs: Date.now() - startedAt,
    };
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  maxParallel: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(maxParallel, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.allSettled(runners);
  return results.filter((result): result is R => result !== undefined);
}

// ============================================================
// 段階C: コンプライアンス辞書検出 (商標・実在名混入検出)
// ============================================================

export async function complianceLint(args: {
  bible: BibleSnapshotV2;
  blocklistPath?: string;
  falsePositivesPath?: string;
}): Promise<LintFinding[]> {
  try {
    const [blocklist, fp] = await Promise.all([
      loadBlocklist(args.blocklistPath),
      loadFalsePositives(args.falsePositivesPath),
    ]);
    return scanBible(args.bible, blocklist, fp).map((finding) => mapComplianceToLintFinding(finding, args.bible));
  } catch (e) {
    return [
      {
        severity: "info",
        scope: "compliance",
        rule: "compliance_load_failed",
        message: `compliance 辞書の読み込みに失敗しました: ${errorMessage(e)}`,
      },
    ];
  }
}

function mapComplianceToLintFinding(c: ComplianceFinding, bible: BibleSnapshotV2): LintFinding {
  const { scope, targetId } = scopeAndTargetFromFieldPath(c.field_path, bible);
  return {
    severity: c.severity,
    scope,
    ...(targetId ? { target_id: targetId } : {}),
    rule: `compliance:${c.category}`,
    message: `[${c.matched_term}] @ ${c.field_path} (line ${c.line ?? "?"}): ${c.text_excerpt}`,
    hint: c.suggestion
      ? `代替案: ${c.suggestion.fictional_name_hint ?? c.suggestion.type} — ${c.suggestion.description}`
      : undefined,
  };
}

function scopeAndTargetFromFieldPath(
  fieldPath: string,
  bible: BibleSnapshotV2,
): { scope: LintScope; targetId?: string } {
  const indexed = /^(characters|locations|props|costumes|relations|visual_motifs)\[(\d+)\](?:\.|$)/u.exec(fieldPath);
  if (indexed) {
    const index = Number(indexed[2]);
    switch (indexed[1]) {
      case "characters":
        return { scope: "character", targetId: bible.characters[index]?.id };
      case "locations":
        return { scope: "location", targetId: bible.locations[index]?.id };
      case "props":
        return { scope: "prop", targetId: bible.props[index]?.id };
      case "costumes":
        return { scope: "costume", targetId: bible.costumes[index]?.id };
      case "relations":
        return { scope: "relation" };
      case "visual_motifs":
        return { scope: "motif", targetId: idFromUnknown(bible.visual_motifs[index]) };
      default:
        return { scope: "compliance" };
    }
  }

  if (fieldPath === "world" || fieldPath.startsWith("world.")) return { scope: "world" };
  if (fieldPath === "volume_synopsis" || fieldPath.startsWith("volume_synopsis.")) {
    return { scope: "volume_synopsis" };
  }
  return { scope: "compliance" };
}

function idFromUnknown(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const id = (value as { id?: unknown }).id;
  return typeof id === "string" ? id : undefined;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ============================================================
// 統合エントリ
// ============================================================

export async function lintBible(args: {
  bible: BibleSnapshotV2;
  skipLlm?: boolean;
  skipCompliance?: boolean;
  skipDepth?: boolean;
  blocklistPath?: string;
  falsePositivesPath?: string;
  cwd?: string;
  executor?: LintExecutor;
  stagePosition?: LintStagePosition;
  snapshotHash?: string;
}): Promise<BibleLintReport> {
  const findings: LintFinding[] = [];
  let judgeModel = "skipped";
  findings.push(...staticLint(args.bible));
  if (!args.skipLlm) {
    const llm = await llmLintBibleChunked({ bible: args.bible, cwd: args.cwd });
    judgeModel = llm.judgeModel;
    findings.push(...llm.findings);
  }
  findings.push(
    ...detectUndefinedReferences(args.bible).map((reference): LintFinding => ({
      severity: "warn",
      scope: "global",
      rule: "undefined_reference",
      message: `${reference.source_path}: 未定義の固有名詞候補 "${reference.matched_text}"`,
      hint: reference.context_excerpt,
    })),
  );
  if (!args.skipCompliance) {
    try {
      const compliance = await complianceLint({
        bible: args.bible,
        blocklistPath: args.blocklistPath,
        falsePositivesPath: args.falsePositivesPath,
      });
      findings.push(...compliance);
    } catch (e) {
      findings.push({
        severity: "info",
        scope: "compliance",
        rule: "compliance_load_failed",
        message: `compliance lint 失敗 (static/LLM lint のみ採用): ${errorMessage(e)}`,
      });
    }
  }
  if (!args.skipDepth) {
    try {
      findings.push(...depthLint(args.bible));
    } catch (e) {
      findings.push({
        severity: "info",
        scope: "depth",
        rule: "depth_lint_failed",
        message: `depth lint 失敗 (static/LLM/compliance lint のみ採用): ${errorMessage(e)}`,
      });
    }
  }

  const fatal = findings.filter((x) => x.severity === "fatal").length;
  const warn = findings.filter((x) => x.severity === "warn").length;
  const info = findings.filter((x) => x.severity === "info").length;

  return {
    schema_version: 2,
    audited_at: new Date().toISOString(),
    bible_slug: args.bible.meta.slug,
    fatal_count: fatal,
    warn_count: warn,
    info_count: info,
    findings,
    summary: `fatal=${fatal} warn=${warn} info=${info}`,
    provenance: {
      skipLlm: args.skipLlm === true,
      executor: args.executor ?? "standalone",
      snapshotHash: args.snapshotHash ?? hashBibleSnapshot(args.bible),
      judgeModel,
      stagePosition: args.stagePosition ?? "standalone",
    },
  };
}

function hashBibleSnapshot(bible: BibleSnapshotV2): string {
  return createHash("sha1").update(JSON.stringify(bible)).digest("hex").slice(0, 12);
}
