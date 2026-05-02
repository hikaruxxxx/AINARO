/**
 * measure-face-consistency.ts スモークテスト
 *
 * Codex CLI を呼ばず (--dry-run=true)、CLI が
 *   1. snapshot を読める
 *   2. manifest から対象 panel を絞り込める (主人公の参照画像が含まれる panel のみ)
 *   3. 集計 + JSON/MD 出力ができる
 * ことを確認する。
 *
 * 実行: npx tsx scripts/manga/measure-face-consistency-smoketest.ts
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
import { aggregateFaceConsistency } from "@/lib/manga/qa/face-consistency";

const SNAPSHOT_PATH = "data/manga/bible/work-1-dungeon-explorer/snapshot.json";
const TMP_REFS_ROOT = path.resolve(".tmp-fc-smoketest-refs");
const TMP_OUTPUT_ROOT = path.resolve(".tmp-fc-smoketest-output");

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

async function main() {
  cleanup();
  process.on("exit", cleanup);

  // ダミー refs (主人公の front.png のみ必要)
  const charRefDir = path.join(
    TMP_REFS_ROOT,
    "work-1-dungeon-explorer",
    "refs",
    "characters",
    "shinozaki_kanade"
  );
  dummyPng(path.join(charRefDir, "front.png"));
  dummyPng(path.join(charRefDir, "side.png"));

  // ダミー panel 出力 + manifest.json
  const epDir = path.join(
    TMP_OUTPUT_ROOT,
    "work-1-dungeon-explorer",
    "ep001"
  );
  mkdirSync(epDir, { recursive: true });

  const panelPaths: string[] = [];
  for (let i = 0; i < 4; i++) {
    const p = path.join(epDir, `panel_${String(i).padStart(3, "0")}.png`);
    dummyPng(p);
    panelPaths.push(p);
  }
  // 5枚目は main で「主人公が登場しない」想定 (refs に shinozaki_kanade を含めない)
  const noProtPanel = path.join(epDir, "panel_004.png");
  dummyPng(noProtPanel);
  panelPaths.push(noProtPanel);

  const manifest = {
    slug: "work-1-dungeon-explorer",
    ep: 1,
    generated_at: new Date().toISOString(),
    dry_run: false,
    panels: panelPaths.map((p, i) => ({
      panel_idx: i,
      prompt: "(dummy)",
      // panel 0-3 は主人公参照を含む。panel 4 は含まない (= 主人公不在シーン)
      referenceImagePaths:
        i < 4
          ? [path.join(charRefDir, "front.png"), path.join(charRefDir, "side.png")]
          : [],
      durationMs: 100,
      outputPath: p,
    })),
  };
  const manifestPath = path.join(epDir, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  console.log(`[smoketest] manifest: ${manifestPath}`);

  // CLI を dry-run で実行
  console.log("");
  console.log(`[smoketest] CLI 実行 (dry-run, シノザキ・カナデのみ)...`);
  const result = spawnSync(
    "npx",
    [
      "tsx",
      "scripts/manga/measure-face-consistency.ts",
      `--snapshot=${SNAPSHOT_PATH}`,
      `--manifest=${manifestPath}`,
      `--character=シノザキ・カナデ`,
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

  // レポート検証
  const reportPath = path.join(epDir, "face-consistency-report.json");
  const reports = JSON.parse(readFileSync(reportPath, "utf-8")) as Array<{
    character_name: string;
    per_panel: Array<{ panel_idx: number }>;
    aggregate: ReturnType<typeof aggregateFaceConsistency>;
  }>;

  console.log("");
  console.log(`[smoketest] レポート検証:`);
  console.log(`  reports: ${reports.length}`);

  let assertionFailed = false;
  if (reports.length !== 1) {
    console.error(`  ❌ reports は 1 件であるべき (got ${reports.length})`);
    assertionFailed = true;
  }
  const r = reports[0];
  if (!r) {
    console.error(`  ❌ reports[0] が undefined`);
    process.exit(1);
  }
  if (r.character_name !== "シノザキ・カナデ") {
    console.error(`  ❌ character_name 不一致: ${r.character_name}`);
    assertionFailed = true;
  }
  // 主人公が refs に含まれる panel 0-3 のみが対象 (panel 4 は除外)
  if (r.per_panel.length !== 4) {
    console.error(
      `  ❌ per_panel は 4 件であるべき (主人公不在の panel 4 は除外、got ${r.per_panel.length})`
    );
    assertionFailed = true;
  }
  const targetIdxs = r.per_panel.map((p) => p.panel_idx).sort();
  if (JSON.stringify(targetIdxs) !== JSON.stringify([0, 1, 2, 3])) {
    console.error(
      `  ❌ panel_idx は [0,1,2,3] であるべき (got ${JSON.stringify(targetIdxs)})`
    );
    assertionFailed = true;
  }
  console.log(`  ✓ character_name = ${r.character_name}`);
  console.log(`  ✓ per_panel = ${r.per_panel.length} (panel_idx=${targetIdxs.join(",")})`);
  console.log(`  ✓ aggregate.total = ${r.aggregate.total}`);

  // markdown ファイルも存在確認
  const mdPath = path.join(epDir, "face-consistency-report.md");
  if (!existsSync(mdPath)) {
    console.error(`  ❌ markdown 出力が無い: ${mdPath}`);
    assertionFailed = true;
  } else {
    const md = readFileSync(mdPath, "utf-8");
    if (!md.includes("シノザキ・カナデ")) {
      console.error(`  ❌ markdown に対象キャラ名が含まれない`);
      assertionFailed = true;
    } else {
      console.log(`  ✓ markdown 出力 OK`);
    }
  }

  if (assertionFailed) {
    console.error("");
    console.error("[smoketest] FAILED");
    process.exit(1);
  }

  // 単体ユニットテスト: aggregateFaceConsistency
  console.log("");
  console.log(`[smoketest] aggregateFaceConsistency 単体検証:`);
  const synthetic = aggregateFaceConsistency([
    {
      panel_idx: 0,
      candidate_image_path: "/x",
      verdict: {
        same_person: true,
        hair_match: true,
        eye_match: true,
        outfit_match: true,
        score: 0.85,
        comment: "OK",
        decision: "pass",
      },
    },
    {
      panel_idx: 1,
      candidate_image_path: "/y",
      verdict: {
        same_person: true,
        hair_match: false,
        eye_match: true,
        outfit_match: true,
        score: 0.6,
        comment: "髪色が薄め",
        decision: "warn",
      },
    },
    {
      panel_idx: 2,
      candidate_image_path: "/z",
      verdict: {
        same_person: false,
        hair_match: false,
        eye_match: false,
        outfit_match: false,
        score: 0.1,
        comment: "別人",
        decision: "hard_fail",
      },
    },
  ]);
  console.log(JSON.stringify(synthetic, null, 2));
  if (synthetic.total !== 3) {
    console.error(`  ❌ total != 3`);
    process.exit(1);
  }
  if (synthetic.decisions.pass !== 1 || synthetic.decisions.warn !== 1 || synthetic.decisions.hard_fail !== 1) {
    console.error(`  ❌ decisions 集計が誤り`);
    process.exit(1);
  }
  if (Math.abs(synthetic.mean_score - (0.85 + 0.6 + 0.1) / 3) > 1e-6) {
    console.error(`  ❌ mean_score が誤り`);
    process.exit(1);
  }
  if (synthetic.hair_mismatch_count !== 2) {
    console.error(`  ❌ hair_mismatch_count != 2`);
    process.exit(1);
  }
  console.log(`  ✓ aggregate 集計 OK`);

  console.log("");
  console.log("[smoketest] ✅ PASS");
}

main().catch((err) => {
  console.error("[smoketest] ERROR:", err);
  process.exit(1);
});
