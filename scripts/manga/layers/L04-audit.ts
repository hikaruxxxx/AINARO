/**
 * L04_audit Storyboard Variant Audit
 *
 * Phase 2D: L04 --variants で生成した storyboard proposals を claude haiku CLI
 * 1 call で横断評価し、_storyboard_alts/audit-{date}.json に保存する。
 *
 * Usage:
 *   npx tsx scripts/manga/layers/L04-audit.ts --slug a07-modern-dungeon --episode 1
 *   npx tsx scripts/manga/layers/L04-audit.ts --slug a07-modern-dungeon --episode 1 \
 *     --proposals data/manga/works/a07-modern-dungeon/episodes/ep01/_storyboard_alts/proposals-2026-05-08.json
 */
import "../_env";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  bibleSnapshotPath,
  REPO_ROOT,
  storyboardAltsDir,
} from "./_paths";
import type {
  StoryboardProposal,
  StoryboardProposalsIndex,
} from "../../../src/lib/manga/storyboard-v2/storyboard-alts";
import {
  emptyStoryboardAuditSeverityCounts,
  STORYBOARD_AUDIT_CATEGORIES,
  STORYBOARD_AUDIT_SEVERITIES,
  type StoryboardAuditReport,
  type StoryboardAuditSeverity,
  type StoryboardAuditVariant,
} from "../../../src/lib/manga/qa-v2/storyboard-audit";

type Args = {
  slug: string;
  episode: number;
  proposals?: string;
  model: string;
  timeoutMs: number;
};

const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";

function parseArgs(): Args {
  const a: Partial<Args> = {
    model: process.env.AINARO_AUDIT_MODEL || "haiku",
    timeoutMs: 10 * 60 * 1000,
  };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    let key: string | null = null;
    let val: string | null = null;
    const eq = arg.match(/^--([^=]+)=(.*)$/);
    if (eq) [, key, val] = eq;
    else {
      const flag = arg.match(/^--(.+)$/);
      if (flag && i + 1 < argv.length) {
        key = flag[1];
        val = argv[++i];
      }
    }
    if (!key || val === null) continue;
    if (key === "slug") a.slug = val;
    else if (key === "episode") a.episode = Number(val);
    else if (key === "proposals") a.proposals = val;
    else if (key === "model") a.model = val;
    else if (key === "timeout-ms") a.timeoutMs = Number(val);
  }
  if (!a.slug || !a.episode) throw new Error("--slug and --episode required");
  return a as Args;
}

function resolveMaybeRepoPath(input: string): string {
  return path.isAbsolute(input) ? input : path.join(REPO_ROOT, input);
}

async function latestFile(dir: string, re: RegExp): Promise<string | null> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw error;
  }
  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && re.test(entry.name))
      .map(async (entry) => {
        const abs = path.join(dir, entry.name);
        const stat = await fs.stat(abs);
        return { abs, mtimeMs: stat.mtimeMs };
      })
  );
  files.sort((a, b) => b.mtimeMs - a.mtimeMs || b.abs.localeCompare(a.abs));
  return files[0]?.abs ?? null;
}

async function loadJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, "utf-8")) as T;
}

function makeJsonSchema(proposalIds: string[]): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      proposals: {
        type: "array",
        minItems: proposalIds.length,
        maxItems: proposalIds.length,
        items: {
          type: "object",
          properties: {
            proposal_id: { enum: proposalIds },
            generation_profile: { enum: ["balanced", "cinematic", "clarity-first"] },
            severity: { enum: [...STORYBOARD_AUDIT_SEVERITIES] },
            issues: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  category: { enum: [...STORYBOARD_AUDIT_CATEGORIES] },
                  description: { type: "string" },
                  panel_id: { type: "string" },
                  page_no: { type: "number" },
                },
                required: ["category", "description"],
                additionalProperties: false,
              },
            },
            strengths: { type: "string" },
            suggested_fix: { type: "string" },
          },
          required: ["proposal_id", "severity", "issues", "strengths", "suggested_fix"],
          additionalProperties: false,
        },
      },
      cross_variant_notes: { type: "string" },
      summary: {
        type: "object",
        properties: {
          recommended_proposal_id: { enum: proposalIds },
        },
        required: ["recommended_proposal_id"],
        additionalProperties: false,
      },
    },
    required: ["proposals", "cross_variant_notes", "summary"],
    additionalProperties: false,
  };
}

function summarizeStoryboard(storyboard: unknown): unknown {
  if (!storyboard || typeof storyboard !== "object") return storyboard;
  const sb = storyboard as { episode_id?: unknown; total_pages?: unknown; pages?: unknown };
  if (!Array.isArray(sb.pages)) return storyboard;
  return {
    episode_id: sb.episode_id,
    total_pages: sb.total_pages,
    pages: sb.pages.map((page) => {
      const p = page as { page_no?: unknown; page_role?: unknown; panels?: unknown };
      return {
        page_no: p.page_no,
        page_role: p.page_role,
        panels: Array.isArray(p.panels)
          ? p.panels.map((panel) => {
              const x = panel as Record<string, unknown>;
              return {
                panel_id: x.panel_id,
                panel_no: x.panel_no,
                shot_type: x.shot_type,
                camera: x.camera,
                importance: x.importance,
                entities: x.entities,
                action: x.action,
                key_visual: x.key_visual,
                dialogue: x.dialogue,
                monologue: x.monologue,
                narration: x.narration,
                sfx: x.sfx,
              };
            })
          : [],
      };
    }),
  };
}

async function buildPrompt(args: {
  slug: string;
  episode: number;
  index: StoryboardProposalsIndex;
  proposalStoryboards: Array<{ proposal: StoryboardProposal; storyboard: unknown }>;
  bible: unknown;
}): Promise<string> {
  const payload = {
    slug: args.slug,
    episode: args.episode,
    audit_rules: STORYBOARD_AUDIT_CATEGORIES,
    bible: args.bible,
    proposals: args.proposalStoryboards.map(({ proposal, storyboard }) => ({
      proposal,
      storyboard: summarizeStoryboard(storyboard),
    })),
  };
  return `あなたは商業漫画ネームの監査担当です。${args.proposalStoryboards.length} 個の storyboard 案を比較してください。

評価軸は必ず次の 8 個だけです:
- continuity: 前話・bible との continuity
- pacing: page_role 分布の商業漫画適正
- clarity: panel 過密、吹き出し数、文字数
- dialogue: character speech_style 一貫性
- entity_binding: character_id / location_id / prop_id が bible に存在
- shot_type_variation: wide/close_up/medium 等の単調さ
- focus_entity_coherence: focus_entity_id が page 単位で logical
- opening_hook_priority: page 1-3 で importance 高 panel 十分

各 proposal について severity, issues, strengths, suggested_fix を返し、全体比較として cross_variant_notes と recommended_proposal_id を返してください。
JSON schema に厳密準拠し、JSON 以外の文章は出力しないでください。

INPUT:
${JSON.stringify(payload, null, 2)}

JSON SCHEMA:
${JSON.stringify(makeJsonSchema(args.index.proposals.map((p) => p.proposal_id)), null, 2)}
`;
}

async function spawnClaudeAudit(args: {
  prompt: string;
  addDirs: string[];
  model: string;
  timeoutMs: number;
}): Promise<{ raw: string; exitCode: number; stderr: string }> {
  const argv = [
    "--print",
    "--output-format=json",
    `--model=${args.model}`,
    "--permission-mode=bypassPermissions",
    "--disable-slash-commands",
  ];
  for (const dir of Array.from(new Set(args.addDirs))) argv.push(`--add-dir=${dir}`);
  argv.push("--", args.prompt);

  return new Promise((resolve) => {
    const child = spawn(CLAUDE_BIN, argv, { stdio: ["ignore", "pipe", "pipe"], env: process.env });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), args.timeoutMs);
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ raw: stdout, exitCode: code ?? 1, stderr });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ raw: "", exitCode: 1, stderr: `${stderr}\n[spawn-error] ${error.message}` });
    });
  });
}

function extractInnerJson(claudeJson: string): unknown {
  const top = JSON.parse(claudeJson) as { result?: string; is_error?: boolean };
  if (top.is_error || typeof top.result !== "string") {
    throw new Error(`claude returned error or no result: ${claudeJson.slice(0, 500)}`);
  }
  let body = top.result.trim();
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) body = fence[1].trim();
  return JSON.parse(body);
}

function isSeverity(value: unknown): value is StoryboardAuditSeverity {
  return typeof value === "string" && (STORYBOARD_AUDIT_SEVERITIES as readonly string[]).includes(value);
}

function normalizeReport(args: {
  slug: string;
  episode: number;
  model: string;
  parsed: unknown;
  index: StoryboardProposalsIndex;
}): StoryboardAuditReport {
  const parsed = args.parsed as Partial<StoryboardAuditReport>;
  const proposalById = new Map(args.index.proposals.map((p) => [p.proposal_id, p]));
  const proposals: StoryboardAuditVariant[] = Array.isArray(parsed.proposals)
    ? parsed.proposals
        .filter((p): p is StoryboardAuditVariant => {
          return Boolean(
            p &&
              typeof p === "object" &&
              typeof (p as StoryboardAuditVariant).proposal_id === "string" &&
              proposalById.has((p as StoryboardAuditVariant).proposal_id) &&
              isSeverity((p as StoryboardAuditVariant).severity) &&
              Array.isArray((p as StoryboardAuditVariant).issues) &&
              typeof (p as StoryboardAuditVariant).strengths === "string" &&
              typeof (p as StoryboardAuditVariant).suggested_fix === "string"
          );
        })
        .map((p) => ({
          ...p,
          generation_profile: p.generation_profile ?? proposalById.get(p.proposal_id)?.generation_profile,
        }))
    : [];
  const counts = emptyStoryboardAuditSeverityCounts();
  for (const proposal of proposals) counts[proposal.severity]++;
  const recommended = parsed.summary?.recommended_proposal_id;
  return {
    schema_version: 1,
    slug: args.slug,
    episode: args.episode,
    audited_at: new Date().toISOString(),
    audited_by: `L04-audit:${args.model}`,
    proposals,
    cross_variant_notes: typeof parsed.cross_variant_notes === "string" ? parsed.cross_variant_notes : "",
    summary: {
      by_severity: counts,
      recommended_proposal_id:
        typeof recommended === "string" && proposalById.has(recommended)
          ? recommended
          : proposals[0]?.proposal_id ?? args.index.proposals[0]?.proposal_id ?? "",
    },
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const altsDir = storyboardAltsDir(args.slug, args.episode);
  const proposalsPath = args.proposals
    ? resolveMaybeRepoPath(args.proposals)
    : await latestFile(altsDir, /^proposals-\d{4}-\d{2}-\d{2}\.json$/);
  if (!proposalsPath) throw new Error(`proposals-*.json not found in ${altsDir}`);

  const index = await loadJson<StoryboardProposalsIndex>(proposalsPath);
  if (index.slug !== args.slug || index.episode !== args.episode) {
    throw new Error(`proposals scope mismatch: ${index.slug} ep${index.episode}`);
  }
  if (!Array.isArray(index.proposals) || index.proposals.length === 0) {
    throw new Error(`no proposals in ${proposalsPath}`);
  }

  const proposalStoryboards = await Promise.all(
    index.proposals.map(async (proposal) => ({
      proposal,
      storyboard: await loadJson(resolveMaybeRepoPath(proposal.storyboard_path)),
    }))
  );
  const bible = await loadJson(bibleSnapshotPath(args.slug));
  const prompt = await buildPrompt({
    slug: args.slug,
    episode: args.episode,
    index,
    proposalStoryboards,
    bible,
  });
  console.log(`[L04_audit] slug=${args.slug} ep=${args.episode} proposals=${index.proposals.length} model=${args.model}`);
  console.log(`[L04_audit] proposals=${proposalsPath}`);

  const response = await spawnClaudeAudit({
    prompt,
    addDirs: [
      path.dirname(proposalsPath),
      ...index.proposals.map((p) => path.dirname(resolveMaybeRepoPath(p.storyboard_path))),
      path.dirname(bibleSnapshotPath(args.slug)),
    ],
    model: args.model,
    timeoutMs: args.timeoutMs,
  });
  if (response.exitCode !== 0) {
    throw new Error(`claude exit ${response.exitCode}: ${response.stderr.slice(0, 1000)}`);
  }

  const report = normalizeReport({
    slug: args.slug,
    episode: args.episode,
    model: args.model,
    parsed: extractInnerJson(response.raw),
    index,
  });
  const date = new Date().toISOString().slice(0, 10);
  await fs.mkdir(altsDir, { recursive: true });
  const outPath = path.join(altsDir, `audit-${date}.json`);
  const tmpPath = `${outPath}.tmp.${process.pid}`;
  await fs.writeFile(tmpPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  await fs.rename(tmpPath, outPath);
  console.log(`[L04_audit] DONE -> ${outPath}`);
  console.log(
    `[L04_audit] severity ok=${report.summary.by_severity.ok} minor=${report.summary.by_severity.minor} major=${report.summary.by_severity.major} critical=${report.summary.by_severity.critical} recommended=${report.summary.recommended_proposal_id}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
