// content/works/ の ready_to_publish 作品を Supabase に一括投入する
//
// 処理:
// 1. content/works/ をスキャン、work.json の state が ready_to_publish のものを対象
// 2. novels テーブルに UPSERT（slug重複はスキップ）
// 3. ep00X.md を読み込み episodes テーブルに INSERT
// 4. total_chapters, total_characters を更新
// 5. work.json の state を "published" に変更
//
// 使い方:
//   npx tsx scripts/generation/publish-to-supabase.ts [--limit 50] [--dry-run]
//
// 前提: .env.local に NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY が設定済み

import { existsSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";
import { createClient } from "@supabase/supabase-js";

// .env.local を手動パース（dotenv非依存）
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
    // クォート除去
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnvFile(".env.local");

const CONTENT_DIR = "content/works";

// パイプラインのジャンル名 → Supabase genres.id のマッピング
const GENRE_MAP: Record<string, string> = {
  isekai_high_fantasy: "fantasy",
  isekai_slowlife: "fantasy",
  isekai_tensei_cheat: "fantasy",
  isekai_tsuiho_zamaa: "fantasy",
  otome_akuyaku_zamaa: "villainess",
  otome_isekai_pure: "villainess",
  otome_konyaku_haki: "villainess",
  otome_villain_fantasy: "villainess",
  battle_dungeon: "action",
  battle_modern_power: "action",
  battle_war_chronicle: "action",
  battle_vrmmo: "action",
  modern_history: "drama",
  modern_human_drama: "drama",
  modern_romance: "romance",
  modern_school: "romance",
  mystery_action: "mystery",
  mystery_detective: "mystery",
  mystery_horror: "horror",
  mystery_sf: "scifi",
};

function mapGenre(pipelineGenre: string): string {
  return GENRE_MAP[pipelineGenre] ?? "other";
}
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 50;

function log(msg: string): void {
  console.log(`[publish] ${msg}`);
}

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です（.env.local）");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

interface WorkJson {
  slug: string;
  title: string;
  genre: string;
  state: string;
  episodes?: number;
  rating?: number;
  createdAt?: string;
  sourceDir?: string;
  hitProbability?: number;
  sourceBatch?: string;
}

// content/works/{slug}/ から ready_to_publish の作品を収集
function collectReadyWorks(): Array<{ slug: string; dir: string; work: WorkJson }> {
  const results: Array<{ slug: string; dir: string; work: WorkJson }> = [];

  for (const slug of readdirSync(CONTENT_DIR)) {
    const dir = join(CONTENT_DIR, slug);
    const workPath = join(dir, "work.json");
    if (!existsSync(workPath)) continue;

    let work: WorkJson;
    try {
      work = JSON.parse(readFileSync(workPath, "utf-8"));
    } catch { continue; }

    if (work.state !== "ready_to_publish") continue;

    // ep001.md が存在するか確認
    if (!existsSync(join(dir, "ep001.md"))) continue;

    results.push({ slug, dir, work });
  }

  // rating降順（あれば）
  results.sort((a, b) => (b.work.rating ?? 0) - (a.work.rating ?? 0));
  return results;
}

// エピソードファイルを読み込み
function loadEpisodes(dir: string): Array<{ number: number; body: string; charCount: number; title: string }> {
  const episodes: Array<{ number: number; body: string; charCount: number; title: string }> = [];

  for (let i = 1; i <= 100; i++) {
    const num = String(i).padStart(3, "0");
    const path = join(dir, `ep${num}.md`);
    if (!existsSync(path)) break;

    const body = readFileSync(path, "utf-8");
    const charCount = body.replace(/[\s\n\r]/g, "").length;

    // タイトルは最初の行から抽出（# で始まる場合）
    const firstLine = body.split("\n")[0];
    const title = firstLine.startsWith("# ")
      ? firstLine.slice(2).trim()
      : `第${i}話`;

    episodes.push({ number: i, body, charCount, title });
  }

  return episodes;
}

// synopsis.md を読み込み
function loadSynopsis(dir: string): string {
  const path = join(dir, "synopsis.md");
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf-8").trim();
}

async function main(): Promise<void> {
  log(`開始 (limit=${limit}, dryRun=${dryRun})`);

  const works = collectReadyWorks();
  log(`ready_to_publish: ${works.length}件`);

  const targets = works.slice(0, limit);
  log(`対象: ${targets.length}件`);

  if (dryRun) {
    for (const w of targets) {
      const eps = loadEpisodes(w.dir);
      log(`  ${w.slug} | ${w.work.title} | ${w.work.genre} | ${eps.length}話`);
    }
    return;
  }

  const supabase = createAdminClient();
  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < targets.length; i++) {
    const w = targets[i];
    log(`[${i + 1}/${targets.length}] ${w.slug} (${w.work.title})`);

    // 1. novels テーブルに挿入
    const synopsis = loadSynopsis(w.dir);
    const episodes = loadEpisodes(w.dir);

    if (episodes.length === 0) {
      log(`  エピソードなし、スキップ`);
      skipped++;
      continue;
    }

    // slug重複チェック
    const { data: existing } = await supabase
      .from("novels")
      .select("id")
      .eq("slug", w.slug)
      .maybeSingle();

    let novelId: string;

    if (existing) {
      log(`  既存作品、エピソード追加のみ`);
      novelId = existing.id;
    } else {
      const dbGenre = mapGenre(w.work.genre);
      const { data: novel, error: novelError } = await supabase
        .from("novels")
        .insert({
          title: w.work.title,
          slug: w.slug,
          synopsis: synopsis || null,
          genre: dbGenre,
          status: "serial",
          author_name: "編集部",
          tags: [w.work.genre, dbGenre],
          is_r18: false,
        })
        .select()
        .single();

      if (novelError) {
        log(`  novels INSERT失敗: ${novelError.message}`);
        failed++;
        continue;
      }
      novelId = novel.id;
      log(`  novels INSERT成功 (id=${novelId})`);
    }

    // 2. episodes テーブルに挿入
    let epSuccess = 0;
    for (const ep of episodes) {
      // 既存チェック
      const { data: existingEp } = await supabase
        .from("episodes")
        .select("id")
        .eq("novel_id", novelId)
        .eq("episode_number", ep.number)
        .maybeSingle();

      if (existingEp) {
        continue; // 既存エピソードはスキップ
      }

      const { error: epError } = await supabase
        .from("episodes")
        .insert({
          novel_id: novelId,
          episode_number: ep.number,
          title: ep.title,
          body_md: ep.body,
          character_count: ep.charCount,
          is_free: true,
          published_at: new Date().toISOString(),
        });

      if (epError) {
        log(`  ep${ep.number} INSERT失敗: ${epError.message}`);
      } else {
        epSuccess++;
      }
    }

    // 3. 集計値を更新
    const totalChars = episodes.reduce((sum, ep) => sum + ep.charCount, 0);
    await supabase
      .from("novels")
      .update({
        total_chapters: episodes.length,
        total_characters: totalChars,
        latest_chapter_at: new Date().toISOString(),
        published_at: new Date().toISOString(),
      })
      .eq("id", novelId);

    // 4. work.json の state を published に更新
    const workPath = join(w.dir, "work.json");
    w.work.state = "published";
    writeFileSync(workPath, JSON.stringify(w.work, null, 2));

    log(`  ${epSuccess}話投入完了 (${totalChars}字)`);
    success++;
  }

  log(`=== 完了 ===`);
  log(`成功: ${success}件`);
  log(`スキップ: ${skipped}件`);
  log(`失敗: ${failed}件`);
}

main().catch((e) => {
  log(`fatal: ${e}`);
  process.exit(1);
});
