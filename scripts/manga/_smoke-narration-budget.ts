/**
 * narration budget audit smoke (Phase Y WY-2)
 *
 * a07 ep01 storyboard.json に対して narration budget 検査を走らせて、
 * Phase Y WY-2 の新ルール (narration_panel_chars_exceeded / narration_page_count_exceeded /
 * narration_episode_omniscient_exceeded) が動作するか確認する。
 *
 * Usage:
 *   npx tsx scripts/manga/_smoke-narration-budget.ts
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { auditVolume } from "../../src/lib/manga/name-preview/audit-rules";
import { loadNarrationBudgets } from "../../src/lib/manga/storyboard-v2/narration-budget";
import type {
  BibleSnapshotV2,
  EpisodeStoryboardV2,
} from "../../src/lib/manga/schemas-v2";

const ROOT = path.resolve(__dirname, "../..");
const SLUG = "a07-modern-dungeon";
const EP = 1;

async function main() {
  const biblePath = path.join(ROOT, `data/manga/works/${SLUG}/bible/snapshot.v2.json`);
  const bible = JSON.parse(readFileSync(biblePath, "utf-8")) as BibleSnapshotV2;

  const sbPath = path.join(
    ROOT,
    `data/manga/works/${SLUG}/episodes/ep${String(EP).padStart(2, "0")}/storyboard.json`,
  );
  const storyboard = JSON.parse(readFileSync(sbPath, "utf-8")) as EpisodeStoryboardV2;

  const budgets = await loadNarrationBudgets();

  console.log(`=== narration budget smoke (a07-modern-dungeon ep01) ===`);
  console.log(`bible.meta.tone_profile: ${JSON.stringify(bible.meta.tone_profile)}`);
  console.log(`bible.meta.genre: ${bible.meta.genre}`);
  console.log(`pages: ${storyboard.pages.length}, panels: ${storyboard.pages.reduce((s, p) => s + p.panels.length, 0)}`);

  // tone_profile=未設定 (デフォルト darkness=0.5 で audit) の場合
  const findingsDefault = auditVolume({
    episodes: [storyboard],
    toneProfile: bible.meta.tone_profile,
    genre: bible.meta.genre,
    narrationBudgets: budgets,
  });

  // tone_profile=light_recovery (darkness=0.3) で再テスト
  const findingsLight = auditVolume({
    episodes: [storyboard],
    toneProfile: { darkness: 0.3, comedic_density: 0.8, recovery_cadence: 0.9, sidekick_presence: 0.9 },
    genre: bible.meta.genre,
    narrationBudgets: budgets,
  });

  // tone_profile=hellmode (darkness=0.8) で再テスト
  const findingsHellmode = auditVolume({
    episodes: [storyboard],
    toneProfile: { darkness: 0.8, comedic_density: 0.3, recovery_cadence: 0.2, sidekick_presence: 0.3 },
    genre: bible.meta.genre,
    narrationBudgets: budgets,
  });

  console.log(`\n=== findings (default tone, narrationBudgets 渡す) ===`);
  console.log(`  total: ${findingsDefault.length}`);
  for (const f of findingsDefault) {
    console.log(`  [${f.severity}] ${f.rule}: ${f.message}`);
  }

  console.log(`\n=== findings (light_recovery tone) ===`);
  console.log(`  total: ${findingsLight.length}`);
  const narrationFindings = findingsLight.filter((f) =>
    f.rule.startsWith("narration_") &&
    (f.rule === "narration_panel_chars_exceeded" ||
      f.rule === "narration_page_count_exceeded" ||
      f.rule === "narration_episode_omniscient_exceeded"),
  );
  console.log(`  narration budget violations: ${narrationFindings.length}`);
  for (const f of narrationFindings.slice(0, 10)) {
    console.log(`    [${f.severity}] ${f.rule}: ${f.message}`);
  }

  console.log(`\n=== findings (hellmode tone) ===`);
  console.log(`  total: ${findingsHellmode.length}`);
  const hellmodeNarrationFindings = findingsHellmode.filter((f) =>
    f.rule === "narration_panel_chars_exceeded" ||
    f.rule === "narration_page_count_exceeded" ||
    f.rule === "narration_episode_omniscient_exceeded",
  );
  console.log(`  narration budget violations (hellmode): ${hellmodeNarrationFindings.length}`);

  console.log(`\n=== verdict ===`);
  if (narrationFindings.length > 0 && hellmodeNarrationFindings.length < narrationFindings.length) {
    console.log(`  PASS: light_recovery で違反検出 (${narrationFindings.length}) > hellmode (${hellmodeNarrationFindings.length})`);
    console.log(`        tone_profile に応じた budget 切替が動作している`);
  } else if (narrationFindings.length === 0 && hellmodeNarrationFindings.length === 0) {
    console.log(`  INCONCLUSIVE: 両方とも違反0件 (a07 が両方の budget を満たしている、または narration_kinds 未設定で omniscient 判定が caption_box フォールバック)`);
  } else {
    console.log(`  WARN: light=${narrationFindings.length} / hellmode=${hellmodeNarrationFindings.length} — 期待通りでない可能性`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
