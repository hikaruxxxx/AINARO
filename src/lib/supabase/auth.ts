import { createClient } from "./server";
import { createAdminClient } from "./admin";
import { redirect } from "next/navigation";
import type { UserProfile } from "@/types/novel";

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL;

/**
 * サーバーサイドで現在のユーザーを取得
 * 未ログインなら null を返す
 */
export async function getUser() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return null;
    return data.user;
  } catch {
    return null;
  }
}

/**
 * ユーザーのプロフィールを取得
 * 未ログイン or プロフィール未作成なら null を返す
 */
export async function getUserProfile(): Promise<UserProfile | null> {
  const user = await getUser();
  if (!user) return null;

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("user_id", user.id)
      .single();
    if (error) return null;
    return data as UserProfile | null;
  } catch {
    return null;
  }
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
 * 作家かどうかを判定（writer or admin）
 */
export async function isWriter(): Promise<boolean> {
  const admin = await isAdmin();
  if (admin) return true;

  const profile = await getUserProfile();
  return profile?.role === "writer" && profile.writer_status === "approved";
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
 * 作家でなければリダイレクト
 * Server Component（layout/page）で使用
 */
export async function requireWriter() {
  const writer = await isWriter();
  if (!writer) {
    redirect("/write");
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

/**
 * API Route用の作家チェック
 * 作家でなければ 401 を返す。認証済みユーザーIDも返す
 */
export async function requireWriterApi(): Promise<
  { authorized: false; response: Response } | { authorized: true; userId: string }
> {
  const user = await getUser();
  if (!user) {
    return {
      authorized: false,
      response: Response.json({ error: "ログインが必要です" }, { status: 401 }),
    };
  }

  // admin は常にwriter権限あり
  if (user.email === ADMIN_EMAIL) {
    return { authorized: true, userId: user.id };
  }

  const supabase = createAdminClient();
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, writer_status")
    .eq("user_id", user.id)
    .single();

  if (!profile || profile.role !== "writer" || profile.writer_status !== "approved") {
    return {
      authorized: false,
      response: Response.json({ error: "作家権限が必要です" }, { status: 403 }),
    };
  }

  return { authorized: true, userId: user.id };
}
