#!/usr/bin/env tsx
/**
 * 既存の漫画ページ画像 (level-gacha-vol1-3 / kindle-references/test-1 等) から
 * panel ごとの background_treatment を LLM vision (subagent) で抽出する learner。
 *
 * Step 2 (2026-05-06)。当初 sharp ベースのヒューリスティックを試したが
 * panel detection が見開き / 吹き出し輪郭で over-segment するため、LLM vision に転換。
 *
 * 流れ (3 phase):
 *   1. prepare: source dir をスキャンして _tasks/{source}/batch-NN.json に
 *      ページ画像 path のリストを出力。1 batch = N images (default 6)
 *   2. agent dispatch (人手): 各 batch に対してこの session の Agent (Claude vision)
 *      を呼び、panel-level JSON を _responses/{source}/batch-NN.json に保存
 *      (Agent prompt の雛形は --print-prompt で取得)
 *   3. merge: _responses/{source}/*.json を読んで `_learner_runs/{source}-{date}.json`
 *      に集約。schema 違反があれば warning を出して当該 page をスキップ
 *
 * 使い方:
 *   # Phase 1: タスク準備
 *   npx tsx scripts/manga/layers/L05c-pattern-bg-learner.ts \
 *     --mode prepare --source data/manga/raw/page-flip/level-gacha-vol1 --batch-size 6
 *
 *   # Phase 2: prompt を取得して Agent に投げる (Claude session 側で実行)
 *   npx tsx scripts/manga/layers/L05c-pattern-bg-learner.ts --print-prompt
 *
 *   # Phase 3: agent 出力をマージ
 *   npx tsx scripts/manga/layers/L05c-pattern-bg-learner.ts \
 *     --mode merge --source data/manga/raw/page-flip/level-gacha-vol1
 *
 * ディレクトリ:
 *   data/manga/reference_pool/_learner_runs/_tasks/{source}/batch-NN.json     (prepare 出力)
 *   data/manga/reference_pool/_learner_runs/_responses/{source}/batch-NN.json (agent 出力)
 *   data/manga/reference_pool/_learner_runs/{source}-{YYYY-MM-DD}.json        (merge 出力)
 */
import path from "node:path";
import { promises as fs } from "node:fs";

type BgTreatment =
  | "detailed_bg"
  | "atmospheric_fade"
  | "tone_back"
  | "solid_white"
  | "solid_black"
  | "floating_ui"
  | "skip"; // 表紙/扉/奥付/目次など解析対象外

type Bbox = { x: number; y: number; w: number; h: number };

type PageResponse = {
  page_no: number;
  image_path: string;
  spread: boolean; // 見開き2pなら true
  panels: Array<{
    panel_no: number;
    bg_treatment: BgTreatment;
    rationale: string;
    /** 0-1 normalized bbox。LLM 推定なので ±10% 程度の誤差あり (internal crop に使用) */
    bbox_normalized?: Bbox;
  }>;
};

type BatchResponse = {
  schema_version: 1;
  batch_id: number;
  pages: PageResponse[];
};

type LearnerRunOutput = {
  schema_version: 1;
  source: string;
  generated_at: string;
  method: "llm-vision-v1";
  page_count: number;
  pages: PageResponse[];
};

type Args = {
  mode: "prepare" | "merge";
  source?: string;
  batchSize: number;
  pages?: { start: number; end: number };
  outRoot: string;
  printPrompt: boolean;
};

function parseArgs(argv: string[]): Args {
  let mode: Args["mode"] = "prepare";
  let source: string | undefined;
  let batchSize = 6;
  let pageRange: string | undefined;
  let outRoot = "data/manga/reference_pool/_learner_runs";
  let printPrompt = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--mode") mode = argv[++i] as Args["mode"];
    else if (a === "--source") source = argv[++i];
    else if (a === "--batch-size") batchSize = parseInt(argv[++i], 10);
    else if (a === "--pages") pageRange = argv[++i];
    else if (a === "--out") outRoot = argv[++i];
    else if (a === "--print-prompt") printPrompt = true;
  }
  let pages: Args["pages"];
  if (pageRange) {
    const m = /^(\d+)-(\d+)$/.exec(pageRange);
    if (!m) {
      console.error(`--pages must be like "1-10" (got: ${pageRange})`);
      process.exit(1);
    }
    pages = { start: parseInt(m[1], 10), end: parseInt(m[2], 10) };
  }
  return { mode, source, batchSize, pages, outRoot, printPrompt };
}

async function listPages(sourceDir: string): Promise<{ page: number; file: string }[]> {
  const manifestPath = path.join(sourceDir, "manifest.json");
  try {
    const raw = await fs.readFile(manifestPath, "utf-8");
    const m = JSON.parse(raw) as { records?: { page: number; filename: string }[] };
    if (m.records && m.records.length > 0) {
      return m.records.map((r) => ({ page: r.page, file: path.join(sourceDir, r.filename) }));
    }
  } catch {
    /* fallthrough */
  }
  const items = await fs.readdir(sourceDir);
  return items
    .filter((f) => /^page_\d+\.(png|jpg|jpeg)$/i.test(f))
    .sort()
    .map((f, idx) => ({ page: idx + 1, file: path.join(sourceDir, f) }));
}

const AGENT_PROMPT_TEMPLATE = `あなたは漫画ページから panel ごとの「背景表現種別 (background_treatment)」を抽出する vision agent です。

# 入力
以下の N 枚の漫画ページ画像を Read tool で開いてください。順番に解析します。

{{IMAGE_LIST}}

# タスク
各画像に対して、以下を判定:
1. 見開き 2 ページか単独 1 ページか (spread: true/false)
2. ページ内の panel 数 (吹き出しは数えない、コマだけ)
3. **読み順 (右上→左下、日本語漫画の右開き)** で各 panel に panel_no を 1, 2, 3... と振る
4. 各 panel の **概算 bbox** を 0-1 normalized で (x, y, w, h)。x/y は左上原点。±10% 誤差は許容
5. 各 panel の background_treatment を以下から 1 つ選ぶ:

| 値 | 意味 |
|---|---|
| detailed_bg | 描き込まれた背景 (室内、街並、ダンジョン壁、自然など、形が読める背景) |
| atmospheric_fade | 主体 (キャラ/物) の周囲だけ描かれ、コマ縁に向けてフェード/抜け |
| tone_back | 全面スクリーントーン (ベタの網点/グラデ、背景描写ゼロ、心情/間用途) |
| solid_white | 全面白 (背景描写ゼロ、衝撃/フラッシュ/紙ベタ) |
| solid_black | 全面黒 (暗転/不在) |
| floating_ui | UI/HUD/ステータス画面/SNS/ニュース記事が panel そのもの |
| skip | 表紙/扉/目次/奥付など解析対象外 (panels は空配列) |

判定の優先度:
- UI/SNS が panel の主役なら floating_ui
- 背景がはっきり描かれていれば detailed_bg (キャラがいてもよい、背景に建物/景色があれば)
- 背景が抜けていてキャラだけ浮いていれば atmospheric_fade
- 全面トーンで主体すらない or 文字のみなら tone_back
- 迷ったら detailed_bg より atmospheric_fade を優先 (保守的に)

# 出力
**stdout に JSON を 1 つだけ出力してください。markdown コードフェンスや前後の説明文は禁止。**

\`\`\`json
{
  "schema_version": 1,
  "batch_id": <BATCH_ID>,
  "pages": [
    {
      "page_no": <int>,
      "image_path": "<元の絶対path>",
      "spread": <bool>,
      "panels": [
        { "panel_no": 1, "bg_treatment": "detailed_bg", "rationale": "1文の根拠",
          "bbox_normalized": { "x": 0.05, "y": 0.05, "w": 0.45, "h": 0.30 } },
        { "panel_no": 2, "bg_treatment": "atmospheric_fade", "rationale": "1文の根拠",
          "bbox_normalized": { "x": 0.50, "y": 0.05, "w": 0.45, "h": 0.30 } }
      ]
    }
  ]
}
\`\`\`

skip の場合は panels: [] にしてください。
最後にこの JSON を以下のパスに Write tool で保存してください: **{{OUTPUT_PATH}}**
保存後、最後の reply で "DONE: <output_path>" とだけ書いてください。
`;

function renderAgentPrompt(args: { batchId: number; outputPath: string; pages: { page: number; file: string }[] }): string {
  const list = args.pages.map((p) => `  ${p.page}. ${p.file}`).join("\n");
  return AGENT_PROMPT_TEMPLATE
    .replace("{{IMAGE_LIST}}", list)
    .replace(/\{\{BATCH_ID\}\}/g, String(args.batchId))
    .replace("{{OUTPUT_PATH}}", args.outputPath);
}

async function prepareTasks(args: Args): Promise<void> {
  if (!args.source) throw new Error("--source required for prepare mode");
  const allPages = await listPages(args.source);
  const filtered = args.pages
    ? allPages.filter((p) => p.page >= args.pages!.start && p.page <= args.pages!.end)
    : allPages;
  if (filtered.length === 0) {
    console.error("no pages matched");
    process.exit(1);
  }
  const sourceName = path.basename(args.source.replace(/\/$/, ""));
  const tasksDir = path.resolve(args.outRoot, "_tasks", sourceName);
  const responsesDir = path.resolve(args.outRoot, "_responses", sourceName);
  await fs.mkdir(tasksDir, { recursive: true });
  await fs.mkdir(responsesDir, { recursive: true });

  const batches: { batch_id: number; pages: { page: number; file: string }[] }[] = [];
  for (let i = 0; i < filtered.length; i += args.batchSize) {
    batches.push({ batch_id: batches.length + 1, pages: filtered.slice(i, i + args.batchSize) });
  }

  // 各 batch task を JSON で保存し、対応する prompt を別 .prompt.md にも保存
  for (const b of batches) {
    const taskPath = path.join(tasksDir, `batch-${String(b.batch_id).padStart(3, "0")}.json`);
    const promptPath = path.join(tasksDir, `batch-${String(b.batch_id).padStart(3, "0")}.prompt.md`);
    const responsePath = path.join(responsesDir, `batch-${String(b.batch_id).padStart(3, "0")}.json`);
    const taskBody = {
      batch_id: b.batch_id,
      pages: b.pages,
      response_path: path.relative(process.cwd(), responsePath),
    };
    await fs.writeFile(taskPath, JSON.stringify(taskBody, null, 2) + "\n", "utf-8");
    await fs.writeFile(
      promptPath,
      renderAgentPrompt({ batchId: b.batch_id, outputPath: responsePath, pages: b.pages }),
      "utf-8"
    );
  }

  console.log(`[L05c-learner/prepare] source=${sourceName} pages=${filtered.length} batches=${batches.length}`);
  console.log(`[L05c-learner/prepare] task files: ${tasksDir}/batch-NNN.json (+ .prompt.md)`);
  console.log(`[L05c-learner/prepare] expected responses: ${responsesDir}/batch-NNN.json`);
  console.log(`\nNext: dispatch a Claude vision agent for each batch using the .prompt.md content.`);
}

function isValidPanel(p: unknown): p is PageResponse["panels"][number] {
  if (typeof p !== "object" || p === null) return false;
  const x = p as Record<string, unknown>;
  if (
    typeof x.panel_no !== "number" ||
    typeof x.bg_treatment !== "string" ||
    !["detailed_bg", "atmospheric_fade", "tone_back", "solid_white", "solid_black", "floating_ui", "skip"].includes(
      x.bg_treatment as string
    ) ||
    typeof x.rationale !== "string"
  ) {
    return false;
  }
  // bbox_normalized は optional だが、あれば形式を検証
  if (x.bbox_normalized !== undefined) {
    const bb = x.bbox_normalized as Record<string, unknown>;
    if (
      typeof bb !== "object" ||
      bb === null ||
      typeof bb.x !== "number" ||
      typeof bb.y !== "number" ||
      typeof bb.w !== "number" ||
      typeof bb.h !== "number"
    ) {
      return false;
    }
  }
  return true;
}

function isValidPage(p: unknown): p is PageResponse {
  if (typeof p !== "object" || p === null) return false;
  const x = p as Record<string, unknown>;
  return (
    typeof x.page_no === "number" &&
    typeof x.image_path === "string" &&
    typeof x.spread === "boolean" &&
    Array.isArray(x.panels) &&
    x.panels.every(isValidPanel)
  );
}

async function mergeResponses(args: Args): Promise<void> {
  if (!args.source) throw new Error("--source required for merge mode");
  const sourceName = path.basename(args.source.replace(/\/$/, ""));
  const responsesDir = path.resolve(args.outRoot, "_responses", sourceName);
  let files: string[];
  try {
    files = (await fs.readdir(responsesDir))
      .filter((f) => /^batch-\d+\.json$/.test(f))
      .sort();
  } catch {
    console.error(`no responses found at ${responsesDir}`);
    process.exit(1);
  }
  if (files.length === 0) {
    console.error(`no batch-*.json files in ${responsesDir}`);
    process.exit(1);
  }

  const allPages: PageResponse[] = [];
  const warnings: string[] = [];
  for (const f of files) {
    const fullPath = path.join(responsesDir, f);
    let raw: string;
    try {
      raw = await fs.readFile(fullPath, "utf-8");
    } catch (e) {
      warnings.push(`${f}: read failed: ${(e as Error).message}`);
      continue;
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch (e) {
      warnings.push(`${f}: invalid JSON: ${(e as Error).message}`);
      continue;
    }
    const obj = json as BatchResponse;
    if (!Array.isArray(obj?.pages)) {
      warnings.push(`${f}: missing pages array`);
      continue;
    }
    for (const page of obj.pages) {
      if (!isValidPage(page)) {
        warnings.push(`${f}: invalid page entry skipped: ${JSON.stringify(page).slice(0, 100)}`);
        continue;
      }
      allPages.push(page);
    }
  }

  allPages.sort((a, b) => a.page_no - b.page_no);
  const date = new Date().toISOString().slice(0, 10);
  const outPath = path.resolve(args.outRoot, `${sourceName}-${date}.json`);
  const out: LearnerRunOutput = {
    schema_version: 1,
    source: sourceName,
    generated_at: new Date().toISOString(),
    method: "llm-vision-v1",
    page_count: allPages.length,
    pages: allPages,
  };
  await fs.writeFile(outPath, JSON.stringify(out, null, 2) + "\n", "utf-8");

  // 集計
  const dist: Record<string, number> = {};
  for (const p of allPages) for (const panel of p.panels) {
    dist[panel.bg_treatment] = (dist[panel.bg_treatment] ?? 0) + 1;
  }

  console.log(`[L05c-learner/merge] merged ${allPages.length} page(s) from ${files.length} batch file(s)`);
  console.log(`[L05c-learner/merge] wrote ${outPath}`);
  console.log("[L05c-learner/merge] bg_treatment distribution:");
  for (const [k, v] of Object.entries(dist).sort()) console.log(`  ${k}: ${v}`);
  if (warnings.length > 0) {
    console.log(`[L05c-learner/merge] warnings:`);
    for (const w of warnings) console.log(`  ${w}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.printPrompt) {
    console.log(AGENT_PROMPT_TEMPLATE);
    return;
  }
  if (args.mode === "prepare") {
    await prepareTasks(args);
  } else if (args.mode === "merge") {
    await mergeResponses(args);
  } else {
    throw new Error(`unknown mode: ${args.mode}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
