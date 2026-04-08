// β-3: ヒットDB → 読者感情欲求の逆算マッピング
//
// 役割:
// - data/generation/hit-loglines.json の全作品(668件)を読む
// - 各作品について LLM(claude -p)で「主感情欲求 + 副感情欲求」を分類
// - 出力: data/generation/hit-loglines-with-desires.json
//
// 設計:
// - 1呼び出し = 1作品(テンプレ化対策)
// - 並列度3、throttleで5h窓を意識
// - 既に分類済みの作品はスキップ(冪等)
// - 失敗は1回リトライ、それ以上は skipped で記録
//
// 使い方:
//   npx tsx scripts/generation/reverse-map-desires.ts [--dry-run] [--limit N]
//
// dry-run: LLMを呼ばずプロンプトだけ出力(コスト見積)
// limit:   最大N件だけ処理(検証用)

import { existsSync, readFileSync, writeFileSync } from "fs";
import { callClaudeCli, extractJsonBlock } from "../../src/lib/screening/claude-cli";
import { loadReaderDesires } from "../../src/lib/screening/seed-v2";
import { throttleBeforeCall } from "../../src/lib/screening/throttle";

interface HitWork {
  ncode: string;
  title: string;
  story: string;
  keyword: string;
  gp_per_ep?: number;
  gp?: number;
  episodes?: number;
}

interface HitDB {
  generatedAt: string;
  source: string;
  totalWorks: number;
  byGenre: Record<string, HitWork[]>;
}

interface DesireMapping {
  ncode: string;
  title: string;
  genre: string;
  primaryDesire: string;
  secondaryDesire: string | null;
  confidence: number;
  reason: string;
  classifiedAt: string;
}

interface OutputFile {
  version: string;
  generatedAt: string;
  source: string;
  totalWorks: number;
  classified: number;
  skipped: number;
  byNcode: Record<string, DesireMapping>;
}

const INPUT_PATH = "data/generation/hit-loglines.json";
const OUTPUT_PATH = "data/generation/hit-loglines-with-desires.json";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const limitIdx = process.argv.indexOf("--limit");
const limit = limitIdx >= 0 ? Number(process.argv[limitIdx + 1]) : Infinity;

const PARALLEL = 3;

function loadInput(): HitDB {
  if (!existsSync(INPUT_PATH)) {
    throw new Error(`${INPUT_PATH} not found`);
  }
  return JSON.parse(readFileSync(INPUT_PATH, "utf-8")) as HitDB;
}

function loadOutput(): OutputFile {
  if (!existsSync(OUTPUT_PATH)) {
    return {
      version: "v1",
      generatedAt: new Date().toISOString(),
      source: INPUT_PATH,
      totalWorks: 0,
      classified: 0,
      skipped: 0,
      byNcode: {},
    };
  }
  return JSON.parse(readFileSync(OUTPUT_PATH, "utf-8")) as OutputFile;
}

function saveOutput(out: OutputFile): void {
  out.generatedAt = new Date().toISOString();
  out.classified = Object.keys(out.byNcode).length;
  writeFileSync(OUTPUT_PATH, JSON.stringify(out, null, 2));
}

function buildPrompt(work: HitWork, genre: string): string {
  const desires = loadReaderDesires();
  const desireList = desires.desires.map((d) => `- ${d.id}: ${d.name}(${d.description})`).join("\n");
  return `あなたはWeb小説の読者心理分析家です。以下の作品が「読者のどの感情欲求」を満たしているかを分類してください。

# 感情欲求一覧
${desireList}

# 作品
- タイトル: ${work.title}
- ジャンル: ${genre}
- キーワード: ${work.keyword}
- あらすじ: ${work.story.slice(0, 600)}

# 出力形式(JSON1行のみ、説明不要)
{
  "primaryDesire": "<id>",
  "secondaryDesire": "<id or null>",
  "confidence": 0.0-1.0,
  "reason": "100字以内"
}

主感情欲求は1つ、副感情欲求は0〜1つ(該当なければnull)。
confidence は分類の自信度(0-1)。`;
}

async function classifyOne(
  work: HitWork,
  genre: string,
  dryRun: boolean,
): Promise<DesireMapping | null> {
  const prompt = buildPrompt(work, genre);
  if (dryRun) {
    console.log(`[dry-run] ${work.ncode} ${work.title} (prompt=${prompt.length}字)`);
    return null;
  }
  await throttleBeforeCall();
  let raw: string;
  try {
    raw = await callClaudeCli(prompt, { layer: "reverse-map", slug: work.ncode });
  } catch (e) {
    console.warn(`[reverse-map] ${work.ncode} 失敗(1回目): ${(e as Error).message}`);
    // 1回リトライ
    try {
      raw = await callClaudeCli(prompt, { layer: "reverse-map-retry", slug: work.ncode });
    } catch (e2) {
      console.error(`[reverse-map] ${work.ncode} 失敗(リトライ): ${(e2 as Error).message}`);
      return null;
    }
  }
  const parsed = extractJsonBlock(raw) as
    | {
        primaryDesire?: string;
        secondaryDesire?: string | null;
        confidence?: number;
        reason?: string;
      }
    | null;
  if (!parsed?.primaryDesire) {
    console.warn(`[reverse-map] ${work.ncode} parse失敗`);
    return null;
  }
  return {
    ncode: work.ncode,
    title: work.title,
    genre,
    primaryDesire: parsed.primaryDesire,
    secondaryDesire: parsed.secondaryDesire ?? null,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    reason: String(parsed.reason ?? ""),
    classifiedAt: new Date().toISOString(),
  };
}

async function processInBatches<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  parallel: number,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += parallel) {
    const batch = items.slice(i, i + parallel);
    const r = await Promise.all(batch.map(worker));
    results.push(...r);
  }
  return results;
}

async function main(): Promise<void> {
  const db = loadInput();
  const out = loadOutput();
  out.totalWorks = db.totalWorks;

  // 全作品を flatten + 既存スキップ
  const queue: { work: HitWork; genre: string }[] = [];
  for (const [genre, works] of Object.entries(db.byGenre)) {
    for (const work of works) {
      if (out.byNcode[work.ncode]) continue; // 既に分類済み
      queue.push({ work, genre });
    }
  }
  const target = queue.slice(0, Math.min(limit, queue.length));
  console.log(`[reverse-map] 全${db.totalWorks}件 / 既存${Object.keys(out.byNcode).length}件 / 対象${target.length}件 (parallel=${PARALLEL})`);
  console.log(`[reverse-map] dry-run=${dryRun}`);

  let processed = 0;
  await processInBatches(
    target,
    async ({ work, genre }) => {
      const m = await classifyOne(work, genre, dryRun);
      if (m) {
        out.byNcode[work.ncode] = m;
        processed++;
        if (processed % 10 === 0) {
          console.log(`[reverse-map] ${processed}/${target.length} 完了`);
          if (!dryRun) saveOutput(out);
        }
      }
    },
    PARALLEL,
  );

  if (!dryRun) saveOutput(out);
  console.log(`[reverse-map] 完了。分類済み=${out.classified}件 出力=${OUTPUT_PATH}`);

  // 集計
  const counts: Record<string, number> = {};
  for (const m of Object.values(out.byNcode)) {
    counts[m.primaryDesire] = (counts[m.primaryDesire] ?? 0) + 1;
  }
  console.log("\n[reverse-map] 主感情欲求分布:");
  for (const [d, c] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${d}: ${c}`);
  }
}

main().catch((e) => {
  console.error("[reverse-map] fatal:", e);
  process.exit(1);
});
