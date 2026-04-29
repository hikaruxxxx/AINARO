/**
 * gpt-image (Codex経由) パイプラインの動作確認スクリプト
 *
 * モックデータでサブジャンル別に表紙を生成し、`/tmp/cover-test-output/v2/` に保存する。
 * --novel-id 指定時はDBから取得し、--upload 指定時は Storage / cover_image_url を更新する。
 *
 * 使い方:
 *   npx tsx scripts/generation/test-cover-v2.ts                          # 全サブジャンル（モック）
 *   npx tsx scripts/generation/test-cover-v2.ts --subgenre=cooking       # 特定サブジャンルのみ
 *   npx tsx scripts/generation/test-cover-v2.ts --novel-id=ID            # DB特定novel
 *   npx tsx scripts/generation/test-cover-v2.ts --novel-id=ID --upload   # 生成 + Storage/DB反映
 *   npx tsx scripts/generation/test-cover-v2.ts --no-title               # タイトル文字なし版（B版）
 */

import { mkdirSync, existsSync, readFileSync } from "fs";
import path from "path";
import sharp from "sharp";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildCoverPrompt } from "../../src/lib/cover/prompt-builder";
import { generateImageViaCodex } from "../../src/lib/cover/codex-image";
import type { Subgenre } from "../../src/lib/cover/genre-typography";

// .env.local を手動パース（dotenv不使用）
function loadEnv() {
  try {
    const content = readFileSync(".env.local", "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const [key, ...rest] = trimmed.split("=");
      if (!key || process.env[key]) continue;
      let value = rest.join("=");
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {}
}
loadEnv();

type MockNovel = {
  /** DBのnovel UUID（--novel-id 経由のときのみ。アップロード対象 ID） */
  id?: string;
  slug: string;
  title: string;
  subtitle: string;
  author: string;
  genre: string;
  /** 未指定なら prompt-builder 側で推定 */
  subgenre?: Subgenre;
  characterDescription: string;
  settingDescription: string;
};

const MOCK_NOVELS: MockNovel[] = [
  {
    slug: "isekai-male",
    title: "社畜スキルで異世界成り上がり",
    subtitle: "報連相で世界を救う",
    author: "AI",
    genre: "isekai_tensei_cheat",
    subgenre: "isekai_tensei_male",
    characterDescription:
      "28-year-old Japanese man with messy black hair, tired but determined expression, wearing a torn and dirty black business suit. Faint magical energy crackling around his right hand",
    settingDescription:
      "medieval fantasy kingdom street at twilight, stone village houses with thatched roofs, distant mountains, dramatic dusk sky",
  },
  {
    slug: "villainess",
    title: "薔薇園の薄暮、悪役令嬢の覚悟",
    subtitle: "私はもう、知っている",
    author: "AI",
    genre: "villainess",
    subgenre: "villainess",
    characterDescription:
      "elegant 18-year-old noble lady with long silver curly hair styled as vertical ringlets, wearing a crimson red Victorian gown with gold embroidery, holding a single red rose, dignified expression",
    settingDescription:
      "lush gothic rose garden of a Victorian palace at twilight, marble fountain, ornate balcony, dramatic dusk lighting in deep purple and gold",
  },
  {
    slug: "cooking",
    title: "異世界キッチンカー、もふもふ亭はじめました",
    subtitle: "隠れスキル「料理長」で大繁盛！",
    author: "AI",
    genre: "isekai_slowlife",
    subgenre: "cooking",
    characterDescription:
      "cheerful 25-year-old woman with brown hair tied in ponytail, wearing a cute white apron over warm clothes, bright friendly smile, with a small fluffy white spirit creature on her shoulder",
    settingDescription:
      "lively medieval fantasy town street with a colorful wooden food stall (kitchen car), steaming dishes, bright sunny day, warm pastel palette",
  },
  {
    slug: "slowlife",
    title: "辺境の薬師、もう一度の人生は静かに",
    subtitle: "村の片隅で、薬草を育てる日々",
    author: "AI",
    genre: "isekai_slowlife",
    subgenre: "slowlife",
    characterDescription:
      "gentle 30-year-old woman with chestnut brown hair in a loose braid, wearing a simple herbalist's dress and apron, kind warm smile, holding a basket of herbs",
    settingDescription:
      "peaceful medieval fantasy frontier village, herb garden, sunlit cottage, blue sky with soft clouds, warm pastel palette",
  },
  {
    slug: "tsuiho",
    title: "追放された天才魔導師は、もう振り返らない",
    subtitle: "勇者パーティーの後悔は、知らない",
    author: "AI",
    genre: "isekai_tsuiho_zamaa",
    subgenre: "tsuiho_zamaa",
    characterDescription:
      "cool young male mage in his early 20s with silver hair and intense blue eyes, wearing a dark navy mage robe with silver embroidery, hand glowing with powerful magic",
    settingDescription:
      "dramatic mountainous landscape at dusk, stone ruins behind, swirling magical particles, deep crimson and gold sky",
  },
  {
    slug: "beast",
    title: "従魔の小竜と、辺境ギルドはじめました",
    subtitle: "もふもふも、ちょっと強い",
    author: "AI",
    genre: "isekai_high_fantasy",
    subgenre: "beast_companion",
    characterDescription:
      "young female adventurer in her early 20s with auburn hair and green eyes, wearing leather adventurer armor, with a small cute baby dragon perched on her shoulder",
    settingDescription:
      "warm rustic medieval fantasy guild courtyard, wooden buildings, sunny afternoon, vibrant green and orange palette",
  },
];

const args = process.argv.slice(2);
const subgenreFilter = args
  .find((a) => a.startsWith("--subgenre="))
  ?.split("=")[1];
const novelIdArg = args.find((a) => a.startsWith("--novel-id="))?.split("=")[1];
const noTitleMode = args.includes("--no-title");
const shouldUpload = args.includes("--upload");
const missingMode = args.includes("--missing");
const limitArg = args.find((a) => a.startsWith("--limit="))?.split("=")[1];
const dryRun = args.includes("--dry-run");
const LIMIT = limitArg ? parseInt(limitArg) : 3;

const outDir = "/tmp/cover-test-output/v2";

function getSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase 環境変数が無い (.env.local)");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function fetchMissingNovelsFromDb(limit: number): Promise<MockNovel[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("novels")
    .select("id, slug, title, tagline, author_name, genre")
    .is("cover_image_url", null)
    .limit(limit);
  if (error) throw new Error(`novel取得失敗: ${error.message}`);
  return (data ?? []).map((d) => ({
    id: d.id,
    slug: d.slug,
    title: d.title,
    subtitle: d.tagline ?? "",
    author: d.author_name ?? "Novelis",
    genre: d.genre,
    characterDescription: "",
    settingDescription: d.tagline ?? "",
  }));
}

async function fetchNovelFromDb(novelId: string): Promise<MockNovel> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("novels")
    .select("id, slug, title, tagline, author_name, genre")
    .eq("id", novelId)
    .single();
  if (error || !data) {
    throw new Error(`novel取得失敗 (id=${novelId}): ${error?.message}`);
  }

  // タグラインがあれば character/setting のヒントとして流用する。
  // 「Aが○○する」のような状況説明文なので、setting に寄せる。
  return {
    id: data.id,
    slug: data.slug,
    title: data.title,
    subtitle: data.tagline ?? "",
    author: data.author_name ?? "Novelis",
    genre: data.genre,
    // subgenre 未指定 → prompt-builder の inferSubgenreFromGenre に任せる
    characterDescription: "",
    settingDescription: data.tagline ?? "",
  };
}

/**
 * 生成済みPNGを WebP に変換し、Supabase Storage と novels.cover_image_url を更新する。
 * 既存の v1 と同じバケット `novel-covers` / 同じファイル名 `{novelId}.webp` を使用。
 */
async function uploadAndUpdateDb(opts: {
  novelId: string;
  pngPath: string;
}): Promise<string> {
  const sb = getSupabaseClient();

  // PNG → WebP 変換 (quality 88、既存 v1 と揃える)
  const pngBuf = readFileSync(opts.pngPath);
  const webpBuf = await sharp(pngBuf).webp({ quality: 88 }).toBuffer();

  const fileName = `${opts.novelId}.webp`;
  const { error: uploadError } = await sb.storage
    .from("novel-covers")
    .upload(fileName, webpBuf, {
      contentType: "image/webp",
      upsert: true,
    });
  if (uploadError) throw new Error(`Storage アップロード失敗: ${uploadError.message}`);

  const { data: urlData } = sb.storage
    .from("novel-covers")
    .getPublicUrl(fileName);
  const coverImageUrl = `${urlData.publicUrl}?t=${Date.now()}`;

  const { error: updateError } = await sb
    .from("novels")
    .update({ cover_image_url: coverImageUrl })
    .eq("id", opts.novelId);
  if (updateError) throw new Error(`DB更新失敗: ${updateError.message}`);

  return coverImageUrl;
}

async function main() {
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  let targets: MockNovel[];
  if (missingMode) {
    targets = await fetchMissingNovelsFromDb(LIMIT);
    if (targets.length === 0) {
      console.log("cover_image_url IS NULL の作品はありません。");
      return;
    }
  } else if (novelIdArg) {
    const novel = await fetchNovelFromDb(novelIdArg);
    targets = [novel];
  } else if (subgenreFilter) {
    targets = MOCK_NOVELS.filter((m) => m.subgenre === subgenreFilter);
  } else {
    targets = MOCK_NOVELS;
  }

  if (targets.length === 0) {
    console.error(`サブジャンル ${subgenreFilter} のモックがありません`);
    process.exit(1);
  }

  if (shouldUpload && !novelIdArg && !missingMode) {
    console.error("--upload は --novel-id か --missing と併用してください");
    process.exit(1);
  }

  if (dryRun) {
    console.log(`=== --dry-run: 生成対象 ${targets.length} 件 ===`);
    for (const t of targets) {
      console.log(`  - ${t.id ?? "(mock)"} / ${t.slug} / ${t.title} (genre=${t.genre})`);
    }
    return;
  }

  console.log(
    `=== gpt-image v2 (Codex経由, ${targets.length}件, タイトル${noTitleMode ? "なし" : "あり"}, upload=${shouldUpload}) ===\n`
  );

  let success = 0;
  const failures: { slug: string; error: string }[] = [];

  for (let i = 0; i < targets.length; i++) {
    const novel = targets[i];
    const suffix = noTitleMode ? "no-title" : "with-title";
    const outPath = path.join(outDir, `${novel.slug}-${suffix}.png`);

    const built = buildCoverPrompt({
      title: novel.title,
      subtitle: novel.subtitle,
      author: novel.author,
      genre: novel.genre,
      subgenreOverride: novel.subgenre,
      characterDescription: novel.characterDescription,
      settingDescription: novel.settingDescription,
      includeTitleInImage: !noTitleMode,
    });

    console.log(
      `[${i + 1}/${targets.length}] ${novel.slug} (subgenre=${built.subgenre}) → ${path.basename(outPath)}`
    );

    try {
      const start = Date.now();
      const result = await generateImageViaCodex({
        prompt: built.prompt,
        outputPath: outPath,
        cwd: process.cwd(),
        timeoutMs: 6 * 60 * 1000,
      });
      const elapsed = Math.round((Date.now() - start) / 1000);
      console.log(
        `  ✓ ${(result.sizeBytes / 1024).toFixed(0)}KB / ${elapsed}s / ${result.attempts}回試行`
      );

      if (shouldUpload && novel.id) {
        const url = await uploadAndUpdateDb({
          novelId: novel.id,
          pngPath: result.outputPath,
        });
        console.log(`  📤 Storage / DB 反映: ${url}`);
      }

      success++;
    } catch (err) {
      const msg = (err as Error).message;
      console.log(`  ✗ ${msg}`);
      failures.push({ slug: novel.slug, error: msg });
    }
  }

  console.log(`\n=== 完了: 成功 ${success} / ${targets.length} ===`);
  if (failures.length > 0) {
    console.log("失敗:");
    for (const f of failures) console.log(`  - ${f.slug}: ${f.error}`);
  }
  console.log(`\n出力先: ${outDir}`);
  console.log(`確認: open ${outDir}/*.png`);
}

main().catch((err) => {
  console.error("エラー:", err);
  process.exit(1);
});
