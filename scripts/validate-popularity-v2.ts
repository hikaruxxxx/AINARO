/**
 * 人気予測エージェント検証実験 v2
 * 全tier（top/upper/mid/lower/bottom）の比較分析
 *
 * 検証する仮説:
 * 1. テキスト特徴量でtierを分離できるか（top vs bottom）
 * 2. どの特徴量が最も分離に寄与するか
 * 3. ジャンル別の差異はあるか
 *
 * 実行: npx tsx scripts/validate-popularity-v2.ts
 */

import * as fs from "fs";
import * as path from "path";

// --- 特徴量抽出 ---

interface TextFeatures {
  charCount: number;
  avgSentenceLength: number;
  sentenceLengthCV: number;
  dialogueRatio: number;
  innerMonologueRatio: number;
  shortSentenceRatio: number;
  emotionDensity: number;
  sensoryCount: number;
  questionRatio: number;
  exclamationRatio: number;
  burstRatio: number;
}

const EMOTION_WORDS = [
  "嬉しい", "嬉し", "喜び", "喜ん", "幸せ", "楽しい", "楽し",
  "好き", "愛し", "感動", "ときめ", "ドキドキ", "わくわく",
  "安心", "安堵", "ほっと", "微笑", "笑顔", "笑い", "笑っ",
  "悲しい", "悲し", "泣い", "泣き", "涙", "辛い",
  "苦しい", "苦し", "痛い", "怖い", "恐ろし", "恐怖",
  "不安", "心配", "焦り", "焦っ", "怒り", "怒っ",
  "悔し", "絶望", "寂し", "孤独",
  "驚い", "驚き", "まさか", "呆然",
  "緊張", "震え", "息を呑",
];

const SENSORY_WORDS: Record<string, string[]> = {
  visual: ["見え", "見つめ", "眺め", "輝い", "光", "色", "瞳", "目", "姿", "影", "闇"],
  auditory: ["聞こえ", "響い", "音", "声", "叫び", "囁い", "静か", "沈黙"],
  tactile: ["触れ", "肌", "温かい", "冷たい", "熱い", "柔らか", "握っ", "抱き"],
  olfactory: ["匂い", "香り"],
  gustatory: ["味", "甘い", "苦い"],
};

function extractFeatures(text: string): TextFeatures | null {
  if (!text || text.length < 300) return null;

  const sentences = text.split(/(?<=[。！？!?])/).map(s => s.trim()).filter(s => s.length > 0);
  if (sentences.length < 5) return null;

  const charCount = text.replace(/\s/g, "").length;
  const lengths = sentences.map(s => s.length);
  const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const stdDev = Math.sqrt(lengths.reduce((acc, l) => acc + (l - avgLen) ** 2, 0) / lengths.length);

  const dialogues = (text.match(/「[^」]*」/g) || []).join("").length;
  const monologues = (text.match(/（[^）]*）/g) || []).join("").length;

  const emotionCount = EMOTION_WORDS.filter(w => text.includes(w)).length;
  const sensoryCount = Object.values(SENSORY_WORDS).filter(words => words.some(w => text.includes(w))).length;

  const diffs: number[] = [];
  for (let i = 1; i < lengths.length; i++) diffs.push(Math.abs(lengths[i] - lengths[i - 1]));
  const meanDiff = diffs.length > 0 ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0;

  return {
    charCount,
    avgSentenceLength: Math.round(avgLen * 10) / 10,
    sentenceLengthCV: avgLen > 0 ? Math.round((stdDev / avgLen) * 1000) / 1000 : 0,
    dialogueRatio: charCount > 0 ? Math.round((dialogues / charCount) * 1000) / 1000 : 0,
    innerMonologueRatio: charCount > 0 ? Math.round((monologues / charCount) * 1000) / 1000 : 0,
    shortSentenceRatio: Math.round((lengths.filter(l => l <= 20).length / lengths.length) * 1000) / 1000,
    emotionDensity: charCount > 0 ? Math.round((emotionCount / charCount) * 100000) / 1000 : 0,
    sensoryCount,
    questionRatio: Math.round((sentences.filter(s => s.includes("？") || s.includes("?")).length / sentences.length) * 1000) / 1000,
    exclamationRatio: Math.round((sentences.filter(s => s.includes("！") || s.includes("!")).length / sentences.length) * 1000) / 1000,
    burstRatio: avgLen > 0 ? Math.round((meanDiff / avgLen) * 1000) / 1000 : 0,
  };
}

// --- 統計関数 ---

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// マン・ホイットニーU検定の近似（大標本）
function mannWhitneyEffect(group1: number[], group2: number[]): number {
  const n1 = group1.length;
  const n2 = group2.length;
  if (n1 < 3 || n2 < 3) return 0;

  // 全データをマージしてランク付け
  const all = [
    ...group1.map(v => ({ v, g: 1 })),
    ...group2.map(v => ({ v, g: 2 })),
  ].sort((a, b) => a.v - b.v);

  let r1 = 0;
  for (let i = 0; i < all.length; i++) {
    if (all[i].g === 1) r1 += i + 1;
  }

  const U = r1 - (n1 * (n1 + 1)) / 2;
  // 効果量 r = U / (n1 * n2) を 0-1 に正規化
  const effect = Math.abs(U / (n1 * n2) - 0.5) * 2;
  return Math.round(effect * 1000) / 1000;
}

// --- メイン ---

function main() {
  const dataDir = path.resolve(__dirname, "../data");
  const crawledDir = path.join(dataDir, "crawled");
  const targets = JSON.parse(fs.readFileSync(path.join(dataDir, "targets/stratified_all.json"), "utf-8"));
  const crawlLog = JSON.parse(fs.readFileSync(path.join(crawledDir, "_crawl_log.json"), "utf-8"));

  const tierMap: Record<string, { tier: string; gp: number; genre: string }> = {};
  for (const t of targets) {
    tierMap[t.ncode] = { tier: t.tier, gp: t.globalPoint, genre: t.searchGenre || t.genreName };
  }

  // 全エピソードの特徴量を抽出
  type WorkResult = { ncode: string; tier: string; gp: number; genre: string; features: TextFeatures };
  const workResults: WorkResult[] = [];

  for (const [ncode, log] of Object.entries(crawlLog) as [string, { episodes: number }][]) {
    if (!log.episodes) continue;
    const info = tierMap[ncode];
    if (!info) continue;

    const epFeatures: TextFeatures[] = [];
    for (let i = 1; i <= log.episodes; i++) {
      const f = path.join(crawledDir, ncode, `ep${String(i).padStart(4, "0")}.json`);
      if (!fs.existsSync(f)) continue;
      try {
        const ep = JSON.parse(fs.readFileSync(f, "utf-8"));
        const feat = extractFeatures(ep.bodyText);
        if (feat) epFeatures.push(feat);
      } catch { continue; }
    }

    if (epFeatures.length < 2) continue;

    // 作品単位の平均
    const avg: TextFeatures = { charCount: 0, avgSentenceLength: 0, sentenceLengthCV: 0, dialogueRatio: 0, innerMonologueRatio: 0, shortSentenceRatio: 0, emotionDensity: 0, sensoryCount: 0, questionRatio: 0, exclamationRatio: 0, burstRatio: 0 };
    for (const f of epFeatures) {
      for (const k of Object.keys(avg) as (keyof TextFeatures)[]) {
        (avg[k] as number) += f[k] as number;
      }
    }
    for (const k of Object.keys(avg) as (keyof TextFeatures)[]) {
      (avg[k] as number) = Math.round(((avg[k] as number) / epFeatures.length) * 1000) / 1000;
    }

    workResults.push({ ncode, tier: info.tier, gp: info.gp, genre: info.genre, features: avg });
  }

  console.log(`\n=== 人気予測エージェント検証実験 v2 ===`);
  console.log(`分析対象: ${workResults.length}作品\n`);

  // --- tier別の特徴量分布 ---
  const tiers = ["top", "upper", "mid", "lower", "bottom"];
  const featureNames: (keyof TextFeatures)[] = [
    "avgSentenceLength", "sentenceLengthCV", "dialogueRatio",
    "shortSentenceRatio", "emotionDensity", "sensoryCount",
    "questionRatio", "exclamationRatio", "burstRatio",
  ];
  const labels: Record<string, string> = {
    avgSentenceLength: "平均文長",
    sentenceLengthCV: "文長CV",
    dialogueRatio: "会話率",
    shortSentenceRatio: "短文率",
    emotionDensity: "感情密度",
    sensoryCount: "五感種数",
    questionRatio: "疑問率",
    exclamationRatio: "感嘆率",
    burstRatio: "バースト比",
  };

  console.log("=== tier別 特徴量中央値 ===\n");
  console.log("特徴量\t\t" + tiers.join("\t"));

  for (const feat of featureNames) {
    const values = tiers.map(tier => {
      const works = workResults.filter(w => w.tier === tier);
      if (works.length === 0) return "-";
      return median(works.map(w => w.features[feat] as number)).toFixed(3);
    });
    console.log(`${labels[feat].padEnd(8)}\t${values.join("\t")}`);
  }

  // --- top vs bottom の効果量 ---
  console.log("\n=== top vs bottom 効果量（Mann-Whitney） ===\n");

  const topWorks = workResults.filter(w => w.tier === "top");
  const bottomWorks = workResults.filter(w => w.tier === "bottom");

  console.log(`top: ${topWorks.length}作品, bottom: ${bottomWorks.length}作品\n`);
  console.log("特徴量\t\ttop中央値\tbottom中央値\t効果量\t判定");

  const significantFeatures: { name: string; effect: number; direction: string }[] = [];

  for (const feat of featureNames) {
    const topValues = topWorks.map(w => w.features[feat] as number);
    const botValues = bottomWorks.map(w => w.features[feat] as number);
    const effect = mannWhitneyEffect(topValues, botValues);
    const topMed = median(topValues);
    const botMed = median(botValues);

    let judgment = "";
    if (effect >= 0.5) judgment = "★★★ 強い分離";
    else if (effect >= 0.3) judgment = "★★ 中程度";
    else if (effect >= 0.15) judgment = "★ 弱い";
    else judgment = "- 分離なし";

    const direction = topMed > botMed ? "top>bottom" : topMed < botMed ? "top<bottom" : "同等";

    if (effect >= 0.15) {
      significantFeatures.push({ name: labels[feat], effect, direction });
    }

    console.log(`${labels[feat].padEnd(8)}\t${topMed.toFixed(3)}\t\t${botMed.toFixed(3)}\t\t${effect.toFixed(3)}\t${judgment} (${direction})`);
  }

  // --- サマリー ---
  console.log("\n=== 結論 ===\n");

  if (significantFeatures.length === 0) {
    console.log("有意な分離を示す特徴量がない。現在の特徴量では人気予測が困難。");
  } else {
    console.log("人気作品（top）と不人気作品（bottom）を分離できる特徴量:\n");
    significantFeatures.sort((a, b) => b.effect - a.effect);
    for (const f of significantFeatures) {
      console.log(`  ${f.name}: 効果量${f.effect}（${f.direction}）`);
    }
  }

  console.log(`\n分析作品数: top=${topWorks.length}, bottom=${bottomWorks.length}`);
  if (bottomWorks.length < 10) {
    console.log("⚠ bottomサンプル数が少ない。結果の信頼性は限定的。");
  }

  // JSON出力
  const outputFile = path.join(dataDir, "experiments/popularity-validation-v2.json");
  fs.writeFileSync(outputFile, JSON.stringify({
    generatedAt: new Date().toISOString(),
    summary: { totalWorks: workResults.length, tiers: Object.fromEntries(tiers.map(t => [t, workResults.filter(w => w.tier === t).length])) },
    significantFeatures,
    workResults: workResults.map(w => ({ ncode: w.ncode, tier: w.tier, gp: w.gp, genre: w.genre, ...w.features })),
  }, null, 2));
  console.log(`\n詳細: ${outputFile}`);
}

main();
