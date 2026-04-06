import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCronAuth } from "@/lib/cron-auth";
import * as fs from "fs";
import * as path from "path";

/**
 * パターンファイル自動更新Cron (毎週日曜 UTC 7:00 = JST 16:00)
 * confirmed済みパターンを content/style/ 配下のファイルに自動追記
 */
export async function GET(req: NextRequest) {
  const authError = verifyCronAuth(req);
  if (authError) return authError;

  const supabase = createAdminClient();

  // 1. confirmed かつ未昇格のパターンを取得
  const { data: patterns, error } = await supabase
    .from("discovered_patterns")
    .select("*")
    .eq("status", "confirmed")
    .is("promoted_at", null)
    .order("discovered_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!patterns || patterns.length === 0) {
    return NextResponse.json({
      success: true,
      message: "昇格対象のパターンなし",
      updated_files: [],
    });
  }

  const styleDir = path.resolve(process.cwd(), "../content/style");
  const genreDir = path.join(styleDir, "genre_specific");
  const updatedFiles: string[] = [];
  const promotedIds: string[] = [];

  // ジャンル別ディレクトリがなければ作成
  if (!fs.existsSync(genreDir)) {
    fs.mkdirSync(genreDir, { recursive: true });
  }

  // 2. パターンを分類して追記
  const commonPositive: typeof patterns = [];
  const commonNegative: typeof patterns = [];
  const genrePatterns = new Map<string, typeof patterns>();

  for (const p of patterns) {
    if (p.genre) {
      if (!genrePatterns.has(p.genre)) genrePatterns.set(p.genre, []);
      genrePatterns.get(p.genre)!.push(p);
    } else if (p.pattern_type === "negative") {
      commonNegative.push(p);
    } else {
      commonPositive.push(p);
    }
  }

  // 3. learned_patterns.md に追記
  if (commonPositive.length > 0) {
    const filePath = path.join(styleDir, "learned_patterns.md");
    const newContent = commonPositive
      .map(p => `- **${p.finding}** → ${p.actionable_rule} (confidence: ${p.confidence}, id: ${p.id})`)
      .join("\n");
    appendToFile(filePath, newContent);
    updatedFiles.push("learned_patterns.md");
    promotedIds.push(...commonPositive.map(p => p.id));
  }

  // 4. anti_patterns.md に追記
  if (commonNegative.length > 0) {
    const filePath = path.join(styleDir, "anti_patterns.md");
    const newContent = commonNegative
      .map(p => `- **${p.finding}** → ${p.actionable_rule} (confidence: ${p.confidence}, id: ${p.id})`)
      .join("\n");
    appendToFile(filePath, newContent);
    updatedFiles.push("anti_patterns.md");
    promotedIds.push(...commonNegative.map(p => p.id));
  }

  // 5. ジャンル別パターンファイルに追記
  for (const [genre, gPatterns] of genrePatterns) {
    const filePath = path.join(genreDir, `${genre}_patterns.md`);
    const newContent = gPatterns
      .map(p => `- **${p.finding}** → ${p.actionable_rule} (confidence: ${p.confidence}, type: ${p.pattern_type}, id: ${p.id})`)
      .join("\n");
    appendToFile(filePath, newContent, genre);
    updatedFiles.push(`genre_specific/${genre}_patterns.md`);
    promotedIds.push(...gPatterns.map(p => p.id));
  }

  // 6. promoted_at を更新
  if (promotedIds.length > 0) {
    await supabase
      .from("discovered_patterns")
      .update({ promoted_at: new Date().toISOString() })
      .in("id", promotedIds);
  }

  return NextResponse.json({
    success: true,
    patterns_promoted: promotedIds.length,
    updated_files: updatedFiles,
    promoted_at: new Date().toISOString(),
  });
}

/**
 * ファイルに追記（存在しなければヘッダー付きで新規作成）
 */
function appendToFile(filePath: string, content: string, genre?: string): void {
  if (!fs.existsSync(filePath)) {
    const title = genre
      ? `# ${genre}ジャンル固有パターン`
      : filePath.includes("anti_patterns")
        ? "# 避けるべきパターン（自動更新）"
        : "# 学習済みパターン（自動更新）";

    const header = `${title}

このファイルは自己強化学習ループによって自動更新されます。
読者行動データから発見されたパターンがA/Bテストで確認された後、ここに追記されます。

手動でのルール削除は管理画面から行ってください（自動では削除しません）。

## パターン一覧

`;
    fs.writeFileSync(filePath, header + content + "\n", "utf-8");
  } else {
    const existing = fs.readFileSync(filePath, "utf-8");
    fs.writeFileSync(filePath, existing.trimEnd() + "\n" + content + "\n", "utf-8");
  }
}
