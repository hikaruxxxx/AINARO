import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/supabase/auth";

/**
 * PUT /api/admin/novels/[id] — 作品更新
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCheck = await requireAdminApi();
    if (!authCheck.authorized) return authCheck.response;

    const { id } = await params;
    const body = await request.json();
    const {
      title,
      slug,
      tagline,
      synopsis,
      genre,
      tags,
      status,
      author_name,
      is_r18,
    } = body;

    // タグはカンマ区切り文字列 or 配列どちらにも対応
    const finalTags = Array.isArray(tags)
      ? tags
      : typeof tags === "string"
        ? tags
            .split(",")
            .map((t: string) => t.trim())
            .filter(Boolean)
        : undefined;

    // undefinedのフィールドは更新対象から除外
    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title;
    if (slug !== undefined) updateData.slug = slug;
    if (tagline !== undefined) updateData.tagline = tagline || null;
    if (synopsis !== undefined) updateData.synopsis = synopsis || null;
    if (genre !== undefined) updateData.genre = genre;
    if (finalTags !== undefined) updateData.tags = finalTags;
    if (status !== undefined) updateData.status = status;
    if (author_name !== undefined) updateData.author_name = author_name;
    if (is_r18 !== undefined) updateData.is_r18 = is_r18;

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("novels")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "このスラッグは既に使用されています" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json(
        { error: "作品が見つかりません" },
        { status: 404 }
      );
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "リクエストの処理に失敗しました" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/novels/[id] — 作品削除
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCheck = await requireAdminApi();
    if (!authCheck.authorized) return authCheck.response;

    const { id } = await params;
    const supabase = createAdminClient();

    const { error } = await supabase.from("novels").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "リクエストの処理に失敗しました" },
      { status: 500 }
    );
  }
}
