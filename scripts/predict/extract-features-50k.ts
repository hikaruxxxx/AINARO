/**
 * 50k narou 表層特徴量抽出
 *
 * 入力:
 *   - data/targets/narou_50k.json (58,156件 ncode + globalPoint + story + genre)
 *   - data/crawled/{ncode}/ep####.json (本文)
 *
 * 出力:
 *   - data/experiments/full-feature-extraction-50k.json (表層21D + メタ4D)
 *
 * 注意:
 *   - ANTHROPIC_API_KEY を使わない（表層特徴のみ、LLMスコアは後段）
 *   - 1作品あたり先頭10話までで特徴量を平均化（v10相当）
 *
 * 実行: npx tsx scripts/predict/extract-features-50k.ts
 */

import * as fs from "fs";
import * as path from "path";
import { extractExtendedFeatures, type ExtendedFeatures } from "../../src/lib/features";

const DATA_DIR = path.resolve(__dirname, "../../data");
const TARGETS = path.join(DATA_DIR, "targets/narou_50k.json");
const CRAWLED = path.join(DATA_DIR, "crawled");
const OUT = path.join(DATA_DIR, "experiments/full-feature-extraction-50k-ep1.json");
const MAX_EPISODES = 1; // 推論時 (screen-mass) は ep1 のみのため分布を合わせる
// narou作品は ep1 が前書き・告知・登場人物一覧のみで本編は ep2 以降、というケースが
// 多い。この場合 ep1 特徴量が取れずデータが大量に脱落するため、ep1 で抽出失敗した
// ときに限り ep5 までフォールバックする。推論側（自社生成）の ep1 は必ず本文なので
// 分布ズレは訓練側だけで吸収される。
const FALLBACK_MAX_EP = 5;

type TargetRow = {
  ncode: string;
  title: string;
  story: string;
  keyword: string;
  globalPoint: number;
  genre: string | number;
  genreName: string;
};

type ResultRow = {
  ncode: string;
  gp: number;
  genre: string;
  title: string;
  story: string;
  keyword: string;
  totalEpisodes: number;
  crawledEpCount: number;
  sourceEp: number; // 特徴量を抽出したエピソード番号 (1-5)
  avgEpChars: number;
  titleLen: number;
  titleHasBracket: number;
  titleHasTemplateKw: number;
} & Record<keyof ExtendedFeatures, number>;

const TEMPLATE_KWS = [
  "追放", "ざまぁ", "転生", "異世界", "婚約破棄", "悪役令嬢",
  "聖女", "チート", "スローライフ", "ハーレム", "最強",
];

function hasBracket(title: string): number {
  return /[【」『]|（/.test(title) ? 1 : 0;
}

function hasTemplateKw(title: string): number {
  return TEMPLATE_KWS.some(kw => title.includes(kw)) ? 1 : 0;
}

function avgFeatures(list: ExtendedFeatures[]): ExtendedFeatures {
  const keys = Object.keys(list[0]) as (keyof ExtendedFeatures)[];
  const out = {} as ExtendedFeatures;
  for (const k of keys) {
    const sum = list.reduce((a, f) => a + (f[k] as number), 0);
    (out[k] as number) = Math.round((sum / list.length) * 10000) / 10000;
  }
  return out;
}

function processWork(target: TargetRow): ResultRow | null {
  const dir = path.join(CRAWLED, target.ncode);
  if (!fs.existsSync(dir)) return null;

  let totalEpisodes = 0;
  try {
    const metaPath = path.join(dir, "_meta.json");
    if (fs.existsSync(metaPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      totalEpisodes = meta.totalEpisodes || 0;
    }
  } catch { /* ignore */ }

  // ep1 が前書き・告知のみで特徴量抽出に失敗した場合、ep5 までフォールバック
  // 最初に特徴量抽出に成功したエピソードを採用する
  let feat: ExtendedFeatures | null = null;
  let usedEp = 0;
  let usedText = "";
  for (let i = 1; i <= FALLBACK_MAX_EP; i++) {
    const epPath = path.join(dir, `ep${String(i).padStart(4, "0")}.json`);
    if (!fs.existsSync(epPath)) continue;
    try {
      const ep = JSON.parse(fs.readFileSync(epPath, "utf-8"));
      const text = ep.bodyText || "";
      const f = extractExtendedFeatures(text);
      if (f) {
        feat = f;
        usedEp = i;
        usedText = text;
        break;
      }
    } catch {
      continue;
    }
  }

  if (!feat) return null;

  return {
    ncode: target.ncode,
    gp: target.globalPoint,
    genre: String(target.genreName || target.genre || ""),
    title: target.title,
    story: target.story || "",
    keyword: target.keyword || "",
    totalEpisodes,
    crawledEpCount: 1,
    sourceEp: usedEp,
    avgEpChars: usedText.length,
    titleLen: target.title.length,
    titleHasBracket: hasBracket(target.title),
    titleHasTemplateKw: hasTemplateKw(target.title),
    ...feat,
  };
}

async function main() {
  const t0 = Date.now();
  const targets: TargetRow[] = JSON.parse(fs.readFileSync(TARGETS, "utf-8"));
  console.log(`targets: ${targets.length}件`);

  const results: ResultRow[] = [];
  let noDir = 0, noFeat = 0;
  let lastReport = Date.now();

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const dir = path.join(CRAWLED, t.ncode);
    if (!fs.existsSync(dir)) { noDir++; continue; }
    const r = processWork(t);
    if (!r) { noFeat++; continue; }
    results.push(r);

    if (Date.now() - lastReport > 5000) {
      const elapsed = (Date.now() - t0) / 1000;
      const rate = (i + 1) / elapsed;
      const eta = (targets.length - i - 1) / rate;
      console.log(`[${i + 1}/${targets.length}] 成功:${results.length} ディレクトリ無:${noDir} 特徴量無:${noFeat} (${rate.toFixed(0)}件/秒 残${Math.round(eta)}秒)`);
      lastReport = Date.now();
    }
  }

  fs.writeFileSync(OUT, JSON.stringify({
    meta: {
      generatedAt: new Date().toISOString(),
      targetCount: targets.length,
      resultCount: results.length,
      maxEpisodes: MAX_EPISODES,
      source: "data/targets/narou_50k.json",
    },
    results,
  }));

  const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`\n✅ 完了: ${results.length}/${targets.length} -> ${OUT} (${elapsed}秒)`);
  console.log(`ディレクトリ無: ${noDir}, 特徴量抽出失敗: ${noFeat}`);
}

main().catch(e => { console.error(e); process.exit(1); });
