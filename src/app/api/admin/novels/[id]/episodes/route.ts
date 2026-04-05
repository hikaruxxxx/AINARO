import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// TODO: Phase 1で管理者認証チェックを追加する

/**
 * 作品の集計値（total_chapters, total_characters, latest_chapter_at）を再計算して更新
 */
async function updateNovelStats(novelId: string) {
  const supabase = createAdminClient();

  // エピソード集計を取得
  const { data: episodes } = await supabase
    .from("episodes")
    .select("character_count, published_at")
    .eq("novel_id", novelId)
    .order("published_at", { ascending: false });

  const totalChapters = episodes?.length || 0;
  const totalCharacters =
    episodes?.reduce((sum, ep) => sum + (ep.character_count || 0), 0) || 0;
  const latestChapterAt =
    episodes && episodes.length > 0 ? episodes[0].published_at : null;

  await supabase
    .from("novels")
    .update({
      total_chapters: totalChapters,
      total_characters: totalCharacters,
      latest_chapter_at: latestChapterAt,
    })
    .eq("id", novelId);
}

/**
 * POST /api/admin/novels/[id]/episodes — エピソード新規作成
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: novelId } = await params;
    const body = await request.json();
    const { episode_number, title, body_md, is_free, published_at } = body;

    if (!title) {
      return NextResponse.json(
        { error: "タイトルは必須です" },
        { status: 400 }
      );
    }

    if (!episode_number) {
      return NextResponse.json(
        { error: "話数は必須です" },
        { status: 400 }
      );
    }

    if (!body_md) {
      return NextResponse.json(
        { error: "本文は必須です" },
        { status: 400 }
      );
    }

    // 文字数を自動計算（空白・改行を除く）
    const characterCount = body_md.replace(/[\s\n\r]/g, "").length;

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("episodes")
      .insert({
        novel_id: novelId,
        episode_number,
        title,
        body_md,
        character_count: characterCount,
        is_free: is_free !== undefined ? is_free : true,
        published_at: published_at || new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      // 話数の重複
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "この話数は既に存在します" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 作品の集計値を更新
    await updateNovelStats(novelId);

    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "リクエストの処理に失敗しました" },
      { status: 500 }
    );
  }
}

export { updateNovelStats };
