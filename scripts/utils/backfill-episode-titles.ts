// content/works/ の各 ep*.md 先頭行 `# 第N話「...」` を正として、
// Supabase episodes.title を UPDATE する（md に既に付与済みのタイトルを DB に同期する）。
//
// タイトルの生成自体はこのスクリプトでは行わない。
// md 先頭が `# 第N話「...」` でないエピソードは skip して、レポートする。
// タイトル付与は Claude Code 会話本体 or サブエージェントで行う方針。
//
// 使い方:
//   npx tsx scripts/utils/backfill-episode-titles.ts [--dry-run] [--slug SLUG] [--limit N] [--report-missing]
//
// 前提: .env.local に NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

const CONTENT_DIR = "content/works";

// 引数パース
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const reportMissing = args.includes("--report-missing");
const slugIdx = args.indexOf("--slug");
const targetSlug = slugIdx !== -1 ? args[slugIdx + 1] : null;
const limitIdx = args.indexOf("--limit");
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : Infinity;

function log(msg: string): void {
  console.log(`[sync-titles] ${msg}`);
}

type EpisodeFile = {
  slug: string;
  epNum: number;
  firstLine: string;
  title: string | null; // `# 第N話「...」` なら抽出、なければ null
};

// 全 ep md を走査
function collectEpisodes(): EpisodeFile[] {
  const results: EpisodeFile[] = [];
  const titleRe = /^# 第(\d+)話「(.+)」\s*$/;

  for (const slug of readdirSync(CONTENT_DIR)) {
    if (targetSlug && slug !== targetSlug) continue;
    const dir = join(CONTENT_DIR, slug);
    if (!existsSync(join(dir, "work.json"))) continue;

    for (let i = 1; i <= 999; i++) {
      const num = String(i).padStart(3, "0");
      const epPath = join(dir, `ep${num}.md`);
      if (!existsSync(epPath)) break;

      const firstLine = readFileSync(epPath, "utf-8").split("\n", 1)[0];
      const m = firstLine.match(titleRe);
      const title = m ? `第${i}話「${m[2].trim()}」` : null;
      results.push({ slug, epNum: i, firstLine, title });
    }
  }

  return results;
}

function createSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function main(): Promise<void> {
  log(`開始 (dryRun=${dryRun}, slug=${targetSlug ?? "all"}, limit=${limit}, reportMissing=${reportMissing})`);

  const all = collectEpisodes();
  const withTitle = all.filter((e) => e.title !== null);
  const missing = all.filter((e) => e.title === null);

  log(`md 総エピソード: ${all.length}件`);
  log(`  タイトル付き: ${withTitle.length}件`);
  log(`  タイトル無し: ${missing.length}件`);

  if (reportMissing) {
    const byMissingSlug = new Map<string, number>();
    for (const e of missing) byMissingSlug.set(e.slug, (byMissingSlug.get(e.slug) ?? 0) + 1);
    log("=== タイトル無し作品 ===");
    for (const [slug, n] of [...byMissingSlug].sort((a, b) => b[1] - a[1])) {
      log(`  ${slug}: ${n}話`);
    }
    return;
  }

  if (withTitle.length === 0) {
    log("同期対象なし。md 側にタイトルを付与してから再実行してください。");
    return;
  }

  // 作品別にまとめて limit 適用
  const bySlug = new Map<string, EpisodeFile[]>();
  for (const e of withTitle) {
    if (!bySlug.has(e.slug)) bySlug.set(e.slug, []);
    bySlug.get(e.slug)!.push(e);
  }
  const slugList = [...bySlug.keys()].slice(0, limit);
  const targets = slugList.flatMap((s) => bySlug.get(s)!);
  log(`同期対象: ${targets.length}件 (${slugList.length}作品)`);

  if (dryRun) {
    for (const t of targets.slice(0, 10)) log(`  ${t.slug} ep${t.epNum} → "${t.title}"`);
    if (targets.length > 10) log(`  ... 他 ${targets.length - 10}件`);
    return;
  }

  const supabase = createSupabaseAdmin();
  let updated = 0;
  let unchanged = 0;
  let noNovel = 0;
  let noEpisode = 0;
  let failed = 0;

  for (const slug of slugList) {
    // novel_id を一度取得
    const { data: novel, error: novelErr } = await supabase
      .from("novels")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (novelErr) {
      log(`  ${slug} novels select失敗: ${novelErr.message}`);
      failed += bySlug.get(slug)!.length;
      continue;
    }
    if (!novel) {
      noNovel += bySlug.get(slug)!.length;
      continue;
    }

    for (const ep of bySlug.get(slug)!) {
      // 既存 title を取得して差分だけ UPDATE
      const { data: existing, error: selErr } = await supabase
        .from("episodes")
        .select("id,title")
        .eq("novel_id", novel.id)
        .eq("episode_number", ep.epNum)
        .maybeSingle();
      if (selErr) {
        log(`  ${slug} ep${ep.epNum} select失敗: ${selErr.message}`);
        failed++;
        continue;
      }
      if (!existing) {
        noEpisode++;
        continue;
      }
      if (existing.title === ep.title) {
        unchanged++;
        continue;
      }
      const { error: updErr } = await supabase
        .from("episodes")
        .update({ title: ep.title })
        .eq("id", existing.id);
      if (updErr) {
        log(`  ${slug} ep${ep.epNum} update失敗: ${updErr.message}`);
        failed++;
      } else {
        updated++;
      }
    }
  }

  log(`完了: 更新 ${updated} / 変更なし ${unchanged} / novel未発見 ${noNovel} / ep未発見 ${noEpisode} / 失敗 ${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
