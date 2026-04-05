import { createClient } from "@supabase/supabase-js";

/**
 * 管理用Supabaseクライアント（service_role key使用）
 * RLSをバイパスして書き込みが可能。Route Handler専用。
 * Phase 0: 管理者認証は未実装のため、APIルートの公開に注意。
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
