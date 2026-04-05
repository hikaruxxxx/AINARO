import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/supabase/auth";

// GET /api/admin/content-funnel — コンテンツ選別ファネル一覧
export async function GET(req: NextRequest) {
  const authCheck = await requireAdminApi();
  if (!authCheck.authorized) return authCheck.response;

  const supabase = createAdminClient();
  const { searchParams } = new URL(req.url);
  const phase = searchParams.get("phase");

  let query = supabase
    .from("content_candidates")
    .select("*")
    .order("pilot_score", { ascending: false, nullsFirst: false });

  if (phase) {
    query = query.eq("phase", phase);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // フェーズごとの集計
  const summary = {
    plot: 0,
    pilot: 0,
    serial: 0,
    archived: 0,
  };
  for (const c of data || []) {
    summary[c.phase as keyof typeof summary]++;
  }

  return NextResponse.json({ candidates: data || [], summary });
}

// POST /api/admin/content-funnel — 新規コンテンツ候補登録
export async function POST(req: NextRequest) {
  const authCheck = await requireAdminApi();
  if (!authCheck.authorized) return authCheck.response;

  const supabase = createAdminClient();
  const body = await req.json();

  const { title, synopsis, genre, tags, notes } = body;

  if (!title || !genre) {
    return NextResponse.json(
      { error: "titleとgenreは必須です" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("content_candidates")
    .insert({
      title,
      synopsis: synopsis || null,
      genre,
      tags: tags || [],
      notes: notes || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ candidate: data });
}
