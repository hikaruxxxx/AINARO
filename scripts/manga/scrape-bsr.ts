/**
 * BSR (Best Sellers Rank) 追跡スクリプト
 *
 * 目的: a07 ローンチ後、自作品 + 競合棚の BSR を日次でスナップショット保存し、
 * Amazon Ads / SNS 施策の効果を可視化する。
 *
 * 設計根拠 (kdp-modular-plum.md §13):
 *   - A10は3-4週ローリングウィンドウで評価。継続販売が効くため日次スナップショットが必要
 *   - amazon.co.jp の product page から #productDetails / detailBullets の "売れ筋ランキング" 行を抽出
 *   - データは data/manga/kdp/bsr-snapshots/{slug}/{date}.json に保存
 *
 * 実行: npx tsx scripts/manga/scrape-bsr.ts --slug a07-modern-dungeon
 *      [--include-competitors]   競合棚 (competitor-shelf-{genre}.json) も追跡対象に追加
 *      [--asins B0XXX,4824XXX]   追加で追跡する ASIN を CSV 指定
 *
 * 注意:
 *   - amazon.co.jp の自動取得は規約上「個人利用・低頻度」の範囲に留める
 *   - 1日1回に限定 (cron で 09:00 JST 起動を推奨)
 *   - Playwright の Chrome (Cookie注入) を再利用
 */
import "./_env";
import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

type Args = {
  slug: string;
  includeCompetitors: boolean;
  extraAsins: string[];
};

function parseArgs(): Args {
  const a: Partial<Args> = { includeCompetitors: false, extraAsins: [] };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    let key: string | null = null;
    let val: string | null = null;
    const eq = arg.match(/^--([^=]+)=(.*)$/);
    if (eq) [, key, val] = eq;
    else if (arg === "--include-competitors") {
      a.includeCompetitors = true;
      continue;
    } else {
      const flag = arg.match(/^--(.+)$/);
      if (flag && i + 1 < argv.length) {
        key = flag[1];
        val = argv[++i];
      }
    }
    if (!key || val === null) continue;
    if (key === "slug") a.slug = val;
    else if (key === "asins") a.extraAsins = val.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (!a.slug) throw new Error("--slug required");
  return a as Args;
}

const REPO_ROOT = path.resolve(__dirname, "..", "..");

async function loadOwnAsins(slug: string): Promise<string[]> {
  // 自作品の ASIN は kdp-series.json で全巻管理 (まだ生成されていなければ空)
  const kdpSeriesPath = path.join(REPO_ROOT, "data", "manga", "works", slug, "kdp-series.json");
  try {
    const raw = await fs.readFile(kdpSeriesPath, "utf-8");
    const series = JSON.parse(raw) as { asin_by_volume?: Record<string, string> };
    return Object.values(series.asin_by_volume ?? {});
  } catch {
    console.warn(`[scrape-bsr] kdp-series.json が見つかりません (slug=${slug}): ${kdpSeriesPath}`);
    return [];
  }
}

async function loadCompetitorAsins(slug: string): Promise<string[]> {
  // genre は slug の末尾要素から推定 (a07-modern-dungeon → modern-dungeon)
  const genre = slug.replace(/^[a-z]\d+-/, "");
  const shelfPath = path.join(REPO_ROOT, "data", "manga", "kdp", `competitor-shelf-${genre}.json`);
  try {
    const raw = await fs.readFile(shelfPath, "utf-8");
    const shelf = JSON.parse(raw) as { items?: Array<{ asin?: string; relevance_score?: number }> };
    // relevance_score が高いか、最初から実データある作品を優先
    const items = shelf.items ?? [];
    // BSR取得対象: 上位10件 (ノイズ削減)
    return items.slice(0, 10).map((it) => it.asin).filter((x): x is string => !!x);
  } catch {
    console.warn(`[scrape-bsr] competitor-shelf が見つかりません: ${shelfPath}`);
    return [];
  }
}

type BsrSnapshot = {
  asin: string;
  ranks: Record<string, number>;
  rating?: number;
  review_count?: number;
  price_yen?: number;
  ku_observed?: boolean;
  collected_at: string;
  source_url: string;
  fetch_error?: string;
};

/**
 * Python スクリプト経由で Playwright を呼び出して BSR を取得。
 * Node からは spawn して JSON を受け取る (既存の web_playwright.py を再利用)。
 */
async function fetchBsrForAsins(asins: string[]): Promise<BsrSnapshot[]> {
  const py = `
import sys, os, json, time, re
sys.path.insert(0, os.path.expanduser('~/.claude/scripts'))
from web_playwright import WebBrowser

ASINS = ${JSON.stringify(asins)}
RESULTS = []

with WebBrowser('amazon.co.jp') as browser:
    for asin in ASINS:
        url = f"https://www.amazon.co.jp/dp/{asin}"
        try:
            browser.page.goto(url, wait_until='load', timeout=30000)
        except Exception as e:
            RESULTS.append({"asin": asin, "fetch_error": str(e), "source_url": url, "collected_at": ""})
            continue
        time.sleep(2)
        result = browser.page.evaluate("""
        () => {
          const rankRows = Array.from(document.querySelectorAll('#detailBullets_feature_div li, #productDetails_db_sections tr'))
            .map(el => el.textContent.replace(/\\\\s+/g, ' ').trim())
            .filter(t => t.includes('ランキング') || t.includes('位'));
          const ranks = {};
          for (const row of rankRows) {
            const matches = row.matchAll(/([\\u4e00-\\u9faf]+|[a-zA-Z\\u30a0-\\u30ff]+)\\s*-\\s*([0-9,]+)\\s*位/g);
            for (const m of matches) {
              const cat = m[1].trim();
              const rank = parseInt(m[2].replace(/,/g, ''), 10);
              if (!isNaN(rank)) ranks[cat] = rank;
            }
          }
          const ratingEl = document.querySelector('#acrPopover, .a-icon-star .a-icon-alt');
          const ratingText = ratingEl ? (ratingEl.title || ratingEl.textContent || '') : '';
          // 「5つ星のうち4.8」「5 つ星のうち 4.8」形式から 4.8 を抽出
          const ratingMatch = ratingText.match(/うち\\s*([0-9.]+)/) || ratingText.match(/([0-9]\\.[0-9]+)/);
          const reviewCountEl = document.querySelector('#acrCustomerReviewText');
          const reviewMatch = reviewCountEl ? (reviewCountEl.textContent || '').match(/([0-9,]+)/) : null;
          const priceEl = document.querySelector('.kindle-price .a-color-price, #kindle-price, .a-price .a-offscreen');
          const priceMatch = priceEl ? (priceEl.textContent || '').match(/([0-9,]+)/) : null;
          const ku = !!document.querySelector('img[alt*="Kindle Unlimited"], [aria-label*="Kindle Unlimited"]');
          return {
            ranks,
            rating: ratingMatch ? parseFloat(ratingMatch[1]) : null,
            review_count: reviewMatch ? parseInt(reviewMatch[1].replace(/,/g, ''), 10) : null,
            price_yen: priceMatch ? parseInt(priceMatch[1].replace(/,/g, ''), 10) : null,
            ku_observed: ku,
          };
        }
        """)
        result['asin'] = asin
        result['source_url'] = url
        result['collected_at'] = time.strftime('%Y-%m-%dT%H:%M:%S+09:00')
        RESULTS.append(result)

print(json.dumps(RESULTS, ensure_ascii=False))
`;
  return new Promise((resolve, reject) => {
    const proc = spawn("python3", ["-c", py]);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => {
      if (code !== 0) {
        console.error(`[scrape-bsr] python sub-process exit ${code}\n${stderr}`);
        reject(new Error(`python sub-process exit ${code}`));
        return;
      }
      try {
        const last = stdout.split("\n").filter((l) => l.trim().startsWith("[")).pop() ?? "[]";
        const parsed = JSON.parse(last) as BsrSnapshot[];
        resolve(parsed);
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function main() {
  const args = parseArgs();
  const ownAsins = await loadOwnAsins(args.slug);
  const compAsins = args.includeCompetitors ? await loadCompetitorAsins(args.slug) : [];
  const asins = Array.from(new Set([...ownAsins, ...compAsins, ...args.extraAsins]));

  if (asins.length === 0) {
    throw new Error(`[scrape-bsr] 取得対象 ASIN が0件。kdp-series.json で自作品ASIN登録するか、--asins / --include-competitors を指定`);
  }

  console.log(`[scrape-bsr] target: ${asins.length} ASINs (own=${ownAsins.length}, comp=${compAsins.length}, extra=${args.extraAsins.length})`);
  console.log(`[scrape-bsr] asins: ${asins.join(", ")}`);

  const snapshots = await fetchBsrForAsins(asins);

  const date = new Date().toISOString().split("T")[0];
  const outDir = path.join(REPO_ROOT, "data", "manga", "kdp", "bsr-snapshots", args.slug);
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `${date}.json`);
  await fs.writeFile(outPath, JSON.stringify({
    schema_version: 1,
    slug: args.slug,
    collected_at: new Date().toISOString(),
    own_asins: ownAsins,
    competitor_asins: compAsins,
    extra_asins: args.extraAsins,
    snapshots,
  }, null, 2));

  console.log(`[scrape-bsr] saved: ${outPath}`);
  console.log(`[scrape-bsr] summary:`);
  for (const s of snapshots) {
    if (s.fetch_error) {
      console.log(`  ❌ ${s.asin}: ${s.fetch_error}`);
      continue;
    }
    const rankSummary = Object.entries(s.ranks ?? {}).slice(0, 3).map(([k, v]) => `${k}:${v}位`).join(" / ");
    console.log(`  ✅ ${s.asin}: ${rankSummary} | ★${s.rating ?? "?"} (${s.review_count ?? "?"}件) | ¥${s.price_yen ?? "?"} | KU=${s.ku_observed}`);
  }
}

main().catch((e) => {
  console.error("[scrape-bsr] FAILED:", e);
  process.exit(1);
});
