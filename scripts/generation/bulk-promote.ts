// L6完走作品をリーグ上位順に content/works/ へ一括昇格する
//
// 各作品について:
// 1. layer2(プロット) + layer3(あらすじ) + layer5(ep1) から
//    _settings.md, _style.md, synopsis.md を claude -p で一括生成
// 2. content/works/{slug}/ にファイル配置
// 3. work.json メタ作成
//
// 使い方:
//   npx tsx scripts/generation/bulk-promote.ts [--limit 50] [--dry-run]

import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync } from "fs";
import { join } from "path";
import { callClaudeCli, extractJsonBlock } from "../../src/lib/screening/claude-cli";
import { loadRatings } from "../../src/lib/screening/league";

const WORKS_DIR = "data/generation/works";
const CONTENT_DIR = "content/works";
const LEAGUES_DIR = "data/generation/leagues";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 50;

interface RankedWork {
  slug: string;
  genre: string;
  rating: number;
  matches: number;
}

function log(msg: string): void {
  console.log(`[bulk-promote] ${msg}`);
}

// L6完走 + リーグ登録済みの作品をレーティング順に取得
function getRankedL6Works(): RankedWork[] {
  const genres = readdirSync(LEAGUES_DIR).filter(
    (d) => existsSync(join(LEAGUES_DIR, d, "ratings.json")),
  );

  const allWorks: RankedWork[] = [];
  for (const genre of genres) {
    const file = loadRatings(genre);
    for (const [slug, entry] of Object.entries(file.entries)) {
      if (entry.layer !== 5) continue;
      // L6完走チェック
      if (!existsSync(join(WORKS_DIR, slug, "layer6_ep002.md"))) continue;
      // 既に content/works/ に存在するものはスキップ
      if (existsSync(join(CONTENT_DIR, slug))) continue;
      allWorks.push({ slug, genre, rating: entry.rating, matches: entry.matchCount });
    }
  }

  allWorks.sort((a, b) => b.rating - a.rating);
  return allWorks;
}

// 作品のレイヤーテキストを読む
function readLayerText(slug: string, filename: string): string {
  const path = join(WORKS_DIR, slug, filename);
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf-8");
}

// LLMで title + synopsis + 文体パラメータを取得し、settings/style はテンプレで組み立てる
async function generateMetaFiles(
  slug: string,
  genre: string,
  plot: string,
  synopsis: string,
  ep1: string,
): Promise<{ settings: string; style: string; synopsisText: string; title: string } | null> {

  const prompt = `あなたはWeb小説の編集者です。以下の作品情報を読み、JSONで回答してください。

## 作品情報
- slug: ${slug}
- ジャンル: ${genre}

### プロット骨格
${plot.slice(0, 2000)}

### あらすじ
${synopsis.slice(0, 1500)}

### ep1冒頭
${ep1.slice(0, 3000)}

## 出力（JSONのみ、説明不要）

\`\`\`json
{
  "title": "作品タイトル（日本語、20字以内）",
  "synopsis": "読者向けあらすじ（150-250字、ネタバレなし）",
  "world": "世界観の要点（100-200字）",
  "style_features": "ep1から読み取れる文体の特徴（100-200字）",
  "pov": "first_person または third_person",
  "tempo": "fast または medium または slow",
  "dialogue_ratio": 0.35,
  "humor_level": "low または medium または high"
}
\`\`\``;

  try {
    const raw = await callClaudeCli(prompt, {
      timeoutMs: 3 * 60 * 1000,
      layer: "bulk_promote",
      slug,
    });

    const parsed = extractJsonBlock(raw) as {
      title?: string;
      synopsis?: string;
      world?: string;
      style_features?: string;
      pov?: string;
      tempo?: string;
      dialogue_ratio?: number;
      humor_level?: string;
    } | null;

    if (!parsed || !parsed.title || !parsed.synopsis) {
      log(`  LLM応答のパース失敗: ${slug}`);
      return null;
    }

    const title = parsed.title;
    const synopsisText = parsed.synopsis;
    const world = parsed.world ?? "（未設定）";
    const pov = parsed.pov ?? "third_person";
    const tempo = parsed.tempo ?? "medium";
    const dialogueRatio = parsed.dialogue_ratio ?? 0.35;
    const humor = parsed.humor_level ?? "medium";
    const features = parsed.style_features ?? "";

    // テンプレートからsettings/styleを生成
    const settings = `# 作品設定：${title}

## 基本情報

- ジャンル: ${genre}
- 想定話数: 30話

## あらすじ

${synopsisText}

## 世界観

${world}`;

    const style = `# 文体プロファイル：${title}

## パラメータ

\`\`\`yaml
pov: ${pov}
tempo: ${tempo}
sentence_length_avg: ${tempo === "fast" ? 18 : tempo === "slow" ? 28 : 22}
dialogue_ratio: ${dialogueRatio.toFixed(2)}
inner_monologue_ratio: ${pov === "first_person" ? "0.30" : "0.15"}
description_density: ${tempo === "slow" ? "high" : "medium"}
humor_level: ${humor}
tension_curve: wave
vocabulary_level: ${humor === "high" ? "casual" : "standard"}
line_break_frequency: frequent
\`\`\`

## 文体の特徴

${features}`;

    return { title, synopsisText, settings, style };
  } catch (e) {
    log(`  LLM呼び出し失敗: ${slug}: ${e}`);
    return null;
  }
}

// content/works/{slug}/ にファイルを配置
function deployToContentWorks(
  slug: string,
  genre: string,
  rating: number,
  title: string,
  synopsisText: string,
  settings: string,
  style: string,
): void {
  const destDir = join(CONTENT_DIR, slug);
  mkdirSync(destDir, { recursive: true });

  // エピソードファイルをコピー
  const ep1Src = join(WORKS_DIR, slug, "layer5_ep001.md");
  const ep2Src = join(WORKS_DIR, slug, "layer6_ep002.md");
  const ep3Src = join(WORKS_DIR, slug, "layer6_ep003.md");

  if (existsSync(ep1Src)) cpSync(ep1Src, join(destDir, "ep001.md"));
  if (existsSync(ep2Src)) cpSync(ep2Src, join(destDir, "ep002.md"));
  if (existsSync(ep3Src)) cpSync(ep3Src, join(destDir, "ep003.md"));

  // メタファイル
  writeFileSync(join(destDir, "_settings.md"), settings);
  writeFileSync(join(destDir, "_style.md"), style);
  writeFileSync(join(destDir, "synopsis.md"), synopsisText);

  // work.json
  const workJson = {
    slug,
    title,
    genre,
    state: "ready_to_publish",
    episodes: 3,
    rating: Math.round(rating),
    createdAt: new Date().toISOString(),
    sourceDir: `data/generation/works/${slug}`,
  };
  writeFileSync(join(destDir, "work.json"), JSON.stringify(workJson, null, 2));
}

async function main(): Promise<void> {
  log(`開始 (limit=${limit}, dryRun=${dryRun})`);

  const ranked = getRankedL6Works();
  log(`L6完走・未昇格: ${ranked.length}件`);

  const targets = ranked.slice(0, limit);
  log(`対象: ${targets.length}件（レーティング上位）`);

  if (dryRun) {
    log("--- ドライラン: 対象一覧 ---");
    for (const w of targets) {
      log(`  ${w.slug} | ${w.genre} | rating=${w.rating.toFixed(0)}`);
    }
    return;
  }

  let success = 0;
  let failed = 0;

  for (let i = 0; i < targets.length; i++) {
    const w = targets[i];
    log(`[${i + 1}/${targets.length}] ${w.slug} (${w.genre}, rating=${w.rating.toFixed(0)})`);

    const plot = readLayerText(w.slug, "layer2_plot.md");
    const synopsis = readLayerText(w.slug, "layer3_synopsis.md");
    const ep1 = readLayerText(w.slug, "layer5_ep001.md");

    if (!ep1) {
      log(`  ep1なし、スキップ`);
      failed++;
      continue;
    }

    const meta = await generateMetaFiles(w.slug, w.genre, plot, synopsis, ep1);
    if (!meta) {
      failed++;
      continue;
    }

    deployToContentWorks(w.slug, w.genre, w.rating, meta.title, meta.synopsisText, meta.settings, meta.style);
    success++;
    log(`  → content/works/${w.slug}/ 昇格完了 (title: ${meta.title})`);
  }

  log(`=== 完了 ===`);
  log(`成功: ${success}件`);
  log(`失敗: ${failed}件`);
  log(`content/works/ 合計: ${readdirSync(CONTENT_DIR).filter((d) => existsSync(join(CONTENT_DIR, d, "ep001.md"))).length}件`);
}

main().catch((e) => {
  log(`fatal: ${e}`);
  process.exit(1);
});
