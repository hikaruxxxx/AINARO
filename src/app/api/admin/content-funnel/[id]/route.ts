import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/supabase/auth";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/admin/content-funnel/[id] — フェーズ変更・判定・スコア更新
export async function PATCH(req: NextRequest, { params }: Params) {
  const authCheck = await requireAdminApi();
  if (!authCheck.authorized) return authCheck.response;

  const { id } = await params;
  const supabase = createAdminClient();
  const body = await req.json();

  const allowedFields = [
    "phase", "decision", "decision_reason", "decided_at",
    "novel_id", "pilot_episodes",
    "pilot_completion_rate", "pilot_next_rate", "pilot_bookmark_rate",
    "pilot_avg_read_sec", "pilot_score",
    "title", "synopsis", "genre", "tags", "notes",
  ];

  const updates: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in body) updates[key] = body[key];
  }

  // pilot_scoreの自動算出
  if (updates.pilot_completion_rate !== undefined || updates.pilot_next_rate !== undefined) {
    const { data: current } = await supabase
      .from("content_candidates")
      .select("pilot_completion_rate, pilot_next_rate, pilot_bookmark_rate")
      .eq("id", id)
      .single();

    if (current) {
      const cr = (updates.pilot_completion_rate as number) ?? current.pilot_completion_rate ?? 0;
      const nr = (updates.pilot_next_rate as number) ?? current.pilot_next_rate ?? 0;
      const br = (updates.pilot_bookmark_rate as number) ?? current.pilot_bookmark_rate ?? 0;
      updates.pilot_score = cr * (1 + nr) * (1 + br);
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "更新フィールドがありません" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("content_candidates")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ candidate: data });
}

// DELETE /api/admin/content-funnel/[id]
export async function DELETE(_req: NextRequest, { params }: Params) {
  const authCheck = await requireAdminApi();
  if (!authCheck.authorized) return authCheck.response;

  const { id } = await params;
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("content_candidates")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
