// cover_image_url が未設定の作品に対して表紙画像を一括生成する
//
// 使い方:
//   npx tsx scripts/generation/bulk-cover.ts [--limit 50] [--dry-run]

import { existsSync, readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { generateCoverInBackground } from "../../src/lib/cover/generate";

// .env.local を手動パース
function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnvFile(".env.local");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 50;

function log(msg: string): void {
  console.log(`[bulk-cover] ${msg}`);
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error(".env.local にSupabase設定が必要");

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // カバーなしの作品を取得
  const { data: novels, error } = await supabase
    .from("novels")
    .select("id, title, tagline, author_name, genre, slug")
    .is("cover_image_url", null)
    .limit(limit);

  if (error) throw new Error(`novels取得失敗: ${error.message}`);
  if (!novels || novels.length === 0) {
    log("カバーなしの作品はありません");
    return;
  }

  log(`カバーなし: ${novels.length}件 (limit=${limit}, dryRun=${dryRun})`);

  if (dryRun) {
    for (const n of novels) {
      log(`  ${n.slug} | ${n.title} | ${n.genre}`);
    }
    return;
  }

  let success = 0;
  let failed = 0;

  for (let i = 0; i < novels.length; i++) {
    const n = novels[i];
    log(`[${i + 1}/${novels.length}] ${n.slug} (${n.title})`);

    try {
      await generateCoverInBackground(
        {
          novelId: n.id,
          title: n.title,
          tagline: n.tagline,
          authorName: n.author_name,
          genre: n.genre,
        },
        supabase,
        { force: true },
      );
      success++;
      // Pollinations.aiのレート制限対策: 2秒間隔
      await new Promise((r) => setTimeout(r, 2000));
    } catch (e) {
      log(`  失敗: ${e}`);
      failed++;
    }
  }

  log(`=== 完了 === 成功: ${success} 失敗: ${failed}`);
}

main().catch((e) => {
  log(`fatal: ${e}`);
  process.exit(1);
});
