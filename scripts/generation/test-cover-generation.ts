/**
 * 表紙画像生成の動作確認スクリプト
 *
 * APIエンドポイントの認証をバイパスして、cover生成ロジックを直接実行する。
 * デフォルトはローカルファイル出力のみ。--upload オプションでStorageにも保存する。
 *
 * 使い方:
 *   npx tsx scripts/test-cover-generation.ts                # DB先頭の小説で1件生成
 *   npx tsx scripts/test-cover-generation.ts --novel-id=xxx # 指定IDで生成
 *   npx tsx scripts/test-cover-generation.ts --mock         # モックデータで1件
 *   npx tsx scripts/test-cover-generation.ts --mock --all-genres # モックで全ジャンル
 *   npx tsx scripts/test-cover-generation.ts --upload       # DB+Storageに反映（実DBに書き込む）
 */

import sharp from "sharp";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import * as path from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getGenreConfig } from "../../src/lib/cover/templates";

// .env.localを手動でパース（dotenvに依存しない）
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

const COVER_W = 1024;
const COVER_H = 1536;

// 引数パース
const args = process.argv.slice(2);
const novelIdArg = args.find((a) => a.startsWith("--novel-id="))?.split("=")[1];
const shouldUpload = args.includes("--upload");
const useMock = args.includes("--mock");
const allGenres = args.includes("--all-genres");

type NovelData = {
  id: string;
  title: string;
  tagline: string | null;
  author_name: string;
  genre: string;
};

// モック小説データ（DBが空のときの動作確認用）
const MOCK_NOVELS: NovelData[] = [
  { id: "mock-fantasy", title: "古城の継承者", tagline: "封じられた魔導書を巡る冒険", author_name: "白川 透", genre: "fantasy" },
  { id: "mock-romance", title: "桜の下で君と", tagline: "卒業まであと三十日", author_name: "藤宮 すみれ", genre: "romance" },
  { id: "mock-villainess", title: "悪役令嬢、薔薇園の薄暮に", tagline: "やり直しの令嬢物語", author_name: "夜霧 玲奈", genre: "villainess" },
  { id: "mock-horror", title: "深夜0時の校舎", tagline: "誰もいないはずの廊下から", author_name: "黒崎 蓮", genre: "horror" },
  { id: "mock-mystery", title: "雨夜の回廊", tagline: "刑事久遠、最後の事件", author_name: "九条 司", genre: "mystery" },
  { id: "mock-scifi", title: "鋼の翼、明日を撃て", tagline: "Project ICARUS", author_name: "桐谷 雷牙", genre: "scifi" },
];

// 出力ディレクトリ
const outDir = "/tmp/cover-test-output";
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

// 文字列ハッシュ → seed
function hashStringToInt(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h) % 1000000;
}

async function generateCover(
  novel: NovelData,
  supabase: SupabaseClient | null
): Promise<string> {
  console.log(`\n--- 対象: ${novel.title} (genre=${novel.genre}) ---`);

  const genreConfig = getGenreConfig(novel.genre);
  console.log(`風景プロンプト: ${genreConfig.scenePrompt.slice(0, 80)}...`);

  // Pollinations.aiから背景画像を取得
  const seed = hashStringToInt(String(novel.id));
  const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(genreConfig.scenePrompt)}?width=${COVER_W}&height=${COVER_H}&seed=${seed}&nologo=true`;

  console.log("背景画像を取得中...");
  const imageRes = await fetch(pollinationsUrl);
  if (!imageRes.ok) {
    throw new Error(`背景画像取得失敗: ${imageRes.status} ${imageRes.statusText}`);
  }
  const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
  console.log(`  取得: ${imageBuffer.length} bytes`);

  if (imageBuffer.length < 5000) {
    throw new Error(
      `背景画像が小さすぎます（レート制限の可能性）: ${imageBuffer.toString().slice(0, 200)}`
    );
  }

  // SVGでタイトル合成（ジャンル別フォントを適用）
  const svg = genreConfig.template({
    title: novel.title,
    subtitle: novel.tagline,
    author: novel.author_name,
    font: genreConfig.font,
  });

  const resized = await sharp(imageBuffer)
    .resize(COVER_W, COVER_H, { fit: "cover", position: "center" })
    .toBuffer();

  const finalBuffer = await sharp(resized)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .webp({ quality: 88 })
    .toBuffer();

  // ローカル保存
  const outFile = path.join(outDir, `${novel.id}.webp`);
  writeFileSync(outFile, finalBuffer);
  console.log(`  保存: ${outFile}`);

  // Storage反映オプション
  if (shouldUpload && supabase) {
    const fileName = `${novel.id}.webp`;
    const { error: uploadError } = await supabase.storage
      .from("novel-covers")
      .upload(fileName, finalBuffer, {
        contentType: "image/webp",
        upsert: true,
      });
    if (uploadError) throw new Error(`アップロード失敗: ${uploadError.message}`);

    const { data: urlData } = supabase.storage
      .from("novel-covers")
      .getPublicUrl(fileName);
    const coverImageUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    const { error: updateError } = await supabase
      .from("novels")
      .update({ cover_image_url: coverImageUrl })
      .eq("id", novel.id);
    if (updateError) throw new Error(`DB更新失敗: ${updateError.message}`);

    console.log(`  Storage URL: ${coverImageUrl}`);
  }

  return outFile;
}

async function main() {
  console.log("=== 表紙画像生成テスト ===");
  console.log(`mode: ${useMock ? "mock" : "db"}, upload: ${shouldUpload}, allGenres: ${allGenres}\n`);

  // Supabase clientは--uploadまたはDB読み込みが必要なときだけ作る
  let supabase: SupabaseClient | null = null;
  if (shouldUpload || !useMock) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("環境変数が設定されていません");
      process.exit(1);
    }
    supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
  }

  // 対象小説の決定
  let novels: NovelData[] = [];

  if (useMock) {
    novels = allGenres ? MOCK_NOVELS : [MOCK_NOVELS[0]];
  } else if (novelIdArg) {
    const { data, error } = await supabase!
      .from("novels")
      .select("id, title, tagline, author_name, genre")
      .eq("id", novelIdArg)
      .single();
    if (error || !data) {
      console.error(`小説が見つかりません (id=${novelIdArg}):`, error?.message);
      process.exit(1);
    }
    novels = [data as NovelData];
  } else {
    const { data, error } = await supabase!
      .from("novels")
      .select("id, title, tagline, author_name, genre")
      .limit(1);
    if (error || !data || data.length === 0) {
      console.error("DBに小説がありません。--mock オプションを使ってください");
      process.exit(1);
    }
    novels = data as NovelData[];
  }

  console.log(`対象: ${novels.length}件\n`);

  const generatedFiles: string[] = [];
  for (const novel of novels) {
    try {
      const file = await generateCover(novel, supabase);
      generatedFiles.push(file);
      // レート制限対策で少し待つ
      if (novels.length > 1) await new Promise((r) => setTimeout(r, 3000));
    } catch (err) {
      console.error(`  失敗: ${(err as Error).message}`);
    }
  }

  console.log(`\n=== 完了 (${generatedFiles.length}/${novels.length}件) ===`);
  if (generatedFiles.length > 0) {
    console.log("確認コマンド:");
    console.log(`  open ${generatedFiles.join(" ")}`);
  }
}

main().catch((err) => {
  console.error("エラー:", err);
  process.exit(1);
});
