import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/writer/apply
 * 作家セルフサービス登録
 */
export async function POST(request: NextRequest) {
  try {
    // ログイン確認
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    // メール認証確認
    if (!user.email_confirmed_at) {
      return NextResponse.json(
        { error: "メール認証が完了していません" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { display_name, agreed_to_terms } = body;

    // バリデーション
    if (!display_name || typeof display_name !== "string") {
      return NextResponse.json(
        { error: "表示名は必須です" },
        { status: 400 }
      );
    }
    if (display_name.trim().length === 0 || display_name.length > 50) {
      return NextResponse.json(
        { error: "表示名は1〜50文字で入力してください" },
        { status: 400 }
      );
    }
    if (!agreed_to_terms) {
      return NextResponse.json(
        { error: "利用規約への同意が必要です" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // 既存プロフィール確認
    const { data: existing } = await supabase
      .from("user_profiles")
      .select("role, writer_status")
      .eq("user_id", user.id)
      .single();

    // 既に承認済みならエラー
    if (existing?.role === "writer" && existing.writer_status === "approved") {
      return NextResponse.json(
        { error: "既に作家として承認されています" },
        { status: 409 }
      );
    }

    // suspendedならエラー
    if (existing?.writer_status === "suspended") {
      return NextResponse.json(
        { error: "アカウントが停止されています" },
        { status: 403 }
      );
    }

    const profileData = {
      user_id: user.id,
      display_name: display_name.trim(),
      role: "writer",
      writer_status: "approved",
      writer_approved_at: new Date().toISOString(),
    };

    if (existing) {
      // 既存レコードを更新
      const { error } = await supabase
        .from("user_profiles")
        .update(profileData)
        .eq("user_id", user.id);

      if (error) {
        return NextResponse.json(
          { error: "プロフィールの更新に失敗しました" },
          { status: 500 }
        );
      }
    } else {
      // 新規作成
      const { error } = await supabase
        .from("user_profiles")
        .insert(profileData);

      if (error) {
        return NextResponse.json(
          { error: "プロフィールの作成に失敗しました" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "サーバーエラーが発生しました" },
      { status: 500 }
    );
  }
}
