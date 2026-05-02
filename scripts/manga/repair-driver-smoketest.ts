/**
 * repair-panels-from-snapshot.ts CLI driver スモークテスト (dry-run only)
 *
 * 合成 storyboard.json + manifest.json + face-consistency-report.json を作り、
 * --dry-run=true で driver を実行。repair-plan.json + manual-review-log.json が
 * 期待される内容で出力されるかを検証する。
 *
 * 実行: npx tsx scripts/manga/repair-driver-smoketest.ts
 */

import {
  existsSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
} from "fs";
import { spawnSync } from "child_process";
import path from "path";
import { loadBibleSnapshot } from "./load-bible-snapshot";
import { snapshotToBibleRows } from "@/lib/manga/bible/snapshot-adapter";
import type { ShotlistPanelEntry, ShotlistData } from "@/lib/manga/schemas";
import type {
  FaceConsistencyReport,
  FaceConsistencyVerdict,
} from "@/lib/manga/qa/face-consistency";

const SNAPSHOT_PATH = "data/manga/bible/work-1-dungeon-explorer/snapshot.json";
const TMP_REFS_ROOT = path.resolve(".tmp-repair-smoketest-refs");
const TMP_OUTPUT_ROOT = path.resolve(".tmp-repair-smoketest-output");

function dummyPng(p: string): void {
  const dir = path.dirname(p);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(p, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
}

function cleanup() {
  for (const p of [TMP_REFS_ROOT, TMP_OUTPUT_ROOT]) {
    try {
      rmSync(p, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

function panel(
  idx: number,
  args: Partial<ShotlistPanelEntry> & {
    role: ShotlistPanelEntry["role"];
    aspect: ShotlistPanelEntry["aspect"];
    scene_id: string;
  }
): ShotlistPanelEntry {
  return {
    idx,
    camera: (args.camera ?? "medium") as ShotlistPanelEntry["camera"],
    tempo: args.tempo ?? "slow",
    characters: args.characters ?? [],
    location: args.location ?? null,
    ...args,
  } as ShotlistPanelEntry;
}

function verdict(
  decision: FaceConsistencyVerdict["decision"],
  score: number
): FaceConsistencyVerdict {
  return {
    same_person: decision !== "hard_fail",
    hair_match: decision === "pass",
    eye_match: true,
    outfit_match: decision !== "hard_fail",
    score,
    comment: `synthetic ${decision}`,
    decision,
  };
}

async function main() {
  cleanup();
  process.on("exit", cleanup);

  const { snapshot } = loadBibleSnapshot(SNAPSHOT_PATH);
  const { characters } = snapshotToBibleRows(snapshot);
  const protagonist = characters.find(
    (c) => c.character_name === "シノザキ・カナデ"
  );
  if (!protagonist) throw new Error("snapshot から主人公が取得できません");

  // ダミー refs
  const charRefDir = path.join(
    TMP_REFS_ROOT,
    snapshot.meta.slug,
    "refs",
    "characters",
    "shinozaki_kanade"
  );
  for (const v of ["front", "side", "expr_joy", "expr_anger", "expr_sad"]) {
    dummyPng(path.join(charRefDir, `${v}.png`));
  }

  // 合成 storyboard.json (5 panels: panel 4 を cliffhanger)
  const sbPanels: ShotlistPanelEntry[] = [
    panel(0, {
      role: "establishing",
      aspect: "panel_landscape",
      scene_id: "s1",
      characters: [protagonist.id],
    }),
    panel(1, {
      role: "dialogue",
      aspect: "panel_square",
      scene_id: "s1",
      characters: [protagonist.id],
    }),
    panel(2, {
      role: "reaction",
      aspect: "panel_portrait",
      scene_id: "s1",
      characters: [protagonist.id],
    }),
    panel(3, {
      role: "action",
      aspect: "panel_square",
      scene_id: "s1",
      characters: [protagonist.id],
    }),
    panel(4, {
      role: "cliffhanger",
      aspect: "panel_landscape",
      scene_id: "s1",
      characters: [protagonist.id],
    }),
  ];
  const shotlist: ShotlistData = {
    rhythm_curve: [],
    panels: sbPanels,
    pages: [],
    episode_target_pages: 1,
    meta: {
      total_panels: sbPanels.length,
      total_height_px_estimate: 0,
      generated_by: "smoketest",
      generation_version: "smoketest-v1",
    },
  };

  const epDir = path.join(TMP_OUTPUT_ROOT, snapshot.meta.slug, "ep001");
  mkdirSync(epDir, { recursive: true });

  // manifest.json (各 panel の出力先と retry_count)
  const panelOutputs: string[] = [];
  for (let i = 0; i < 5; i++) {
    const p = path.join(epDir, `panel_${String(i).padStart(3, "0")}.png`);
    dummyPng(p);
    panelOutputs.push(p);
  }
  const manifest = {
    slug: snapshot.meta.slug,
    ep: 1,
    generated_at: new Date().toISOString(),
    panels: sbPanels.map((sb, i) => ({
      panel_idx: sb.idx,
      prompt: "(synthetic)",
      referenceImagePaths: [path.join(charRefDir, "front.png")],
      durationMs: 100,
      outputPath: panelOutputs[i],
      retry_count: i === 3 ? 2 : 0, // panel 3 は通常コマで上限 2 に到達済み
    })),
  };
  const manifestPath = path.join(epDir, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

  // storyboard.json は CLI が探す場所か --storyboard で渡せる
  const sbJsonPath = path.join(epDir, "storyboard.json");
  writeFileSync(
    sbJsonPath,
    JSON.stringify({ plot: {}, shotlist }, null, 2),
    "utf-8"
  );

  // face-consistency-report.json
  // panel 0: pass / panel 1-2: warn / panel 3: warn (attempts 2 → manual_review 期待) / panel 4: hard_fail (cliffhanger 重要)
  const fcReport: FaceConsistencyReport[] = [
    {
      character_name: protagonist.character_name,
      reference_image_path: path.join(charRefDir, "front.png"),
      measured_at: new Date().toISOString(),
      per_panel: [
        { panel_idx: 0, candidate_image_path: panelOutputs[0], verdict: verdict("pass", 0.85) },
        { panel_idx: 1, candidate_image_path: panelOutputs[1], verdict: verdict("warn", 0.6) },
        { panel_idx: 2, candidate_image_path: panelOutputs[2], verdict: verdict("warn", 0.55) },
        { panel_idx: 3, candidate_image_path: panelOutputs[3], verdict: verdict("warn", 0.6) },
        { panel_idx: 4, candidate_image_path: panelOutputs[4], verdict: verdict("hard_fail", 0.1) },
      ],
      aggregate: {
        total: 5,
        decisions: { pass: 1, warn: 3, reroll: 0, hard_fail: 1 },
        panels_by_decision: {
          pass: [0],
          warn: [1, 2, 3],
          reroll: [],
          hard_fail: [4],
        },
        mean_score: 0.54,
        hair_mismatch_count: 0,
        eye_mismatch_count: 0,
        outfit_mismatch_count: 0,
      },
    },
  ];
  const reportPath = path.join(epDir, "face-consistency-report.json");
  writeFileSync(reportPath, JSON.stringify(fcReport, null, 2), "utf-8");

  // CLI 実行 (dry-run)
  console.log(`[smoketest] CLI 実行 (dry-run)...`);
  const result = spawnSync(
    "npx",
    [
      "tsx",
      "scripts/manga/repair-panels-from-snapshot.ts",
      `--snapshot=${SNAPSHOT_PATH}`,
      `--manifest=${manifestPath}`,
      `--storyboard=${sbJsonPath}`,
      `--consistency-report=${reportPath}`,
      `--refs-root=${TMP_REFS_ROOT}`,
      `--dry-run=true`,
    ],
    { encoding: "utf-8", stdio: "pipe" }
  );
  if (result.stdout) console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
  if (result.status !== 0) {
    console.error(`[smoketest] CLI exit=${result.status}`);
    process.exit(1);
  }

  // repair-plan.json 検証
  const planPath = path.join(epDir, "repair-plan.json");
  if (!existsSync(planPath)) {
    console.error(`  ❌ repair-plan.json が出力されていない`);
    process.exit(1);
  }
  const repairOut = JSON.parse(readFileSync(planPath, "utf-8")) as {
    summary: { total: number; by_action: Record<string, number> };
    plans: Array<{
      panel_idx: number;
      judgement: { action: string; retryAttempt: number };
      important_check: { important: boolean; reasons: string[] };
    }>;
  };

  console.log("");
  console.log(`[smoketest] repair-plan 検証:`);
  let failed = 0;

  // panel 0: pass → accept
  const p0 = repairOut.plans.find((p) => p.panel_idx === 0);
  if (!p0 || p0.judgement.action !== "accept") {
    console.error(`  ❌ panel 0: expected accept, got ${p0?.judgement.action}`);
    failed++;
  } else console.log(`  ✓ panel 0: accept`);

  // panel 1: warn attempts=0 → retry_stronger_ref
  const p1 = repairOut.plans.find((p) => p.panel_idx === 1);
  if (!p1 || p1.judgement.action !== "retry_stronger_ref") {
    console.error(
      `  ❌ panel 1: expected retry_stronger_ref, got ${p1?.judgement.action}`
    );
    failed++;
  } else console.log(`  ✓ panel 1: retry_stronger_ref`);

  // panel 2: warn attempts=0 → retry_stronger_ref
  const p2 = repairOut.plans.find((p) => p.panel_idx === 2);
  if (!p2 || p2.judgement.action !== "retry_stronger_ref") {
    console.error(
      `  ❌ panel 2: expected retry_stronger_ref, got ${p2?.judgement.action}`
    );
    failed++;
  } else console.log(`  ✓ panel 2: retry_stronger_ref`);

  // panel 3: 通常コマで attempts=2 (上限) → manual_review
  const p3 = repairOut.plans.find((p) => p.panel_idx === 3);
  if (!p3 || p3.judgement.action !== "manual_review") {
    console.error(
      `  ❌ panel 3: expected manual_review (attempts=2 通常上限), got ${p3?.judgement.action}`
    );
    failed++;
  } else console.log(`  ✓ panel 3: manual_review (通常上限到達)`);

  // panel 4: hard_fail かつ cliffhanger → 重要扱い、attempts=0 → retry_stronger_ref
  const p4 = repairOut.plans.find((p) => p.panel_idx === 4);
  if (!p4 || p4.judgement.action !== "retry_stronger_ref") {
    console.error(
      `  ❌ panel 4: expected retry_stronger_ref (重要+attempts=0), got ${p4?.judgement.action}`
    );
    failed++;
  } else console.log(`  ✓ panel 4: retry_stronger_ref`);
  if (!p4?.important_check.important) {
    console.error(`  ❌ panel 4 should be important`);
    failed++;
  } else
    console.log(
      `  ✓ panel 4 important: reasons=${p4.important_check.reasons.join(",")}`
    );

  // summary
  console.log("");
  console.log(`[smoketest] summary: ${JSON.stringify(repairOut.summary, null, 2)}`);

  if (failed > 0) {
    console.error("");
    console.error(`[smoketest] FAILED (${failed} 件)`);
    process.exit(1);
  }
  console.log("");
  console.log("[smoketest] ✅ PASS");
}

main().catch((err) => {
  console.error("[smoketest] ERROR:", err);
  process.exit(1);
});
