/**
 * Bible Quantitative Facts Audit
 *
 * 2026-05-17 Sprint 10 案1 で新設。
 *
 * storyboard.json の narration / dialogue / monologue / sfx 内に出現する
 * 数値 (年代・年齢) が bible.world.timeline / system に書かれた数値と一致するか
 * を regex で簡易検証する。
 *
 * 目的: a07 ep01 panel#1 で「三年前」「十五歳」と bible (20年前・18歳) から
 * 逸脱した narration が L04 storyboard 段で混入した事例の再発防止。
 *
 * 制約 (regex ベース簡易実装):
 * - 日本語の年代「N年前」「漢数字 N 年前」のみ抽出
 * - 年齢「N 歳」「漢数字 N 歳」のみ抽出
 * - bible 側の数値は world.timeline + system テキストから機械抽出
 * - 個人時間軸 (キャラ年齢からの回想等) は bible に書かれていなければ
 *   「unknown (cannot validate)」として skip
 *
 * 本格対応 (Sprint 10 続き候補):
 * - bible.meta に quantitative_facts 構造化フィールドを追加し、回想は別 facet で管理
 * - L04 生成時 inline で audit を呼び、不一致なら regen
 */

import type { BibleSnapshotV2, EpisodeStoryboardV2 } from "../schemas-v2";

export type BibleFacts = {
  /** bible.world.timeline + system から抽出した「N年前」表記 (アラビア数字に正規化) */
  yearsAgo: number[];
  /** 年齢「N歳」抽出 */
  ages: number[];
  /** 制度上のランク一覧 (例: ["S","A","B","C","D","E","F"])。
   *  bible.meta.quantitative_facts.ranks があれば優先採用。 */
  ranks: string[];
};

export type StoryboardTextHit = {
  panel_id: string;
  page_no: number;
  field: "narration" | "dialogue" | "monologue" | "sfx";
  index: number;
  text: string;
  yearsAgo: number[];
  ages: number[];
  ranks: string[];
};

export type Finding = {
  severity: "warning" | "fatal";
  panel_id: string;
  page_no: number;
  field: StoryboardTextHit["field"];
  text: string;
  kind: "years_ago_mismatch" | "age_mismatch" | "rank_mismatch";
  found: number | string;
  expected: Array<number | string>;
  message: string;
};

const KANJI_DIGITS: Record<string, number> = {
  〇: 0, 零: 0,
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
  十: 10, 百: 100, 千: 1000,
};

/**
 * 漢数字 (例: "二十", "十五", "三十二") → アラビア数字 (例: 20, 15, 32)
 * 万・億 等の大単位は本用途では不要なので未対応。
 */
function kanjiToNumber(s: string): number | null {
  if (/^\d+$/.test(s)) return Number(s);
  let total = 0;
  let current = 0;
  for (const ch of s) {
    const v = KANJI_DIGITS[ch];
    if (v === undefined) return null;
    if (v === 10 || v === 100 || v === 1000) {
      total += (current === 0 ? 1 : current) * v;
      current = 0;
    } else {
      current = current * 10 + v;
    }
  }
  return total + current;
}

const YEARS_AGO_RE = /(\d+|[〇零一二三四五六七八九十百千]+)年前/g;
const AGE_RE = /(\d+|[〇零一二三四五六七八九十]+)歳/g;
// 「S級」「F級」「SS級」「Sプラス級」のような rank 表記。アルファベット連続 or
// 漢数字混じり ("S+" "SS" "Sプラス") を 1 トークンとして拾う。数字 (例: 3級)
// は別の制度 (簿記/英検) を指すこともあるため対象外。
const RANK_RE = /([A-Z]{1,2}|[A-Z][\+ぁ-ヿ]*)級/g;

function extractYearsAgo(text: string): number[] {
  const results: number[] = [];
  for (const m of text.matchAll(YEARS_AGO_RE)) {
    const n = kanjiToNumber(m[1]);
    if (n !== null && n > 0) results.push(n);
  }
  return results;
}

function extractAges(text: string): number[] {
  const results: number[] = [];
  for (const m of text.matchAll(AGE_RE)) {
    const n = kanjiToNumber(m[1]);
    if (n !== null && n > 0 && n < 200) results.push(n);
  }
  return results;
}

function extractRanks(text: string): string[] {
  const results: string[] = [];
  for (const m of text.matchAll(RANK_RE)) {
    results.push(m[1]);
  }
  return results;
}

export function extractBibleFacts(bible: BibleSnapshotV2): BibleFacts {
  // 2026-05-17 Sprint 14 案1: bible.meta.quantitative_facts があれば優先参照、
  // regex 抽出は補完用 fallback として併用する (regex 取りこぼしは構造化で補い、
  // 構造化未指定の値は regex で拾う)。
  const structured = bible.meta.quantitative_facts;
  const text = `${bible.world.timeline ?? ""}\n${bible.world.system ?? ""}\n${bible.world.premise ?? ""}`;
  const regexYears = extractYearsAgo(text);
  const regexAges = extractAges(text);

  const yearsAgo = Array.from(
    new Set([...(structured?.years_ago ?? []), ...regexYears]),
  );
  const structuredAge = structured?.judgement_age_max;
  const ages = Array.from(
    new Set([
      ...(structuredAge !== undefined ? [structuredAge] : []),
      ...regexAges,
    ]),
  );
  const ranks = Array.from(new Set(structured?.ranks ?? []));

  return { yearsAgo, ages, ranks };
}

export function extractStoryboardHits(storyboard: EpisodeStoryboardV2): StoryboardTextHit[] {
  const hits: StoryboardTextHit[] = [];
  for (const page of storyboard.pages) {
    for (const panel of page.panels) {
      const collect = (field: StoryboardTextHit["field"], texts: string[]) => {
        texts.forEach((text, index) => {
          const yearsAgo = extractYearsAgo(text);
          const ages = extractAges(text);
          const ranks = extractRanks(text);
          if (yearsAgo.length === 0 && ages.length === 0 && ranks.length === 0) return;
          hits.push({
            panel_id: panel.panel_id,
            page_no: page.page_no,
            field,
            index,
            text,
            yearsAgo,
            ages,
            ranks,
          });
        });
      };
      collect("narration", panel.narration ?? []);
      // dialogue / monologue は character ごとに text を持つ構造
      const dialogueTexts = (panel.dialogue ?? []).map((d) => d.text);
      const monologueTexts = (panel.monologue ?? []).map((m) => m.text);
      collect("dialogue", dialogueTexts);
      collect("monologue", monologueTexts);
      collect("sfx", panel.sfx ?? []);
    }
  }
  return hits;
}

export function auditBibleFacts(
  bible: BibleSnapshotV2,
  storyboard: EpisodeStoryboardV2,
): { facts: BibleFacts; findings: Finding[] } {
  const facts = extractBibleFacts(bible);
  const hits = extractStoryboardHits(storyboard);
  const findings: Finding[] = [];

  for (const hit of hits) {
    for (const n of hit.yearsAgo) {
      if (facts.yearsAgo.length > 0 && !facts.yearsAgo.includes(n)) {
        findings.push({
          severity: "warning",
          panel_id: hit.panel_id,
          page_no: hit.page_no,
          field: hit.field,
          text: hit.text,
          kind: "years_ago_mismatch",
          found: n,
          expected: facts.yearsAgo,
          message: `「${n}年前」が bible.world で確認できる「${facts.yearsAgo.join("/")}年前」と一致しない。個人時間軸 (キャラの過去回想等) なら誤検出だが、世界観 narration なら設定逸脱の可能性あり。`,
        });
      }
    }
    for (const n of hit.ages) {
      if (facts.ages.length > 0 && !facts.ages.includes(n)) {
        // bible「18歳まで」は範囲指定なので、N <= 18 なら整合と見做す簡易ルール
        const bibleMaxAge = Math.max(...facts.ages);
        if (n <= bibleMaxAge) continue;
        findings.push({
          severity: "warning",
          panel_id: hit.panel_id,
          page_no: hit.page_no,
          field: hit.field,
          text: hit.text,
          kind: "age_mismatch",
          found: n,
          expected: facts.ages,
          message: `「${n}歳」が bible.world で確認できる「${facts.ages.join("/")}歳」を超える。設定逸脱の可能性あり。`,
        });
      }
    }
    // 2026-05-17 Sprint 15 案4: ranks の不一致検出。
    // bible.meta.quantitative_facts.ranks が設定されている場合のみ走る。
    if (facts.ranks.length > 0) {
      for (const rank of hit.ranks) {
        if (!facts.ranks.includes(rank)) {
          findings.push({
            severity: "warning",
            panel_id: hit.panel_id,
            page_no: hit.page_no,
            field: hit.field,
            text: hit.text,
            kind: "rank_mismatch",
            found: rank,
            expected: facts.ranks,
            message: `「${rank}級」が bible.meta.quantitative_facts.ranks の正式 rank 一覧 [${facts.ranks.join("/")}] に無い。AI 補完による架空 rank の可能性あり。`,
          });
        }
      }
    }
  }

  return { facts, findings };
}
