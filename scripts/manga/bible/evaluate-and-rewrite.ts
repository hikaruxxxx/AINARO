/**
 * Emit a Claude Agent prompt for evaluating and optionally rewriting one bible snapshot field.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { bibleSnapshotPath } from "../layers/_paths";
import { findTargetField, type Scope } from "./apply-deepen-patch";

type Args = {
  slug: string;
  targetId: string;
  scope: Scope;
  field: string;
  emitPrompt: string;
};

type JsonRecord = Record<string, unknown>;

type PromptInput = {
  slug: string;
  targetId: string;
  scope: Scope;
  field: string;
  bible: unknown;
};

const DEFAULT_PROMPT_PATH = "/tmp/bible-eval-prompt.md";

export function parseArgs(argv = process.argv.slice(2)): Args {
  const out: Partial<Args> = { emitPrompt: DEFAULT_PROMPT_PATH };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = arg.match(/^--([^=]+)=(.*)$/u);
    const key = eq?.[1] ?? (arg.startsWith("--") ? arg.slice(2) : "");
    const value = eq?.[2] ?? (key && i + 1 < argv.length ? argv[++i] : undefined);
    if (!key || value === undefined) continue;

    if (key === "slug") out.slug = value;
    else if (key === "target-id") out.targetId = value;
    else if (key === "scope") out.scope = parseScope(value);
    else if (key === "field") out.field = value;
    else if (key === "emit-prompt") out.emitPrompt = value;
  }

  if (!out.slug) throw new Error("--slug required");
  if (!out.targetId) throw new Error("--target-id required");
  if (!out.scope) throw new Error("--scope required");
  if (!out.field) throw new Error("--field required");
  return out as Args;
}

export function buildAgentPrompt(input: PromptInput): string {
  const target = findTargetField(input.bible, input.scope, input.targetId, input.field);
  const minIdeal = depthSpecForField(input.bible, input.field);
  const context = buildContext(input.bible, input.scope, target.target, input.field);
  const targetMeta = buildTargetMeta(input.scope, target.target, minIdeal);

  return `# AINARO 漫画 bible 文書評価タスク

## 対象
- slug: ${input.slug}
- target_id: ${input.targetId}
- scope: ${input.scope}
- field: ${input.field}
${targetMeta}

## 周辺コンテキスト
${context}

## 現状の field 内容
\`\`\`
${target.current}
\`\`\`

## 評価軸
1. 商業 bible 水準か (depth、文学性、独自性があり、編集者・作画・脚本が使える密度か)
2. AIらしい紋切り表現がないか (テンプレ自体は OK だが、抽象語の反復や一般論の水増しは排除)
3. キャラ固有か (汎用心理学にとどまらず、本作固有の制度/武器/関係性/固有名詞が出ているか)
4. 既存設定との整合 (他の field や bible 全体と矛盾していないか)
5. 読者報酬の構造 (主人公への反論・対比・伏線として機能しているか。antagonist の場合は特に厳しく見る)
6. min/ideal 字数 (depth_spec。短すぎる場合は必要な密度まで書き直す)

## 出力形式

以下の JSON 形式で評価結果を返してください (Markdown コードフェンス不要):

\`\`\`json
{
  "evaluation_summary": "...100-200字で総評...",
  "issues": [
    { "category": "ai_cliché|character_generic|inconsistency|reader_reward|too_short|too_long|commercial_depth|other", "description": "...", "location_hint": "段落2 後半" }
  ],
  "needs_rewrite": true,
  "rewritten_text": "...修正後の全文...",
  "rewrite_rationale": "...修正方針を簡潔に..."
}
\`\`\`

issues は最大 5 件まで。issues が空 (= 修正不要) なら needs_rewrite: false、rewritten_text: null。
rewritten_text は ideal 字数を目指す (本ケースなら ${minIdeal.ideal} 字目安)。
既存設定を壊さず、現状の良い固有要素は保持し、必要箇所のみ上書き前提の全文として返してください。

## ⚠️ 厳守ルール (hallucination 防止)

1. **キャラ名厳守**: 上記コンテキストに登場するキャラ名 (例: 主人公の正確な氏名は context 内の name field を使う) **以外** のキャラ名を絶対に使うな。
   - context にあるなら例: 桐生レン / 白瀬灯里 / 氷室玲二 等をそのまま使う
   - context にない人物を新規に登場させない (脇役の名前も既存リストのみ)

2. **新規固有名詞の禁止**: bible 既知の制度名・武器名・固有名詞 (例: 公社アプリ / 鑑定石プロトコル / ナビ / Sランク / 適性ランク 等) のみ使用可。
   - 「偶然許可リスト」「信頼スコア」「国家直轄部隊」のような **未登場の新概念** を生成するな
   - 既存設定に無いものは「彼が普段使う手帳」「上司に提出する報告書」のような **一般語** で表現する
   - 必要なら既存 bible に明示されている固有名詞だけを再利用する

3. **既存設定の優先**: context の origin_wound_deep / backstory 等に書かれた具体的固有要素 (妹・澪 / 右手手袋 / Sランク徽章 / 予備鑑定誤表示) を尊重し、矛盾する新設定を作らない。
`;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const snapshotPath = bibleSnapshotPath(args.slug);
  const bible = await readJson(snapshotPath, "snapshot.json");
  const prompt = buildAgentPrompt({
    slug: args.slug,
    targetId: args.targetId,
    scope: args.scope,
    field: args.field,
    bible,
  });

  await fs.mkdir(path.dirname(args.emitPrompt), { recursive: true });
  await fs.writeFile(args.emitPrompt, prompt);
  console.log(`[evaluate-rewrite] prompt: ${args.emitPrompt}`);
}

function buildTargetMeta(scope: Scope, target: JsonRecord, minIdeal: { min: number; ideal: number }): string {
  const lines = scope === "character"
    ? [
        `- character_name: ${stringValue(target.name)}`,
        `- character_role: ${stringValue(target.role)}`,
      ]
    : scope === "location"
      ? [
          `- location_name: ${stringValue(target.name)}`,
          `- location_type: ${stringValue(target.location_type)}`,
        ]
      : [`- motif_name: ${stringValue(target.name)}`];

  return [...lines, `- 字数 min/ideal: ${minIdeal.min} / ${minIdeal.ideal}`].join("\n");
}

function buildContext(bible: unknown, scope: Scope, target: JsonRecord, field: string): string {
  const root = asRecord(bible, "bible");
  const chunks: string[] = [];
  const meta = asOptionalRecord(root.meta);
  const world = asOptionalRecord(root.world);

  pushLine(chunks, "title", stringValue(meta?.title));
  pushLine(chunks, "core_hook", stringValue(asOptionalRecord(meta?.core_hook)?.one_liner));
  pushLine(chunks, "world_premise", clip(stringValue(world?.premise), 500));

  if (scope === "character") {
    pushLine(chunks, "name", stringValue(target.name));
    pushLine(chunks, "role", stringValue(target.role));
    pushLine(chunks, "backstory", clip(stringValue(target.backstory), 500));
    for (const relatedField of ["appearance_notes", "origin_wound_deep", "narrative_function", "relationship_dynamics"]) {
      if (relatedField !== field) pushLine(chunks, relatedField, clip(stringValue(target[relatedField]), 500));
    }
  } else if (scope === "location") {
    pushLine(chunks, "name", stringValue(target.name));
    pushLine(chunks, "location_type", stringValue(target.location_type));
    pushLine(chunks, "visual_description", clip(stringValue(target.visual_description), 500));
  } else {
    pushLine(chunks, "name", stringValue(target.name));
    pushLine(chunks, "meaning", clip(stringValue(target.meaning), 500));
    pushLine(chunks, "usage", clip(stringValue(target.usage), 500));
  }

  return chunks.length > 0 ? chunks.map((line) => `- ${line}`).join("\n") : "(周辺コンテキストなし)";
}

function depthSpecForField(bible: unknown, field: string): { min: number; ideal: number } {
  const root = asOptionalRecord(bible);
  const depthSpec = asOptionalRecord(root?.depth_spec);
  const fieldSpec = asOptionalRecord(depthSpec?.[field]);
  const min = numberValue(fieldSpec?.min_chars) ?? numberValue(fieldSpec?.min) ?? 2000;
  const ideal = numberValue(fieldSpec?.ideal_chars) ?? numberValue(fieldSpec?.ideal) ?? 6000;
  return { min, ideal };
}

async function readJson(filePath: string, label: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf-8")) as unknown;
  } catch (error) {
    throw new Error(`${label} not found or invalid: ${filePath} (${errorMessage(error)})`);
  }
}

function parseScope(value: string): Scope {
  if (value === "character" || value === "location" || value === "motif") return value;
  throw new Error(`unknown --scope: ${value}`);
}

function pushLine(lines: string[], label: string, value: string): void {
  if (value) lines.push(`${label}: ${value}`);
}

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asOptionalRecord(value: unknown): JsonRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonRecord) : undefined;
}

function asRecord(value: unknown, label: string): JsonRecord {
  const record = asOptionalRecord(value);
  if (record) return record;
  throw new Error(`${label} is not an object`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const isCliEntry = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isCliEntry) {
  void main().catch((error: unknown) => {
    console.error("[evaluate-rewrite] FAILED:", error);
    process.exit(1);
  });
}
