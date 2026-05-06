#!/usr/bin/env tsx
/**
 * v1.json の unset slot.background_treatment を kindle-test-1 example pages から
 * vision agent で labeling して埋める。
 *
 * Step 8 (2026-05-06)。bootstrap script (L05b) はルールベースで 76/195 slot 埋めたが
 * 残り 119 slot (主に rect 通常 dialogue) は文脈無しに判定不能。pattern の
 * example_pages を実際に vision agent に見せて per-slot ラベル付けする。
 *
 * 三段運用 (L05c と同じ pattern):
 *   1. prepare: pattern → batch task (example page + slot 数 + 期待ラベル一覧)
 *   2. agent dispatch: batch ごとに Claude vision agent
 *   3. merge: agent 出力で v1.json slot.background_treatment を更新
 *
 * 使い方:
 *   npx tsx scripts/manga/utils/learn-pattern-slot-bg.ts --mode prepare --batch-size 10
 *   # → vision agent をすべての batch で実行
 *   npx tsx scripts/manga/utils/learn-pattern-slot-bg.ts --mode merge --write
 */
import path from "node:path";
import { promises as fs } from "node:fs";

type BgTreatment =
  | "detailed_bg" | "atmospheric_fade" | "tone_back"
  | "solid_white" | "solid_black" | "floating_ui" | "unspecified";

type Slot = {
  slot_id: string;
  reading_order: number;
  role_hint: string;
  size_class: string;
  is_borderless?: boolean;
  bleed?: boolean;
  background_treatment?: BgTreatment;
  [k: string]: unknown;
};

type Pattern = {
  id: string;
  panel_count: number;
  example_pages: number[];
  slots: Slot[];
  [k: string]: unknown;
};

type Args = {
  mode: "prepare" | "merge";
  batchSize: number;
  outRoot: string;
  write: boolean;
};

function parseArgs(argv: string[]): Args {
  let mode: Args["mode"] = "prepare";
  let batchSize = 10;
  let outRoot = "data/manga/reference_pool/_pattern_slot_learner";
  let write = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--mode") mode = argv[++i] as Args["mode"];
    else if (a === "--batch-size") batchSize = Number(argv[++i]);
    else if (a === "--out") outRoot = argv[++i];
    else if (a === "--write") write = true;
  }
  return { mode, batchSize, outRoot, write };
}

function kindlePagePath(pageNo: number): string {
  return path.resolve(`data/manga/raw/kindle-references/test-1/pages/page_${String(pageNo).padStart(4, "0")}.png`);
}

const PROMPT_TEMPLATE = `あなたは漫画 panel のレイアウト辞書を補完する vision agent です。

# 入力
以下の N 個の pattern について、各 example page を Read tool で開き、ページ内の
panel を **読み順 (右上→左下、日本語漫画の右開き)** で 1..panel_count まで識別し、
各 panel の background_treatment を判定してください。

{{TASK_LIST}}

# 判定値
| 値 | 意味 |
|---|---|
| detailed_bg | 描き込まれた背景 (室内/街/ダンジョン/自然、形が読める) |
| atmospheric_fade | 主体周辺だけ描き、コマ縁にフェード/抜け |
| tone_back | 全面スクリーントーン、scenery ゼロ |
| solid_white | 全面白 |
| solid_black | 全面黒 |
| floating_ui | UI/HUD/SNS が panel そのもの |

# 出力
以下に Write tool で JSON 保存: **{{OUTPUT_PATH}}**

\`\`\`json
{
  "schema_version": 1,
  "results": [
    {
      "pattern_id": "pat_001_3tier_dialogue_5",
      "example_page": 16,
      "panel_count": 5,
      "labels": ["detailed_bg", "detailed_bg", "atmospheric_fade", "detailed_bg", "atmospheric_fade"]
    }
  ]
}
\`\`\`

ルール:
- labels の長さは panel_count と必ず一致 (足りない/余りはダメ)
- 順序は読み順 (右上→左下)
- 判断不能 panel は "unspecified" を入れる (空文字や null は禁止)
- 該当 example page が見つからなかった場合 labels: [] にし、別エントリで notes にメモ

保存後 reply は "DONE" のみ。
`;

type PatternTask = {
  pattern_id: string;
  example_page: number;
  panel_count: number;
  unset_indices: number[]; // どの reading_order が unset か (情報のみ)
  example_image_path: string;
};

async function loadDict(): Promise<{ patterns: Pattern[]; raw: { patterns: Pattern[]; [k: string]: unknown } }> {
  const dictPath = path.resolve("data/manga/layout_patterns/v1.json");
  const raw = JSON.parse(await fs.readFile(dictPath, "utf-8"));
  return { patterns: raw.patterns as Pattern[], raw };
}

async function prepare(args: Args): Promise<void> {
  const { patterns } = await loadDict();
  const tasks: PatternTask[] = [];
  for (const p of patterns) {
    const unsetSlots = p.slots.filter((s) => !s.background_treatment);
    if (unsetSlots.length === 0) continue;
    if (p.example_pages.length === 0) {
      console.warn(`[learn-pattern-slot] ${p.id}: no example_pages, skip`);
      continue;
    }
    const exPage = p.example_pages[0];
    const imgPath = kindlePagePath(exPage);
    try {
      await fs.access(imgPath);
    } catch {
      console.warn(`[learn-pattern-slot] ${p.id}: example page ${exPage} image not found at ${imgPath}, skip`);
      continue;
    }
    tasks.push({
      pattern_id: p.id,
      example_page: exPage,
      panel_count: p.panel_count,
      unset_indices: unsetSlots.map((s) => s.reading_order),
      example_image_path: imgPath,
    });
  }
  if (tasks.length === 0) {
    console.error("[learn-pattern-slot/prepare] no tasks");
    process.exit(1);
  }
  const tasksDir = path.resolve(args.outRoot, "_tasks");
  const responsesDir = path.resolve(args.outRoot, "_responses");
  await fs.mkdir(tasksDir, { recursive: true });
  await fs.mkdir(responsesDir, { recursive: true });

  const batches: { batch_id: number; tasks: PatternTask[] }[] = [];
  for (let i = 0; i < tasks.length; i += args.batchSize) {
    batches.push({ batch_id: batches.length + 1, tasks: tasks.slice(i, i + args.batchSize) });
  }

  for (const b of batches) {
    const taskPath = path.join(tasksDir, `batch-${String(b.batch_id).padStart(3, "0")}.json`);
    const promptPath = path.join(tasksDir, `batch-${String(b.batch_id).padStart(3, "0")}.prompt.md`);
    const responsePath = path.join(responsesDir, `batch-${String(b.batch_id).padStart(3, "0")}.json`);

    const taskListMd = b.tasks
      .map(
        (t, i) =>
          `${i + 1}. pattern_id=${t.pattern_id} (panel_count=${t.panel_count}, unset reading_orders=[${t.unset_indices.join(",")}])\n   image: ${t.example_image_path}`
      )
      .join("\n");

    await fs.writeFile(taskPath, JSON.stringify(b, null, 2));
    await fs.writeFile(
      promptPath,
      PROMPT_TEMPLATE.replace("{{TASK_LIST}}", taskListMd).replace("{{OUTPUT_PATH}}", responsePath)
    );
  }

  console.log(`[learn-pattern-slot/prepare] tasks=${tasks.length} batches=${batches.length}`);
  console.log(`[learn-pattern-slot/prepare] tasks dir: ${tasksDir}`);
  console.log(`[learn-pattern-slot/prepare] responses dir (Agent 出力): ${responsesDir}`);
}

async function merge(args: Args): Promise<void> {
  const responsesDir = path.resolve(args.outRoot, "_responses");
  let files: string[];
  try {
    files = (await fs.readdir(responsesDir)).filter((f) => /^batch-\d+\.json$/.test(f)).sort();
  } catch {
    console.error(`[learn-pattern-slot/merge] no responses at ${responsesDir}`);
    process.exit(1);
  }
  if (files.length === 0) {
    console.error("[learn-pattern-slot/merge] no batch-*.json");
    process.exit(1);
  }

  const labelsByPattern = new Map<string, string[]>();
  const warnings: string[] = [];
  for (const f of files) {
    let json: { results?: { pattern_id: string; panel_count: number; labels: string[] }[] };
    try {
      json = JSON.parse(await fs.readFile(path.join(responsesDir, f), "utf-8"));
    } catch (e) {
      warnings.push(`${f}: invalid JSON: ${(e as Error).message}`);
      continue;
    }
    for (const r of json.results ?? []) {
      if (!Array.isArray(r.labels)) {
        warnings.push(`${f} ${r.pattern_id}: labels not array`);
        continue;
      }
      labelsByPattern.set(r.pattern_id, r.labels);
    }
  }

  const { patterns, raw } = await loadDict();
  const validBg = new Set(["detailed_bg", "atmospheric_fade", "tone_back", "solid_white", "solid_black", "floating_ui", "unspecified"]);

  let changed = 0;
  let skippedAlreadySet = 0;
  let skippedInvalid = 0;
  for (const p of patterns) {
    const labels = labelsByPattern.get(p.id);
    if (!labels) continue;
    if (labels.length !== p.panel_count) {
      warnings.push(`${p.id}: labels.length=${labels.length} != panel_count=${p.panel_count}, skip`);
      continue;
    }
    const slotsByOrder = [...p.slots].sort((a, b) => a.reading_order - b.reading_order);
    for (let i = 0; i < slotsByOrder.length; i++) {
      const s = slotsByOrder[i];
      const lbl = labels[i] as BgTreatment;
      if (!validBg.has(lbl)) {
        warnings.push(`${p.id} slot ${s.slot_id}: invalid label "${lbl}", skip`);
        skippedInvalid++;
        continue;
      }
      if (s.background_treatment) {
        skippedAlreadySet++;
        continue;
      }
      s.background_treatment = lbl;
      changed++;
    }
  }

  // Distribution
  const dist: Record<string, number> = {};
  for (const p of patterns) for (const s of p.slots) {
    const k = s.background_treatment ?? "(unset)";
    dist[k] = (dist[k] ?? 0) + 1;
  }

  console.log(`[learn-pattern-slot/merge] changed=${changed} skipped_already_set=${skippedAlreadySet} skipped_invalid=${skippedInvalid}`);
  console.log("[learn-pattern-slot/merge] new distribution:");
  for (const [k, v] of Object.entries(dist).sort()) console.log(`  ${k}: ${v}`);
  if (warnings.length > 0) {
    console.log("[learn-pattern-slot/merge] warnings:");
    for (const w of warnings.slice(0, 30)) console.log(`  ${w}`);
    if (warnings.length > 30) console.log(`  ... +${warnings.length - 30} more`);
  }
  if (!args.write) {
    console.log("\n[learn-pattern-slot/merge] dry-run (use --write to persist)");
    return;
  }
  await fs.writeFile(
    path.resolve("data/manga/layout_patterns/v1.json"),
    JSON.stringify(raw, null, 2) + "\n",
    "utf-8"
  );
  console.log("[learn-pattern-slot/merge] v1.json updated");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === "prepare") await prepare(args);
  else if (args.mode === "merge") await merge(args);
  else throw new Error(`unknown mode: ${args.mode}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
