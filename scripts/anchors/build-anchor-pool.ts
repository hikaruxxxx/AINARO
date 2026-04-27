/**
 * Phase 1 anchor reference pool builder
 *
 * 設計: docs/architecture/phase1_pipeline_design_v2.md §2
 *
 * 目的: narou スクレイピングデータから、各 Phase 1 サブジャンルごとに
 *       hit / middle / low の3帯の参照作品を選定し、Layer 3/5 の評価素材を
 *       書き出す。Layer 2/4 の素材は LLM 抽出が必要なため別フェーズ。
 *
 * 入力:
 *   - data/targets/narou_50k.json (narou メタデータ)
 *   - data/generation/genre-taxonomy.json (Phase 1 サブジャンル定義)
 *   - data/crawled/{ncode}/ep0001.json (本文)
 *
 * 出力:
 *   - data/generation/anchors/manifest.json
 *   - data/generation/anchors/calibration.json (スケルトン)
 *   - data/generation/anchors/{genre}/anchors.json
 *   - data/generation/anchors/{genre}/layer3/{hit|middle|low}/{anchor_id}.md
 *   - data/generation/anchors/{genre}/layer5/{hit|middle|low}/{anchor_id}.md
 *   - data/generation/anchors/audit/build_YYYYMMDD.jsonl
 *
 * 実行: npx tsx scripts/anchors/build-anchor-pool.ts
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const TARGETS_FILE = path.join(ROOT, "data/targets/narou_50k.json");
const TAXONOMY_FILE = path.join(ROOT, "data/generation/genre-taxonomy.json");
const CRAWLED_DIR = path.join(ROOT, "data/crawled");
const OUTPUT_DIR = path.join(ROOT, "data/generation/anchors");

const ANCHOR_VERSION = "anchor-2026-04-v2";
const ANCHORS_PER_BAND = 10; // hit/middle/low 各帯の代表作数
const MIN_KEYWORD_SCORE = 2; // この未満はサブジャンル未確定として除外
const MIN_STORY_LEN = 80; // story (synopsis) の最低文字数
const MIN_BODY_LEN = 800; // ep1 本文の最低文字数 (極端に短い回はバッドサンプル)

// v2 帯設計: globalPoint の対数スケールで境界をつけて、帯間ギャップを明確にする。
// 200-2000 と 5000+ の間に gap (2000-5000) を空けることで、middle と hit の混同を減らす。
// 50-200 にも gap を空けて、low と middle が連続的に混じらないようにする。
const HIT_MIN_GLOBAL_POINT = 5000; // hit 帯はここ以上 (上位 1〜2 割相当)
const MIDDLE_MIN_GLOBAL_POINT = 200; // middle 帯の下限
const MIDDLE_MAX_GLOBAL_POINT = 2000; // middle 帯の上限
const LOW_MIN_GLOBAL_POINT = 1; // low 帯の下限 (gp=0 の捨て垢を除外)
const LOW_MAX_GLOBAL_POINT = 50; // low 帯の上限

// --- 型定義 ---

interface NarouWork {
  ncode: string;
  title: string;
  story: string;
  keyword: string;
  globalPoint: number;
  genre: string | number;
  genreName: string;
  episodes: number;
  source?: string;
}

interface SubGenre {
  id: string;
  name: string;
  keywords: string[];
  readerDesires: string[];
  narouMapping: string[];
  phaseAMapping?: string[];
}

interface MajorGenre {
  id: string;
  name: string;
  description: string;
  subGenres: SubGenre[];
}

interface Taxonomy {
  version: string;
  majorGenres: MajorGenre[];
}

type Band = "hit" | "middle" | "low";

interface AnchorEntry {
  anchorId: string;
  ncode: string;
  title: string;
  band: Band;
  globalPoint: number;
  episodes: number;
  narouGenreName: string;
  source: "narou";
  hasLayer3: boolean;
  hasLayer5: boolean;
  matchedKeywords: string[];
  classifyScore: number;
}

interface AuditRecord {
  ncode: string;
  title: string;
  decision: "selected" | "skipped";
  band?: Band;
  subGenreId?: string;
  reason?: string;
  globalPoint?: number;
  classifyScore?: number;
}

// --- ヘルパ ---

function loadJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, "utf8")) as T;
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function todayStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function makeAnchorId(ncode: string): string {
  // anchor_id は ncode + 短いハッシュで衝突を避ける
  const h = crypto.createHash("sha1").update(ncode).digest("hex").slice(0, 6);
  return `${ncode}_${h}`;
}

function readEp1Body(ncode: string): string | null {
  const p = path.join(CRAWLED_DIR, ncode, "ep0001.json");
  if (!fs.existsSync(p)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8")) as { bodyText?: string };
    const body = j.bodyText ?? "";
    if (body.length < MIN_BODY_LEN) return null;
    return body;
  } catch {
    return null;
  }
}

// --- ジャンル分類 ---

/**
 * narou メタデータから Phase 1 サブジャンルを推定する。
 *
 * スコア:
 *   narouMapping 一致 = +5
 *   キーワード一致(keyword/title/story 全文に対する部分文字列) = +1 per keyword
 *
 * 最高スコアのサブジャンルに割り当てる。スコア < MIN_KEYWORD_SCORE は未確定として除外。
 */
function classifyToSubGenre(
  work: NarouWork,
  taxonomy: Taxonomy,
): { subGenreId: string; score: number; matched: string[] } | null {
  const haystack = `${work.title}\n${work.story}\n${work.keyword}`;
  const allSubGenres = taxonomy.majorGenres.flatMap((g) => g.subGenres);

  let best: { subGenreId: string; score: number; matched: string[] } | null = null;

  for (const sub of allSubGenres) {
    let score = 0;
    const matched: string[] = [];

    if (sub.narouMapping.includes(work.genreName)) {
      score += 5;
    }

    for (const kw of sub.keywords) {
      if (haystack.includes(kw)) {
        score += 1;
        matched.push(kw);
      }
    }

    if (best == null || score > best.score) {
      best = { subGenreId: sub.id, score, matched };
    }
  }

  if (!best || best.score < MIN_KEYWORD_SCORE) return null;
  return best;
}

// --- 帯選定 ---

/**
 * v2 banding: globalPoint の絶対しきい値で hit / middle / low を排他的に切り出す。
 *
 * v1 では top-k / middle-of-sorted / bottom-k で取っていたが、middle と low が
 * 距離的に近すぎて LLM 評価で順序が逆転する問題があった (2026-04-28 観測)。
 *
 * v2 では 50-200 と 2000-5000 に明示的に gap を設けて帯間距離を確保する。
 *
 * 各帯から ANCHORS_PER_BAND 件を選ぶが、各帯ごとに「globalPoint 帯の中央寄り」を取って
 * 極端な outlier (gp=10万のメガヒットだけが hit、gp=1の捨て垢だけが low、等) を避ける。
 */
function selectBands(works: NarouWork[]): Record<Band, NarouWork[]> | null {
  const hitPool = works.filter((w) => (w.globalPoint ?? 0) >= HIT_MIN_GLOBAL_POINT);
  const middlePool = works.filter((w) => {
    const gp = w.globalPoint ?? 0;
    return gp >= MIDDLE_MIN_GLOBAL_POINT && gp <= MIDDLE_MAX_GLOBAL_POINT;
  });
  const lowPool = works.filter((w) => {
    const gp = w.globalPoint ?? 0;
    return gp >= LOW_MIN_GLOBAL_POINT && gp <= LOW_MAX_GLOBAL_POINT;
  });

  if (hitPool.length < ANCHORS_PER_BAND || middlePool.length < ANCHORS_PER_BAND || lowPool.length < ANCHORS_PER_BAND) {
    return null;
  }

  const hit = pickBandRepresentatives(hitPool, ANCHORS_PER_BAND);
  const middle = pickBandRepresentatives(middlePool, ANCHORS_PER_BAND);
  const low = pickBandRepresentatives(lowPool, ANCHORS_PER_BAND);

  // 排他性ガード (gap 設計上重複しないはずだが念のため)
  const allNcodes = [...hit, ...middle, ...low].map((w) => w.ncode);
  const uniq = new Set(allNcodes);
  if (uniq.size !== allNcodes.length) {
    throw new Error("band overlap detected: hit/middle/low must be disjoint");
  }

  return { hit, middle, low };
}

/**
 * 帯内から代表作を ANCHORS_PER_BAND 件選ぶ。
 * 帯の中央付近を選ぶことで極端な outlier を避ける。
 */
function pickBandRepresentatives(pool: NarouWork[], n: number): NarouWork[] {
  if (pool.length <= n) return pool;
  const sorted = [...pool].sort((a, b) => (b.globalPoint ?? 0) - (a.globalPoint ?? 0));
  // 中央 60% の帯から等間隔サンプリング (extreme outlier を避ける)
  const cutLow = Math.floor(sorted.length * 0.2);
  const cutHigh = Math.floor(sorted.length * 0.8);
  const middleSlice = sorted.slice(cutLow, cutHigh);
  if (middleSlice.length < n) return sorted.slice(0, n);
  const step = middleSlice.length / n;
  const picked: NarouWork[] = [];
  for (let i = 0; i < n; i++) {
    picked.push(middleSlice[Math.floor(i * step)]);
  }
  return picked;
}

// --- 出力 ---

function writeLayerMaterials(
  work: NarouWork,
  body: string,
  anchorId: string,
  genreDir: string,
  band: Band,
): { hasLayer3: boolean; hasLayer5: boolean } {
  let hasLayer3 = false;
  let hasLayer5 = false;

  // Layer 3 (synopsis): narou の story フィールドを使う
  if (work.story && work.story.trim().length >= MIN_STORY_LEN) {
    const layer3Dir = path.join(genreDir, "layer3", band);
    ensureDir(layer3Dir);
    const md = [
      `# ${work.title}`,
      ``,
      `- ncode: ${work.ncode}`,
      `- band: ${band}`,
      `- globalPoint: ${work.globalPoint}`,
      `- source: narou`,
      ``,
      `## あらすじ`,
      ``,
      work.story.trim(),
      ``,
    ].join("\n");
    fs.writeFileSync(path.join(layer3Dir, `${anchorId}.md`), md);
    hasLayer3 = true;
  }

  // Layer 5 (ep1 本文): data/crawled/{ncode}/ep0001.json の bodyText
  if (body && body.length >= MIN_BODY_LEN) {
    const layer5Dir = path.join(genreDir, "layer5", band);
    ensureDir(layer5Dir);
    const md = [
      `# ${work.title} - 第1話`,
      ``,
      `- ncode: ${work.ncode}`,
      `- band: ${band}`,
      `- globalPoint: ${work.globalPoint}`,
      `- source: narou`,
      ``,
      `---`,
      ``,
      body,
      ``,
    ].join("\n");
    fs.writeFileSync(path.join(layer5Dir, `${anchorId}.md`), md);
    hasLayer5 = true;
  }

  return { hasLayer3, hasLayer5 };
}

// --- メイン ---

function main() {
  console.log("[anchor-builder] start");

  if (!fs.existsSync(TARGETS_FILE)) {
    throw new Error(`targets file not found: ${TARGETS_FILE}`);
  }
  if (!fs.existsSync(TAXONOMY_FILE)) {
    throw new Error(`taxonomy file not found: ${TAXONOMY_FILE}`);
  }

  const allWorks = loadJson<NarouWork[]>(TARGETS_FILE);
  const taxonomy = loadJson<Taxonomy>(TAXONOMY_FILE);
  const allSubGenres = taxonomy.majorGenres.flatMap((g) => g.subGenres);

  console.log(`[anchor-builder] loaded ${allWorks.length} works, ${allSubGenres.length} sub-genres`);

  ensureDir(OUTPUT_DIR);
  ensureDir(path.join(OUTPUT_DIR, "audit"));

  // ジャンル別にグループ化 + 事前フィルタ
  const grouped = new Map<string, Array<NarouWork & { _matched: string[]; _score: number }>>();
  const audit: AuditRecord[] = [];

  for (const work of allWorks) {
    if (!work.ncode || !work.ncode.startsWith("n")) {
      audit.push({ ncode: work.ncode ?? "", title: work.title ?? "", decision: "skipped", reason: "non_narou_ncode" });
      continue;
    }
    if (!work.story || work.story.trim().length < MIN_STORY_LEN) {
      audit.push({ ncode: work.ncode, title: work.title, decision: "skipped", reason: "story_too_short" });
      continue;
    }

    const cls = classifyToSubGenre(work, taxonomy);
    if (!cls) {
      audit.push({ ncode: work.ncode, title: work.title, decision: "skipped", reason: "no_subgenre_match" });
      continue;
    }

    // 本文がないものは Layer 5 anchor として使えないが、Layer 3 anchor としては使える
    // ただし anchor pool としての価値は低いので、本文なしは捨てる方針
    const body = readEp1Body(work.ncode);
    if (!body) {
      audit.push({ ncode: work.ncode, title: work.title, decision: "skipped", subGenreId: cls.subGenreId, reason: "no_body" });
      continue;
    }

    const list = grouped.get(cls.subGenreId) ?? [];
    list.push({ ...work, _matched: cls.matched, _score: cls.score });
    grouped.set(cls.subGenreId, list);
  }

  console.log("[anchor-builder] candidates per sub-genre:");
  for (const sub of allSubGenres) {
    const n = grouped.get(sub.id)?.length ?? 0;
    console.log(`  ${sub.id}: ${n}`);
  }

  // 帯選定 + 出力
  const manifest = {
    version: ANCHOR_VERSION,
    builtAt: new Date().toISOString(),
    source: {
      targetsFile: path.relative(ROOT, TARGETS_FILE),
      taxonomyVersion: taxonomy.version,
      crawledDir: path.relative(ROOT, CRAWLED_DIR),
    },
    config: {
      anchorsPerBand: ANCHORS_PER_BAND,
      minKeywordScore: MIN_KEYWORD_SCORE,
      minStoryLen: MIN_STORY_LEN,
      minBodyLen: MIN_BODY_LEN,
      hitMinGlobalPoint: HIT_MIN_GLOBAL_POINT,
      middleGlobalPointRange: [MIDDLE_MIN_GLOBAL_POINT, MIDDLE_MAX_GLOBAL_POINT],
      lowGlobalPointRange: [LOW_MIN_GLOBAL_POINT, LOW_MAX_GLOBAL_POINT],
    },
    genres: {} as Record<string, { hit: number; middle: number; low: number; total: number }>,
  };

  for (const sub of allSubGenres) {
    const candidates = grouped.get(sub.id) ?? [];
    const bands = selectBands(candidates);
    if (!bands) {
      console.warn(
        `[anchor-builder] WARN ${sub.id}: insufficient candidates per band (total=${candidates.length}), skipping anchor build for this genre`,
      );
      manifest.genres[sub.id] = { hit: 0, middle: 0, low: 0, total: 0 };
      audit.push({
        ncode: "",
        title: "",
        decision: "skipped",
        subGenreId: sub.id,
        reason: `subgenre_below_band_threshold:${candidates.length}`,
      });
      continue;
    }
    const genreDir = path.join(OUTPUT_DIR, sub.id);
    ensureDir(genreDir);

    const anchors: AnchorEntry[] = [];

    for (const band of ["hit", "middle", "low"] as Band[]) {
      for (const work of bands[band]) {
        const anchorId = makeAnchorId(work.ncode);
        const body = readEp1Body(work.ncode);
        if (!body) {
          audit.push({ ncode: work.ncode, title: work.title, decision: "skipped", subGenreId: sub.id, band, reason: "body_lost_during_pass2" });
          continue;
        }
        const { hasLayer3, hasLayer5 } = writeLayerMaterials(work, body, anchorId, genreDir, band);

        anchors.push({
          anchorId,
          ncode: work.ncode,
          title: work.title,
          band,
          globalPoint: work.globalPoint ?? 0,
          episodes: work.episodes ?? 0,
          narouGenreName: work.genreName,
          source: "narou",
          hasLayer3,
          hasLayer5,
          matchedKeywords: (work as NarouWork & { _matched: string[] })._matched,
          classifyScore: (work as NarouWork & { _score: number })._score,
        });

        audit.push({
          ncode: work.ncode,
          title: work.title,
          decision: "selected",
          band,
          subGenreId: sub.id,
          globalPoint: work.globalPoint,
          classifyScore: (work as NarouWork & { _score: number })._score,
        });
      }
    }

    fs.writeFileSync(
      path.join(genreDir, "anchors.json"),
      JSON.stringify({ subGenreId: sub.id, version: ANCHOR_VERSION, anchors }, null, 2),
    );

    manifest.genres[sub.id] = {
      hit: anchors.filter((a) => a.band === "hit").length,
      middle: anchors.filter((a) => a.band === "middle").length,
      low: anchors.filter((a) => a.band === "low").length,
      total: anchors.length,
    };
  }

  // manifest 書き出し
  fs.writeFileSync(path.join(OUTPUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));

  // calibration.json スケルトン (実値はペアワイズ校正フェーズで埋める)
  const calibration = {
    version: ANCHOR_VERSION,
    builtAt: new Date().toISOString(),
    note: "anchor 同士のペアワイズ評価で hit/middle/low 中央値 Elo を埋める。v12 絶対確率しきい値も同フェーズで決定する。",
    hitProbability: {
      pass: 55.0,
      reject: 35.0,
      calibratedOn: null as string | null,
    },
    layers: {} as Record<string, Record<string, {
      hitMedianElo: number | null;
      middleMedianElo: number | null;
      lowMedianElo: number | null;
      passElo: number | null;
      requiredAnchorMatches: number;
    }>>,
  };
  for (const sub of allSubGenres) {
    calibration.layers[sub.id] = {};
    for (const layer of ["layer2", "layer3", "layer4", "layer5"]) {
      calibration.layers[sub.id][layer] = {
        hitMedianElo: null,
        middleMedianElo: null,
        lowMedianElo: null,
        passElo: null,
        requiredAnchorMatches: 10,
      };
    }
  }
  fs.writeFileSync(path.join(OUTPUT_DIR, "calibration.json"), JSON.stringify(calibration, null, 2));

  // audit log 書き出し
  const auditPath = path.join(OUTPUT_DIR, "audit", `build_${todayStamp()}.jsonl`);
  fs.writeFileSync(auditPath, audit.map((a) => JSON.stringify(a)).join("\n") + "\n");

  console.log("[anchor-builder] done");
  console.log("manifest:", JSON.stringify(manifest.genres, null, 2));
  console.log(`audit records: ${audit.length} (selected=${audit.filter((a) => a.decision === "selected").length})`);
}

main();
