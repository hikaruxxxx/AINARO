/**
 * Compliance Blocklist 月次更新スクリプト (skeleton, Phase 0)
 *
 * 目的:
 *   - data/manga/compliance/blocklist.json を月次で差分更新
 *   - false-positives.json のレビューリマインダ
 *   - 想定実行頻度: 月 1 回 (毎月 1 日 09:00 等)
 *
 * Phase 0 では skeleton のみ実装。実際の外部ソース連携は Phase 0 完了後に追加:
 *   - 商標庁公報 RSS (https://www.jpo.go.jp/) — 新規登録商標の差分
 *   - 著名 IP DB (集英社/講談社/角川公式 RSS、KADOKAWA Anime News 等)
 *   - 主要 SNS / 政府公人リストの差分
 *
 * Usage:
 *   npx tsx scripts/compliance/update-blocklist.ts             # 通常実行 (現状はレポートのみ)
 *   npx tsx scripts/compliance/update-blocklist.ts --dry-run   # 差分のみ表示
 *   npx tsx scripts/compliance/update-blocklist.ts --review    # false-positives のレビュー促進
 *
 * launchd 連携:
 *   ~/Library/LaunchAgents/ainaro-compliance-blocklist-update.plist で月次起動
 *   plist 雛形は scripts/compliance/launchd.plist.template.xml に格納予定 (TODO)
 */
import "../manga/_env";
import { promises as fs } from "node:fs";
import path from "node:path";

const BLOCKLIST_PATH = "data/manga/compliance/blocklist.json";
const FALSE_POSITIVES_PATH = "data/manga/compliance/false-positives.json";

type Args = {
  dryRun: boolean;
  review: boolean;
};

type BlocklistMin = {
  schema_version: number;
  _meta?: Record<string, unknown>;
  safe_substitutes?: Record<string, unknown>;
  category_severity?: { fatal?: string[]; warn?: string[] };
  [category: string]: unknown;
};

type FalsePositivesMin = {
  schema_version: number;
  exact_term_excludes?: string[];
  context_excludes?: Array<{ term: string; reason: string; added_at?: string }>;
};

function parseArgs(): Args {
  const a: Args = { dryRun: false, review: false };
  for (const arg of process.argv.slice(2)) {
    if (arg === "--dry-run") a.dryRun = true;
    else if (arg === "--review") a.review = true;
  }
  return a;
}

async function loadJson<T>(filePath: string): Promise<T> {
  const resolved = path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath);
  const raw = await fs.readFile(resolved, "utf-8");
  return JSON.parse(raw) as T;
}

function summarizeBlocklist(blocklist: BlocklistMin): {
  total_terms: number;
  by_top_category: Record<string, number>;
  safe_substitutes_count: number;
} {
  const skipKeys = new Set([
    "schema_version",
    "_meta",
    "safe_substitutes",
    "category_severity",
  ]);
  let total = 0;
  const byTop: Record<string, number> = {};

  function countTerms(value: unknown): number {
    if (Array.isArray(value)) {
      return value.filter((x) => typeof x === "string").length;
    }
    if (value && typeof value === "object") {
      let sum = 0;
      for (const child of Object.values(value as Record<string, unknown>)) {
        sum += countTerms(child);
      }
      return sum;
    }
    return 0;
  }

  for (const [topKey, value] of Object.entries(blocklist)) {
    if (skipKeys.has(topKey)) continue;
    const count = countTerms(value);
    byTop[topKey] = count;
    total += count;
  }

  return {
    total_terms: total,
    by_top_category: byTop,
    safe_substitutes_count: Object.keys(blocklist.safe_substitutes ?? {}).length,
  };
}

function summarizeFalsePositives(fp: FalsePositivesMin): {
  exact_excludes: number;
  context_excludes: number;
  oldest_entry_at?: string;
} {
  const exactCount = (fp.exact_term_excludes ?? []).length;
  const ctxList = fp.context_excludes ?? [];
  const dates = ctxList
    .map((c) => c.added_at)
    .filter((d): d is string => Boolean(d))
    .sort();
  return {
    exact_excludes: exactCount,
    context_excludes: ctxList.length,
    oldest_entry_at: dates[0],
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  console.log("[compliance/update-blocklist] start");
  console.log(`  dry-run: ${args.dryRun}`);
  console.log(`  review:  ${args.review}`);

  const blocklist = await loadJson<BlocklistMin>(BLOCKLIST_PATH);
  const fp = await loadJson<FalsePositivesMin>(FALSE_POSITIVES_PATH);

  const blSummary = summarizeBlocklist(blocklist);
  const fpSummary = summarizeFalsePositives(fp);

  console.log("\n=== Blocklist 現状 ===");
  console.log(`  total terms: ${blSummary.total_terms}`);
  console.log(`  safe_substitutes: ${blSummary.safe_substitutes_count}`);
  console.log("  by top category:");
  for (const [cat, count] of Object.entries(blSummary.by_top_category).sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`    ${cat}: ${count}`);
  }

  console.log("\n=== False positives 現状 ===");
  console.log(`  exact excludes:   ${fpSummary.exact_excludes}`);
  console.log(`  context excludes: ${fpSummary.context_excludes}`);
  if (fpSummary.oldest_entry_at) {
    console.log(`  oldest entry at:  ${fpSummary.oldest_entry_at}`);
  }

  // ============================================================
  // TODO (Phase 0 完了後の実装):
  // ============================================================
  // 1. 商標庁公報 RSS フィード取得・パース
  //    例: https://www.jpo.go.jp/e/news/rss/* 等から登録商標の差分を取得
  //    新規登録商標を blocklist.trademarks.* の該当カテゴリに自動追加
  //
  // 2. 著名 IP DB 連携
  //    集英社・講談社・小学館・KADOKAWA・スクエニ等の RSS から新作品名を取得
  //    blocklist.ip_works.anime_manga / games / novels に追加
  //
  // 3. 政治家・芸能人公人リスト
  //    Wikipedia "現職参議院議員" "現職衆議院議員" カテゴリの API 取得
  //    blocklist.real_persons.politicians_jp / celebrities_jp_high_profile に追加
  //
  // 4. AnchorPool 既存生成物の compliance scan
  //    data/generation/anchors/* を全 scan、検出語を blocklist 候補に
  //
  // 5. PR 化フロー
  //    --dry-run でなければ blocklist.json を直接更新
  //    git diff を生成し、Slack/Discord 等に通知 (TODO: 通知方式は後決め)
  //
  // 6. False positives のエージング
  //    180 日以上経過した context_excludes は --review モードで再確認を促す
  // ============================================================

  if (args.review) {
    console.log("\n=== False positives レビュー対象 ===");
    const ctx = fp.context_excludes ?? [];
    const now = Date.now();
    const oldThresholdMs = 180 * 24 * 60 * 60 * 1000;
    let oldCount = 0;
    for (const entry of ctx) {
      if (!entry.added_at) continue;
      const addedMs = Date.parse(entry.added_at);
      if (Number.isFinite(addedMs) && now - addedMs > oldThresholdMs) {
        oldCount += 1;
        console.log(
          `  [180日以上経過] '${entry.term}' (${entry.added_at}): ${entry.reason}`
        );
      }
    }
    if (oldCount === 0) {
      console.log("  全 context_excludes は最近のもの (180日以内)");
    }
  }

  if (args.dryRun) {
    console.log("\n[compliance/update-blocklist] dry-run のみ。差分書き込みは実装後 (TODO)");
  }

  console.log("\n[compliance/update-blocklist] DONE");
}

main().catch((e) => {
  console.error("[compliance/update-blocklist] FAILED:", e);
  process.exit(1);
});
