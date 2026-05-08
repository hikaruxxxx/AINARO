/**
 * Bible Lint (怠惰検出)
 *
 * BibleSnapshotV2 を 2 段階でレビュー:
 *   段階A (deterministic): TODO/null/長さ/テンプレ反復/anchor 数 を機械的検出
 *   段階B (Codex CLI judge): セマンティックな浅さを LLM judge に依頼
 *
 * 出力: BibleLintReport (致命/警告/情報の3レベル)
 */
import { runCodexText } from "../llm/codex-text";
import type { BibleSnapshotV2 } from "../schemas-v2";

export type LintSeverity = "fatal" | "warn" | "info";

export type LintFinding = {
  severity: LintSeverity;
  scope: "world" | "character" | "location" | "prop" | "costume" | "relation" | "motif" | "continuity_seed" | "volume_synopsis" | "global";
  target_id?: string;
  rule: string;
  message: string;
  hint?: string;
};

export type BibleLintReport = {
  schema_version: 1;
  audited_at: string;
  bible_slug: string;
  fatal_count: number;
  warn_count: number;
  info_count: number;
  findings: LintFinding[];
  summary: string;
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

export async function llmLintBible(args: {
  bible: BibleSnapshotV2;
  cwd?: string;
  timeoutMs?: number;
}): Promise<LintFinding[]> {
  const result = await runCodexText<{
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
  }>({
    task: [
      "あなたは商業漫画の編集者として、bible (作品設計書 JSON) の作り込みの深さをレビューします。",
      "ヒット作 (200万部級) と並ぶレベルかどうかを判断してください。お世辞は不要、率直な指摘を。",
      "",
      "## レビュー観点 (浅い/怠惰のサイン)",
      "1. キャラ personality_visual がジャンルの常套句のみ (例: '感情を表に出さない', '無感動')",
      "2. キャラ continuity_anchors が外見要素のみで、心理的記号 (例: 「人と話すとき必ず半歩後ろに下がる」) が無い",
      "3. キャラ間の差別化が弱い (主人公以外がテンプレ)",
      "4. world.rules がジャンル定型のみ (例: 'スキルはダンジョン内でのみ成長') で、edge case がない",
      "5. visual_motifs が衣装/小道具の単純列挙、意味付け (なぜ繰り返すか) が浅い",
      "6. locations が章舞台のみ、ジャンル象徴ロケ (例: ダンジョン内部マップ) が無い",
      "7. volume_synopsis が出来事の列挙のみ、テーマの一貫した感情ライン設計が無い",
      "8. プレースホルダ (TODO, 後で書く) が放置",
      "9. 同じ役割のキャラが似た spec で書かれている",
      "10. 主人公の信念・トラウマ・矛盾が言語化されていない",
      "",
      "## core_hook gateway",
      "bible.meta.core_hook が存在する場合は、次の4観点も必ず評価し、問題があれば shallowness_findings に該当 rule を追加してください。",
      "- core_hook_one_liner_blurry (warn): one_liner が凡庸/ぼやけ。具体的な異常性が見えない",
      "- core_hook_type_misclassified (warn): type タグ (A:反復蓄積 / B:接続媒介 / C:視点ずらし) と one_liner の中身が整合しない",
      "- core_hook_differentiation_unclear (fatal): hit_references との差分が one_liner から伝わらない",
      "- core_hook_long_term_viability (warn): 15巻続けられる構造がなく、短命ギミックに見える",
      "",
      "## 入力 (bible 全文)",
      "```json",
      JSON.stringify(args.bible, null, 2).slice(0, 100000),
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
    timeoutMs: args.timeoutMs ?? 6 * 60 * 1000,
    maxRetries: 1,
  });

  if (!result.parsed) return [];
  const parsed = result.parsed as {
    overall_assessment: string;
    rationale: string;
    shallowness_findings: Array<LintFinding>;
  };
  // 先頭に overall_assessment を info で挿入
  const out: LintFinding[] = [
    {
      severity: "info",
      scope: "global",
      rule: "llm_overall_assessment",
      message: `LLM 総評: ${parsed.overall_assessment} — ${parsed.rationale}`,
    },
    ...parsed.shallowness_findings,
  ];
  return out;
}

// ============================================================
// 統合エントリ
// ============================================================

export async function lintBible(args: {
  bible: BibleSnapshotV2;
  skipLlm?: boolean;
  cwd?: string;
}): Promise<BibleLintReport> {
  const findings: LintFinding[] = [];
  findings.push(...staticLint(args.bible));
  if (!args.skipLlm) {
    try {
      const llm = await llmLintBible({ bible: args.bible, cwd: args.cwd });
      findings.push(...llm);
    } catch (e) {
      findings.push({
        severity: "info",
        scope: "global",
        rule: "llm_judge_failed",
        message: `LLM judge 失敗 (static lint のみ採用): ${(e as Error).message}`,
      });
    }
  }

  const fatal = findings.filter((x) => x.severity === "fatal").length;
  const warn = findings.filter((x) => x.severity === "warn").length;
  const info = findings.filter((x) => x.severity === "info").length;

  return {
    schema_version: 1,
    audited_at: new Date().toISOString(),
    bible_slug: args.bible.meta.slug,
    fatal_count: fatal,
    warn_count: warn,
    info_count: info,
    findings,
    summary: `fatal=${fatal} warn=${warn} info=${info}`,
  };
}
