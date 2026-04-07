import { NextRequest, NextResponse } from "next/server";
import { requireWriterApi } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyOwnership } from "../../../route";

/**
 * POST /api/writer/novels/[id]/episodes/[episodeId]/publish
 * draft→published 遷移
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string }> }
) {
  try {
    const auth = await requireWriterApi();
    if (!auth.authorized) return auth.response;

    const { id, episodeId } = await params;
    const ownership = await verifyOwnership(id, auth.userId);
    if (!ownership.ok) return ownership.response;

    const supabase = createAdminClient();

    // エピソード取得
    const { data: episode, error: fetchError } = await supabase
      .from("episodes")
      .select("*")
      .eq("id", episodeId)
      .eq("novel_id", id)
      .single();

    if (fetchError || !episode) {
      return NextResponse.json(
        { error: "エピソードが見つかりません" },
        { status: 404 }
      );
    }

    // 既に公開済み
    if (episode.status === "published") {
      return NextResponse.json(
        { error: "既に公開済みです" },
        { status: 409 }
      );
    }

    // 最低100文字チェック
    if (!episode.body_md || episode.body_md.length < 100) {
      return NextResponse.json(
        { error: "本文は100文字以上必要です" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    // エピソードを公開
    const { data: published, error: updateError } = await supabase
      .from("episodes")
      .update({
        status: "published",
        published_at: now,
      })
      .eq("id", episodeId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: "エピソードの公開に失敗しました" },
        { status: 500 }
      );
    }

    // 作品の集計値を再計算
    const { data: stats } = await supabase
      .from("episodes")
      .select("character_count, published_at")
      .eq("novel_id", id)
      .eq("status", "published");

    if (stats) {
      const totalChapters = stats.length;
      const totalCharacters = stats.reduce(
        (sum, ep) => sum + (ep.character_count || 0),
        0
      );
      // 最新の公開日時を取得
      const latestChapterAt = stats.reduce((latest, ep) => {
        if (!ep.published_at) return latest;
        return ep.published_at > latest ? ep.published_at : latest;
      }, "");

      await supabase
        .from("novels")
        .update({
          total_chapters: totalChapters,
          total_characters: totalCharacters,
          latest_chapter_at: latestChapterAt || now,
        })
        .eq("id", id);
    }

    return NextResponse.json({ episode: published });
  } catch {
    return NextResponse.json(
      { error: "サーバーエラーが発生しました" },
      { status: 500 }
    );
  }
}
