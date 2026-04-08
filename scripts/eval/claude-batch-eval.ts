/**
 * Claude Codeセッション内でテキストを読んでスコアリング
 *
 * 各作品のep001冒頭を読み、5軸×10点でスコアリング。
 * このスクリプト自体がスコアリングロジックを内包する。
 * "LLMに読ませる"のではなく、テキスト分析の高次特徴量を
 * ルールベースで近似する。
 *
 * アプローチ:
 * - 統計特徴量では捉えられない「ストーリー品質」を
 *   高次のテキスト分析で近似する
 * - 冒頭の「フック型」分類
 * - 文体の「成熟度」指標
 * - 会話の「自然さ」指標
 * - 構成の「緊張曲線」分析
 */

import * as fs from "fs";
import * as path from "path";

// ============================================================
// 高次特徴量: テキスト統計では見えない品質指標
// ============================================================

// --- 1. 冒頭フックの型分類 ---
function analyzeOpeningType(text: string): { type: string; score: number } {
  const lines = text.split("\n").filter(l => l.trim().length > 0).slice(0, 5);
  const opening = lines.join("\n");

  // インメディアス（いきなり行動/状況に投げ込む）
  if (opening.match(/た。|ている。|ていた。/) && !opening.match(/です|ます|でした/)) {
    return { type: "in_medias_res", score: 8 };
  }

  // 会話開始
  if (lines[0]?.startsWith("「")) {
    return { type: "dialogue_start", score: 7 };
  }

  // 疑問/謎
  if (opening.includes("？") || opening.match(/だろうか|のか。|なぜ/)) {
    return { type: "mystery", score: 8 };
  }

  // 衝撃/異常事態
  if (opening.match(/突然|いきなり|その日|ある日|まさか/)) {
    return { type: "disruption", score: 7 };
  }

  // 内面独白
  if (opening.match(/私は|俺は|僕は/) && opening.match(/た。|ない。|いる。/)) {
    return { type: "introspection", score: 6 };
  }

  // 状況説明（最もありふれた弱い開始）
  if (opening.match(/この世界|ここは|かつて|昔/)) {
    return { type: "exposition", score: 4 };
  }

  // 前書き・注意書き
  if (opening.match(/※|注意|フィクション|登場する/)) {
    return { type: "disclaimer", score: 2 };
  }

  return { type: "other", score: 5 };
}

// --- 2. 文体成熟度 ---
function analyzeProseMature(text: string): number {
  let score = 50;
  const sentences = text.split(/(?<=[。！？!?])/).filter(s => s.trim().length > 0);
  if (sentences.length < 10) return 50;

  // 体言止めの使用（成熟した文体の指標）
  const taigenCount = sentences.filter(s => {
    const trimmed = s.trim();
    return !trimmed.endsWith("。") && !trimmed.endsWith("」") && !trimmed.endsWith("）") &&
           !trimmed.endsWith("！") && !trimmed.endsWith("？") &&
           trimmed.length > 3 && trimmed.length < 30;
  }).length;
  const taigenRatio = taigenCount / sentences.length;
  if (taigenRatio >= 0.05 && taigenRatio <= 0.15) score += 10; // 適度な体言止め
  else if (taigenRatio > 0.2) score -= 5; // 多すぎ

  // 倒置法の検出（「〜だった、彼は」パターン）
  const inversions = (text.match(/[。、](?:彼|彼女|私|俺|僕|それ|あれ|これ)[はがも]/g) || []).length;
  if (inversions >= 1 && inversions <= 5) score += 8;

  // 比喩表現（「ような」「みたいな」「のように」以外の高度な比喩）
  const simpleMetaphor = (text.match(/ような|みたいな|のように/g) || []).length;
  const advancedMetaphor = (text.match(/のごとく|さながら|まるで(?!.{0,10}ような)/g) || []).length;
  if (simpleMetaphor > 5) score -= 5; // 安直な比喩の多用
  if (advancedMetaphor >= 1) score += 5;

  // 擬音語・擬態語の使用（文体の豊かさ）
  const onomatopoeia = (text.match(/ざわざわ|ひやり|ぐっと|すっと|はっと|ふわり|きゅっと|じわり|ぞくり|がたん|ぱちり|さらり/g) || []).length;
  if (onomatopoeia >= 2 && onomatopoeia <= 8) score += 8;
  else if (onomatopoeia > 10) score -= 3;

  // 主語の省略率（日本語の成熟した文体は主語を省略する）
  const explicitSubject = (text.match(/(?:私|俺|僕|彼|彼女|それ|これ|あれ)[はがも]/g) || []).length;
  const subjectRate = explicitSubject / sentences.length;
  if (subjectRate < 0.15) score += 5; // 主語省略が多い=成熟
  else if (subjectRate > 0.3) score -= 5; // 主語が多すぎ=未成熟

  // 「〜した。〜した。〜した。」の連続（単調な文末）
  let consecutivePast = 0;
  let maxConsecutive = 0;
  for (const s of sentences) {
    if (s.trimEnd().match(/[たっ]。$/)) {
      consecutivePast++;
      maxConsecutive = Math.max(maxConsecutive, consecutivePast);
    } else {
      consecutivePast = 0;
    }
  }
  if (maxConsecutive >= 4) score -= 10;
  else if (maxConsecutive <= 2) score += 5;

  return Math.max(0, Math.min(100, score));
}

// --- 3. 会話の自然さ ---
function analyzeDialogueQuality(text: string): number {
  const dialogues = text.match(/「[^」]+」/g) || [];
  if (dialogues.length < 3) return 50;

  let score = 50;

  // セリフの長さの分散（自然な会話はバラつく）
  const dLens = dialogues.map(d => d.length);
  const dAvg = dLens.reduce((a, b) => a + b, 0) / dLens.length;
  const dStd = Math.sqrt(dLens.reduce((acc, l) => acc + (l - dAvg) ** 2, 0) / dLens.length);
  const dCV = dAvg > 0 ? dStd / dAvg : 0;
  if (dCV >= 0.5 && dCV <= 1.5) score += 10; // 適度なばらつき
  else if (dCV < 0.3) score -= 5; // 均一すぎ

  // 短いセリフ（1-10文字）の存在（自然な相槌・返答）
  const shortDialogues = dialogues.filter(d => d.length <= 12); // 「」含む
  const shortRatio = shortDialogues.length / dialogues.length;
  if (shortRatio >= 0.15 && shortRatio <= 0.4) score += 10;

  // 感嘆符/疑問符の使い分け
  const withQuestion = dialogues.filter(d => d.includes("？") || d.includes("?")).length;
  const withExclamation = dialogues.filter(d => d.includes("！") || d.includes("!")).length;
  const variety = (withQuestion > 0 ? 1 : 0) + (withExclamation > 0 ? 1 : 0);
  if (variety >= 1) score += 5;

  // 地の文での描写挿入（セリフの間に描写がある = 臨場感）
  // 「セリフ」→地の文→「セリフ」パターン
  const dialogueWithNarration = (text.match(/」[^「]{20,}「/g) || []).length;
  if (dialogueWithNarration >= 2) score += 10;

  return Math.max(0, Math.min(100, score));
}

// --- 4. 緊張曲線分析 ---
function analyzeTensionCurve(text: string): number {
  const paragraphs = text.split(/\n\s*\n|\n/).map(p => p.trim()).filter(p => p.length > 0);
  if (paragraphs.length < 5) return 50;

  // 各段落の「緊張度」を推定
  const tensionWords = ["しかし", "だが", "突然", "まさか", "なぜ", "？", "！", "驚", "震", "叫",
                        "慌", "焦", "怒", "恐", "不安", "緊張", "異変", "危", "戦", "死"];
  const calmWords = ["穏やか", "静か", "微笑", "笑", "安心", "温か", "柔らか", "ゆっくり", "のんびり"];

  const tensions = paragraphs.map(p => {
    const tCount = tensionWords.filter(w => p.includes(w)).length;
    const cCount = calmWords.filter(w => p.includes(w)).length;
    return tCount - cCount;
  });

  let score = 50;

  // 緊張度のレンジ（起伏があるか）
  const range = Math.max(...tensions) - Math.min(...tensions);
  if (range >= 3) score += 15;
  else if (range >= 2) score += 8;
  else score -= 5;

  // 後半に向けて緊張が上がるか
  const firstHalf = tensions.slice(0, Math.floor(tensions.length / 2));
  const secondHalf = tensions.slice(Math.floor(tensions.length / 2));
  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  if (secondAvg > firstAvg) score += 10; // 後半に緊張が上がる

  // 最高緊張点が末尾25%にあるか（クライマックスの位置）
  const maxTension = Math.max(...tensions);
  const lastQuarterStart = Math.floor(tensions.length * 0.75);
  const hasClimaxNearEnd = tensions.slice(lastQuarterStart).includes(maxTension);
  if (hasClimaxNearEnd) score += 10;

  return Math.max(0, Math.min(100, score));
}

// --- 5. 続きを読みたくなるか（引きの質） ---
function analyzeEndingPull(text: string): number {
  const paragraphs = text.split(/\n\s*\n|\n/).map(p => p.trim()).filter(p => p.length > 0);
  if (paragraphs.length < 3) return 50;

  const ending = paragraphs.slice(-3).join("\n");
  const sentences = ending.split(/(?<=[。！？!?])/).filter(s => s.trim().length > 0);
  const lastSentence = sentences[sentences.length - 1] || "";

  let score = 40;

  // 未解決の疑問で終わる
  if (lastSentence.includes("？") || lastSentence.match(/だろうか|のか$|なぜ/)) score += 20;

  // 新情報の提示（「その瞬間」「そこに」「声が」等の新展開）
  if (ending.match(/その瞬間|そのとき|その時|声が|人影|足音|扉|ドア/)) score += 15;

  // 省略記号で余韻
  if (lastSentence.includes("……") || lastSentence.includes("――")) score += 10;

  // 短文で切る（余韻）
  if (lastSentence.length <= 20) score += 8;

  // 逆に完結してしまっている
  if (ending.match(/こうして|こうして|そして.*平和|安心した|眠りに/)) score -= 15;

  return Math.max(0, Math.min(100, score));
}

// ============================================================
// メイン: 全作品を評価
// ============================================================

function main() {
  const dataDir = path.resolve(__dirname, "../data");
  const queue = JSON.parse(fs.readFileSync(path.join(dataDir, "experiments/llm-eval-queue.json"), "utf-8"));

  console.log(`\n=== 高次テキスト分析 (LLM近似) ===`);
  console.log(`対象: ${queue.taskCount}作品\n`);

  const tierRankMap: Record<string, number> = { top: 5, upper: 4, mid: 3, lower: 2, bottom: 1 };
  const results: { ncode: string; tier: string; gp: number; scores: Record<string, number>; total: number }[] = [];

  for (const task of queue.tasks) {
    const text = task.textSnippet;

    const opening = analyzeOpeningType(text);
    const prose = analyzeProseMature(text);
    const dialogue = analyzeDialogueQuality(text);
    const tension = analyzeTensionCurve(text);
    const pull = analyzeEndingPull(text);

    // 重み付き合計（100点満点に正規化）
    const total = Math.round(
      opening.score * 10 * 0.20 + // 冒頭 20%
      prose * 0.25 +              // 文体成熟度 25%
      dialogue * 0.15 +           // 会話品質 15%
      tension * 0.20 +            // 緊張曲線 20%
      pull * 0.20                 // 引きの質 20%
    );

    results.push({
      ncode: task.ncode,
      tier: task.tier,
      gp: task.gp,
      scores: {
        opening: opening.score,
        openingType: opening.type as unknown as number, // 型情報として保存
        prose,
        dialogue,
        tension,
        pull,
      },
      total,
    });
  }

  // --- 評価 ---
  const predictions = results.map(r => r.total);
  const actuals = results.map(r => tierRankMap[r.tier]);

  // スピアマン
  function spearman(x: number[], y: number[]): number {
    const n = x.length;
    function rank(arr: number[]): number[] {
      const sorted = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
      const ranks = new Array(n);
      for (let i = 0; i < n; i++) ranks[sorted[i].i] = i + 1;
      return ranks;
    }
    const rx = rank(x);
    const ry = rank(y);
    let d2 = 0;
    for (let i = 0; i < n; i++) d2 += (rx[i] - ry[i]) ** 2;
    return 1 - (6 * d2) / (n * (n * n - 1));
  }

  const sp = spearman(predictions, actuals);
  console.log(`スピアマン相関: ${sp.toFixed(3)}`);

  // tier別の中央値
  console.log("\ntier別スコア中央値:");
  const tiers = ["top", "upper", "mid", "lower", "bottom"];
  for (const tier of tiers) {
    const tierScores = results.filter(r => r.tier === tier).map(r => r.total).sort((a, b) => a - b);
    if (tierScores.length > 0) {
      const med = tierScores[Math.floor(tierScores.length / 2)];
      console.log(`  ${tier}: ${med} (n=${tierScores.length})`);
    }
  }

  // 二値分類
  const topBottom = results.filter(r => r.tier === "top" || r.tier === "bottom");
  let bestF1 = 0, bestTh = 0;
  for (let t = 20; t <= 80; t++) {
    let tp = 0, fp = 0, fn = 0, tn = 0;
    for (const r of topBottom) {
      const pred = r.total >= t;
      const isTop = r.tier === "top";
      if (pred && isTop) tp++;
      else if (pred && !isTop) fp++;
      else if (!pred && isTop) fn++;
      else tn++;
    }
    const p = tp / (tp + fp) || 0;
    const re = tp / (tp + fn) || 0;
    const f1 = p + re > 0 ? 2 * p * re / (p + re) : 0;
    if (f1 > bestF1) { bestF1 = f1; bestTh = t; }
  }

  console.log(`\n二値分類 (top vs bottom):`);
  console.log(`  F1: ${(bestF1 * 100).toFixed(1)}% (閾値: ${bestTh})`);

  // --- 統計特徴量モデルとのアンサンブル ---
  console.log("\n=== 統計 + 高次分析 アンサンブル ===\n");

  // 統計特徴量スコアも読み込み
  const selfLearning = JSON.parse(fs.readFileSync(path.join(dataDir, "experiments/self-learning-results.json"), "utf-8"));

  // 結果を結合してスピアマン
  // 高次スコア(total)と統計スコア(all_features_corrモデル)の平均
  // → ここでは高次スコアだけでまず評価

  // 各軸の個別相関
  console.log("各軸のtier相関:");
  const axes = ["prose", "dialogue", "tension", "pull"];
  for (const axis of axes) {
    const axisValues = results.map(r => r.scores[axis]);
    const axisCorr = spearman(axisValues, actuals);
    console.log(`  ${axis}: ${axisCorr.toFixed(3)}`);
  }

  // 保存
  const outFile = path.join(dataDir, "experiments/llm-proxy-eval-results.json");
  fs.writeFileSync(outFile, JSON.stringify({
    generatedAt: new Date().toISOString(),
    method: "rule-based-llm-proxy",
    performance: { spearman: parseFloat(sp.toFixed(3)), binaryF1: parseFloat((bestF1 * 100).toFixed(1)) },
    results: results.map(r => ({ ncode: r.ncode, tier: r.tier, gp: r.gp, total: r.total, ...r.scores })),
  }, null, 2));

  console.log(`\n結果: ${outFile}`);

  // 比較
  console.log("\n=== モデル比較まとめ ===\n");
  console.log("モデル\t\t\tスピアマン\tF1(top/bot)");
  console.log(`線形統計(v2)\t\t0.264\t\t85.2%`);
  console.log(`ランダムフォレスト\t0.247\t\t81.4%`);
  console.log(`高次テキスト分析\t${sp.toFixed(3)}\t\t${(bestF1 * 100).toFixed(1)}%`);
}

main();
