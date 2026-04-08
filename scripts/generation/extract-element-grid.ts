// data/generation/hit-loglines.json から4軸タグを抽出して
// data/generation/element-grid.json を生成する一回限りの前処理スクリプト。
//
// LLMを使わずキーワード辞書とパターンマッチで決定論的に抽出する。
// （新しいタグを追加したい場合はこのファイルの辞書を更新する）
//
// 実行: npx tsx scripts/generation/extract-element-grid.ts

import { readFileSync, writeFileSync } from "fs";

interface HitWork {
  ncode: string;
  title: string;
  story: string;
  keyword: string;
  gp_per_ep: number;
}
interface HitDB {
  byGenre: Record<string, HitWork[]>;
}

// 4軸の辞書（部分一致でカウント）
const KYOUGUU = [
  "処刑",
  "追放",
  "婚約破棄",
  "婚約解消",
  "転生",
  "悪役令嬢",
  "落ちこぼれ",
  "ハズレ",
  "毒",
  "聖女",
  "騙され",
  "裏切られ",
  "捨て",
  "孤児",
];
const TENKI = [
  "ループ",
  "やり直し",
  "前世",
  "記憶",
  "スキル",
  "覚醒",
  "出会い",
  "死に戻り",
  "転生",
  "目覚め",
  "覚悟",
];
const HOUKOU = ["復讐", "ざまぁ", "スローライフ", "成り上がり", "溺愛", "ハッピーエンド", "復権", "辺境"];
const HOOK = [
  "理不尽",
  "痛快",
  "共感",
  "薬草",
  "薬師",
  "魔術",
  "料理",
  "錬金",
  "聖女",
  "婿養子",
  "後悔",
  "他者視点",
  "シリアス",
];

function extract(text: string, dict: readonly string[]): string[] {
  const found: string[] = [];
  for (const word of dict) {
    if (text.includes(word)) found.push(word);
  }
  return found;
}

function main(): void {
  const dbPath = "data/generation/hit-loglines.json";
  const outPath = "data/generation/element-grid.json";
  const db = JSON.parse(readFileSync(dbPath, "utf-8")) as HitDB;

  const grid: Record<string, { 境遇: Set<string>; 転機: Set<string>; 方向: Set<string>; フック: Set<string> }> = {};

  for (const [genre, works] of Object.entries(db.byGenre)) {
    grid[genre] = {
      境遇: new Set(),
      転機: new Set(),
      方向: new Set(),
      フック: new Set(),
    };
    for (const w of works) {
      const text = `${w.title} ${w.story} ${w.keyword}`;
      extract(text, KYOUGUU).forEach((t) => grid[genre].境遇.add(t));
      extract(text, TENKI).forEach((t) => grid[genre].転機.add(t));
      extract(text, HOUKOU).forEach((t) => grid[genre].方向.add(t));
      extract(text, HOOK).forEach((t) => grid[genre].フック.add(t));
    }
    // 各軸が空のときフォールバック
    if (grid[genre].境遇.size === 0) grid[genre].境遇.add("追放");
    if (grid[genre].転機.size === 0) grid[genre].転機.add("覚醒");
    if (grid[genre].方向.size === 0) grid[genre].方向.add("ざまぁ");
    if (grid[genre].フック.size === 0) grid[genre].フック.add("痛快");
  }

  const out = {
    byGenre: Object.fromEntries(
      Object.entries(grid).map(([g, axes]) => [
        g,
        {
          境遇: [...axes.境遇],
          転機: [...axes.転機],
          方向: [...axes.方向],
          フック: [...axes.フック],
        },
      ]),
    ),
  };

  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`✅ element-grid.json を生成: ${Object.keys(out.byGenre).length}ジャンル`);
  for (const [g, axes] of Object.entries(out.byGenre)) {
    console.log(
      `  ${g}: 境遇${axes.境遇.length} 転機${axes.転機.length} 方向${axes.方向.length} フック${axes.フック.length}`,
    );
  }
}

main();
