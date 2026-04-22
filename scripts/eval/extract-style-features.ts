// ジャンル別 prose 特徴量抽出
//
// 使い方: npx tsx scripts/eval/extract-style-features.ts <label> [top_n] [bottom_n]
//   label: stratified_all.jsonの searchGenre (例: ハイファンタジー)
//   top_n: top作品サンプル数 (default 10)
//   bottom_n: bottom作品サンプル数 (default 10)
//
// 出力: top/bottomそれぞれの実測値(中央値/四分位)とその差

import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

interface Work {
  ncode: string;
  tier: string;
  searchGenre?: string;
  globalPoint: number;
}

interface Features {
  chars: number;                  // 総文字数
  avgSentLen: number;             // 平均文長
  sentLenCV: number;              // 文長変動係数
  dialogueRatio: number;          // 会話比率(「」内文字数/全文)
  commaPerSent: number;           // 一文平均の読点
  shortSentRatio: number;         // 短文(<15字)比率
  longSentRatio: number;          // 長文(>50字)比率
  sensoryDensity: number;         // 感覚語/1000字
  monologueRatio: number;         // 括弧独白比率
  sceneBreakCount: number;        // シーン転換数(空行2行以上)
  kanjiRatio: number;             // 漢字比率
  questionRatio: number;          // 疑問文比率
  exclamationRatio: number;       // 感嘆文比率
}

const SENSORY_WORDS = [
  "匂い","臭い","香り","香","音","響","騒","鳴","声",
  "触れ","感触","冷た","温か","熱い","痛","硬","柔","湿","軋",
  "味","苦","酸","塩","辛","甘","渋","薫",
  "光","眩","暗","翳","影","煌",
];

function extract(text: string): Features | null {
  if (text.length < 500) return null;
  const sentences = text.split(/(?<=[。！？!?])/).map(s => s.trim()).filter(Boolean);
  if (sentences.length < 5) return null;

  const chars = text.replace(/\s/g, "").length;
  const lens = sentences.map(s => s.length);
  const avgLen = lens.reduce((a,b)=>a+b,0)/lens.length;
  const std = Math.sqrt(lens.reduce((a,l)=>a+(l-avgLen)**2,0)/lens.length);

  const dialogues = text.match(/「[^」]*」/g) ?? [];
  const dialogueChars = dialogues.reduce((a,d)=>a+d.length, 0);
  const monologues = text.match(/（[^）]*）/g) ?? [];
  const monologueChars = monologues.reduce((a,m)=>a+m.length, 0);

  const commas = (text.match(/、/g) ?? []).length;
  const sceneBreaks = (text.match(/\n\s*\n\s*\n/g) ?? []).length;
  const kanji = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;

  const sensoryCount = SENSORY_WORDS.reduce((a,w) => a + (text.match(new RegExp(w, "g")) ?? []).length, 0);

  const shortSents = lens.filter(l => l < 15).length;
  const longSents = lens.filter(l => l > 50).length;
  const questions = sentences.filter(s => s.endsWith("？") || s.endsWith("?")).length;
  const excls = sentences.filter(s => s.endsWith("！") || s.endsWith("!")).length;

  return {
    chars,
    avgSentLen: avgLen,
    sentLenCV: std / avgLen,
    dialogueRatio: dialogueChars / chars,
    commaPerSent: commas / sentences.length,
    shortSentRatio: shortSents / sentences.length,
    longSentRatio: longSents / sentences.length,
    sensoryDensity: sensoryCount / chars * 1000,
    monologueRatio: monologueChars / chars,
    sceneBreakCount: sceneBreaks,
    kanjiRatio: kanji / chars,
    questionRatio: questions / sentences.length,
    exclamationRatio: excls / sentences.length,
  };
}

function pickStoryEp(ncode: string): string | null {
  for (let n = 1; n <= 5; n++) {
    const p = `data/crawled/${ncode}/ep${String(n).padStart(4, "0")}.json`;
    if (!existsSync(p)) continue;
    try {
      const d = JSON.parse(readFileSync(p, "utf-8"));
      const body = d.bodyText ?? "";
      const first = body.slice(0, 100);
      if (first.includes("登場人物") || first.includes("用語") || first.includes("設定") || first.startsWith("※")) continue;
      if (body.length < 1500) continue;
      return body;
    } catch {}
  }
  return null;
}

function median(arr: number[]): number {
  const s = [...arr].sort((a,b)=>a-b);
  return s[Math.floor(s.length/2)];
}
function q(arr: number[], p: number): number {
  const s = [...arr].sort((a,b)=>a-b);
  return s[Math.floor(s.length * p)];
}

function summarize(feats: Features[]): Record<string, {med: number, q25: number, q75: number}> {
  if (feats.length === 0) return {};
  const keys = Object.keys(feats[0]) as (keyof Features)[];
  const out: Record<string, {med: number, q25: number, q75: number}> = {};
  for (const k of keys) {
    const vals = feats.map(f => f[k]);
    out[k] = { med: median(vals), q25: q(vals, 0.25), q75: q(vals, 0.75) };
  }
  return out;
}

function main() {
  const label = process.argv[2];
  const topN = parseInt(process.argv[3] ?? "10", 10);
  const botN = parseInt(process.argv[4] ?? "10", 10);
  if (!label) {
    console.error("usage: extract-style-features.ts <label> [top_n] [bottom_n]");
    process.exit(1);
  }

  const targets: Work[] = JSON.parse(readFileSync("data/targets/stratified_all.json", "utf-8"));
  const matching = targets.filter(w => w.searchGenre === label);
  const top = matching.filter(w => w.tier === "top").sort((a,b)=>b.globalPoint-a.globalPoint);
  const bot = matching.filter(w => w.tier === "bottom").sort((a,b)=>a.globalPoint-b.globalPoint);

  const topFeats: Features[] = [];
  const botFeats: Features[] = [];
  for (const w of top) {
    if (topFeats.length >= topN) break;
    const body = pickStoryEp(w.ncode);
    if (!body) continue;
    const f = extract(body);
    if (f) topFeats.push(f);
  }
  for (const w of bot) {
    if (botFeats.length >= botN) break;
    const body = pickStoryEp(w.ncode);
    if (!body) continue;
    const f = extract(body);
    if (f) botFeats.push(f);
  }

  const topSum = summarize(topFeats);
  const botSum = summarize(botFeats);
  const hasBot = botFeats.length > 0;

  console.log(`${label} prose特徴量 (top n=${topFeats.length}${hasBot ? ` vs bottom n=${botFeats.length}` : ", bottom不足"})\n`);
  const fmt = (v: number, k: string) => {
    if (k === "chars") return v.toFixed(0);
    if (k.includes("Ratio") || k.includes("Density") || k.includes("CV")) return (v).toFixed(3);
    return v.toFixed(1);
  };
  const labelMap: Record<string, string> = {
    chars: "総文字数",
    avgSentLen: "平均文長",
    sentLenCV: "文長変動係数",
    dialogueRatio: "会話比率",
    commaPerSent: "1文あたり読点",
    shortSentRatio: "短文(<15字)比率",
    longSentRatio: "長文(>50字)比率",
    sensoryDensity: "感覚語密度(/1000字)",
    monologueRatio: "独白()比率",
    sceneBreakCount: "シーン転換数",
    kanjiRatio: "漢字比率",
    questionRatio: "疑問文比率",
    exclamationRatio: "感嘆文比率",
  };
  if (hasBot) {
    console.log(`| 指標 | top 中央 (IQR) | bottom 中央 (IQR) | 差 |`);
    console.log(`|------|----------------|-------------------|-----|`);
    for (const k of Object.keys(topSum)) {
      const t = topSum[k], b = botSum[k];
      if (!t || !b) continue;
      const diff = t.med - b.med;
      const arrow = Math.abs(diff) > Math.abs(t.med) * 0.1 ? (diff > 0 ? "↑" : "↓") : "≈";
      console.log(`| ${labelMap[k] ?? k} | ${fmt(t.med, k)} (${fmt(t.q25, k)}-${fmt(t.q75, k)}) | ${fmt(b.med, k)} (${fmt(b.q25, k)}-${fmt(b.q75, k)}) | ${fmt(diff, k)} ${arrow} |`);
    }
  } else {
    console.log(`| 指標 | top 中央 (IQR) |`);
    console.log(`|------|----------------|`);
    for (const k of Object.keys(topSum)) {
      const t = topSum[k];
      if (!t) continue;
      console.log(`| ${labelMap[k] ?? k} | ${fmt(t.med, k)} (${fmt(t.q25, k)}-${fmt(t.q75, k)}) |`);
    }
  }
}

main();
