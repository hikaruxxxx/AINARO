// パターン更新前後の生成品質比較
//
// 使い方: npx tsx scripts/eval/pattern-effect-compare.ts
//
// 仕組み:
// - content/style/learned_patterns.md の mtime を cutoff として PRE/POST に分割
// - BT ratings.json から勝率・負率・finalized率を集計
// - 本文内のアンチパターン/効くパターン適用率をプログラム検出
// - 1週間後の finalized勝率再計測に使う

import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { join } from "path";

const PATTERN_FILE = "content/style/learned_patterns.md";
const WORKS_DIR = "data/generation/works";
const LEAGUES_DIR = "data/generation/leagues";

interface RatingEntry {
  rating: number;
  matches: number;
  wins: number;
  losses: number;
  ties: number;
  finalized: boolean;
}

function loadRatings(): Map<string, RatingEntry> {
  const out = new Map<string, RatingEntry>();
  if (!existsSync(LEAGUES_DIR)) return out;
  for (const g of readdirSync(LEAGUES_DIR)) {
    const rp = join(LEAGUES_DIR, g, "ratings.json");
    if (!existsSync(rp)) continue;
    try {
      const d = JSON.parse(readFileSync(rp, "utf-8"));
      for (const [slug, e] of Object.entries<any>(d.entries ?? {})) {
        out.set(slug, {
          rating: e.rating ?? 1200,
          matches: e.matchCount ?? 0,
          wins: e.wins ?? 0,
          losses: e.losses ?? 0,
          ties: e.ties ?? 0,
          finalized: !!e.finalized,
        });
      }
    } catch {}
  }
  return out;
}

// BT集計
interface Bucket { slugs: string[]; rating: number[]; wins: number; losses: number; ties: number; matches: number[]; finalized: number }
function makeBucket(): Bucket { return { slugs: [], rating: [], wins: 0, losses: 0, ties: 0, matches: [], finalized: 0 }; }
function addToBucket(b: Bucket, slug: string, r: RatingEntry) {
  b.slugs.push(slug);
  b.rating.push(r.rating);
  b.wins += r.wins; b.losses += r.losses; b.ties += r.ties;
  b.matches.push(r.matches);
  if (r.finalized) b.finalized++;
}
function reportBucket(label: string, b: Bucket) {
  if (b.slugs.length === 0) { console.log(`${label}: n=0`); return; }
  const avg = (a: number[]) => a.reduce((s,v)=>s+v,0)/a.length;
  const total = b.wins + b.losses + b.ties;
  const winrate = total ? b.wins/total : 0;
  const lossrate = total ? b.losses/total : 0;
  console.log(`  ${label}: n=${b.slugs.length}, rating=${avg(b.rating).toFixed(1)}, matches=${avg(b.matches).toFixed(1)}, 勝率=${(winrate*100).toFixed(1)}%, 負率=${(lossrate*100).toFixed(1)}%, finalized=${b.finalized}(${(b.finalized/b.slugs.length*100).toFixed(1)}%)`);
}

// anti/positive パターン検出
interface PatternFlags { [k: string]: 0 | 1 }
function checkAnti(text: string): PatternFlags {
  const op = text.slice(0, 1500);
  const flags: PatternFlags = {};
  flags["台本式発話"] = /\n[\u4e00-\u9fff\u30a0-\u30ff]{2,6}「/.test(text) ? 1 : 0;
  const keitai = (op.match(/(でした|のです|ました)[。、」]/g) ?? []).length;
  flags["敬体過去形連発(≥5)"] = keitai >= 5 ? 1 : 0;
  flags["抽象決意宣言"] = /(今度こそ|負けない|私の物語|もう二度と|絶対に.{0,5}守)/.test(op) ? 1 : 0;
  flags["「ここはどこ」自問"] = /(ここはどこ|ここは、どこ|ここは一体どこ)/.test(op) ? 1 : 0;
  flags["受動覚醒冒頭"] = /^(目が覚め|気がつくと|意識を取り戻|目を覚まし)/.test(text.slice(0, 200)) ? 1 : 0;
  flags["A君B君"] = /(A君|B君|Aさん.{0,3}Bさん|仮にAが)/.test(op) ? 1 : 0;
  flags["まだ知らなかった"] = /(まだ知らなかった|その時の.{0,5}はまだ|これが.{0,5}始まり.{0,5}とは)/.test(text) ? 1 : 0;
  flags["Wikipedia式現代換算"] = /(現代風に|現代で言う|現在の.{0,3}県|約\d+メートル)/.test(op) ? 1 : 0;
  return flags;
}
function checkPositive(text: string): PatternFlags {
  const op = text.slice(0, 300);
  const first = text.slice(0, 500).split(/[。！？]/)[0] ?? "";
  const flags: PatternFlags = {};
  const sens = ["匂い","臭い","感触","冷た","温か","痛み","刺さ","軋む","噛む","撫で","震え","痺れ","鈍い","鋭い","擦れ","きしむ","汗","呼吸","鼓動"];
  flags["冒頭1文に物理感覚"] = sens.some(w => first.includes(w)) ? 1 : 0;
  flags["冒頭に数値+単位"] = /[0-9〇一二三四五六七八九十百千万]+(?:年|月|日|時|分|度|歳|回|メートル|キロ|階層|人)/.test(op) ? 1 : 0;
  const first800 = text.slice(0, 800);
  const kyu = ["匂い","臭い","香"].some(w => op.includes(w));
  const sho = ["触れ","感触","冷た","温か","痛","硬","柔","湿"].some(w => op.includes(w));
  const mi = ["味","苦い","酸い","塩辛"].some(w => op.includes(w));
  const cho = ["音","響","騒","鳴"].some(w => op.includes(w));
  flags["冒頭に非視覚感覚≥2"] = [cho,kyu,sho,mi].filter(Boolean).length >= 2 ? 1 : 0;
  const hasDlg = first800.includes("「");
  const hasEvt = ["来た","現れ","届い","呼び","叩","扉","鐘","号令","宣言","告げ","処刑","断罪","婚約"].some(w => first800.includes(w));
  flags["冒頭800字内に外的事件"] = (hasDlg && hasEvt) ? 1 : 0;
  return flags;
}

function main() {
  const cutoff = statSync(PATTERN_FILE).mtimeMs;
  console.log(`=== パターン効果検証 ===`);
  console.log(`cutoff: ${new Date(cutoff).toISOString()}`);
  console.log();

  const ratings = loadRatings();
  const pre = makeBucket(), post = makeBucket();
  const preMid = makeBucket(), postMid = makeBucket();
  const preFin = makeBucket(), postFin = makeBucket();
  const antiPre: Record<string, number> = {}, antiPost: Record<string, number> = {};
  const posPre: Record<string, number> = {}, posPost: Record<string, number> = {};
  let nPre = 0, nPost = 0;

  for (const d of readdirSync(WORKS_DIR)) {
    const ep1 = join(WORKS_DIR, d, "layer5_ep001.md");
    if (!existsSync(ep1)) continue;
    let text: string;
    try { text = readFileSync(ep1, "utf-8"); } catch { continue; }
    if (text.length < 500) continue;
    const isPost = statSync(ep1).mtimeMs >= cutoff;

    // アンチ/効くパターン検出
    const anti = checkAnti(text), pos = checkPositive(text);
    for (const [k, v] of Object.entries(anti)) (isPost ? antiPost : antiPre)[k] = ((isPost ? antiPost : antiPre)[k] ?? 0) + v;
    for (const [k, v] of Object.entries(pos)) (isPost ? posPost : posPre)[k] = ((isPost ? posPost : posPre)[k] ?? 0) + v;
    if (isPost) nPost++; else nPre++;

    // BT集計
    const r = ratings.get(d);
    if (!r || r.matches < 3) continue;
    (isPost ? post : pre) && addToBucket(isPost ? post : pre, d, r);
    if (r.matches >= 3 && r.matches <= 7) addToBucket(isPost ? postMid : preMid, d, r);
    if (r.finalized) addToBucket(isPost ? postFin : preFin, d, r);
  }

  console.log(`=== BT勝率 (マッチ≥3) ===`);
  reportBucket("PRE ", pre);
  reportBucket("POST", post);
  console.log();
  console.log(`=== BT勝率 (マッチ3-7、同条件) ===`);
  reportBucket("PRE ", preMid);
  reportBucket("POST", postMid);
  console.log();
  console.log(`=== BT勝率 (finalized のみ) ===`);
  reportBucket("PRE ", preFin);
  reportBucket("POST", postFin);
  console.log();

  console.log(`=== アンチパターン検出率 (PRE n=${nPre} / POST n=${nPost}) ===`);
  console.log(`${"パターン".padEnd(28)} ${"PRE".padStart(8)} ${"POST".padStart(8)} 差`);
  for (const k of Object.keys(antiPre).sort()) {
    const p = (antiPre[k] ?? 0) / nPre * 100;
    const q = (antiPost[k] ?? 0) / nPost * 100;
    const d = (p - q).toFixed(1);
    const arrow = p - q > 0 ? "↓改善" : (p - q < 0 ? "↑悪化" : "−");
    console.log(`  ${k.padEnd(28)} ${p.toFixed(1).padStart(6)}%  ${q.toFixed(1).padStart(6)}%  ${d.padStart(5)}pt ${arrow}`);
  }
  console.log();

  console.log(`=== 効くパターン適用率 (PRE n=${nPre} / POST n=${nPost}) ===`);
  console.log(`${"パターン".padEnd(28)} ${"PRE".padStart(8)} ${"POST".padStart(8)} 差`);
  for (const k of Object.keys(posPre).sort()) {
    const p = (posPre[k] ?? 0) / nPre * 100;
    const q = (posPost[k] ?? 0) / nPost * 100;
    const d = (q - p).toFixed(1);
    const arrow = q - p > 0 ? "↑向上" : (q - p < 0 ? "↓低下" : "−");
    console.log(`  ${k.padEnd(28)} ${p.toFixed(1).padStart(6)}%  ${q.toFixed(1).padStart(6)}%  ${d.padStart(5)}pt ${arrow}`);
  }
}

main();
