/**
 * L11 Vision Audit
 *
 * page_plan の panel rect から crop を作り、実 render が background_treatment 指示を
 * 守っているかを Claude Vision で確認する。背景監査と軽量な構図 flag は同じ vision pass
 * で抽出し、API/CLI 呼び出し回数を増やさない。
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { promises as fs } from "node:fs";
import sharp from "sharp";
import type {
  AuditCheckResult,
  BackgroundTreatment,
  BgTreatmentComplianceCheck,
  CompositionFlags,
  PagePlanV2,
  VisionAuditResult,
} from "../schemas-v2";

export type {
  BgTreatmentComplianceCheck,
  CompositionFlags,
  VisionAuditResult,
} from "../schemas-v2";

const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";
const DEFAULT_MODEL = process.env.AINARO_AUDIT_MODEL || "haiku";

const BACKGROUND_TREATMENTS: readonly BackgroundTreatment[] = [
  "detailed_bg",
  "atmospheric_fade",
  "tone_back",
  "solid_white",
  "solid_black",
  "floating_ui",
  "unspecified",
];

export type VisionAuditPanelTask = {
  panel_id: string;
  page_no: number;
  specified: BackgroundTreatment;
  crop_path: string;
};

export type VisionAuditOptions = {
  pagePlan: PagePlanV2;
  rendersDir: string;
  auditDir: string;
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
  /** true の場合は crop と prompt だけ作り、Claude は呼ばない */
  dryRun?: boolean;
};

type ClaudeRunResult = {
  raw: string;
  exitCode: number;
  stderr: string;
};

type VisionAuditCliShape = {
  bg_treatment_compliance: BgTreatmentComplianceCheck[];
  composition_flags: CompositionFlags[];
};

function isBackgroundTreatment(value: unknown): value is BackgroundTreatment {
  return typeof value === "string" && BACKGROUND_TREATMENTS.includes(value as BackgroundTreatment);
}

function isCompliance(value: unknown): value is BgTreatmentComplianceCheck["compliance"] {
  return value === "match" || value === "minor_drift" || value === "major_violation";
}

function normalizeVisionAuditResult(raw: unknown): VisionAuditResult {
  const obj = raw as Partial<VisionAuditCliShape>;
  const bgChecks: BgTreatmentComplianceCheck[] = [];
  const compositionFlags: CompositionFlags[] = [];

  for (const c of obj.bg_treatment_compliance ?? []) {
    if (
      typeof c.panel_id !== "string" ||
      !isBackgroundTreatment(c.specified) ||
      !isBackgroundTreatment(c.observed) ||
      !isCompliance(c.compliance)
    ) {
      continue;
    }
    bgChecks.push({
      panel_id: c.panel_id,
      specified: c.specified,
      observed: c.observed,
      compliance: c.compliance,
      evidence: typeof c.evidence === "string" ? c.evidence : "",
    });
  }

  for (const f of obj.composition_flags ?? []) {
    if (typeof f.panel_id !== "string") continue;
    compositionFlags.push({
      panel_id: f.panel_id,
      character_placement_feels_impossible: f.character_placement_feels_impossible,
      speech_bubble_overlaps_face_or_action: f.speech_bubble_overlaps_face_or_action,
      tail_points_to_wrong_speaker: f.tail_points_to_wrong_speaker,
      perspective_or_location_continuity_broken: f.perspective_or_location_continuity_broken,
      over_detailed_background_contradicts_expected_treatment:
        f.over_detailed_background_contradicts_expected_treatment,
      notes: f.notes,
    });
  }

  return {
    bg_treatment_compliance: bgChecks,
    composition_flags: compositionFlags,
  };
}

async function cropPanel(args: {
  pageImagePath: string;
  cropPath: string;
  rect: { x: number; y: number; w: number; h: number };
}): Promise<void> {
  const meta = await sharp(args.pageImagePath).metadata();
  const pageW = meta.width ?? 0;
  const pageH = meta.height ?? 0;
  const left = Math.max(0, Math.min(pageW - 1, Math.round(args.rect.x)));
  const top = Math.max(0, Math.min(pageH - 1, Math.round(args.rect.y)));
  const wantedW = Math.max(1, Math.round(args.rect.w));
  const wantedH = Math.max(1, Math.round(args.rect.h));
  const width = Math.max(1, Math.min(wantedW, pageW - left));
  const height = Math.max(1, Math.min(wantedH, pageH - top));

  await sharp(args.pageImagePath)
    .extract({ left, top, width, height })
    .png()
    .toFile(args.cropPath);
}

export async function collectVisionAuditCandidates(args: {
  pagePlan: PagePlanV2;
  rendersDir: string;
  auditDir: string;
}): Promise<VisionAuditPanelTask[]> {
  const cropsDir = path.join(args.auditDir, "crops");
  await fs.mkdir(cropsDir, { recursive: true });

  const tasks: VisionAuditPanelTask[] = [];
  for (const page of args.pagePlan.pages) {
    const pageImg = path.join(args.rendersDir, `p${String(page.page_no).padStart(2, "0")}.png`);
    try {
      await fs.access(pageImg);
    } catch {
      continue;
    }

    for (const panel of page.panels) {
      const specified = panel.background_treatment;
      if (!specified || specified === "unspecified") continue;

      const cropPath = path.join(cropsDir, `${panel.panel_id}.png`);
      try {
        await cropPanel({ pageImagePath: pageImg, cropPath, rect: panel.rect });
      } catch (e) {
        console.warn(`[audit-vision] crop failed for ${panel.panel_id}: ${(e as Error).message}`);
        continue;
      }

      tasks.push({
        panel_id: panel.panel_id,
        page_no: page.page_no,
        specified,
        crop_path: cropPath,
      });
    }
  }

  return tasks;
}

export function buildVisionAuditPrompt(tasks: VisionAuditPanelTask[]): string {
  const taskList = tasks
    .map((t, i) => `${i + 1}. ${t.crop_path} (panel_id=${t.panel_id}, specified=${t.specified})`)
    .join("\n");

  return `あなたは漫画 panel crop を監査する vision reviewer です。各画像を Read tool で実際に開いて評価してください。

# 入力
${taskList}

# 背景表現ラベル
- detailed_bg: 室内/街/ダンジョン等の背景がはっきり描かれている
- atmospheric_fade: 主体周辺だけ描き、コマ縁や奥行きがフェード/抜けている
- tone_back: 全面スクリーントーン、scenery は描かれていない
- solid_white: 全面白、背景描画なし
- solid_black: 全面黒、背景描画なし
- floating_ui: panel 自体が UI/HUD/SNS/ステータス画面
- unspecified: 判定不能時だけ使う

# 判定
各 panel について以下を返してください。

1. bg_treatment_compliance
- specified: 入力の specified と同じ値
- observed: 画像から見える実態に最も近い背景表現ラベル
- compliance:
  - match: 指定と実態が一致
  - minor_drift: 意図は近いが少し背景過多/不足
  - major_violation: tone_back/solid_white 等なのに背景が描き込まれる、detailed_bg なのに背景が無い等
- evidence: 日本語で短く根拠を書く

2. composition_flags
明確に問題が見える場合だけ boolean を true にしてください。問題がなければ false または省略で構いません。
- character_placement_feels_impossible
- speech_bubble_overlaps_face_or_action
- tail_points_to_wrong_speaker
- perspective_or_location_continuity_broken
- over_detailed_background_contradicts_expected_treatment
- notes: 必要時のみ日本語で補足

# 出力
JSON のみ返答。前置き・コードブロック・コメントは不要です。

{
  "bg_treatment_compliance": [
    {
      "panel_id": "p_01_01",
      "specified": "tone_back",
      "observed": "tone_back",
      "compliance": "match",
      "evidence": "全面トーンで背景描写がない"
    }
  ],
  "composition_flags": [
    {
      "panel_id": "p_01_01",
      "speech_bubble_overlaps_face_or_action": false,
      "notes": ""
    }
  ]
}`;
}

async function spawnClaudeVisionAudit(args: {
  prompt: string;
  absPaths: string[];
  model: string;
  timeoutMs: number;
}): Promise<ClaudeRunResult> {
  const dirs = Array.from(new Set(args.absPaths.map((p) => path.dirname(p))));
  // bible-image-audit と同じく claude CLI の Read tool に画像パスを渡して vision 判定する。
  const argv = [
    "--print",
    "--output-format=json",
    `--model=${args.model}`,
    "--allowedTools=Read",
    "--permission-mode=bypassPermissions",
    "--disable-slash-commands",
  ];
  for (const d of dirs) argv.push(`--add-dir=${d}`);
  argv.push("--", args.prompt);

  return new Promise((resolve) => {
    const child = spawn(CLAUDE_BIN, argv, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, args.timeoutMs);
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ raw: stdout, exitCode: code ?? 1, stderr });
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ raw: "", exitCode: 1, stderr: stderr + `\n[spawn-error] ${e.message}` });
    });
  });
}

function extractClaudeInnerJson(claudeJson: string): unknown {
  // claude --output-format=json は top-level の result に model 出力を入れる。
  const top = JSON.parse(claudeJson) as { result?: string; is_error?: boolean };
  if (top.is_error || typeof top.result !== "string") {
    throw new Error(`claude returned error or no result: ${claudeJson.slice(0, 500)}`);
  }
  let body = top.result.trim();
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) body = fence[1].trim();
  return JSON.parse(body);
}

export async function runVisionAudit(args: VisionAuditOptions): Promise<VisionAuditResult> {
  await fs.mkdir(args.auditDir, { recursive: true });
  const tasks = await collectVisionAuditCandidates({
    pagePlan: args.pagePlan,
    rendersDir: args.rendersDir,
    auditDir: args.auditDir,
  });
  const prompt = buildVisionAuditPrompt(tasks);
  await fs.writeFile(path.join(args.auditDir, "audit-vision.prompt.md"), prompt);
  await fs.writeFile(path.join(args.auditDir, "audit-vision.tasks.json"), JSON.stringify({ tasks }, null, 2));

  if (tasks.length === 0) {
    const empty: VisionAuditResult = { bg_treatment_compliance: [], composition_flags: [] };
    await fs.writeFile(path.join(args.auditDir, "audit-vision.json"), JSON.stringify(empty, null, 2));
    return empty;
  }

  if (args.dryRun) {
    const dry: VisionAuditResult = { bg_treatment_compliance: [], composition_flags: [] };
    await fs.writeFile(
      path.join(args.auditDir, "audit-vision.dry-run.json"),
      JSON.stringify({ dry_run: true, panels: tasks.length, result: dry }, null, 2)
    );
    return dry;
  }

  const model = args.model ?? DEFAULT_MODEL;
  const timeoutMs = args.timeoutMs ?? 5 * 60 * 1000;
  const maxRetries = args.maxRetries ?? 1;
  let lastErr: string | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const r = await spawnClaudeVisionAudit({
      prompt,
      absPaths: tasks.map((t) => t.crop_path),
      model,
      timeoutMs,
    });
    await fs.writeFile(path.join(args.auditDir, `audit-vision.raw.attempt-${attempt + 1}.json`), r.raw);
    if (r.exitCode !== 0) {
      lastErr = `claude exit ${r.exitCode}: ${r.stderr.slice(0, 600)}`;
      continue;
    }

    try {
      const result = normalizeVisionAuditResult(extractClaudeInnerJson(r.raw));
      await fs.writeFile(path.join(args.auditDir, "audit-vision.json"), JSON.stringify(result, null, 2));
      return result;
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }

  throw new Error(`vision audit failed: ${lastErr ?? "unknown error"}`);
}

export function visionAuditToChecks(result: VisionAuditResult): AuditCheckResult[] {
  const checks: AuditCheckResult[] = [];

  for (const c of result.bg_treatment_compliance) {
    checks.push({
      panel_id: c.panel_id,
      check_kind: "bg_treatment_compliance",
      passed: c.compliance !== "major_violation",
      score: c.compliance === "match" ? 1 : c.compliance === "minor_drift" ? 0.5 : 0,
      threshold: 0.5,
      detail: `vision specified=${c.specified} observed=${c.observed} compliance=${c.compliance}: ${c.evidence}`,
    });
  }

  for (const f of result.composition_flags) {
    const flagNames = [
      "character_placement_feels_impossible",
      "speech_bubble_overlaps_face_or_action",
      "tail_points_to_wrong_speaker",
      "perspective_or_location_continuity_broken",
      "over_detailed_background_contradicts_expected_treatment",
    ] as const;
    const active = flagNames.filter((name) => f[name]);
    if (active.length === 0 && !f.notes) continue;
    checks.push({
      panel_id: f.panel_id,
      check_kind: "composition_flag",
      passed: active.length === 0,
      detail: active.length > 0 ? `vision flags=${active.join(", ")} ${f.notes ?? ""}`.trim() : f.notes,
    });
  }

  return checks;
}

export function countMajorBgViolations(result: VisionAuditResult): number {
  return result.bg_treatment_compliance.filter((c) => c.compliance === "major_violation").length;
}

export async function prepareLegacyBgVisionAudit(args: {
  pagePlan: PagePlanV2;
  rendersDir: string;
  auditDir: string;
  batchSize: number;
}): Promise<{ panels: number; batches: number; tasksDir: string; responsesDir: string }> {
  const tasks = await collectVisionAuditCandidates(args);
  if (tasks.length === 0) throw new Error("no audit candidates (no rendered pages with bg_treatment panels)");

  const tasksDir = path.join(args.auditDir, "_tasks");
  const responsesDir = path.join(args.auditDir, "_responses");
  await fs.mkdir(tasksDir, { recursive: true });
  await fs.mkdir(responsesDir, { recursive: true });

  let batches = 0;
  for (let i = 0; i < tasks.length; i += args.batchSize) {
    batches++;
    const batchTasks = tasks.slice(i, i + args.batchSize);
    const taskPath = path.join(tasksDir, `batch-${String(batches).padStart(3, "0")}.json`);
    const promptPath = path.join(tasksDir, `batch-${String(batches).padStart(3, "0")}.prompt.md`);
    const responsePath = path.join(responsesDir, `batch-${String(batches).padStart(3, "0")}.json`);
    await fs.writeFile(taskPath, JSON.stringify({ batch_id: batches, tasks: batchTasks }, null, 2));
    await fs.writeFile(
      promptPath,
      `${buildVisionAuditPrompt(batchTasks)}\n\n上記 JSON を ${responsePath} に保存してください。保存後 reply は "DONE" のみ。`
    );
  }

  return { panels: tasks.length, batches, tasksDir, responsesDir };
}

export async function mergeLegacyBgVisionAudit(args: {
  auditDir: string;
}): Promise<{ checks: AuditCheckResult[]; outPath: string }> {
  const responsesDir = path.join(args.auditDir, "_responses");
  const files = (await fs.readdir(responsesDir)).filter((f) => /^batch-\d+\.json$/.test(f)).sort();
  if (files.length === 0) throw new Error(`no batch-*.json under ${responsesDir}`);

  const merged: VisionAuditResult = { bg_treatment_compliance: [], composition_flags: [] };
  for (const f of files) {
    try {
      const raw = JSON.parse(await fs.readFile(path.join(responsesDir, f), "utf-8")) as unknown;
      const result = normalizeVisionAuditResult(raw);
      merged.bg_treatment_compliance.push(...result.bg_treatment_compliance);
      merged.composition_flags.push(...result.composition_flags);
    } catch (e) {
      console.warn(`[bg-vision/merge] invalid JSON in ${f}: ${(e as Error).message}`);
    }
  }

  const checks = visionAuditToChecks(merged);
  const outPath = path.join(args.auditDir, "audit-bg-vision.json");
  await fs.writeFile(
    outPath,
    JSON.stringify({ schema_version: 1, generated_at: new Date().toISOString(), vision: merged, checks }, null, 2)
  );
  return { checks, outPath };
}
