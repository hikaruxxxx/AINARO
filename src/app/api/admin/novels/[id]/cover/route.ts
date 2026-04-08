import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/supabase/auth";
import { generateCover } from "@/lib/cover/generate";

// Vercel Serverless Functionのタイムアウトを60秒に延長
export const maxDuration = 60;

/**
 * POST /api/admin/novels/[id]/cover — 表紙画像を手動再生成
 *
 * 既存の cover_image_url があっても強制的に上書きする。
 * 通常はDBに登録時に自動生成されるが、生成失敗時や手動で再生成したい時に使う。
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCheck = await requireAdminApi();
    if (!authCheck.authorized) return authCheck.response;

    const { id } = await params;
    const supabase = createAdminClient();

    // 1. 小説メタデータを取得
    const { data: novel, error: fetchError } = await supabase
      .from("novels")
      .select("id, title, tagline, author_name, genre")
      .eq("id", id)
      .single();

    if (fetchError || !novel) {
      return NextResponse.json(
        { error: "作品が見つかりません" },
        { status: 404 }
      );
    }

    // 2. 表紙生成（generate.tsの共通ロジックを使用）
    const result = await generateCover(
      {
        novelId: novel.id,
        title: novel.title,
        tagline: novel.tagline,
        authorName: novel.author_name,
        genre: novel.genre,
      },
      supabase
    );

    // 3. novels.cover_image_urlを更新
    const { error: updateError } = await supabase
      .from("novels")
      .update({ cover_image_url: result.publicUrl })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json(
        { error: `データベースの更新に失敗しました: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ cover_image_url: result.publicUrl });
  } catch (err) {
    console.error("表紙画像生成エラー:", err);
    return NextResponse.json(
      { error: (err as Error).message || "画像生成中にエラーが発生しました" },
      { status: 500 }
    );
  }
}
