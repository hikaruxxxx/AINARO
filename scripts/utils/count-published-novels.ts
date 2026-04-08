/**
 * 公開済み作品の本数を集計
 *
 * v2 §6 ローンチ前チェックリスト「完結30本以上 / 連載20本以上」の確認用。
 *
 * 使い方:
 *   npx tsx scripts/utils/count-published-novels.ts
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

// .env.local を手動でパース
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
  console.error("環境変数 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要です");
  process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
  // 全作品取得 (status, total_chapters, published_at)
  const { data: novels, error } = await supabase
    .from("novels")
    .select("id, title, status, total_chapters, published_at, cover_image_url, synopsis, tags");

  if (error) {
    console.error("DBエラー:", error.message);
    process.exit(1);
  }

  if (!novels || novels.length === 0) {
    console.log("作品がありません");
    return;
  }

  const completed = novels.filter((n) => n.status === "complete");
  const serial = novels.filter((n) => n.status === "serial");
  const hiatus = novels.filter((n) => n.status === "hiatus");
  const other = novels.filter(
    (n) => !["complete", "serial", "hiatus"].includes(n.status)
  );

  // 必須メタ未完備の検出
  const noCover = novels.filter((n) => !n.cover_image_url);
  const noSynopsis = novels.filter((n) => !n.synopsis || n.synopsis.length < 20);
  const noTags = novels.filter((n) => !n.tags || n.tags.length === 0);
  const noEpisodes = novels.filter((n) => !n.total_chapters || n.total_chapters === 0);

  console.log("=".repeat(60));
  console.log("Novelis 公開作品集計 (v2 §6 チェックリスト用)");
  console.log("=".repeat(60));
  console.log("");
  console.log(`総作品数: ${novels.length} 本`);
  console.log("");
  console.log("【ステータス別】");
  console.log(`  完結 (complete): ${completed.length} 本  目標30本以上 ${completed.length >= 30 ? "✅" : "❌ 不足 " + (30 - completed.length)}`);
  console.log(`  連載中 (serial): ${serial.length} 本  目標20本以上 ${serial.length >= 20 ? "✅" : "❌ 不足 " + (20 - serial.length)}`);
  console.log(`  休止 (hiatus):   ${hiatus.length} 本`);
  if (other.length > 0) {
    console.log(`  その他:          ${other.length} 本`);
    for (const n of other) {
      console.log(`    - ${n.title} (status=${n.status})`);
    }
  }
  console.log("");
  console.log("【メタ情報の完備】");
  console.log(`  カバー画像なし:  ${noCover.length} 本 ${noCover.length === 0 ? "✅" : "⚠️"}`);
  console.log(`  あらすじ不足:    ${noSynopsis.length} 本 ${noSynopsis.length === 0 ? "✅" : "⚠️"}`);
  console.log(`  タグなし:        ${noTags.length} 本 ${noTags.length === 0 ? "✅" : "⚠️"}`);
  console.log(`  エピソード0:     ${noEpisodes.length} 本 ${noEpisodes.length === 0 ? "✅" : "⚠️"}`);

  // 不足している作品の詳細
  if (noCover.length > 0 || noSynopsis.length > 0 || noTags.length > 0 || noEpisodes.length > 0) {
    console.log("");
    console.log("【要修正作品】");
    const needsFix = new Set<string>();
    for (const n of noCover) needsFix.add(n.id);
    for (const n of noSynopsis) needsFix.add(n.id);
    for (const n of noTags) needsFix.add(n.id);
    for (const n of noEpisodes) needsFix.add(n.id);
    for (const id of needsFix) {
      const n = novels.find((x) => x.id === id);
      if (!n) continue;
      const issues = [];
      if (!n.cover_image_url) issues.push("カバー");
      if (!n.synopsis || n.synopsis.length < 20) issues.push("あらすじ");
      if (!n.tags || n.tags.length === 0) issues.push("タグ");
      if (!n.total_chapters) issues.push("エピソード");
      console.log(`  - ${n.title} [${n.status}] : ${issues.join(", ")}`);
    }
  }

  console.log("");
  console.log("=".repeat(60));

  // 終了コード: 目標未達なら 1
  if (completed.length < 30 || serial.length < 20) {
    console.log("⚠️  ローンチ目標未達");
    process.exit(1);
  } else {
    console.log("✅ ローンチ目標達成");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
