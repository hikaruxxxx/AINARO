/**
 * 本番Supabaseのマイグレーション適用状況チェック
 *
 * 04-08系の5本のマイグレーションが本番DBに適用済みか、
 * 各テーブル/関数の存在とサンプルクエリで確認する。
 *
 * 使い方:
 *   npx tsx scripts/utils/check-migration-status.ts
 *
 * 終了コード: 全て適用済みなら 0、未適用が1つでもあれば 1
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

function loadEnv() {
  try {
    const content = readFileSync(".env.local", "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const [key, ...valueParts] = trimmed.split("=");
      if (key && !process.env[key]) {
        let value = valueParts.join("=");
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        process.env[key] = value;
      }
    }
  } catch {
    // .env.localが無い場合は無視
  }
}
loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要");
  process.exit(1);
}

const supabase = createClient(url, key);

type CheckResult = {
  migration: string;
  description: string;
  status: "✅" | "❌" | "⚠️";
  detail: string;
};

const results: CheckResult[] = [];

async function checkTable(name: string): Promise<{ ok: boolean; count?: number; error?: string }> {
  // 注意: head:true + count:exact だけでは PostgRESTスキーマキャッシュの
  // 古いエントリで誤OKを返すことがあった (2026-04-08 検出)。
  // 実体テーブルが無くても「count=0 でOK」となる罠を避けるため、
  // 実データ select も併用して本当に SELECT が通るか検証する。
  const { error: selErr } = await supabase
    .from(name)
    .select("*")
    .limit(1);
  if (selErr) return { ok: false, error: selErr.message };

  const { count, error: cntErr } = await supabase
    .from(name)
    .select("*", { count: "exact", head: true });
  if (cntErr) return { ok: false, error: cntErr.message };
  return { ok: true, count: count ?? 0 };
}

async function checkRpc(name: string, args: Record<string, unknown> = {}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc(name, args);
  if (error) {
    // 関数が存在しない場合のエラーを判定
    if (
      error.message.includes("does not exist") ||
      error.message.includes("function") ||
      error.code === "42883" ||
      error.code === "PGRST202"
    ) {
      return { ok: false, error: error.message };
    }
    // 実行エラー(関数は存在する)は OK 扱い
    return { ok: true, error: error.message };
  }
  return { ok: true };
}

async function main() {
  console.log("=".repeat(70));
  console.log("本番Supabaseマイグレーション適用状況チェック");
  console.log(`URL: ${url?.replace(/https:\/\/([^.]+).*/, "https://$1***")}`);
  console.log("=".repeat(70));
  console.log("");

  // ============================================================
  // 20260408000000_work_completions
  // ============================================================
  {
    const t = await checkTable("work_completions");
    const monthly = await checkRpc("monthly_completion_stats", { p_months_back: 1 });
    const top = await checkRpc("top_completed_works", { p_limit: 1, p_days_back: 30 });
    const allOk = t.ok && monthly.ok && top.ok;
    results.push({
      migration: "20260408000000_work_completions",
      description: "完走者数の派生テーブル + 集計関数",
      status: allOk ? "✅" : "❌",
      detail: allOk
        ? `work_completions: ${t.count}件 / RPC両方OK`
        : `table=${t.ok ? "OK" : "NG: " + t.error} / monthly_completion_stats=${monthly.ok ? "OK" : "NG"} / top_completed_works=${top.ok ? "OK" : "NG"}`,
    });
  }

  // ============================================================
  // 20260408010000_streaks_and_badges
  // ============================================================
  {
    const badges = await checkTable("badges");
    const userBadges = await checkTable("user_badges");
    // claim_login_bonus / grant_reading_badges の存在確認
    // 引数を空のUUIDで呼ぶと「ユーザーが見つからない」系のエラーになるが関数は存在する
    const bonus = await checkRpc("claim_login_bonus", {
      p_user_id: "00000000-0000-0000-0000-000000000000",
    });
    const grant = await checkRpc("grant_reading_badges", {
      p_user_id: "00000000-0000-0000-0000-000000000000",
    });
    const allOk = badges.ok && userBadges.ok && bonus.ok && grant.ok;
    results.push({
      migration: "20260408010000_streaks_and_badges",
      description: "ストリーク + バッジマスタ + ユーザー獲得記録",
      status: allOk ? "✅" : "❌",
      detail: allOk
        ? `badges: ${badges.count}件 / user_badges: ${userBadges.count}件 / RPC両方OK`
        : `badges=${badges.ok ? "OK" : "NG"} / user_badges=${userBadges.ok ? "OK" : "NG"} / claim_login_bonus=${bonus.ok ? "OK" : "NG"} / grant_reading_badges=${grant.ok ? "OK" : "NG"}`,
    });
  }

  // ============================================================
  // 20260408020000_mau_dau_stats
  // ============================================================
  {
    const dau = await checkRpc("dau_daily", { p_days_back: 1 });
    const mau = await checkRpc("mau_summary", { p_days_back: 1 });
    const allOk = dau.ok && mau.ok;
    results.push({
      migration: "20260408020000_mau_dau_stats",
      description: "MAU/DAU 集計関数(v2 主KPI)",
      status: allOk ? "✅" : "❌",
      detail: allOk
        ? "dau_daily / mau_summary 両方OK"
        : `dau_daily=${dau.ok ? "OK" : "NG: " + dau.error} / mau_summary=${mau.ok ? "OK" : "NG: " + mau.error}`,
    });
  }

  // ============================================================
  // 20260408030000_push_subscriptions
  // ============================================================
  {
    const t = await checkTable("push_subscriptions");
    results.push({
      migration: "20260408030000_push_subscriptions",
      description: "Webプッシュ通知 購読管理テーブル",
      status: t.ok ? "✅" : "❌",
      detail: t.ok ? `push_subscriptions: ${t.count}件` : `NG: ${t.error}`,
    });
  }

  // ============================================================
  // 20260408040000_grant_badges_on_completion
  // ============================================================
  // record_work_completion 関数の本体に「PERFORM grant_reading_badges」が
  // 含まれているかは pg_proc から確認する必要がある。ここでは代理として
  // grant_reading_badges 関数の存在と完走時の動作確認は手動チェック扱い。
  {
    const grant = await checkRpc("grant_reading_badges", {
      p_user_id: "00000000-0000-0000-0000-000000000000",
    });
    results.push({
      migration: "20260408040000_grant_badges_on_completion",
      description: "完走時バッジ自動付与トリガー(record_work_completion 上書き)",
      status: grant.ok ? "⚠️" : "❌",
      detail: grant.ok
        ? "grant_reading_badges は存在(トリガー本体の上書きは手動確認: 完走テストで user_badges に finisher_1 が入るか)"
        : `NG: ${grant.error}`,
    });
  }

  // ============================================================
  // 結果出力
  // ============================================================
  console.log("【マイグレーション適用状況】");
  for (const r of results) {
    console.log(`${r.status}  ${r.migration}`);
    console.log(`   ${r.description}`);
    console.log(`   → ${r.detail}`);
    console.log("");
  }

  const failed = results.filter((r) => r.status === "❌");
  const warning = results.filter((r) => r.status === "⚠️");

  console.log("=".repeat(70));
  if (failed.length === 0 && warning.length === 0) {
    console.log("✅ 全マイグレーション適用済み");
    process.exit(0);
  } else if (failed.length === 0) {
    console.log(`⚠️  ${warning.length}件は手動確認が必要(失敗ではない)`);
    process.exit(0);
  } else {
    console.log(`❌ ${failed.length}件のマイグレーション未適用 or 関数未定義`);
    console.log("");
    console.log("対処:");
    console.log("  Supabase Dashboard → SQL Editor で該当マイグレーションを実行");
    for (const r of failed) {
      console.log(`  - supabase/migrations/${r.migration}.sql`);
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("予期しないエラー:", e);
  process.exit(1);
});
