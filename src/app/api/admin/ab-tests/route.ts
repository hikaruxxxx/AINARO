import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/supabase/auth";

// GET /api/admin/ab-tests — A/Bテスト一覧
export async function GET(req: NextRequest) {
  const authCheck = await requireAdminApi();
  if (!authCheck.authorized) return authCheck.response;

  const supabase = createAdminClient();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  let query = supabase
    .from("ab_tests")
    .select("*, episodes(episode_number, title), novels(title, slug)")
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tests: data || [] });
}

// POST /api/admin/ab-tests — A/Bテスト作成
export async function POST(req: NextRequest) {
  const authCheck = await requireAdminApi();
  if (!authCheck.authorized) return authCheck.response;

  const supabase = createAdminClient();
  const body = await req.json();

  const {
    name,
    description,
    novel_id,
    episode_id,
    variants,
    traffic_split,
    primary_metric,
    variant_bodies,  // {A: {body_md, body_html?}, B: {body_md, body_html?}}
  } = body;

  if (!name || !novel_id || !episode_id || !variants || variants.length < 2) {
    return NextResponse.json(
      { error: "name, novel_id, episode_id, variants（2つ以上）が必要です" },
      { status: 400 }
    );
  }

  // テスト作成
  const { data: test, error: testError } = await supabase
    .from("ab_tests")
    .insert({
      name,
      description: description || null,
      novel_id,
      episode_id,
      variants,
      traffic_split: traffic_split || { A: 50, B: 50 },
      primary_metric: primary_metric || "next_episode_rate",
    })
    .select()
    .single();

  if (testError) {
    return NextResponse.json({ error: testError.message }, { status: 500 });
  }

  // バリアント本文を保存
  if (variant_bodies) {
    const variantRows = Object.entries(variant_bodies).map(
      ([variantId, content]) => {
        const c = content as { body_md: string; body_html?: string };
        return {
          ab_test_id: test.id,
          variant_id: variantId,
          body_md: c.body_md,
          body_html: c.body_html || null,
          character_count: c.body_md.replace(/[\s\n]/g, "").length,
        };
      }
    );

    await supabase.from("episode_variants").insert(variantRows);
  }

  return NextResponse.json({ test });
}
