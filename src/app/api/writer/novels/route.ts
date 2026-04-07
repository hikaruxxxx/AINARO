import { NextRequest, NextResponse } from "next/server";
import { requireWriterApi } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/writer/novels
 * 自分の作品一覧を取得
 */
export async function GET() {
  try {
    const auth = await requireWriterApi();
    if (!auth.authorized) return auth.response;

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("novels")
      .select("*")
      .eq("author_id", auth.userId)
      .eq("author_type", "external")
      .order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: "作品一覧の取得に失敗しました" },
        { status: 500 }
      );
    }

    return NextResponse.json({ novels: data });
  } catch {
    return NextResponse.json(
      { error: "サーバーエラーが発生しました" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/writer/novels
 * 作品を新規作成
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireWriterApi();
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { title, tagline, synopsis, genre, tags, is_r18 } = body;

    // バリデーション
    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json(
        { error: "タイトルは必須です" },
        { status: 400 }
      );
    }
    if (!genre || typeof genre !== "string" || genre.trim().length === 0) {
      return NextResponse.json(
        { error: "ジャンルは必須です" },
        { status: 400 }
      );
    }

    // slug自動生成
    const slug = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    // tags処理: カンマ区切り文字列 or 配列対応
    let parsedTags: string[] = [];
    if (tags) {
      if (Array.isArray(tags)) {
        parsedTags = tags.map((t: string) => t.trim()).filter(Boolean);
      } else if (typeof tags === "string") {
        parsedTags = tags.split(",").map((t: string) => t.trim()).filter(Boolean);
      }
    }

    const supabase = createAdminClient();

    // 作者名をプロフィールから取得
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("display_name")
      .eq("user_id", auth.userId)
      .single();

    const authorName = profile?.display_name || "名無し";

    const { data, error } = await supabase
      .from("novels")
      .insert({
        title: title.trim(),
        tagline: tagline?.trim() || null,
        synopsis: synopsis?.trim() || null,
        genre: genre.trim(),
        tags: parsedTags,
        slug,
        is_r18: is_r18 || false,
        author_type: "external",
        author_id: auth.userId,
        author_name: authorName,
        status: "serial",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: "作品の作成に失敗しました" },
        { status: 500 }
      );
    }

    return NextResponse.json({ novel: data }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "サーバーエラーが発生しました" },
      { status: 500 }
    );
  }
}
