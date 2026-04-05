import { createClient } from "./server";
import { redirect } from "next/navigation";

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL;

/**
 * サーバーサイドで現在のユーザーを取得
 * 未ログインなら null を返す
 */
export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * 管理者かどうかを判定
 */
export async function isAdmin(): Promise<boolean> {
  if (!ADMIN_EMAIL) return false;
  const user = await getUser();
  return user?.email === ADMIN_EMAIL;
}

/**
 * 管理者でなければ /admin/login にリダイレクト
 * Server Component（layout/page）で使用
 */
export async function requireAdmin() {
  const admin = await isAdmin();
  if (!admin) {
    redirect("/admin/login");
  }
}

/**
 * API Route用の管理者チェック
 * 管理者でなければ 401 を返す
 */
export async function requireAdminApi(): Promise<{ authorized: false; response: Response } | { authorized: true }> {
  const admin = await isAdmin();
  if (!admin) {
    return {
      authorized: false,
      response: Response.json(
        { error: "管理者認証が必要です" },
        { status: 401 }
      ),
    };
  }
  return { authorized: true };
}
