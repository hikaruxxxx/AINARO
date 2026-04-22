// 学習済みパターンの読み込み
//
// content/style/learned_patterns.md と anti_patterns.md から
// 確認済みパターンを読み込んでプロンプト用テキストに変換する。
//
// 週次 cron (update-patterns) が discovered_patterns テーブルから
// confirmed パターンをこれらのファイルに追記する。
// 生成レイヤー(Layer5/6)はDBではなくファイル経由で読む(DB非依存)。

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const LEARNED_PATH = "content/style/learned_patterns.md";
const ANTI_PATH = "content/style/anti_patterns.md";

// ジャンル(内部seed genre) → パターン先頭ラベル の許可リスト
// 内部genre が与えられたとき、該当ラベルのパターンのみ注入される(未ラベルは常時注入)
const GENRE_LABEL_MAP: Record<string, string[]> = {
  isekai_slowlife: ["スローライフ"],
  battle_vrmmo: ["VR", "アクション"],
  battle_dungeon: ["アクション"],
  battle_modern_power: ["アクション"],
  battle_war_chronicle: ["アクション"],
  otome_akuyaku_zamaa: ["悪役令嬢", "婚約破棄"],
  otome_villain_fantasy: ["悪役令嬢"],
  otome_konyaku_haki: ["婚約破棄"],
  otome_isekai_pure: ["悪役令嬢"],
  mystery_sf: ["SF", "宇宙"],
  mystery_horror: ["ホラー"],
  mystery_detective: ["推理"],
  mystery_action: ["推理", "アクション"],
};

// パターン一覧セクションからルールを抽出
// フォーマット: "## パターン一覧" 以下の "- " で始まる行
function extractRules(content: string): string[] {
  const lines = content.split("\n");
  let inSection = false;
  const rules: string[] = [];
  for (const line of lines) {
    if (line.startsWith("## パターン一覧")) {
      inSection = true;
      continue;
    }
    if (inSection && line.startsWith("## ")) break; // 次セクションに到達
    if (inSection && line.startsWith("- ")) {
      rules.push(line.slice(2).trim());
    }
  }
  return rules;
}

// パターン先頭の `(LABEL)` または `(LABEL1/LABEL2)` を抽出
// 未ラベルは null を返す
function extractLabels(rule: string): string[] | null {
  const m = rule.match(/^\(([^)]+)\)\s*/);
  if (!m) return null;
  // '/' で分割して複数ラベル対応
  return m[1].split("/").map((s) => s.trim()).filter(Boolean);
}

// 指定genre(内部seed genre)で注入すべきパターンをフィルタ
// - 未ラベルのパターンは常に通す
// - ラベル付きは GENRE_LABEL_MAP[genre] に含まれる場合のみ通す
// - genre 未指定時は全パターンを通す(後方互換)
function filterByGenre(rules: string[], genre?: string): string[] {
  if (!genre) return rules;
  const allowedLabels = GENRE_LABEL_MAP[genre] ?? [];
  return rules.filter((rule) => {
    const labels = extractLabels(rule);
    if (labels === null) return true; // 未ラベル = 全ジャンル共通
    return labels.some((l) => allowedLabels.includes(l));
  });
}

export interface LoadedPatterns {
  positive: string[];   // 効くパターン(learned_patterns.md)
  negative: string[];   // 避けるべきパターン(anti_patterns.md)
}

export function loadConfirmedPatterns(): LoadedPatterns {
  const positive = existsSync(LEARNED_PATH)
    ? extractRules(readFileSync(LEARNED_PATH, "utf-8"))
    : [];
  const negative = existsSync(ANTI_PATH)
    ? extractRules(readFileSync(ANTI_PATH, "utf-8"))
    : [];
  return { positive, negative };
}

// プロンプト注入用テキストを生成
// isExploration=true の場合: anti_patterns のみ適用(探索枠)
// isExploration=false の場合: 両方適用(通常枠)
// genre が指定された場合、該当ジャンルのパターンのみ注入(未ラベルは常時)
export function buildPatternBlock(isExploration = false, genre?: string): string {
  const { positive, negative } = loadConfirmedPatterns();
  const filteredPositive = filterByGenre(positive, genre);
  const filteredNegative = filterByGenre(negative, genre);

  if (filteredPositive.length === 0 && filteredNegative.length === 0) return "";

  const parts: string[] = [];

  if (!isExploration && filteredPositive.length > 0) {
    parts.push("## 効くパターン(適用すること)");
    for (const r of filteredPositive) parts.push(`- ${r}`);
  }

  if (filteredNegative.length > 0) {
    parts.push("## 避けるべきパターン(厳守)");
    for (const r of filteredNegative) parts.push(`- ${r}`);
  }

  if (parts.length === 0) return "";
  return `\n# 学習済みパターン\n${parts.join("\n")}\n`;
}

// 適用したパターンを _meta.json に記録
// 公開スクリプトが episode_generation_meta テーブルに転記する際に使う
export function recordAppliedPatterns(
  worksDir: string,
  slug: string,
  isExploration: boolean,
): void {
  const metaPath = join(worksDir, slug, "_meta.json");
  if (!existsSync(metaPath)) return;
  try {
    const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
    const { positive, negative } = loadConfirmedPatterns();
    // 探索枠は negative のみ適用
    meta.appliedPatterns = isExploration ? negative : [...positive, ...negative];
    meta.appliedPatternCount = meta.appliedPatterns.length;
    writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  } catch {
    // 記録失敗は生成成功に影響しない
  }
}
