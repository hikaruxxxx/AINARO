import { NextRequest, NextResponse } from "next/server";
import { requireWriterApi } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyOwnership } from "../../route";

/**
 * GET /api/writer/novels/[id]/episodes/[episodeId]
 * エピソード詳細を取得
 */
export async function GET(
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
    const { data, error } = await supabase
      .from("episodes")
      .select("*")
      .eq("id", episodeId)
      .eq("novel_id", id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "エピソードが見つかりません" },
        { status: 404 }
      );
    }

    return NextResponse.json({ episode: data });
  } catch {
    return NextResponse.json(
      { error: "サーバーエラーが発生しました" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/writer/novels/[id]/episodes/[episodeId]
 * エピソードを更新（公開済みの本文変更はブロック）
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string }> }
) {
  try {
    const auth = await requireWriterApi();
    if (!auth.authorized) return auth.response;

    const { id, episodeId } = await params;
    const ownership = await verifyOwnership(id, auth.userId);
    if (!ownership.ok) return ownership.response;

    const supabase = createAdminClient();

    // 現在のエピソードを取得
    const { data: existing, error: fetchError } = await supabase
      .from("episodes")
      .select("*")
      .eq("id", episodeId)
      .eq("novel_id", id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "エピソードが見つかりません" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const allowedFields = ["title", "body_md", "episode_number"];

    // 許可されたフィールドのみ抽出
    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "更新するフィールドがありません" },
        { status: 400 }
      );
    }

    // 公開済みの本文変更はブロック
    if (existing.status === "published" && updates.body_md !== undefined) {
      return NextResponse.json(
        { error: "公開済みエピソードの本文は変更できません" },
        { status: 409 }
      );
    }

    // body_mdが更新される場合、文字数を再計算
    if (updates.body_md !== undefined) {
      updates.character_count = (updates.body_md as string).length;
    }

    const { data, error } = await supabase
      .from("episodes")
      .update(updates)
      .eq("id", episodeId)
      .eq("novel_id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: "エピソードの更新に失敗しました" },
        { status: 500 }
      );
    }

    return NextResponse.json({ episode: data });
  } catch {
    return NextResponse.json(
      { error: "サーバーエラーが発生しました" },
      { status: 500 }
    );
  }
}
