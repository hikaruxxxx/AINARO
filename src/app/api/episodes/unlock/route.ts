import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/episodes/unlock — エピソードをポイントで先読み解放
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const { episode_id } = await req.json();
  if (!episode_id) {
    return NextResponse.json({ error: "episode_idが必要です" }, { status: 400 });
  }

  const admin = createAdminClient();

  // エピソード情報を取得
  const { data: episode } = await admin
    .from("episodes")
    .select("id, unlock_at, unlock_price, novel_id")
    .eq("id", episode_id)
    .single();

  if (!episode) {
    return NextResponse.json({ error: "エピソードが見つかりません" }, { status: 404 });
  }

  // すでに無料解放済みか確認
  if (!episode.unlock_at || new Date(episode.unlock_at) <= new Date()) {
    return NextResponse.json({ error: "このエピソードはすでに無料公開されています" }, { status: 400 });
  }

  // すでに解放済みか確認
  const { data: existing } = await admin
    .from("point_unlocks")
    .select("id")
    .eq("user_id", user.id)
    .eq("episode_id", episode_id)
    .single();

  if (existing) {
    return NextResponse.json({ error: "すでに解放済みです" }, { status: 400 });
  }

  const price = episode.unlock_price;
  if (price <= 0) {
    return NextResponse.json({ error: "このエピソードは無料です" }, { status: 400 });
  }

  // ポイント消費
  const { data: newBalance, error: pointError } = await admin.rpc("grant_points", {
    p_user_id: user.id,
    p_amount: -price,
    p_type: "unlock_episode",
    p_reference_id: episode_id,
    p_description: `エピソード先読み解放`,
  });

  if (pointError) {
    if (pointError.message.includes("残高不足")) {
      return NextResponse.json({ error: "ポイントが不足しています" }, { status: 400 });
    }
    return NextResponse.json({ error: pointError.message }, { status: 500 });
  }

  // 解放記録
  await admin.from("point_unlocks").insert({
    user_id: user.id,
    episode_id,
    points_spent: price,
  });

  return NextResponse.json({ balance: newBalance, unlocked: true });
}

// GET /api/episodes/unlock?episode_ids=id1,id2 — 解放済みエピソード一覧
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ unlocked: [] });
  }

  const { searchParams } = new URL(req.url);
  const episodeIds = searchParams.get("episode_ids")?.split(",").filter(Boolean);

  let query = supabase
    .from("point_unlocks")
    .select("episode_id")
    .eq("user_id", user.id);

  if (episodeIds && episodeIds.length > 0) {
    query = query.in("episode_id", episodeIds);
  }

  const { data } = await query;
  return NextResponse.json({
    unlocked: (data || []).map((d) => d.episode_id),
  });
}
