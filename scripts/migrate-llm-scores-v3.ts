/**
 * LLMスコア v2 → v3 移行スクリプト
 *
 * v3では以下を追加:
 * - text: 評価に使ったテキスト
 * - totalEpisodes: エピソード数
 * - evalMeta: { episodeUsed, textLength, isStoryContent, contentFilter, evaluatedAt }
 *
 * 実行: npx tsx scripts/migrate-llm-scores-v3.ts
 */

import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.resolve(__dirname, "../data");
const V2_FILE = path.join(DATA_DIR, "experiments/llm-feature-scores-v2-full.json");
const V3_FILE = path.join(DATA_DIR, "experiments/llm-feature-scores-v3.json");
const FEATURES_FILE = path.join(DATA_DIR, "experiments/full-feature-extraction.json");
const CRAWLED_DIR = path.join(DATA_DIR, "crawled");
const MAX_TEXT_CHARS = 3000;

// --- コンテンツフィルタ（llm-eval-local.tsでも再利用） ---

/** ep0001がキャラ一覧・設定ページかどうかを判定 */
export function isCharacterSheet(title: string, bodyText: string): boolean {
  // タイトルベース検出
  const titlePatterns = [
    /登場人物/, /キャラクター/, /人物紹介/, /設定資料/, /設定$/,
    /用語/, /世界観/, /ガイド/, /参考資料/, /世界設定/, /人物設定/,
    /相関図/, /地図/, /一覧/,
  ];
  if (titlePatterns.some((p) => p.test(title))) return true;

  // 本文ベース検出
  const first1000 = bodyText.slice(0, 1000);

  // 箇条書きマーカーが多い
  const bulletCount = (first1000.match(/[■●▼▲◆★☆◇□]/g) || []).length;
  if (bulletCount >= 4) return true;

  // プロフィール書式が多い
  const profilePatterns = /(?:名前|年齢|身長|種族|職業|外見|スキル|性別|所属|容姿)[：:]/g;
  if ((first1000.match(profilePatterns) || []).length >= 3) return true;

  // ※で始まるネタバレ注意 + 箇条書き的構造
  if (/^[\s　]*※/.test(first1000) && bulletCount >= 2) return true;

  return false;
}

/** crawledディレクトリからエピソードテキストを取得（フィルタ付き） */
function loadEpisodeText(ncode: string): {
  text: string;
  episodeUsed: number;
  isStoryContent: boolean;
  contentFilter: string;
} {
  // ep0001を試す
  const ep1Path = path.join(CRAWLED_DIR, ncode, "ep0001.json");
  if (fs.existsSync(ep1Path)) {
    try {
      const ep = JSON.parse(fs.readFileSync(ep1Path, "utf-8"));
      const title = ep.title || "";
      const body = ep.bodyText || "";

      if (body.length >= 300 && !isCharacterSheet(title, body)) {
        return {
          text: body.slice(0, MAX_TEXT_CHARS),
          episodeUsed: 1,
          isStoryContent: true,
          contentFilter: "pass",
        };
      }

      // ep0001がキャラ一覧 → ep0002にフォールバック
      const ep2Path = path.join(CRAWLED_DIR, ncode, "ep0002.json");
      if (fs.existsSync(ep2Path)) {
        try {
          const ep2 = JSON.parse(fs.readFileSync(ep2Path, "utf-8"));
          const body2 = ep2.bodyText || "";
          if (body2.length >= 300 && !isCharacterSheet(ep2.title || "", body2)) {
            return {
              text: body2.slice(0, MAX_TEXT_CHARS),
              episodeUsed: 2,
              isStoryContent: true,
              contentFilter: "fallback_ep2",
            };
          }
        } catch { /* ignore */ }
      }

      // ep0001がキャラ一覧でep0002も使えない
      return {
        text: body.slice(0, MAX_TEXT_CHARS),
        episodeUsed: 1,
        isStoryContent: false,
        contentFilter: "charsheet_detected",
      };
    } catch { /* ignore */ }
  }

  return { text: "", episodeUsed: 0, isStoryContent: false, contentFilter: "unavailable" };
}

function main() {
  // v2スコア読み込み
  const v2 = JSON.parse(fs.readFileSync(V2_FILE, "utf-8"));
  console.log(`v2スコア: ${v2.results.length}作品`);

  // 表層特徴量（totalEpisodes取得用）
  const features = JSON.parse(fs.readFileSync(FEATURES_FILE, "utf-8"));
  const featMap = new Map<string, { totalEpisodes: number }>();
  for (const r of features.results) {
    featMap.set(r.ncode, { totalEpisodes: r.totalEpisodes || 0 });
  }

  // 移行
  const v3Results: unknown[] = [];
  let backfilled = 0;
  let charsheets = 0;
  let unavailable = 0;
  let fallbacks = 0;

  for (const r of v2.results) {
    const feat = featMap.get(r.ncode);
    const ep = loadEpisodeText(r.ncode);

    if (ep.contentFilter === "charsheet_detected") charsheets++;
    else if (ep.contentFilter === "fallback_ep2") fallbacks++;
    else if (ep.contentFilter === "unavailable") unavailable++;
    else backfilled++;

    v3Results.push({
      ncode: r.ncode,
      gp: r.gp || 0,
      site: r.site || "narou",
      genre: r.genre || "unknown",
      totalEpisodes: feat?.totalEpisodes ?? 0,
      scores: r.scores,
      total: r.total,
      evalMeta: {
        episodeUsed: ep.episodeUsed,
        textLength: ep.text.length,
        isStoryContent: ep.isStoryContent,
        contentFilter: ep.contentFilter,
        evaluatedAt: v2.generatedAt || new Date().toISOString(),
      },
      text: ep.text,
    });
  }

  const v3 = {
    generatedAt: new Date().toISOString(),
    version: 3,
    method: "claude-code-subagent-v2-full",
    totalWorks: v3Results.length,
    results: v3Results,
  };

  fs.writeFileSync(V3_FILE, JSON.stringify(v3, null, 2));

  console.log(`\nv3移行完了: ${v3Results.length}作品`);
  console.log(`  テキストバックフィル: ${backfilled}`);
  console.log(`  キャラ一覧検出: ${charsheets}`);
  console.log(`  ep2フォールバック: ${fallbacks}`);
  console.log(`  テキスト取得不可: ${unavailable}`);
  console.log(`\n保存: ${V3_FILE}`);
}

// 直接実行時のみmain()を呼ぶ（import時はスキップ）
const isDirectRun = process.argv[1]?.includes("migrate-llm-scores-v3");
if (isDirectRun) main();
