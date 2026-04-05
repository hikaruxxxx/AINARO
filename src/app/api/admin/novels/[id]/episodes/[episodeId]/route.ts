import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// TODO: Phase 1で管理者認証チェックを追加する

/**
 * 作品の集計値を再計算して更新（エピソードRoute用のコピー）
 */
async function updateNovelStats(novelId: string) {
  const supabase = createAdminClient();

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
 * PUT /api/admin/novels/[id]/episodes/[episodeId] — エピソード更新
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string }> }
) {
  try {
    const { id: novelId, episodeId } = await params;
    const body = await request.json();
    const { episode_number, title, body_md, is_free, published_at } = body;

    const updateData: Record<string, unknown> = {};
    if (episode_number !== undefined) updateData.episode_number = episode_number;
    if (title !== undefined) updateData.title = title;
    if (body_md !== undefined) {
      updateData.body_md = body_md;
      // 本文更新時は文字数も再計算
      updateData.character_count = body_md.replace(/[\s\n\r]/g, "").length;
    }
    if (is_free !== undefined) updateData.is_free = is_free;
    if (published_at !== undefined) updateData.published_at = published_at;

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("episodes")
      .update(updateData)
      .eq("id", episodeId)
      .eq("novel_id", novelId)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "この話数は既に存在します" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json(
        { error: "エピソードが見つかりません" },
        { status: 404 }
      );
    }

    // 作品の集計値を更新
    await updateNovelStats(novelId);

    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "リクエストの処理に失敗しました" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/novels/[id]/episodes/[episodeId] — エピソード削除
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string }> }
) {
  try {
    const { id: novelId, episodeId } = await params;
    const supabase = createAdminClient();

    const { error } = await supabase
      .from("episodes")
      .delete()
      .eq("id", episodeId)
      .eq("novel_id", novelId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 作品の集計値を更新
    await updateNovelStats(novelId);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "リクエストの処理に失敗しました" },
      { status: 500 }
    );
  }
}
