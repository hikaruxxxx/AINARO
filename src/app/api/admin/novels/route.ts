import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// TODO: Phase 1で管理者認証チェックを追加する

/**
 * POST /api/admin/novels — 作品新規作成
 */
export async function POST(request: NextRequest) {
  try {
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

    if (!title) {
      return NextResponse.json(
        { error: "タイトルは必須です" },
        { status: 400 }
      );
    }

    if (!genre) {
      return NextResponse.json(
        { error: "ジャンルは必須です" },
        { status: 400 }
      );
    }

    // slugが未指定ならtitleをkebab-case風に変換（日本語はそのまま）
    const finalSlug =
      slug ||
      title
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^\w\u3000-\u9fff\uff00-\uffef-]/g, "");

    // タグはカンマ区切り文字列 or 配列どちらにも対応
    const finalTags = Array.isArray(tags)
      ? tags
      : typeof tags === "string"
        ? tags
            .split(",")
            .map((t: string) => t.trim())
            .filter(Boolean)
        : [];

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("novels")
      .insert({
        title,
        slug: finalSlug,
        tagline: tagline || null,
        synopsis: synopsis || null,
        genre,
        tags: finalTags,
        status: status || "serial",
        author_name: author_name || "編集部",
        is_r18: is_r18 || false,
      })
      .select()
      .single();

    if (error) {
      // スラッグ重複の可能性
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "このスラッグは既に使用されています" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "リクエストの処理に失敗しました" },
      { status: 500 }
    );
  }
}
