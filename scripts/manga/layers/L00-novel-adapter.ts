/**
 * L00 Novel Adapter
 *
 * 原作小説 Markdown を読み、L03.5 generate mode に渡せる散文 brief を生成する。
 * LLM 呼び出しは Codex CLI subprocess 経由に限定し、API key を使わない。
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { BibleSnapshotV2, CharacterEntryV2 } from "../../../src/lib/manga/schemas-v2";

export type NovelAdapterInput = {
  slug: string; episode: number; novelMdPaths: string[]; bibleSnapshotPath: string;
  archetypeHintId?: string; targetPages?: number; outputPath?: string;
};

export type NovelAdapterOutput = {
  briefPath: string;
  metadata: { cast: string[]; archetype: string; sourcePathsHash: string; generatedAt: string };
};

export type EpisodeArchetype = {
  id: string;
  name?: string;
  distribution?: number;
  description?: string;
  structure?: Array<{ phase: string; pages?: string; channels?: string[]; required?: string[] }>;
  state_changes?: Record<string, unknown>;
};

type CastHit = CharacterEntryV2 & { count: number; matchedAliases: string[] };
type GenerateBriefArgs = {
  novelTexts: string[]; cast: CastHit[]; archetype: EpisodeArchetype; coreHook: unknown;
  targetPages: number; bible: BibleSnapshotV2; cwd?: string; timeoutMs?: number;
};
type AdaptNovelOptions = {
  generateBrief?: (args: GenerateBriefArgs) => Promise<string>;
  now?: () => Date;
};
type Args = NovelAdapterInput & { dryRun: boolean; timeoutMs?: number };
type LoadedInput = {
  novels: string[]; bible: BibleSnapshotV2; cast: CastHit[];
  archetype: EpisodeArchetype; briefPath: string; sourcePathsHash: string;
};

const ARCHETYPE_PATH = "data/manga/episode_patterns/dungeon_modern.json";

function countOccurrences(text: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  for (let cursor = 0; ; cursor += needle.length) {
    const idx = text.indexOf(needle, cursor);
    if (idx === -1) return count;
    count++;
    cursor = idx;
  }
}

function aliasesForCharacter(name: string): string[] {
  const normalized = name.replace(/\s+/g, "");
  const parts = name.split(/\s+/).filter(Boolean);
  const aliases = [name, normalized, ...parts];
  if (parts.length < 2) {
    const m = normalized.match(/^([一-龯々]{1,4})([ァ-ヶーA-Za-z0-9]+)$/);
    if (m) aliases.push(m[1], m[2]);
  }
  return [...new Set(aliases.map((v) => v.trim()).filter(Boolean))];
}

export function extractCastFromNovels(
  novelTexts: string[],
  bible: BibleSnapshotV2,
  limit = 5,
): CastHit[] {
  const joined = novelTexts.join("\n\n");
  return bible.characters
    .map((character) => {
      const matchedAliases: string[] = [];
      const count = aliasesForCharacter(character.name).reduce((sum, alias) => {
        const n = countOccurrences(joined, alias);
        if (n > 0) matchedAliases.push(alias);
        return sum + n;
      }, 0);
      return { ...character, count, matchedAliases };
    })
    .filter((character) => character.count > 0)
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id, "ja"))
    .slice(0, limit);
}

export async function loadArchetype(archetypeHintId = "M1_series_opener"): Promise<EpisodeArchetype> {
  const dict = JSON.parse(await fs.readFile(ARCHETYPE_PATH, "utf-8")) as { patterns?: EpisodeArchetype[] };
  const archetype = dict.patterns?.find((pattern) => pattern.id === archetypeHintId);
  if (!archetype) throw new Error(`archetype not found: ${archetypeHintId}`);
  return archetype;
}

function defaultArchetypeIdForSubtype(_subtype?: string): string {
  return "M1_series_opener";
}

export function defaultBriefPath(slug: string, episode: number): string {
  const ep = `ep${String(episode).padStart(2, "0")}`;
  return path.join("data", "manga", "works", slug, "episodes", ep, "_brief.v2.md");
}

export function hashSourceTexts(paths: string[], texts: string[]): string {
  const h = createHash("sha256");
  paths.forEach((p, i) => h.update(path.normalize(p)).update("\0").update(texts[i] ?? "").update("\0"));
  return h.digest("hex");
}

function summarizeBible(bible: BibleSnapshotV2, cast: CastHit[]): Record<string, unknown> {
  const castIds = new Set(cast.map((c) => c.id));
  return {
    title: bible.meta.title,
    subtype: bible.meta.subtype,
    core_hook: bible.meta.core_hook,
    world_premise: bible.world?.premise,
    cast: bible.characters.filter((c) => castIds.has(c.id)).map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role,
      spec: c.spec,
      appearance_notes: c.appearance_notes,
    })),
    key_locations: bible.locations.slice(0, 8).map((location) => ({ id: location.id, name: location.name })),
    key_props: bible.props.slice(0, 8).map((prop) => ({ id: prop.id, name: prop.name })),
  };
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/);
  return `${(fence ? fence[1] : trimmed).trim()}\n`;
}

function buildBriefPrompt(args: GenerateBriefArgs): string {
  const castLine = args.cast
    .map((c) => `${c.name} (${c.id}, count=${c.count}, aliases=${c.matchedAliases.join("/")})`)
    .join("\n");
  const phases = (args.archetype.structure ?? [])
    .map((s) => `- ${s.phase} (${s.pages ?? "pages未指定"}): ${(s.required ?? []).join(" / ")}`)
    .join("\n");
  const novels = args.novelTexts.map((text, i) => `## 小説本文 ${i + 1}\n${text.trim()}`).join("\n\n---\n\n");
  return `あなたは漫画脚本の Source Adapter です。小説本文を、L03.5 generate mode に渡す \`_brief.v2.md\` に変換してください。

## 出力ルール
- 日本語の散文のみ。Markdown 見出し、箇条書き、メタヘッダ、JSON、コードフェンスは禁止。
- 6段落に分ける。各段落はおおむね200-400字。
- 漫画 ${args.targetPages} ページ想定。表紙は含めない。
- 既存 brief と同じ粒度で、ページ設計に使える順序・場面・視覚情報・感情核を書く。
- 小説本文にない新キャラや新設定を増やさない。
- core_hook は必ず「異変」フェーズに置き、その後「初回発動」で動作として見せる。
- 最終段落は次話への引きで終える。

## 主要キャスト
${castLine}

## Archetype
id: ${args.archetype.id}
description: ${args.archetype.description ?? ""}
${phases}

## core_hook
${JSON.stringify(args.coreHook, null, 2)}

## Bible context
${JSON.stringify(summarizeBible(args.bible, args.cast), null, 2)}

${novels}

完成版 \`_brief.v2.md\` の本文だけを出力してください。`;
}

export async function runCodexTextOnce(opts: {
  task: string;
  cwd: string;
  timeoutMs: number;
}): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "codex",
      ["exec", "--sandbox", "read-only", "--skip-git-repo-check", "--cd", opts.cwd, "-"],
      { cwd: opts.cwd, stdio: ["pipe", "pipe", "pipe"], detached: true },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    const timer = setTimeout(() => {
      if (child.pid) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          try { child.kill("SIGKILL"); } catch {}
        }
      }
      reject(new Error(`Codex CLI timeout (${opts.timeoutMs}ms)`));
    }, opts.timeoutMs);
    child.on("error", (err) => { clearTimeout(timer); reject(err); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ stdout, stderr, exitCode: code }); });
    child.stdin.write(opts.task);
    child.stdin.end();
  });
}

export async function generateBriefViaCodexCli(args: GenerateBriefArgs): Promise<string> {
  const cwd = args.cwd ?? process.cwd();
  const result = await runCodexTextOnce({
    task: buildBriefPrompt(args),
    cwd,
    timeoutMs: args.timeoutMs ?? 5 * 60 * 1000,
  });
  if (result.exitCode !== 0) {
    throw new Error(`Codex CLI failed (exit=${result.exitCode}): ${result.stderr.slice(-800)}`);
  }
  const content = stripCodeFence(result.stdout);
  if (content.split(/\n{2,}/).filter((p) => p.trim()).length < 4) {
    throw new Error(`brief output is too short: ${content.slice(0, 300)}`);
  }
  return content;
}

async function loadInput(input: NovelAdapterInput): Promise<LoadedInput> {
  const novels = await Promise.all(input.novelMdPaths.map((p) => fs.readFile(p, "utf-8")));
  const bible = JSON.parse(await fs.readFile(input.bibleSnapshotPath, "utf-8")) as BibleSnapshotV2;
  const cast = extractCastFromNovels(novels, bible);
  const archetype = await loadArchetype(input.archetypeHintId ?? defaultArchetypeIdForSubtype(bible.meta.subtype));
  return {
    novels,
    bible,
    cast,
    archetype,
    briefPath: input.outputPath ?? defaultBriefPath(input.slug, input.episode),
    sourcePathsHash: hashSourceTexts(input.novelMdPaths, novels),
  };
}

export async function adaptNovelToBrief(
  input: NovelAdapterInput,
  options: AdaptNovelOptions = {},
): Promise<NovelAdapterOutput> {
  const loaded = await loadInput(input);
  const generateBrief = options.generateBrief ?? generateBriefViaCodexCli;
  const briefContent = await generateBrief({
    novelTexts: loaded.novels,
    cast: loaded.cast,
    archetype: loaded.archetype,
    coreHook: loaded.bible.meta.core_hook,
    targetPages: input.targetPages ?? 22,
    bible: loaded.bible,
  });
  await fs.mkdir(path.dirname(loaded.briefPath), { recursive: true });
  await fs.writeFile(loaded.briefPath, briefContent, "utf-8");
  return {
    briefPath: loaded.briefPath,
    metadata: {
      cast: loaded.cast.map((c) => c.id),
      archetype: loaded.archetype.id,
      sourcePathsHash: loaded.sourcePathsHash,
      generatedAt: (options.now ?? (() => new Date()))().toISOString(),
    },
  };
}

function parseArgs(argv = process.argv.slice(2)): Args {
  const a: Partial<Args> = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const eq = argv[i].match(/^--([^=]+)=(.*)$/);
    const key = eq?.[1] ?? argv[i].match(/^--(.+)$/)?.[1];
    if (!key) continue;
    if (key === "dry-run") {
      a.dryRun = true;
      continue;
    }
    const val = eq?.[2] ?? argv[++i];
    if (!val || val.startsWith("--")) continue;
    if (key === "slug") a.slug = val;
    else if (key === "episode") a.episode = Number(val);
    else if (key === "novel") a.novelMdPaths = [...(a.novelMdPaths ?? []), val];
    else if (key === "bible") a.bibleSnapshotPath = val;
    else if (key === "archetype-hint") a.archetypeHintId = val;
    else if (key === "target-pages") a.targetPages = Number(val);
    else if (key === "output") a.outputPath = val;
    else if (key === "timeout-ms") a.timeoutMs = Number(val);
  }
  if (!a.slug || !a.episode || !a.bibleSnapshotPath || !a.novelMdPaths?.length) {
    throw new Error("--slug, --episode, --novel, and --bible required");
  }
  return a as Args;
}

async function main() {
  const args = parseArgs();
  if (args.dryRun) {
    const loaded = await loadInput(args);
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          briefPath: loaded.briefPath,
          cast: loaded.cast.map((c) => ({ id: c.id, name: c.name, count: c.count })),
          archetype: loaded.archetype.id,
          sourcePathsHash: loaded.sourcePathsHash,
        },
        null,
        2,
      ),
    );
    return;
  }
  const result = await adaptNovelToBrief(args, {
    generateBrief: (genArgs) => generateBriefViaCodexCli({ ...genArgs, timeoutMs: args.timeoutMs }),
  });
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
