import { NextRequest, NextResponse } from "next/server";
import { requireWriterApi } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 所有権確認ヘルパー
 * 作品が存在し、外部作家が所有していることを確認
 */
export async function verifyOwnership(
  novelId: string,
  userId: string
): Promise<
  | { ok: true }
  | { ok: false; response: NextResponse }
> {
  const supabase = createAdminClient();
  const { data: novel, error } = await supabase
    .from("novels")
    .select("id, author_id, author_type")
    .eq("id", novelId)
    .single();

  if (error || !novel) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "作品が見つかりません" },
        { status: 404 }
      ),
    };
  }

  if (novel.author_type !== "external" || novel.author_id !== userId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "この作品へのアクセス権がありません" },
        { status: 403 }
      ),
    };
  }

  return { ok: true };
}

/**
 * GET /api/writer/novels/[id]
 * 作品詳細を取得
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
      .from("novels")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      return NextResponse.json(
        { error: "作品の取得に失敗しました" },
        { status: 500 }
      );
    }

    return NextResponse.json({ novel: data });
  } catch {
    return NextResponse.json(
      { error: "サーバーエラーが発生しました" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/writer/novels/[id]
 * 作品を部分更新
 */
export async function PUT(
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
    const allowedFields = [
      "title",
      "tagline",
      "synopsis",
      "genre",
      "tags",
      "status",
      "is_r18",
    ];

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

    // tags処理
    if (updates.tags !== undefined) {
      const tags = updates.tags;
      if (Array.isArray(tags)) {
        updates.tags = tags.map((t: string) => t.trim()).filter(Boolean);
      } else if (typeof tags === "string") {
        updates.tags = tags.split(",").map((t: string) => t.trim()).filter(Boolean);
      }
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("novels")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: "作品の更新に失敗しました" },
        { status: 500 }
      );
    }

    return NextResponse.json({ novel: data });
  } catch {
    return NextResponse.json(
      { error: "サーバーエラーが発生しました" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/writer/novels/[id]
 * 作品を削除（公開済みエピソードがある場合は不可）
 */
export async function DELETE(
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

    // 公開済みエピソードの存在チェック
    const { count } = await supabase
      .from("episodes")
      .select("id", { count: "exact", head: true })
      .eq("novel_id", id)
      .eq("status", "published");

    if (count && count > 0) {
      return NextResponse.json(
        { error: "公開済みエピソードがあるため削除できません" },
        { status: 409 }
      );
    }

    const { error } = await supabase.from("novels").delete().eq("id", id);

    if (error) {
      return NextResponse.json(
        { error: "作品の削除に失敗しました" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "サーバーエラーが発生しました" },
      { status: 500 }
    );
  }
}
