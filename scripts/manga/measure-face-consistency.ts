/**
 * Face Consistency 計測 CLI (LLM-as-Judge)
 *
 * 入力:
 *   - snapshot.json (character_name → spec / continuity_seeds)
 *   - manifest.json (generate-panels-from-snapshot.ts の出力)
 *   - bible refs (data/manga/bible/<slug>/refs/characters/<name>/front.png)
 *
 * 流れ:
 *   1. snapshot を読み、各キャラの reference_image_path (front.png) を解決
 *   2. manifest.panels[i].referenceImagePaths から、その panel に主人公(など)が
 *      含まれているかを推測 (キャラ ref パスが含まれる panel のみ対象)
 *   3. 各 panel について measureFaceConsistency を実行
 *   4. 集計してレポート JSON / Markdown 出力
 *
 * 使い方:
 *   npx tsx scripts/manga/measure-face-consistency.ts \
 *     --snapshot=data/manga/bible/work-1-dungeon-explorer/snapshot.json \
 *     --manifest=data/manga/output/work-1-dungeon-explorer/ep001/manifest.json
 *
 *   # 特定キャラだけ計測
 *   npx tsx scripts/manga/measure-face-consistency.ts \
 *     --snapshot=... --manifest=... --character=シノザキ・カナデ
 *
 *   # dry-run (LLM 呼ばずに対象 panel 数だけ確認)
 *   npx tsx scripts/manga/measure-face-consistency.ts \
 *     --snapshot=... --manifest=... --dry-run=true
 *
 * 出力:
 *   <manifest dir>/face-consistency-report.json
 *   <manifest dir>/face-consistency-report.md
 */

import "./_env";
import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { loadBibleSnapshot } from "./load-bible-snapshot";
import {
  measureFaceConsistency,
  aggregateFaceConsistency,
  type FaceConsistencyReport,
} from "../../src/lib/manga/qa/face-consistency";

type CliArgs = {
  snapshotPath: string;
  manifestPath: string;
  characterFilter?: string;
  refsRoot: string;
  dryRun: boolean;
  imageTimeoutMs: number;
  maxRetries: number;
};

function parseArgs(): CliArgs {
  const args: Partial<CliArgs> = {};
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (!m) continue;
    const [, key, value] = m;
    switch (key) {
      case "snapshot":
        args.snapshotPath = value;
        break;
      case "manifest":
        args.manifestPath = value;
        break;
      case "character":
        args.characterFilter = value;
        break;
      case "refs-root":
        args.refsRoot = value;
        break;
      case "dry-run":
        args.dryRun = value === "true" || value === "1";
        break;
      case "timeout-ms":
        args.imageTimeoutMs = Number.parseInt(value, 10);
        break;
      case "max-retries":
        args.maxRetries = Number.parseInt(value, 10);
        break;
    }
  }
  if (!args.snapshotPath) throw new Error("--snapshot=<path> が必要です");
  if (!args.manifestPath) throw new Error("--manifest=<path> が必要です");
  return {
    snapshotPath: args.snapshotPath,
    manifestPath: args.manifestPath,
    characterFilter: args.characterFilter,
    refsRoot: args.refsRoot ?? "data/manga/bible",
    dryRun: args.dryRun ?? false,
    imageTimeoutMs: args.imageTimeoutMs ?? 5 * 60 * 1000,
    maxRetries: args.maxRetries ?? 1,
  };
}

function safeName(name: string, romaji?: string): string {
  if (romaji && romaji !== "TODO" && !romaji.startsWith("TODO")) {
    return romaji.toLowerCase().replace(/\s+/g, "_").replace(/[^\w-]/g, "");
  }
  return name.replace(/[^\w぀-ゟ゠-ヿ一-龯-]/g, "_");
}

function renderMarkdown(reports: FaceConsistencyReport[]): string {
  const lines: string[] = [];
  lines.push(`# Face Consistency Report`);
  lines.push("");
  lines.push(`計測日時: ${new Date().toISOString()}`);
  lines.push("");
  for (const r of reports) {
    const a = r.aggregate;
    lines.push(`## ${r.character_name}`);
    lines.push("");
    lines.push(`- 参照画像: \`${r.reference_image_path}\``);
    lines.push(`- 対象パネル数: ${a.total}`);
    lines.push(`- 平均 score: **${a.mean_score.toFixed(3)}**`);
    lines.push(
      `- decisions: pass=${a.decisions.pass} / warn=${a.decisions.warn} / reroll=${a.decisions.reroll} / hard_fail=${a.decisions.hard_fail}`
    );
    lines.push(
      `- 属性 mismatch: hair=${a.hair_mismatch_count} eye=${a.eye_mismatch_count} outfit=${a.outfit_mismatch_count}`
    );
    if (a.panels_by_decision.hard_fail.length > 0) {
      lines.push(
        `- ⚠️ hard_fail panel: ${a.panels_by_decision.hard_fail.join(", ")}`
      );
    }
    if (a.panels_by_decision.reroll.length > 0) {
      lines.push(
        `- 🔁 reroll panel: ${a.panels_by_decision.reroll.join(", ")}`
      );
    }
    lines.push("");
    lines.push(`### Per-panel`);
    lines.push("");
    lines.push("| panel | decision | score | hair | eye | outfit | comment |");
    lines.push("|------:|----------|------:|:----:|:---:|:------:|---------|");
    for (const p of r.per_panel) {
      const v = p.verdict;
      lines.push(
        `| ${p.panel_idx} | ${v.decision} | ${v.score.toFixed(2)} | ${v.hair_match ? "✓" : "✗"} | ${v.eye_match ? "✓" : "✗"} | ${v.outfit_match ? "✓" : "✗"} | ${v.comment.replace(/\|/g, "\\|").slice(0, 80)} |`
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function main() {
  const args = parseArgs();
  const { snapshot } = loadBibleSnapshot(args.snapshotPath);
  const manifestRaw = await readFile(args.manifestPath, "utf-8");
  const manifest = JSON.parse(manifestRaw) as {
    slug: string;
    ep: number;
    panels: Array<{
      panel_idx: number;
      prompt: string;
      referenceImagePaths: string[];
      outputPath: string;
      error?: string;
    }>;
  };

  console.log(
    `[measure-face-consistency] slug=${manifest.slug} ep=${manifest.ep} panels=${manifest.panels.length} dry_run=${args.dryRun}`
  );

  // 対象キャラを決める (--character 指定 or snapshot 全 protagonist)
  const targetChars = args.characterFilter
    ? snapshot.characters.filter(
        (c) => c.character_name === args.characterFilter
      )
    : snapshot.characters.filter(
        (c) => !c.character_name.startsWith("TODO")
      );
  if (targetChars.length === 0) {
    throw new Error(
      `対象キャラが 0 件。snapshot に存在するキャラ名を --character で指定してください。`
    );
  }

  const reports: FaceConsistencyReport[] = [];

  for (const c of targetChars) {
    const dirName = safeName(c.character_name, c.character_name_romaji);
    const refPath = path.resolve(
      args.refsRoot,
      snapshot.meta.slug,
      "refs",
      "characters",
      dirName,
      "front.png"
    );
    if (!existsSync(refPath)) {
      console.warn(
        `[skip] ${c.character_name}: 参照画像が見つからない (${refPath})`
      );
      continue;
    }

    // この character の参照ディレクトリを含む refs を持つ panel を対象にする
    // (= 主人公が登場する panel)
    const targetPanels = manifest.panels.filter((p) => {
      if (p.error) return false;
      if (!existsSync(p.outputPath)) return false;
      return p.referenceImagePaths.some((r) => r.includes(`/${dirName}/`));
    });

    console.log(
      `[${c.character_name}] 対象 panel: ${targetPanels.length}/${manifest.panels.length}`
    );

    if (targetPanels.length === 0) continue;

    if (args.dryRun) {
      reports.push({
        character_name: c.character_name,
        reference_image_path: refPath,
        measured_at: new Date().toISOString(),
        per_panel: targetPanels.map((p) => ({
          panel_idx: p.panel_idx,
          candidate_image_path: p.outputPath,
          verdict: {
            same_person: true,
            hair_match: true,
            eye_match: true,
            outfit_match: true,
            score: 0,
            comment: "(dry-run)",
            decision: "pass" as const,
          },
        })),
        aggregate: {
          total: targetPanels.length,
          decisions: { pass: targetPanels.length, warn: 0, reroll: 0, hard_fail: 0 },
          panels_by_decision: {
            pass: targetPanels.map((p) => p.panel_idx),
            warn: [],
            reroll: [],
            hard_fail: [],
          },
          mean_score: 0,
          hair_mismatch_count: 0,
          eye_mismatch_count: 0,
          outfit_mismatch_count: 0,
        },
      });
      continue;
    }

    const per_panel: FaceConsistencyReport["per_panel"] = [];
    for (const p of targetPanels) {
      const startedAt = Date.now();
      try {
        const verdict = await measureFaceConsistency({
          referenceImagePath: refPath,
          candidateImagePath: p.outputPath,
          characterName: c.character_name,
          spec: c.spec,
          timeoutMs: args.imageTimeoutMs,
          maxRetries: args.maxRetries,
        });
        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
        console.log(
          `  [judge] panel ${p.panel_idx}: ${verdict.decision} (score=${verdict.score.toFixed(2)}, ${elapsed}s) ${verdict.comment.slice(0, 60)}`
        );
        per_panel.push({
          panel_idx: p.panel_idx,
          candidate_image_path: p.outputPath,
          verdict,
        });
      } catch (e) {
        console.warn(
          `  [judge-fail] panel ${p.panel_idx}: ${(e as Error).message}`
        );
      }
    }

    reports.push({
      character_name: c.character_name,
      reference_image_path: refPath,
      measured_at: new Date().toISOString(),
      per_panel,
      aggregate: aggregateFaceConsistency(per_panel),
    });
  }

  const outDir = path.dirname(args.manifestPath);
  const jsonPath = path.join(outDir, "face-consistency-report.json");
  const mdPath = path.join(outDir, "face-consistency-report.md");
  await writeFile(jsonPath, JSON.stringify(reports, null, 2), "utf-8");
  await writeFile(mdPath, renderMarkdown(reports), "utf-8");

  console.log("");
  console.log("=========================================");
  console.log(`[measure-face-consistency] DONE`);
  for (const r of reports) {
    const a = r.aggregate;
    console.log(
      `  ${r.character_name}: pass=${a.decisions.pass} warn=${a.decisions.warn} reroll=${a.decisions.reroll} hard_fail=${a.decisions.hard_fail} (mean_score=${a.mean_score.toFixed(3)})`
    );
  }
  console.log(`  json: ${jsonPath}`);
  console.log(`  md:   ${mdPath}`);
  console.log("=========================================");
}

main().catch((err) => {
  console.error("[measure-face-consistency] FAILED:", err);
  process.exit(1);
});
