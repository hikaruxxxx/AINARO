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

    // 既存プロフィール確認（.single() は 0 件時にエラーを返すので maybeSingle を使う）
    const { data: existing, error: selectError } = await supabase
      .from("user_profiles")
      .select("role, writer_status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (selectError) {
      console.error("[writer/apply] select error", selectError);
      return NextResponse.json(
        { error: `プロフィール取得に失敗しました: ${selectError.message}` },
        { status: 500 }
      );
    }

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

    // upsert で新規/既存の分岐を一本化（user_id で衝突解決）
    const { error: upsertError } = await supabase
      .from("user_profiles")
      .upsert(profileData, { onConflict: "user_id" });

    if (upsertError) {
      console.error("[writer/apply] upsert error", upsertError);
      return NextResponse.json(
        { error: `プロフィールの作成に失敗しました: ${upsertError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[writer/apply] unexpected error", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `サーバーエラーが発生しました: ${message}` },
      { status: 500 }
    );
  }
}
