// 長編生成パイプライン v3 - 整合性チェッカー（ルールベース）
//
// 1話の本文に対して以下をチェック:
// 1. スキル名の表記揺れ (ability_system.json と照合)
// 2. ステータス値の単調性 (state-snapshot.ts と協調)
// 3. ステータス画面の書式遵守 (status_format.md と照合)
// 4. 主人公の口癖密度 (protagonist.md と照合)
// 5. 関係性整合 (relationship_graph.json と照合)
//
// LLM呼び出しなし。
//
// 使い方:
//   npx tsx scripts/generation/coherence-checker.ts <slug> <ep_number>

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { loadState, diffState } from "./state-snapshot";

const WORKS_DIR = "data/generation/works";

interface AbilitySystem {
  skills: Array<{ name: string; owner_jobs?: string[] }>;
  jobs: Array<{ name: string }>;
}

interface RelationshipGraph {
  groups: Array<{
    members: Array<{ name: string; first_appearance_episode?: number }>;
  }>;
  antagonists?: Array<{ name: string; first_appearance_episode?: number }>;
}

interface AuditResult {
  episode: number;
  judgment: "A" | "B" | "C";
  rule_based: {
    skill_naming_violations: string[];
    status_monotonicity_violations: string[];
    status_format_violations: string[];
    catchphrase_count: number;
    catchphrase_density_ok: boolean;
    relationship_violations: string[];
  };
  recommended_actions: string[];
  needs_regeneration: boolean;
}

function readEpisodeBody(slug: string, ep: number): string {
  const epPad = ep.toString().padStart(4, "0");
  const p = join(WORKS_DIR, slug, "longform", "episodes", `ep${epPad}.md`);
  if (!existsSync(p)) {
    throw new Error(`Episode body not found: ${p}`);
  }
  return readFileSync(p, "utf-8");
}

function loadJSON<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function loadProtagonistCatchphrases(slug: string): string[] {
  const p = join(WORKS_DIR, slug, "longform", "protagonist.md");
  if (!existsSync(p)) return [];
  const text = readFileSync(p, "utf-8");
  // Section 5 の口癖を抽出
  const section = text.match(/##?\s*5\.?[\s\S]*?(?=##?\s*6\.?|$)/);
  if (!section) return [];
  // 「...」で囲まれた文字列を抽出
  const matches = section[0].match(/「[^」]+」/g);
  return matches ?? [];
}

function checkSkillNaming(body: string, abilitySystem: AbilitySystem): string[] {
  const violations: string[] = [];
  const officialNames = new Set(abilitySystem.skills.map((s) => s.name));

  // 表記揺れの典型的なパターン
  const commonVariants: Record<string, string[]> = {
    召喚: ["召喚術"],
    生成: ["生成術"],
    合成: ["合成術", "シンセサイズ"],
    強化: ["強化術", "エンハンス"],
  };

  for (const [official, variants] of Object.entries(commonVariants)) {
    if (officialNames.has(official)) {
      for (const variant of variants) {
        if (body.includes(variant) && !officialNames.has(variant)) {
          violations.push(`「${variant}」は正式名「${official}」で表記すべき`);
        }
      }
    }
  }

  return violations;
}

function checkStatusFormat(body: string): string[] {
  const violations: string[] = [];

  // 半角【と全角【の混在チェック
  if (body.includes("【") && body.includes("[")) {
    // [体力] のような半角表記が混じっていないか
    const hasHalfwidthStat = /\[(?:体力|魔力|攻撃力|耐久力|素早さ|知力|幸運|レベル|名前|年齢|職業)\]/.test(body);
    if (hasHalfwidthStat) {
      violations.push("半角[]と全角【】が混在");
    }
  }

  // ステータス画面ブロック内で書式が一貫しているか
  // 簡易チェック: 【】の数が偶数か
  const openBrackets = (body.match(/【/g) ?? []).length;
  const closeBrackets = (body.match(/】/g) ?? []).length;
  if (openBrackets !== closeBrackets) {
    violations.push(`【】の数が不一致: 【${openBrackets} 】${closeBrackets}`);
  }

  return violations;
}

function countCatchphrases(body: string, catchphrases: string[]): number {
  let count = 0;
  for (const phrase of catchphrases) {
    // 「...」の中身だけで検索（句読点を取り除いて緩めに）
    const inner = phrase.replace(/^「|」$/g, "").trim();
    if (inner.length < 4) continue; // 短すぎる口癖はスキップ
    // 厳密一致 + 部分一致
    const re = new RegExp(inner.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    const matches = body.match(re);
    if (matches) count += matches.length;
  }
  return count;
}

function checkRelationships(body: string, ep: number, graph: RelationshipGraph): string[] {
  const violations: string[] = [];

  // 「初対面」「初めて会った」「見覚えのない」を含む箇所の前後にキャラ名がある場合
  // そのキャラの first_appearance_episode が ep <= N なら違反

  const allMembers = [
    ...graph.groups.flatMap((g) => g.members),
    ...(graph.antagonists ?? []),
  ];

  const reIntroduction = /(初対面|初めて会|見覚えのない|誰だ|何者だ)/g;
  const matches = [...body.matchAll(reIntroduction)];

  for (const match of matches) {
    const idx = match.index ?? 0;
    const surrounding = body.slice(Math.max(0, idx - 100), idx + 100);
    for (const member of allMembers) {
      if (
        surrounding.includes(member.name) &&
        member.first_appearance_episode !== undefined &&
        member.first_appearance_episode < ep
      ) {
        violations.push(
          `キャラ「${member.name}」を ep${ep} で初対面扱い（既出: ep${member.first_appearance_episode}）`,
        );
      }
    }
  }

  return violations;
}

function determineJudgment(result: AuditResult["rule_based"]): "A" | "B" | "C" {
  // C: 重大違反（ステータス単調性違反、関係性矛盾）
  if (
    result.status_monotonicity_violations.length > 0 ||
    result.relationship_violations.length > 0
  ) {
    return "C";
  }
  // B: 軽微な違反（表記揺れ、口癖不足）
  if (
    result.skill_naming_violations.length > 0 ||
    result.status_format_violations.length > 0 ||
    !result.catchphrase_density_ok
  ) {
    return "B";
  }
  return "A";
}

function generateRecommendations(result: AuditResult["rule_based"]): string[] {
  const recs: string[] = [];

  for (const v of result.skill_naming_violations) {
    recs.push(`⚠ 表記揺れ修正: ${v}`);
  }
  for (const v of result.status_monotonicity_violations) {
    recs.push(`❌ ステータス単調性違反（再生成推奨）: ${v}`);
  }
  for (const v of result.status_format_violations) {
    recs.push(`⚠ 書式違反: ${v}`);
  }
  if (!result.catchphrase_density_ok) {
    recs.push(
      `⚠ 口癖密度不足: ${result.catchphrase_count}回（基準2回）。自然な箇所に1-2回追加`,
    );
  }
  for (const v of result.relationship_violations) {
    recs.push(`❌ 関係性矛盾（再生成推奨）: ${v}`);
  }

  return recs;
}

function writeAuditReport(slug: string, result: AuditResult): void {
  const epPad = result.episode.toString().padStart(4, "0");
  const p = join(WORKS_DIR, slug, "longform", "episodes", `ep${epPad}_audit.md`);

  const lines: string[] = [];
  lines.push(`# ep${result.episode} 監査レポート`);
  lines.push("");
  lines.push(`## 総合判定: ${result.judgment}`);
  lines.push(
    result.judgment === "A"
      ? "（A: 全項目合格）"
      : result.judgment === "B"
        ? "（B: 警告あり、軽微な修正で完了）"
        : "（C: 違反あり、再生成推奨）",
  );
  lines.push("");
  lines.push("## ルールベース監査");
  lines.push("");
  lines.push("### 表記揺れ（スキル名）");
  if (result.rule_based.skill_naming_violations.length === 0) {
    lines.push("- ✅ 全て一致");
  } else {
    result.rule_based.skill_naming_violations.forEach((v) => lines.push(`- ⚠ ${v}`));
  }
  lines.push("");
  lines.push("### ステータス単調性");
  if (result.rule_based.status_monotonicity_violations.length === 0) {
    lines.push("- ✅ 単調増加");
  } else {
    result.rule_based.status_monotonicity_violations.forEach((v) => lines.push(`- ❌ ${v}`));
  }
  lines.push("");
  lines.push("### ステータス書式");
  if (result.rule_based.status_format_violations.length === 0) {
    lines.push("- ✅ 書式遵守");
  } else {
    result.rule_based.status_format_violations.forEach((v) => lines.push(`- ⚠ ${v}`));
  }
  lines.push("");
  lines.push("### 口癖密度");
  lines.push(
    `- 主人公の口癖を ${result.rule_based.catchphrase_count} 回使用 ${
      result.rule_based.catchphrase_density_ok ? "✅" : "⚠（基準2回未満）"
    }`,
  );
  lines.push("");
  lines.push("### 関係性整合");
  if (result.rule_based.relationship_violations.length === 0) {
    lines.push("- ✅ 整合");
  } else {
    result.rule_based.relationship_violations.forEach((v) => lines.push(`- ❌ ${v}`));
  }
  lines.push("");
  lines.push("## 推奨アクション");
  if (result.recommended_actions.length === 0) {
    lines.push("- なし（合格）");
  } else {
    result.recommended_actions.forEach((r) => lines.push(`- ${r}`));
  }
  lines.push("");
  lines.push("## 再生成判定");
  lines.push(`- ${result.needs_regeneration ? "❌ 再生成推奨" : "✅ そのまま次話へ進める"}`);
  lines.push("");

  writeFileSync(p, lines.join("\n"));
  console.log(`[OK] audit report written: ${p}`);
}

function main(): void {
  const args = process.argv.slice(2);
  const slug = args[0];
  const ep = parseInt(args[1] ?? "0", 10);

  if (!slug || ep < 1) {
    console.error("Usage: npx tsx scripts/generation/coherence-checker.ts <slug> <ep_number>");
    process.exit(1);
  }

  // ファイル読み込み
  const body = readEpisodeBody(slug, ep);
  const abilitySystemPath = join(WORKS_DIR, slug, "longform", "world_bible", "ability_system.json");
  const relationshipPath = join(WORKS_DIR, slug, "longform", "relationship_graph.json");

  const abilitySystem = loadJSON<AbilitySystem>(abilitySystemPath);
  const relationshipGraph = loadJSON<RelationshipGraph>(relationshipPath);

  if (!abilitySystem) {
    console.error(`[ERROR] ability_system.json not found: ${abilitySystemPath}`);
    process.exit(1);
  }
  if (!relationshipGraph) {
    console.error(`[ERROR] relationship_graph.json not found: ${relationshipPath}`);
    process.exit(1);
  }

  // 各チェック実行
  const skillViolations = checkSkillNaming(body, abilitySystem);
  const formatViolations = checkStatusFormat(body);

  // ステータス単調性: state-snapshot を活用
  const statusViolations: string[] = [];
  const prev = loadState(slug, ep - 1);
  const current = loadState(slug, ep);
  if (prev && current) {
    const stateDiff = diffState(prev, current);
    statusViolations.push(...stateDiff.violations);
  }

  // 口癖密度
  const catchphrases = loadProtagonistCatchphrases(slug);
  const catchphraseCount = countCatchphrases(body, catchphrases);
  const densityOk = catchphraseCount >= 2;

  // 関係性
  const relationshipViolations = checkRelationships(body, ep, relationshipGraph);

  // 結果集計
  const ruleBased = {
    skill_naming_violations: skillViolations,
    status_monotonicity_violations: statusViolations,
    status_format_violations: formatViolations,
    catchphrase_count: catchphraseCount,
    catchphrase_density_ok: densityOk,
    relationship_violations: relationshipViolations,
  };

  const judgment = determineJudgment(ruleBased);
  const recommendations = generateRecommendations(ruleBased);
  const needsRegeneration = judgment === "C";

  const result: AuditResult = {
    episode: ep,
    judgment,
    rule_based: ruleBased,
    recommended_actions: recommendations,
    needs_regeneration: needsRegeneration,
  };

  writeAuditReport(slug, result);

  // 標準出力にもサマリー
  console.log("");
  console.log(`=== ep${ep} 整合性監査 ===`);
  console.log(`総合判定: ${judgment}`);
  console.log(`違反件数:`);
  console.log(`  - スキル名表記揺れ: ${skillViolations.length}`);
  console.log(`  - ステータス単調性違反: ${statusViolations.length}`);
  console.log(`  - 書式違反: ${formatViolations.length}`);
  console.log(`  - 口癖密度: ${catchphraseCount} (${densityOk ? "OK" : "不足"})`);
  console.log(`  - 関係性矛盾: ${relationshipViolations.length}`);

  // 終了コード: A=0, B=1, C=2
  process.exit(judgment === "A" ? 0 : judgment === "B" ? 1 : 2);
}

main();
