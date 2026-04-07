/**
 * 表層特徴量の一括抽出スクリプト
 *
 * クロール済み全作品から21次元の表層特徴量を抽出し、
 * full-feature-extraction.json を更新する。
 *
 * 実行: npx tsx scripts/extract-surface-features.ts
 *       npx tsx scripts/extract-surface-features.ts --force  # 既存も再抽出
 */

import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.resolve(__dirname, "../data");
const CRAWLED_DIR = path.join(DATA_DIR, "crawled");
const OUTPUT_FILE = path.join(DATA_DIR, "experiments/full-feature-extraction.json");

// ============================================================
// ターゲットリスト読み込み（ncode → メタデータ）
// ============================================================

interface TargetMeta {
  gp: number;
  genre: string;
  totalEpisodes: number;
}

function loadTargets(): Map<string, TargetMeta> {
  const targets = new Map<string, TargetMeta>();

  const files = [
    "stratified_all.json",
    "paired_comparison.json",
    "narou_8k.json",
    "stratified_v2.json",
    "kakuyomu_stratified_v2.json",
    "alphapolis_stratified.json",
  ];

  for (const file of files) {
    const fp = path.join(DATA_DIR, "targets", file);
    if (!fs.existsSync(fp)) continue;
    const data = JSON.parse(fs.readFileSync(fp, "utf-8"));
    for (const t of data) {
      let nc = t.ncode || t.id;
      if (!nc) continue;

      // サイト別プレフィックス付与（クロールディレクトリと一致させる）
      const site = t.site || "";
      if (site === "kakuyomu" && !nc.startsWith("kakuyomu_")) {
        nc = `kakuyomu_${nc}`;
      } else if (site === "alphapolis" && !nc.startsWith("alphapolis_")) {
        nc = `alphapolis_${nc.replace("/", "_")}`;
      }

      if (targets.has(nc)) continue;
      targets.set(nc, {
        gp: t.globalPoint ?? t.gp ?? 0,
        genre: t.searchGenre ?? t.genre ?? "unknown",
        totalEpisodes: t.general_all_no ?? t.totalEpisodes ?? t.episodes ?? 0,
      });
    }
  }

  return targets;
}

// ============================================================
// 特徴量抽出（predict-pv.ts と同一ロジック）
// ============================================================

const POSITIVE_EMOTIONS = ["嬉しい", "嬉し", "喜び", "喜ん", "幸せ", "楽しい", "楽し", "好き", "愛し", "感動", "ときめ", "ドキドキ", "わくわく", "安心", "安堵", "ほっと", "微笑", "笑顔", "笑い", "笑っ"];
const NEGATIVE_EMOTIONS = ["悲しい", "悲し", "泣い", "泣き", "涙", "辛い", "苦しい", "苦し", "痛い", "怖い", "恐ろし", "恐怖", "不安", "心配", "焦り", "焦っ", "怒り", "怒っ", "悔し", "絶望", "寂し", "孤独"];
const CONJUNCTIONS = ["しかし", "そして", "また", "さらに", "そのため", "ところが", "けれど", "だが", "それでも", "つまり", "すると", "やがて", "それから", "だから"];

function r(v: number): number { return Math.round(v * 10000) / 10000; }

function extractFeatures(text: string): Record<string, number> | null {
  if (!text || text.length < 300) return null;
  const sentences = text.split(/(?<=[。！？!?])/).map(s => s.trim()).filter(s => s.length > 0);
  if (sentences.length < 5) return null;

  const paragraphs = text.split(/\n\s*\n|\n/).map(p => p.trim()).filter(p => p.length > 0);
  const chars = text.replace(/\s/g, "").length;
  const sLens = sentences.map(s => s.length);
  const sAvg = sLens.reduce((a, b) => a + b, 0) / sLens.length;
  const sStd = Math.sqrt(sLens.reduce((acc, l) => acc + (l - sAvg) ** 2, 0) / sLens.length);

  const pLens = paragraphs.map(p => p.length);
  const pAvg = pLens.reduce((a, b) => a + b, 0) / pLens.length;
  const pStd = Math.sqrt(pLens.reduce((acc, l) => acc + (l - pAvg) ** 2, 0) / pLens.length);

  const dialogues = text.match(/「[^」]*」/g) || [];
  const dChars = dialogues.join("").length;
  const monologues = text.match(/（[^）]*）/g) || [];
  const mChars = monologues.join("").length;

  const diffs: number[] = [];
  for (let i = 1; i < sLens.length; i++) diffs.push(Math.abs(sLens[i] - sLens[i - 1]));
  const meanDiff = diffs.length > 0 ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0;

  const posCount = POSITIVE_EMOTIONS.filter(w => text.includes(w)).length;
  const negCount = NEGATIVE_EMOTIONS.filter(w => text.includes(w)).length;
  const totalEmo = posCount + negCount;

  const kanji = text.match(/[\u4e00-\u9fff]/g) || [];
  const katakana = text.match(/[\u30a0-\u30ff]/g) || [];
  const hiragana = text.match(/[\u3040-\u309f]/g) || [];

  const commas = (text.match(/、/g) || []).length;
  const questions = sentences.filter(s => s.includes("？") || s.includes("?")).length;
  const exclamations = sentences.filter(s => s.includes("！") || s.includes("!")).length;

  const cleanChars = [...text.replace(/[\s\n\r、。！？!?「」『』（）\(\)・…―─ー]/g, "")];
  const bigrams = new Set<string>();
  for (let i = 0; i < cleanChars.length - 1; i++) bigrams.add(cleanChars[i] + cleanChars[i + 1]);

  const conjUsed = CONJUNCTIONS.reduce((acc, w) => acc + (text.match(new RegExp(w, "g"))?.length || 0), 0);

  return {
    avgSentenceLen: r(sAvg),
    sentenceLenCV: r(sAvg > 0 ? sStd / sAvg : 0),
    shortSentenceRatio: r(sLens.filter(l => l <= 20).length / sLens.length),
    longSentenceRatio: r(sLens.filter(l => l >= 50).length / sLens.length),
    medSentenceRatio: r(sLens.filter(l => l > 20 && l < 50).length / sLens.length),
    burstRatio: r(sAvg > 0 ? meanDiff / sAvg : 0),
    paragraphLenCV: r(pAvg > 0 ? pStd / pAvg : 0),
    avgParagraphLen: r(pAvg),
    dialogueRatio: r(chars > 0 ? dChars / chars : 0),
    innerMonologueRatio: r(chars > 0 ? mChars / chars : 0),
    narrativeRatio: r(chars > 0 ? (chars - dChars - mChars) / chars : 0),
    emotionDensity: r(chars > 0 ? totalEmo / (chars / 1000) : 0),
    uniqueEmotionRatio: r(totalEmo > 0 ? new Set([...POSITIVE_EMOTIONS.filter(w => text.includes(w)), ...NEGATIVE_EMOTIONS.filter(w => text.includes(w))]).size / totalEmo : 0),
    questionRatio: r(questions / sentences.length),
    exclamationRatio: r(exclamations / sentences.length),
    commaPerSentence: r(commas / sentences.length),
    bigramTTR: r(cleanChars.length > 1 ? bigrams.size / (cleanChars.length - 1) : 0),
    kanjiRatio: r(chars > 0 ? kanji.length / chars : 0),
    katakanaRatio: r(chars > 0 ? katakana.length / chars : 0),
    hiraganaRatio: r(chars > 0 ? hiragana.length / chars : 0),
    conjDensity: r(chars > 0 ? conjUsed / (chars / 1000) : 0),
  };
}

// ============================================================
// メイン
// ============================================================

function main() {
  const args = process.argv.slice(2);
  const forceAll = args.includes("--force");

  console.log("=== 表層特徴量 一括抽出 ===\n");

  // ターゲットメタデータ
  const targets = loadTargets();
  console.log(`ターゲットリスト: ${targets.size}作品`);

  // クロールログ読み込み
  const crawlLog: Record<string, { episodes?: number; status?: string }> = {};
  for (const logFile of ["_crawl_log.json", "_kakuyomu_crawl_log.json", "_alphapolis_crawl_log.json"]) {
    const fp = path.join(CRAWLED_DIR, logFile);
    if (!fs.existsSync(fp)) continue;
    const data = JSON.parse(fs.readFileSync(fp, "utf-8"));
    Object.assign(crawlLog, data);
  }
  console.log(`クロールログ: ${Object.keys(crawlLog).length}作品`);

  // クロールログにないがディレクトリが存在する作品も追加
  const crawledDirs = fs.readdirSync(CRAWLED_DIR).filter(d =>
    !d.startsWith("_") && fs.statSync(path.join(CRAWLED_DIR, d)).isDirectory()
  );
  let addedFromDir = 0;
  for (const dir of crawledDirs) {
    if (!crawlLog[dir]) {
      // エピソード数をディレクトリから推定
      const epFiles = fs.readdirSync(path.join(CRAWLED_DIR, dir)).filter(f => f.startsWith("ep") && f.endsWith(".json"));
      if (epFiles.length > 0) {
        crawlLog[dir] = { episodes: epFiles.length };
        addedFromDir++;
      }
    }
  }
  console.log(`ディレクトリ探索で追加: ${addedFromDir}作品 → 合計: ${Object.keys(crawlLog).length}作品`);

  // 既存データ読み込み
  interface ExistingResult {
    ncode: string;
    [key: string]: unknown;
  }
  const existingMap = new Map<string, ExistingResult>();
  if (!forceAll && fs.existsSync(OUTPUT_FILE)) {
    const existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf-8"));
    for (const r of existing.results) {
      existingMap.set(r.ncode, r);
    }
    console.log(`既存データ: ${existingMap.size}作品（スキップ対象）`);
  }

  // LLMスコア読み込み
  const llmScoresPath = path.join(DATA_DIR, "experiments/llm-feature-scores-v2-full.json");
  const llmByNcode = new Map<string, Record<string, number>>();
  if (fs.existsSync(llmScoresPath)) {
    const llmData = JSON.parse(fs.readFileSync(llmScoresPath, "utf-8"));
    for (const r of llmData.results) {
      llmByNcode.set(r.ncode, r.scores);
    }
    console.log(`LLMスコア: ${llmByNcode.size}作品`);
  }

  // あらすじスコア読み込み
  const synopsisPath = path.join(DATA_DIR, "experiments/synopsis-llm-scores.json");
  const synByNcode = new Map<string, Record<string, number>>();
  if (fs.existsSync(synopsisPath)) {
    const synData = JSON.parse(fs.readFileSync(synopsisPath, "utf-8"));
    const synResults = synData.results || synData;
    for (const r of (Array.isArray(synResults) ? synResults : [])) {
      if (r.ncode && r.scores) {
        synByNcode.set(r.ncode, r.scores);
      }
    }
    console.log(`あらすじスコア: ${synByNcode.size}作品`);
  }

  // 特徴量抽出
  const results: Record<string, unknown>[] = [];
  let extracted = 0;
  let skipped = 0;
  let failed = 0;

  const ncodes = Object.keys(crawlLog).filter(nc => {
    const ep1 = path.join(CRAWLED_DIR, nc, "ep0001.json");
    return fs.existsSync(ep1) && targets.has(nc);
  });

  console.log(`\n抽出対象: ${ncodes.length}作品\n`);

  for (const ncode of ncodes) {
    // 既存データがある場合はスキップ（ただし force 時は再抽出）
    if (!forceAll && existingMap.has(ncode)) {
      results.push(existingMap.get(ncode)!);
      skipped++;
      continue;
    }

    const meta = targets.get(ncode)!;

    // ディレクトリ内の全エピソードファイルを取得（上限なし）
    const epDir = path.join(CRAWLED_DIR, ncode);
    const epFiles = fs.readdirSync(epDir)
      .filter(f => f.startsWith("ep") && f.endsWith(".json"))
      .sort();

    // エピソードごとに特徴量を抽出して平均
    const epFeats: Record<string, number>[] = [];
    let totalChars = 0;
    let epCount = 0;

    for (const epFileName of epFiles) {
      const epFile = path.join(epDir, epFileName);
      if (!fs.existsSync(epFile)) continue;
      try {
        const ep = JSON.parse(fs.readFileSync(epFile, "utf-8"));
        if (!ep.bodyText) continue;
        totalChars += ep.bodyText.length;
        epCount++;
        const feat = extractFeatures(ep.bodyText);
        if (feat) epFeats.push(feat);
      } catch { continue; }
    }

    if (epFeats.length === 0) {
      failed++;
      continue;
    }

    // エピソード平均
    const avg: Record<string, number> = {};
    const keys = Object.keys(epFeats[0]);
    for (const k of keys) {
      avg[k] = r(epFeats.reduce((s, f) => s + f[k], 0) / epFeats.length);
    }

    // タイトル特徴量
    // （クロールデータにタイトルがあれば使用、なければ0）

    // LLMスコア
    const llm = llmByNcode.get(ncode);
    const hasLlmScores = !!llm;

    // あらすじスコア
    const syn = synByNcode.get(ncode);

    const result: Record<string, unknown> = {
      ncode,
      gp: meta.gp,
      genre: meta.genre,
      totalEpisodes: meta.totalEpisodes,
      titleLen: 0,
      titleHasBracket: 0,
      titleHasTemplateKw: 0,
      avgEpChars: epCount > 0 ? Math.round(totalChars / epCount) : 0,
      crawledEpCount: epCount,
      ...avg,
      // 追加統計
      charCount: totalChars,
      sentenceCount: 0, // 後方互換のため
      paragraphCount: 0,
      // あらすじスコア
      synopsis_concept: syn?.concept ?? 0,
      synopsis_hook: syn?.hook ?? 0,
      synopsis_differentiation: syn?.differentiation ?? 0,
      synopsis_appeal: syn?.appeal ?? 0,
      // LLMスコア
      llm_hook: llm?.hook ?? 0,
      llm_character: llm?.character ?? 0,
      llm_originality: llm?.originality ?? 0,
      llm_prose: llm?.prose ?? 0,
      llm_tension: llm?.tension ?? 0,
      llm_pull: llm?.pull ?? 0,
      hasLlmScores,
    };

    results.push(result);
    extracted++;

    if ((extracted + skipped) % 100 === 0) {
      console.log(`  [${extracted + skipped}/${ncodes.length}] 抽出: ${extracted}, スキップ: ${skipped}, 失敗: ${failed}`);
    }
  }

  console.log(`\n完了: 抽出 ${extracted}, スキップ ${skipped}, 失敗 ${failed}`);
  console.log(`合計: ${results.length}作品`);

  // 保存
  const output = {
    generatedAt: new Date().toISOString(),
    description: "表層特徴量21次元 + LLMスコア6次元 + あらすじスコア4次元（クロール済み全作品）",
    totalWorks: results.length,
    results,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\n保存: ${OUTPUT_FILE}`);

  // LLMスコア有無の統計
  const withLlm = results.filter(r => r.hasLlmScores).length;
  const withSyn = results.filter(r => (r.synopsis_concept as number) > 0).length;
  console.log(`  LLMスコアあり: ${withLlm}/${results.length}`);
  console.log(`  あらすじスコアあり: ${withSyn}/${results.length}`);
}

main();
