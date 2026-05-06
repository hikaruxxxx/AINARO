#!/usr/bin/env tsx
/**
 * L11 vision-based background_treatment compliance audit。
 *
 * page_plan.json の各 panel に紐づく `background_treatment` ラベルと、実 render の
 * 中身が一致しているかを LLM vision で確認する。
 *
 * 静的監査 (audit.ts auditBackgroundTreatment) は ref 構成の矛盾しか拾えない。
 * 「tone_back と指示したのに背景がドーンと描かれている」のような実画像と意図の
 * 不整合は本スクリプト経由で agent dispatch して確認する。
 *
 * 三段運用 (L05c-pattern-bg-learner と同じ pattern):
 *   1. prepare: page_plan + renders を走査 → panel crop + task 雛形を出力
 *   2. agent dispatch (人手): batch ごとに Claude vision agent を呼び結果 JSON 保存
 *   3. merge: agent 結果を読んで AuditCheckResult[] JSON に集約
 *
 * 使い方:
 *   # Phase 1: panel crop + task batches を準備
 *   npx tsx scripts/manga/utils/audit-bg-vision.ts \
 *     --mode prepare --slug a07-modern-dungeon --episode 1 --batch-size 8
 *
 *   # Phase 2: 各 batch の prompt を Agent (general-purpose subagent) で実行
 *
 *   # Phase 3: agent 結果を merge
 *   npx tsx scripts/manga/utils/audit-bg-vision.ts \
 *     --mode merge --slug a07-modern-dungeon --episode 1
 *
 * 出力:
 *   data/manga/works/{slug}/episodes/ep{NN}/_audit_bg/_tasks/batch-NNN.{json,prompt.md}
 *   data/manga/works/{slug}/episodes/ep{NN}/_audit_bg/_responses/batch-NNN.json
 *   data/manga/works/{slug}/episodes/ep{NN}/_audit_bg/audit-bg-vision.json (final)
 */
import path from "node:path";
import { promises as fs } from "node:fs";
import sharp from "sharp";
import type {
  BackgroundTreatment,
  PagePlanV2,
  AuditCheckResult,
} from "../../../src/lib/manga/schemas-v2";

type Args = {
  mode: "prepare" | "merge";
  slug: string;
  episode: number;
  batchSize: number;
};

function parseArgs(argv: string[]): Args {
  let mode: Args["mode"] = "prepare";
  let slug: string | undefined;
  let episode: number | undefined;
  let batchSize = 8;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--mode") mode = argv[++i] as Args["mode"];
    else if (a === "--slug") slug = argv[++i];
    else if (a === "--episode") episode = Number(argv[++i]);
    else if (a === "--batch-size") batchSize = Number(argv[++i]);
  }
  if (!slug || !episode) {
    console.error("--slug and --episode required");
    process.exit(1);
  }
  return { mode, slug, episode, batchSize };
}

function workDir(slug: string, episode: number): string {
  return path.resolve(`data/manga/works/${slug}/episodes/ep${String(episode).padStart(2, "0")}`);
}

function pagePlanPath(slug: string, episode: number): string {
  return path.join(workDir(slug, episode), "page_plan.json");
}

function rendersDir(slug: string, episode: number): string {
  return path.join(workDir(slug, episode), "renders");
}

function auditBgDir(slug: string, episode: number): string {
  return path.join(workDir(slug, episode), "_audit_bg");
}

type PanelTask = {
  panel_id: string;
  page_no: number;
  expected_treatment: BackgroundTreatment;
  crop_path: string;
};

async function listAuditCandidates(args: Args): Promise<PanelTask[]> {
  const plan = JSON.parse(await fs.readFile(pagePlanPath(args.slug, args.episode), "utf-8")) as PagePlanV2;
  const cropsDir = path.join(auditBgDir(args.slug, args.episode), "crops");
  await fs.mkdir(cropsDir, { recursive: true });

  const tasks: PanelTask[] = [];
  for (const page of plan.pages) {
    const pageImg = path.join(rendersDir(args.slug, args.episode), `p${String(page.page_no).padStart(2, "0")}.png`);
    let pageImgExists = false;
    try {
      await fs.access(pageImg);
      pageImgExists = true;
    } catch {}
    if (!pageImgExists) continue;

    for (const panel of page.panels) {
      const t = panel.background_treatment;
      if (!t || t === "unspecified") continue;

      const cropPath = path.join(cropsDir, `${panel.panel_id}.png`);
      try {
        await sharp(pageImg)
          .extract({
            left: Math.max(0, Math.round(panel.rect.x)),
            top: Math.max(0, Math.round(panel.rect.y)),
            width: Math.max(1, Math.round(panel.rect.w)),
            height: Math.max(1, Math.round(panel.rect.h)),
          })
          .png()
          .toFile(cropPath);
      } catch (e) {
        console.warn(`[bg-vision] crop failed for ${panel.panel_id}: ${(e as Error).message}`);
        continue;
      }

      tasks.push({
        panel_id: panel.panel_id,
        page_no: page.page_no,
        expected_treatment: t,
        crop_path: cropPath,
      });
    }
  }
  return tasks;
}

const PROMPT_TEMPLATE = `あなたは漫画 panel の背景表現を audit する vision agent です。

# 入力
以下の N 枚の panel crop image を Read tool で開いてください。各 image の
**期待される背景表現種別 (expected_treatment)** が併記してあります。

{{TASK_LIST}}

# 判定
各 panel について、image の実態が expected_treatment と一致しているか:

- **detailed_bg**: 室内/街/ダンジョン等の背景がはっきり描かれている → ✓
- **atmospheric_fade**: 主体周辺だけ描き、コマ縁にフェード/抜け → ✓
- **tone_back**: 全面スクリーントーン、scenery 一切なし → ✓
- **solid_white**: 全面白、背景描画なし → ✓
- **solid_black**: 全面黒 → ✓
- **floating_ui**: panel そのものが UI/HUD/SNS など → ✓

判定基準:
- 一致 → passed: true
- 不一致 (例: tone_back のはずが detailed_bg を描いている) → passed: false
- 判定不能 (画像破損/解析不可) → passed: false, detail に "judge_failed" を含める

# 出力
以下に Write tool で JSON 保存: **{{OUTPUT_PATH}}**

\`\`\`json
{
  "schema_version": 1,
  "checks": [
    { "panel_id": "p_XX", "expected_treatment": "tone_back", "passed": true,
      "detail": "全面トーン、背景なし、人物のみ → 一致" },
    { "panel_id": "p_YY", "expected_treatment": "tone_back", "passed": false,
      "detail": "石壁が描かれている、tone_back のはずが detailed_bg → 不一致" }
  ]
}
\`\`\`

保存後 reply は "DONE" のみ。
`;

function renderPrompt(args: { batchId: number; outputPath: string; tasks: PanelTask[] }): string {
  const lines = args.tasks
    .map((t, i) => `  ${i + 1}. ${t.crop_path} (panel_id=${t.panel_id}, expected=${t.expected_treatment})`)
    .join("\n");
  return PROMPT_TEMPLATE.replace("{{TASK_LIST}}", lines).replace("{{OUTPUT_PATH}}", args.outputPath);
}

async function prepare(args: Args): Promise<void> {
  const tasks = await listAuditCandidates(args);
  if (tasks.length === 0) {
    console.error(`[bg-vision/prepare] no audit candidates (no rendered pages with bg_treatment panels)`);
    process.exit(1);
  }
  const baseDir = auditBgDir(args.slug, args.episode);
  const tasksDir = path.join(baseDir, "_tasks");
  const responsesDir = path.join(baseDir, "_responses");
  await fs.mkdir(tasksDir, { recursive: true });
  await fs.mkdir(responsesDir, { recursive: true });

  const batches: { batch_id: number; tasks: PanelTask[] }[] = [];
  for (let i = 0; i < tasks.length; i += args.batchSize) {
    batches.push({ batch_id: batches.length + 1, tasks: tasks.slice(i, i + args.batchSize) });
  }
  for (const b of batches) {
    const taskPath = path.join(tasksDir, `batch-${String(b.batch_id).padStart(3, "0")}.json`);
    const promptPath = path.join(tasksDir, `batch-${String(b.batch_id).padStart(3, "0")}.prompt.md`);
    const responsePath = path.join(responsesDir, `batch-${String(b.batch_id).padStart(3, "0")}.json`);
    await fs.writeFile(taskPath, JSON.stringify({ batch_id: b.batch_id, tasks: b.tasks }, null, 2));
    await fs.writeFile(promptPath, renderPrompt({ batchId: b.batch_id, outputPath: responsePath, tasks: b.tasks }));
  }
  console.log(`[bg-vision/prepare] panels=${tasks.length} batches=${batches.length}`);
  console.log(`[bg-vision/prepare] tasks dir: ${tasksDir}`);
  console.log(`[bg-vision/prepare] dispatch each batch via Agent → ${responsesDir}`);
}

async function merge(args: Args): Promise<void> {
  const baseDir = auditBgDir(args.slug, args.episode);
  const responsesDir = path.join(baseDir, "_responses");
  let files: string[] = [];
  try {
    files = (await fs.readdir(responsesDir)).filter((f) => /^batch-\d+\.json$/.test(f)).sort();
  } catch {
    console.error(`[bg-vision/merge] no responses at ${responsesDir}`);
    process.exit(1);
  }
  if (files.length === 0) {
    console.error(`[bg-vision/merge] no batch-*.json under ${responsesDir}`);
    process.exit(1);
  }

  const checks: AuditCheckResult[] = [];
  for (const f of files) {
    let raw: string;
    try {
      raw = await fs.readFile(path.join(responsesDir, f), "utf-8");
    } catch {
      continue;
    }
    let json: { checks?: Array<{ panel_id: string; passed: boolean; detail?: string; expected_treatment?: string }> };
    try {
      json = JSON.parse(raw);
    } catch {
      console.warn(`[bg-vision/merge] invalid JSON in ${f}`);
      continue;
    }
    for (const c of json.checks ?? []) {
      checks.push({
        panel_id: c.panel_id,
        check_kind: "bg_treatment_compliance",
        passed: c.passed,
        detail: `vision: ${c.detail ?? "(no detail)"}`,
      });
    }
  }
  const outPath = path.join(baseDir, "audit-bg-vision.json");
  await fs.writeFile(outPath, JSON.stringify({ schema_version: 1, generated_at: new Date().toISOString(), checks }, null, 2));
  const passed = checks.filter((c) => c.passed).length;
  console.log(`[bg-vision/merge] ${checks.length} checks (${passed} passed, ${checks.length - passed} failed)`);
  console.log(`[bg-vision/merge] wrote ${outPath}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === "prepare") await prepare(args);
  else if (args.mode === "merge") await merge(args);
  else throw new Error(`unknown mode: ${args.mode}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
