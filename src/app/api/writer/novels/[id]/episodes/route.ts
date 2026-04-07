import { NextRequest, NextResponse } from "next/server";
import { requireWriterApi } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyOwnership } from "../route";

/**
 * GET /api/writer/novels/[id]/episodes
 * エピソード一覧（body_md除外、episode_number ASC）
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireWriterApi();
    if (!auth.authorized) return auth.response;

    const { id } = await params;
    const ownership = await verifyOwnership(id, auth.userId);
    if (!ownership.ok) return ownership.response;

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("episodes")
      .select(
        "id, novel_id, episode_number, title, status, character_count, published_at, created_at, updated_at"
      )
      .eq("novel_id", id)
      .order("episode_number", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: "エピソード一覧の取得に失敗しました" },
        { status: 500 }
      );
    }

    return NextResponse.json({ episodes: data });
  } catch {
    return NextResponse.json(
      { error: "サーバーエラーが発生しました" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/writer/novels/[id]/episodes
 * エピソードを新規作成（status='draft'）
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireWriterApi();
    if (!auth.authorized) return auth.response;

    const { id } = await params;
    const ownership = await verifyOwnership(id, auth.userId);
    if (!ownership.ok) return ownership.response;

    const body = await request.json();
    const { title, body_md, episode_number } = body;

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json(
        { error: "タイトルは必須です" },
        { status: 400 }
      );
    }

    // body_mdから文字数を自動計算
    const characterCount = body_md ? body_md.length : 0;

    const supabase = createAdminClient();

    // episode_numberが指定されていなければ最大値+1
    let epNumber = episode_number;
    if (!epNumber) {
      const { data: maxEp } = await supabase
        .from("episodes")
        .select("episode_number")
        .eq("novel_id", id)
        .order("episode_number", { ascending: false })
        .limit(1)
        .single();

      epNumber = (maxEp?.episode_number || 0) + 1;
    }

    const { data, error } = await supabase
      .from("episodes")
      .insert({
        novel_id: id,
        title: title.trim(),
        body_md: body_md || "",
        episode_number: epNumber,
        character_count: characterCount,
        status: "draft",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: "エピソードの作成に失敗しました" },
        { status: 500 }
      );
    }

    return NextResponse.json({ episode: data }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "サーバーエラーが発生しました" },
      { status: 500 }
    );
  }
}
