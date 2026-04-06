import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/supabase/auth";

/**
 * パターン個別操作API（ステータス変更）
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authCheck = await requireAdminApi();
  if (!authCheck.authorized) return authCheck.response;

  const { id } = await params;
  const body = await req.json();
  const { status } = body;

  const validStatuses = ["hypothesis", "testing", "confirmed", "rejected", "retired"];
  if (!status || !validStatuses.includes(status)) {
    return NextResponse.json(
      { error: `無効なステータス: ${status}` },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("discovered_patterns")
    .update({ status })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ pattern: data });
}
