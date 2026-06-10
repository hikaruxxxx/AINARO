/**
 * KDP レポート CSV ingestion → KU FCE 計測パイプライン
 *
 * 設計根拠:
 *   - Plan: /Users/hikarumori/.claude/plans/groovy-wishing-castle.md WX-6
 *   - Codex 推奨「CSV ingest だけは早めに作る」(2026-05-06)
 *   - docs/strategy/kdp_account_safety.md §6.2
 *
 * 主指標: FCE (Final Completion Equivalent) = Pages Read / KENPC
 *   - 月10万円 ≒ FCE 1000/月 (KENPC 160 × 1KENP 0.6-0.8円)
 *   - 詳細はゴール定義: plan の Operational Goal セクション参照
 *
 * 入力: KDP レポート CSV (Author Central > Reports > KDP Royalty Report)
 *   想定列: ASIN, Title, Author, Pages Read (KENP), Royalty, Currency, Date等
 *
 * 出力:
 *   - data/manga/works/{slug}/kpi/ku-rt-{YYYY-MM}.json (月次集計)
 *   - data/manga/works/{slug}/kpi/completion.json (FCE トレンド)
 *
 * 使い方:
 *   npx tsx scripts/manga/ingest-kdp-report.ts --csv=path/to/report.csv --month=2026-09
 *   npx tsx scripts/manga/ingest-kdp-report.ts --csv=path/to/report.csv --month=2026-09 --dry-run
 *
 * Phase X: 手動実行 (CSV を Author Central から手動DLしてpath指定)
 * Phase Y: 週次 cron 化 (kdp-api 経由 or playwright で自動DL)
 */

import "./_env";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

// ===== 型定義 =====

export type KdpReportRow = {
  asin: string;
  title: string;
  author?: string;
  /** KU で読まれた合計ページ数 (KENP) */
  pagesRead: number;
  /** Kindle Edition Normalized Page Count (本のページ数、ASIN ごと固定) */
  kenpc?: number;
  /** ロイヤリティ (KU read分 + 販売分の合計、現地通貨) */
  royalty: number;
  currency: string;
  /** マーケットプレイス (例: Amazon.co.jp / Amazon.com) */
  marketplace?: string;
  /** KU borrows 数 (CSV に含まれる場合) */
  borrows?: number;
};

export type WorkKpiMonthly = {
  schemaVersion: 1;
  slug: string;
  asin: string;
  title: string;
  yearMonth: string; // "2026-09"
  /** 取得元 CSV のパス (audit用) */
  sourceCsv: string;
  /** ingestion 実行時刻 */
  ingestedAt: string;

  // === KU 主指標 ===
  pagesRead: number;
  kenpc: number; // 既知の KENPC を採用 (CSV 取得 or 手動入力 or 前月引き継ぎ)
  /** FCE = Pages Read / KENPC (= 完読相当人数) */
  fce: number;

  // === 副指標 ===
  borrows?: number;
  royalty: number;
  currency: string;
  marketplace?: string;

  // === 1巻10万円 判定補助 ===
  /** 1KENP 単価 (円換算、目安 0.6-0.8円。月次変動) */
  kenpUnitPriceJpyEstimate?: number;
  /** 月収益概算 (円) = pagesRead * kenpUnitPriceJpyEstimate + 販売royalty */
  monthlyRevenueJpyEstimate?: number;
  /** 月10万円目標達成判定 (kenpUnitPriceJpy が指定された時のみ) */
  targetReached100k?: boolean;
};

export type CompletionTrend = {
  schemaVersion: 1;
  slug: string;
  asin: string;
  /** 月別 FCE の時系列 (新→旧) */
  months: Array<{
    yearMonth: string;
    fce: number;
    pagesRead: number;
    kenpc: number;
    royalty: number;
    currency: string;
    monthlyRevenueJpyEstimate?: number;
    targetReached100k?: boolean;
  }>;
  /** 直近3ヶ月の FCE 平均 (安定性指標) */
  rolling3MonthAvgFce?: number;
  /** 1巻10万円ライン (FCE 1000) を達成した最初の月 */
  firstMonth100kReached?: string;
};

// ===== CSV パーサ =====

/**
 * CSV パーサ (RFC 4180 準拠の最小実装)。
 *
 * 対応 (Phase X WX-6 Codex レビュー反映 2026-05-06):
 *   - UTF-8 BOM (﻿) を先頭から自動除去
 *   - クォート (") で囲まれたセル内の改行 (LF / CRLF) を保持
 *   - クォート内の "" (escaped quote) を " として扱う
 *   - 行末 CRLF / LF 両対応
 *   - 空行はスキップ
 *
 * KDP レポート CSV のような UTF-8 BOM 付き / 改行入りセルを含む実 CSV で堅牢に動く。
 */
export function parseCsv(text: string): string[][] {
  // BOM 除去
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  const rows: string[][] = [];
  let cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
      continue;
    }
    // 非 quote モード
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(current);
      current = "";
    } else if (ch === "\r") {
      // CRLF または CR で行終端。次の \n はスキップ
      if (text[i + 1] === "\n") i++;
      cells.push(current);
      // 空行スキップ (全セルが空の場合)
      if (!(cells.length === 1 && cells[0] === "")) rows.push(cells);
      cells = [];
      current = "";
    } else if (ch === "\n") {
      cells.push(current);
      if (!(cells.length === 1 && cells[0] === "")) rows.push(cells);
      cells = [];
      current = "";
    } else {
      current += ch;
    }
  }
  // 末尾に改行が無い場合の最後の行
  if (current.length > 0 || cells.length > 0) {
    cells.push(current);
    if (!(cells.length === 1 && cells[0] === "")) rows.push(cells);
  }
  return rows;
}

/**
 * KDP レポート CSV の列ヘッダから KdpReportRow への mapping を作る。
 * KDP は時々ヘッダ表記を変えるので、複数候補を許容する fuzzy match。
 */
export function buildHeaderIndex(headerRow: string[]): {
  asin: number;
  title: number;
  author: number;
  pagesRead: number;
  kenpc: number;
  royalty: number;
  currency: number;
  marketplace: number;
  borrows: number;
} {
  const lower = headerRow.map((h) => h.toLowerCase().trim());
  const findByCandidates = (candidates: string[]): number => {
    for (const cand of candidates) {
      const idx = lower.indexOf(cand);
      if (idx >= 0) return idx;
    }
    return -1;
  };
  return {
    asin: findByCandidates(["asin"]),
    title: findByCandidates(["title", "title-name"]),
    author: findByCandidates(["author", "author name"]),
    pagesRead: findByCandidates([
      "kenp pages read",
      "pages read",
      "pages_read",
      "kenp",
    ]),
    kenpc: findByCandidates(["kenpc", "kindle edition normalized page count"]),
    royalty: findByCandidates(["royalty", "estimated royalty", "earnings"]),
    currency: findByCandidates(["currency", "royalty currency"]),
    marketplace: findByCandidates(["marketplace", "marketplace id", "country"]),
    borrows: findByCandidates(["units borrowed", "borrows", "ku borrows"]),
  };
}

export function rowToReportRow(
  row: string[],
  idx: ReturnType<typeof buildHeaderIndex>,
): KdpReportRow | null {
  if (idx.asin < 0 || idx.pagesRead < 0) return null;
  const asin = (row[idx.asin] ?? "").trim();
  if (!asin) return null;
  const num = (i: number, fallback = 0): number => {
    if (i < 0) return fallback;
    const raw = (row[i] ?? "").trim().replace(/,/g, "");
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  };
  const str = (i: number): string => (i >= 0 ? (row[i] ?? "").trim() : "");
  return {
    asin,
    title: str(idx.title),
    author: idx.author >= 0 ? str(idx.author) : undefined,
    pagesRead: num(idx.pagesRead),
    kenpc: idx.kenpc >= 0 ? num(idx.kenpc, 0) : undefined,
    royalty: num(idx.royalty),
    currency: str(idx.currency) || "JPY",
    marketplace: idx.marketplace >= 0 ? str(idx.marketplace) : undefined,
    borrows: idx.borrows >= 0 ? num(idx.borrows, 0) : undefined,
  };
}

// ===== 集計 =====

export type IngestArgs = {
  csvPath: string;
  yearMonth: string; // "2026-09"
  /** KENPC が CSV に含まれない場合の手動指定 (ASIN ごと) */
  kenpcOverrides?: Record<string, number>;
  /** 1KENP 単価 (円換算、月次推定値、未指定時は計算 skip) */
  kenpUnitPriceJpy?: number;
  /** ASIN -> slug の対応 (data/manga/works/{slug}/ への書き込み先解決) */
  asinToSlug?: Record<string, string>;
  /** dry-run モード (ファイル書き出しせずに集計結果だけ出力) */
  dryRun?: boolean;
  /** 出力ルート (default: data/manga/works) */
  outRoot?: string;
};

export type IngestResult = {
  monthlies: WorkKpiMonthly[];
  unmatched: KdpReportRow[]; // asinToSlug に該当しなかった行
  errors: string[];
};

/**
 * CSV を読み込んで月次 KPI と完読率トレンドを更新する。
 * dryRun=true なら結果をメモリ上で返すだけでファイルは書かない。
 */
export function ingestKdpReport(args: IngestArgs): IngestResult {
  const result: IngestResult = { monthlies: [], unmatched: [], errors: [] };

  if (!existsSync(args.csvPath)) {
    result.errors.push(`CSV not found: ${args.csvPath}`);
    return result;
  }

  const csvText = readFileSync(args.csvPath, "utf-8");
  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    result.errors.push("CSV に有効な行がありません");
    return result;
  }

  const headerIdx = buildHeaderIndex(rows[0]);
  if (headerIdx.asin < 0 || headerIdx.pagesRead < 0) {
    result.errors.push(
      "CSV に ASIN または Pages Read 列が見つかりません。KDP レポート列名が変更された可能性",
    );
    return result;
  }

  const outRoot = args.outRoot ?? "data/manga/works";
  const ingestedAt = new Date().toISOString();

  for (const row of rows.slice(1)) {
    const r = rowToReportRow(row, headerIdx);
    if (!r) continue;

    const slug = args.asinToSlug?.[r.asin];
    if (!slug) {
      result.unmatched.push(r);
      continue;
    }

    const kenpc = r.kenpc ?? args.kenpcOverrides?.[r.asin];
    if (!kenpc || kenpc <= 0) {
      result.errors.push(
        `ASIN ${r.asin} (slug=${slug}): KENPC が不明 (CSV になし、kenpcOverrides 未指定)`,
      );
      continue;
    }

    const fce = r.pagesRead / kenpc;
    const monthlyRevenueJpy = args.kenpUnitPriceJpy
      ? r.pagesRead * args.kenpUnitPriceJpy +
        (r.currency === "JPY" ? r.royalty : 0) // 簡易: JPY のみ販売royaltyに加算
      : undefined;

    const monthly: WorkKpiMonthly = {
      schemaVersion: 1,
      slug,
      asin: r.asin,
      title: r.title,
      yearMonth: args.yearMonth,
      sourceCsv: path.resolve(args.csvPath),
      ingestedAt,
      pagesRead: r.pagesRead,
      kenpc,
      fce,
      borrows: r.borrows,
      royalty: r.royalty,
      currency: r.currency,
      marketplace: r.marketplace,
      kenpUnitPriceJpyEstimate: args.kenpUnitPriceJpy,
      monthlyRevenueJpyEstimate: monthlyRevenueJpy,
      targetReached100k:
        monthlyRevenueJpy !== undefined ? monthlyRevenueJpy >= 100_000 : undefined,
    };

    result.monthlies.push(monthly);

    if (!args.dryRun) {
      const kpiDir = path.join(outRoot, slug, "kpi");
      if (!existsSync(kpiDir)) mkdirSync(kpiDir, { recursive: true });

      // 月次 JSON
      const monthFile = path.join(kpiDir, `ku-rt-${args.yearMonth}.json`);
      writeFileSync(monthFile, JSON.stringify(monthly, null, 2), "utf-8");

      // completion.json (時系列) を更新
      const completionFile = path.join(kpiDir, "completion.json");
      const existing: CompletionTrend = existsSync(completionFile)
        ? (JSON.parse(readFileSync(completionFile, "utf-8")) as CompletionTrend)
        : {
            schemaVersion: 1,
            slug,
            asin: r.asin,
            months: [],
          };
      // 同月 entry があれば置換、なければ追加
      const filtered = existing.months.filter((m) => m.yearMonth !== args.yearMonth);
      filtered.unshift({
        yearMonth: args.yearMonth,
        fce,
        pagesRead: r.pagesRead,
        kenpc,
        royalty: r.royalty,
        currency: r.currency,
        monthlyRevenueJpyEstimate: monthlyRevenueJpy,
        targetReached100k: monthly.targetReached100k,
      });
      // 月次降順ソート
      filtered.sort((a, b) => (a.yearMonth < b.yearMonth ? 1 : -1));
      const updated: CompletionTrend = {
        ...existing,
        asin: r.asin,
        months: filtered,
        rolling3MonthAvgFce: filtered.slice(0, 3).reduce((s, m) => s + m.fce, 0) / Math.min(3, filtered.length || 1),
        firstMonth100kReached:
          existing.firstMonth100kReached ??
          (monthly.targetReached100k ? args.yearMonth : undefined),
      };
      writeFileSync(completionFile, JSON.stringify(updated, null, 2), "utf-8");
    }
  }

  return result;
}

// ===== CLI =====

function parseCliArgs(argv: string[]): IngestArgs {
  const args: Partial<IngestArgs> & {
    asinToSlugFile?: string;
    kenpcOverridesFile?: string;
  } = {};
  for (const a of argv) {
    if (a.startsWith("--csv=")) args.csvPath = a.slice("--csv=".length);
    else if (a.startsWith("--month=")) args.yearMonth = a.slice("--month=".length);
    else if (a.startsWith("--asin-to-slug=")) {
      args.asinToSlugFile = a.slice("--asin-to-slug=".length);
    } else if (a.startsWith("--kenpc-overrides=")) {
      args.kenpcOverridesFile = a.slice("--kenpc-overrides=".length);
    } else if (a.startsWith("--kenp-unit-price-jpy=")) {
      args.kenpUnitPriceJpy = Number(a.slice("--kenp-unit-price-jpy=".length));
    } else if (a.startsWith("--out-root=")) {
      args.outRoot = a.slice("--out-root=".length);
    } else if (a === "--dry-run") {
      args.dryRun = true;
    }
  }
  if (!args.csvPath) {
    throw new Error("--csv=path/to/report.csv is required");
  }
  if (!args.yearMonth) {
    throw new Error("--month=YYYY-MM is required");
  }
  if (args.asinToSlugFile && existsSync(args.asinToSlugFile)) {
    args.asinToSlug = JSON.parse(readFileSync(args.asinToSlugFile, "utf-8"));
  }
  if (args.kenpcOverridesFile && existsSync(args.kenpcOverridesFile)) {
    args.kenpcOverrides = JSON.parse(
      readFileSync(args.kenpcOverridesFile, "utf-8"),
    );
  }
  return args as IngestArgs;
}

async function main() {
  let args: IngestArgs;
  try {
    args = parseCliArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`[ingest-kdp-report] ${(e as Error).message}`);
    console.error("");
    console.error("使い方:");
    console.error(
      "  npx tsx scripts/manga/ingest-kdp-report.ts --csv=path/to/report.csv --month=2026-09",
    );
    console.error("");
    console.error("オプション:");
    console.error("  --asin-to-slug=path/to/asin-slug-map.json  ASIN -> slug の対応表");
    console.error(
      "  --kenpc-overrides=path/to/kenpc.json        ASIN -> KENPC の手動指定 (CSV に列が無い場合)",
    );
    console.error(
      "  --kenp-unit-price-jpy=0.7                    1KENP 円単価推定値 (月次変動)",
    );
    console.error("  --out-root=data/manga/works                  出力先ルート");
    console.error("  --dry-run                                    ファイル書き出しせず集計結果だけ表示");
    process.exit(1);
  }

  const result = ingestKdpReport(args);

  console.log(`[ingest-kdp-report] 月次取り込み完了: ${args.yearMonth}`);
  console.log(`  matched works: ${result.monthlies.length}`);
  console.log(`  unmatched ASIN: ${result.unmatched.length}`);
  console.log(`  errors: ${result.errors.length}`);

  if (result.monthlies.length > 0) {
    console.log("\n=== 月次 KPI 一覧 ===");
    for (const m of result.monthlies) {
      const target = m.targetReached100k ? "✅" : m.monthlyRevenueJpyEstimate ? "❌" : "?";
      const revenue =
        m.monthlyRevenueJpyEstimate !== undefined
          ? `¥${Math.round(m.monthlyRevenueJpyEstimate).toLocaleString()}`
          : "(unit price 未指定)";
      console.log(
        `  ${target} ${m.slug.padEnd(30)} FCE=${m.fce.toFixed(1).padStart(8)} pagesRead=${m.pagesRead.toString().padStart(8)} ${revenue}`,
      );
    }
  }

  if (result.unmatched.length > 0) {
    console.log("\n=== ASIN -> slug マッピング不在 ===");
    for (const u of result.unmatched.slice(0, 10)) {
      console.log(`  ${u.asin} ${u.title}`);
    }
    if (result.unmatched.length > 10) {
      console.log(`  ... 他 ${result.unmatched.length - 10} 件`);
    }
  }

  if (result.errors.length > 0) {
    console.log("\n=== エラー ===");
    for (const e of result.errors) console.log(`  ${e}`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
