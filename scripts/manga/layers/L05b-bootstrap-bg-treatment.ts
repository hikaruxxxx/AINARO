#!/usr/bin/env tsx
/**
 * data/manga/layout_patterns/v1.json の各 slot に background_treatment を
 * ルールベースで一次注入する bootstrap スクリプト。
 *
 * Step 1b (2026-05-06)。catalog-v1.md の「atmospheric / 境界消失 / 網点 / UI / silhouette」
 * といった observation を slot レベルに落とし込む。確信度の低いものは未指定のまま
 * 残し、Step 2 の learner script (画像から推定) で埋める。
 *
 * 使い方:
 *   npx tsx scripts/manga/layers/L05b-bootstrap-bg-treatment.ts          # dry-run (差分のみ表示)
 *   npx tsx scripts/manga/layers/L05b-bootstrap-bg-treatment.ts --write  # v1.json 上書き
 *
 * ルール (優先度順、上から評価):
 *   1. features に "panel境界完全消失" / "full_bleed_radial" + 該当 slot bleed=true → atmospheric_fade
 *   2. role_hint に "bubble" / "skill_activation" → floating_ui
 *   3. role_hint に "ui_" / "status_" / "id_artifact" / "sns_" / "news_" → floating_ui
 *   4. features に "網点トーン背景" → tone_back (該当 pattern の全 slot)
 *   5. is_borderless: true →
 *      - role_hint or features に "silhouette" → atmospheric_fade
 *      - role_hint に "atmospheric" or features に "atmospheric" → atmospheric_fade
 *      - その他の borderless → atmospheric_fade (デフォルト解釈)
 *   6. それ以外 (rect 通常 slot) → 未指定 (Step 2 learner で埋める)
 */
import { promises as fs } from "node:fs";
import path from "node:path";

type Slot = {
  slot_id: string;
  reading_order: number;
  role_hint: string;
  size_class: string;
  polygon: number[][];
  is_borderless?: boolean;
  bleed?: boolean;
  background_treatment?: string;
  internal_diagonal_split?: unknown;
};

type Pattern = {
  id: string;
  name: string;
  panel_count: number;
  page_role_hints: string[];
  subtype_hints: string[];
  features: string[];
  slots: Slot[];
  [k: string]: unknown;
};

type Dict = {
  schema_version: number;
  patterns: Pattern[];
  [k: string]: unknown;
};

type Treatment =
  | "detailed_bg"
  | "atmospheric_fade"
  | "tone_back"
  | "solid_white"
  | "solid_black"
  | "floating_ui"
  | "unspecified";

function classify(slot: Slot, pattern: Pattern): Treatment | undefined {
  const role = slot.role_hint.toLowerCase();
  const featStr = pattern.features.join(",").toLowerCase();

  // Rule 4: 網点トーン背景 (パターン全体)
  if (featStr.includes("網点トーン背景")) {
    return "tone_back";
  }

  // Rule 2: bubble/skill_activation → floating_ui
  if (role.includes("bubble") || role.includes("skill_activation")) {
    return "floating_ui";
  }

  // Rule 3: UI / status / SNS / ID artifact 系 → floating_ui
  if (
    role.startsWith("ui_") ||
    role.includes("status_") ||
    role.includes("id_artifact") ||
    role.includes("sns_") ||
    role.includes("news_") ||
    role.includes("ui_information")
  ) {
    return "floating_ui";
  }

  // Rule 5: borderless slot
  if (slot.is_borderless) {
    if (role.includes("silhouette") || featStr.includes("silhouette")) {
      return "atmospheric_fade";
    }
    if (role.includes("atmospheric") || featStr.includes("atmospheric")) {
      return "atmospheric_fade";
    }
    // role-specific borderless cases
    if (role.includes("isolation") || role.includes("focal_climax") || role.includes("relational_pivot")) {
      return "atmospheric_fade";
    }
    // borderless のデフォルト: atmospheric_fade
    return "atmospheric_fade";
  }

  // Rule 1 fallback: bleed=true で full_bleed feature を持つ slot
  if (slot.bleed && (featStr.includes("full_bleed") || featStr.includes("panel境界完全消失"))) {
    return "atmospheric_fade";
  }

  // Rule 6: rect 通常 slot は未指定 (learner で埋める)
  return undefined;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const writeMode = args.includes("--write");
  const dictPath = path.resolve("data/manga/layout_patterns/v1.json");

  const raw = await fs.readFile(dictPath, "utf-8");
  const dict = JSON.parse(raw) as Dict;

  let touched = 0;
  let skipped = 0;
  const summary: Record<string, number> = {};
  const changes: string[] = [];

  for (const pattern of dict.patterns) {
    for (const slot of pattern.slots) {
      const inferred = classify(slot, pattern);
      if (inferred === undefined) {
        skipped++;
        continue;
      }
      if (slot.background_treatment === inferred) {
        skipped++;
        continue;
      }
      const before = slot.background_treatment ?? "(none)";
      slot.background_treatment = inferred;
      summary[inferred] = (summary[inferred] ?? 0) + 1;
      touched++;
      changes.push(`  ${pattern.id}/${slot.slot_id}  ${before} → ${inferred}`);
    }
  }

  console.log(`[bootstrap-bg-treatment] patterns=${dict.patterns.length}`);
  console.log(`[bootstrap-bg-treatment] would change ${touched} slot(s), unchanged ${skipped}`);
  console.log("[bootstrap-bg-treatment] inferred treatment counts:");
  for (const [k, v] of Object.entries(summary).sort()) {
    console.log(`  ${k}: ${v}`);
  }

  if (changes.length > 0 && changes.length <= 80) {
    console.log("\n[bootstrap-bg-treatment] changes:");
    for (const line of changes) console.log(line);
  } else if (changes.length > 80) {
    console.log(`\n[bootstrap-bg-treatment] ${changes.length} changes (head):`);
    for (const line of changes.slice(0, 20)) console.log(line);
    console.log("  ...");
  }

  if (!writeMode) {
    console.log("\n[bootstrap-bg-treatment] dry-run (use --write to persist)");
    return;
  }

  // 出力 (元の整形を概ね保つ)
  await fs.writeFile(dictPath, JSON.stringify(dict, null, 2) + "\n", "utf-8");
  console.log(`[bootstrap-bg-treatment] written ${dictPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
