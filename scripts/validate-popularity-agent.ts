/**
 * 人気予測エージェントの検証実験
 *
 * crawled/の実在人気作品に対してpopularity analyzerを実行し、
 * エージェントのスコアと実際の人気指標（globalPoint, bookmarks）の
 * 相関を検証する。
 *
 * 実行: npx tsx scripts/validate-popularity-agent.ts
 */

import * as fs from "fs";
import * as path from "path";

// --- analyzerを直接importできないのでロジックを埋め込む ---
// (Next.jsの@エイリアスが使えないため、analyzerのコア部分を移植)

// 文分割
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[。！？!?])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n|\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function extractDialogue(text: string): string[] {
  return text.match(/「[^」]*」/g) || [];
}

function extractInnerMonologue(text: string): string[] {
  return text.match(/（[^）]*）/g) || [];
}

// 感情語彙
const EMOTION_WORDS = [
  "嬉しい", "嬉し", "喜び", "喜ん", "幸せ", "楽しい", "楽し",
  "好き", "愛し", "感動", "感激", "ときめ", "ドキドキ", "わくわく",
  "安心", "安堵", "ほっと", "微笑", "笑顔", "笑い", "笑っ",
  "悲しい", "悲し", "悲しみ", "泣い", "泣き", "涙", "辛い", "辛く",
  "苦しい", "苦し", "痛い", "痛み", "怖い", "恐ろし", "恐怖",
  "不安", "心配", "焦り", "焦っ", "怒り", "怒っ", "憎い", "憎し",
  "悔し", "惨め", "絶望", "寂し", "孤独",
  "驚い", "驚き", "衝撃", "信じられ", "まさか", "呆然",
  "緊張", "震え", "戦慄", "息を呑", "固まっ", "凍りつ",
];

const SENSORY_WORDS = {
  visual: ["見え", "見つめ", "眺め", "映っ", "輝い", "光", "色", "赤い", "青い", "白い", "黒い", "暗い", "明るい", "煌めき", "瞳", "目", "景色", "姿", "影", "闇", "鮮やか"],
  auditory: ["聞こえ", "聴こえ", "響い", "音", "声", "叫び", "囁い", "静か", "沈黙", "ざわめき", "足音", "鳴っ", "鳴り"],
  tactile: ["触れ", "触っ", "肌", "温かい", "温もり", "冷たい", "熱い", "柔らか", "硬い", "痛い", "震え", "撫で", "握っ", "抱き"],
  olfactory: ["匂い", "匂っ", "香り", "香っ", "臭い", "臭っ", "芳し"],
  gustatory: ["味", "甘い", "苦い", "酸っぱい", "辛い", "美味し", "不味い"],
};

// --- 特徴量抽出 ---

interface TextFeatures {
  charCount: number;
  sentenceCount: number;
  paragraphCount: number;
  avgSentenceLength: number;
  sentenceLengthCV: number;
  dialogueRatio: number;
  innerMonologueRatio: number;
  shortSentenceRatio: number; // 20字以下
  emotionDensity: number; // 100文字あたり
  sensoryCount: number; // 使用された感覚の種類数（0-5）
  questionRatio: number; // 疑問文の割合
  exclamationRatio: number; // 感嘆文の割合
  openingHasHook: boolean; // 冒頭3文に疑問/感嘆/短文があるか
  endingHasTension: boolean; // 末尾に引きがあるか
  burstRatio: number; // 隣接文の文長差分の平均 / 平均文長
}

function extractFeatures(text: string): TextFeatures {
  const sentences = splitSentences(text);
  const paragraphs = splitParagraphs(text);
  const dialogues = extractDialogue(text);
  const monologues = extractInnerMonologue(text);

  const charCount = text.replace(/\s/g, "").length;
  const sentenceCount = sentences.length;
  const paragraphCount = paragraphs.length;

  // 文長統計
  const lengths = sentences.map((s) => s.length);
  const avgLen = lengths.length > 0 ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;
  const stdDev = lengths.length > 1
    ? Math.sqrt(lengths.reduce((acc, l) => acc + (l - avgLen) ** 2, 0) / lengths.length)
    : 0;
  const sentenceLengthCV = avgLen > 0 ? stdDev / avgLen : 0;

  // 会話・独白比率
  const dialogueChars = dialogues.join("").length;
  const monologueChars = monologues.join("").length;
  const dialogueRatio = charCount > 0 ? dialogueChars / charCount : 0;
  const innerMonologueRatio = charCount > 0 ? monologueChars / charCount : 0;

  // 短文率
  const shortSentenceRatio = lengths.length > 0
    ? lengths.filter((l) => l <= 20).length / lengths.length
    : 0;

  // 感情語密度
  const emotionCount = EMOTION_WORDS.filter((w) => text.includes(w)).length;
  const emotionDensity = charCount > 0 ? (emotionCount / charCount) * 100 : 0;

  // 五感
  const sensoryCount = Object.values(SENSORY_WORDS).filter(
    (words) => words.some((w) => text.includes(w))
  ).length;

  // 疑問・感嘆
  const questionRatio = sentenceCount > 0
    ? sentences.filter((s) => s.includes("？") || s.includes("?")).length / sentenceCount
    : 0;
  const exclamationRatio = sentenceCount > 0
    ? sentences.filter((s) => s.includes("！") || s.includes("!")).length / sentenceCount
    : 0;

  // 冒頭フック
  const opening = sentences.slice(0, 3);
  const openingHasHook = opening.some(
    (s) => s.includes("？") || s.includes("！") || s.length <= 20
  );

  // 末尾引き
  const lastSentences = sentences.slice(-3);
  const tensionWords = ["しかし", "だが", "けれど", "ところが", "その時", "まさか", "突然", "不意に", "……", "――"];
  const endingHasTension = lastSentences.some(
    (s) => tensionWords.some((w) => s.includes(w)) || s.includes("？")
  );

  // バースト比
  let burstRatio = 0;
  if (lengths.length > 1) {
    const diffs = [];
    for (let i = 1; i < lengths.length; i++) {
      diffs.push(Math.abs(lengths[i] - lengths[i - 1]));
    }
    const meanDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    burstRatio = avgLen > 0 ? meanDiff / avgLen : 0;
  }

  return {
    charCount,
    sentenceCount,
    paragraphCount,
    avgSentenceLength: Math.round(avgLen * 10) / 10,
    sentenceLengthCV: Math.round(sentenceLengthCV * 1000) / 1000,
    dialogueRatio: Math.round(dialogueRatio * 1000) / 1000,
    innerMonologueRatio: Math.round(innerMonologueRatio * 1000) / 1000,
    shortSentenceRatio: Math.round(shortSentenceRatio * 1000) / 1000,
    emotionDensity: Math.round(emotionDensity * 1000) / 1000,
    sensoryCount,
    questionRatio: Math.round(questionRatio * 1000) / 1000,
    exclamationRatio: Math.round(exclamationRatio * 1000) / 1000,
    openingHasHook,
    endingHasTension,
    burstRatio: Math.round(burstRatio * 1000) / 1000,
  };
}

// --- メイン ---

interface WorkMeta {
  ncode: string;
  title: string;
  globalPoint: number;
  bookmarks: number;
  tier: string;
}

interface EpisodeResult {
  ncode: string;
  episode: number;
  features: TextFeatures;
}

function main() {
  const dataDir = path.resolve(__dirname, "../data");
  const crawledDir = path.join(dataDir, "crawled");
  const targetsFile = path.join(dataDir, "targets/stratified_all.json");

  // 作品メタデータ読み込み
  const targets: WorkMeta[] = JSON.parse(fs.readFileSync(targetsFile, "utf-8"));
  const metaMap = new Map<string, WorkMeta>();
  for (const t of targets) {
    metaMap.set(t.ncode, t);
  }

  // クロール済みエピソードを全分析
  const results: (EpisodeResult & { title: string; globalPoint: number; bookmarks: number; tier: string })[] = [];

  const crawlLog = JSON.parse(fs.readFileSync(path.join(crawledDir, "_crawl_log.json"), "utf-8"));

  for (const [ncode, log] of Object.entries(crawlLog) as [string, { episodes: number }][]) {
    if (!log.episodes) continue;
    const meta = metaMap.get(ncode);
    if (!meta) continue;

    const workDir = path.join(crawledDir, ncode);

    for (let ep = 1; ep <= log.episodes; ep++) {
      const epFile = path.join(workDir, `ep${String(ep).padStart(4, "0")}.json`);
      if (!fs.existsSync(epFile)) continue;

      const epData = JSON.parse(fs.readFileSync(epFile, "utf-8"));
      const text = epData.bodyText;

      // テキストが短すぎるもの（作者コメント等）はスキップ
      if (!text || text.length < 500) {
        continue;
      }

      const features = extractFeatures(text);

      results.push({
        ncode,
        episode: ep,
        features,
        title: meta.title.slice(0, 25),
        globalPoint: meta.globalPoint,
        bookmarks: meta.bookmarks,
        tier: meta.tier,
      });
    }
  }

  console.log(`\n=== 人気予測エージェント検証実験 ===`);
  console.log(`分析対象: ${results.length}話（${new Set(results.map((r) => r.ncode)).size}作品）\n`);

  // --- 作品別の平均特徴量 ---
  const workAverages = new Map<string, { features: TextFeatures; count: number; globalPoint: number; bookmarks: number; title: string }>();

  for (const r of results) {
    const existing = workAverages.get(r.ncode);
    if (!existing) {
      workAverages.set(r.ncode, { features: { ...r.features }, count: 1, globalPoint: r.globalPoint, bookmarks: r.bookmarks, title: r.title });
    } else {
      // 各数値フィールドを加算
      for (const key of Object.keys(r.features) as (keyof TextFeatures)[]) {
        const val = r.features[key];
        if (typeof val === "number") {
          (existing.features[key] as number) += val;
        }
      }
      existing.count++;
    }
  }

  // 平均化
  const workStats: {
    ncode: string;
    title: string;
    globalPoint: number;
    bookmarks: number;
    avgSentenceLength: number;
    sentenceLengthCV: number;
    dialogueRatio: number;
    innerMonologueRatio: number;
    shortSentenceRatio: number;
    emotionDensity: number;
    sensoryCount: number;
    burstRatio: number;
    questionRatio: number;
    exclamationRatio: number;
    episodes: number;
  }[] = [];

  for (const [ncode, data] of workAverages) {
    const f = data.features;
    const n = data.count;
    workStats.push({
      ncode,
      title: data.title,
      globalPoint: data.globalPoint,
      bookmarks: data.bookmarks,
      avgSentenceLength: Math.round((f.avgSentenceLength / n) * 10) / 10,
      sentenceLengthCV: Math.round((f.sentenceLengthCV / n) * 1000) / 1000,
      dialogueRatio: Math.round((f.dialogueRatio / n) * 1000) / 1000,
      innerMonologueRatio: Math.round((f.innerMonologueRatio / n) * 1000) / 1000,
      shortSentenceRatio: Math.round((f.shortSentenceRatio / n) * 1000) / 1000,
      emotionDensity: Math.round((f.emotionDensity / n) * 1000) / 1000,
      sensoryCount: Math.round((f.sensoryCount / n) * 10) / 10,
      burstRatio: Math.round((f.burstRatio / n) * 1000) / 1000,
      questionRatio: Math.round((f.questionRatio / n) * 1000) / 1000,
      exclamationRatio: Math.round((f.exclamationRatio / n) * 1000) / 1000,
      episodes: n,
    });
  }

  // globalPoint降順でソート
  workStats.sort((a, b) => b.globalPoint - a.globalPoint);

  console.log("=== 作品別特徴量（globalPoint降順） ===\n");
  console.log("作品名\t\t\t\tgP\tBM\t文長\tCV\t会話率\t独白率\t短文率\t感情\t五感\tバースト\t疑問率\t感嘆率\tep数");
  for (const w of workStats) {
    console.log(
      `${w.title.padEnd(20)}\t${w.globalPoint}\t${w.bookmarks}\t${w.avgSentenceLength}\t${w.sentenceLengthCV}\t${w.dialogueRatio}\t${w.innerMonologueRatio}\t${w.shortSentenceRatio}\t${w.emotionDensity}\t${w.sensoryCount}\t${w.burstRatio}\t\t${w.questionRatio}\t${w.exclamationRatio}\t${w.episodes}`
    );
  }

  // --- 相関分析（簡易版: スピアマンの順位相関） ---
  console.log("\n=== globalPointとの相関分析（スピアマン順位相関） ===\n");

  const featureNames = [
    "avgSentenceLength", "sentenceLengthCV", "dialogueRatio",
    "innerMonologueRatio", "shortSentenceRatio", "emotionDensity",
    "sensoryCount", "burstRatio", "questionRatio", "exclamationRatio",
  ] as const;

  const featureLabels: Record<string, string> = {
    avgSentenceLength: "平均文長",
    sentenceLengthCV: "文長CV",
    dialogueRatio: "会話率",
    innerMonologueRatio: "独白率",
    shortSentenceRatio: "短文率",
    emotionDensity: "感情密度",
    sensoryCount: "五感種数",
    burstRatio: "バースト比",
    questionRatio: "疑問率",
    exclamationRatio: "感嘆率",
  };

  // スピアマン順位相関
  function spearman(x: number[], y: number[]): number {
    const n = x.length;
    if (n < 3) return 0;

    function rank(arr: number[]): number[] {
      const sorted = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
      const ranks = new Array(n);
      for (let i = 0; i < n; i++) {
        ranks[sorted[i].i] = i + 1;
      }
      return ranks;
    }

    const rx = rank(x);
    const ry = rank(y);

    let dSquaredSum = 0;
    for (let i = 0; i < n; i++) {
      dSquaredSum += (rx[i] - ry[i]) ** 2;
    }

    return 1 - (6 * dSquaredSum) / (n * (n * n - 1));
  }

  const gps = workStats.map((w) => w.globalPoint);
  const bms = workStats.map((w) => w.bookmarks);

  console.log("特徴量\t\tvs globalPoint\tvs bookmarks\t解釈");
  for (const name of featureNames) {
    const values = workStats.map((w) => w[name] as number);
    const corrGP = Math.round(spearman(values, gps) * 1000) / 1000;
    const corrBM = Math.round(spearman(values, bms) * 1000) / 1000;

    let interpretation = "";
    const absCorr = Math.abs(corrGP);
    if (absCorr >= 0.7) interpretation = corrGP > 0 ? "強い正の相関" : "強い負の相関";
    else if (absCorr >= 0.4) interpretation = corrGP > 0 ? "中程度の正の相関" : "中程度の負の相関";
    else if (absCorr >= 0.2) interpretation = "弱い相関";
    else interpretation = "相関なし";

    console.log(`${featureLabels[name].padEnd(10)}\t${corrGP}\t\t${corrBM}\t\t${interpretation}`);
  }

  // --- 全話の特徴量もJSON出力 ---
  const outputPath = path.join(dataDir, "experiments");
  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath, { recursive: true });
  }

  const outputFile = path.join(outputPath, "popularity-validation.json");
  fs.writeFileSync(
    outputFile,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        summary: {
          totalEpisodes: results.length,
          totalWorks: workStats.length,
          tiers: [...new Set(results.map((r) => r.tier))],
        },
        workAverages: workStats,
        episodes: results.map((r) => ({
          ncode: r.ncode,
          episode: r.episode,
          globalPoint: r.globalPoint,
          tier: r.tier,
          ...r.features,
        })),
      },
      null,
      2
    )
  );

  console.log(`\n詳細データ: ${outputFile}`);

  // --- 限界の指摘 ---
  console.log("\n=== 注意事項 ===");
  console.log(`- 全${results.length}話が「top tier」のみ。tier間比較ができない`);
  console.log("- top tier内の順位相関は、全体の予測力とは異なる");
  console.log("- mid/bottom tierをクロールして再実験が必要");
  console.log("- 各作品の冒頭10話のみの分析（作品全体の代表性は限定的）");
}

main();
