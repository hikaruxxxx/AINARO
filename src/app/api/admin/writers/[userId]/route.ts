import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/supabase/auth";

/**
 * PUT /api/admin/writers/[userId] — 作家ステータス更新（停止/再開）
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const authCheck = await requireAdminApi();
  if (!authCheck.authorized) return authCheck.response;

  const { userId } = await params;
  const body = await request.json();
  const { writer_status } = body;

  if (!writer_status || !["approved", "suspended"].includes(writer_status)) {
    return NextResponse.json({ error: "無効なステータスです" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const updates: Record<string, unknown> = { writer_status };

  // 停止時はroleをreaderに戻す
  if (writer_status === "suspended") {
    updates.role = "reader";
  }
  // 再開時はroleをwriterに戻す
  if (writer_status === "approved") {
    updates.role = "writer";
  }

  const { error } = await supabase
    .from("user_profiles")
    .update(updates)
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
