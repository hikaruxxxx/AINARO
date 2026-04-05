import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/ab-test/assign — セッションにバリアントを割り当てる
// リクエスト: { episode_id, session_id }
// レスポンス: { variant_id, body_md, body_html } or null（テストなし）
export async function POST(req: NextRequest) {
  const { episode_id, session_id } = await req.json();

  if (!episode_id || !session_id) {
    return NextResponse.json({ error: "episode_idとsession_idが必要です" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // このエピソードでrunning中のA/Bテストがあるか
  const { data: test } = await supabase
    .from("ab_tests")
    .select("id, variants, traffic_split")
    .eq("episode_id", episode_id)
    .eq("status", "running")
    .single();

  if (!test) {
    return NextResponse.json({ variant: null });
  }

  // 既に割り当て済みか確認
  const { data: existing } = await supabase
    .from("ab_assignments")
    .select("variant_id")
    .eq("ab_test_id", test.id)
    .eq("session_id", session_id)
    .single();

  let variantId: string;

  if (existing) {
    variantId = existing.variant_id;
  } else {
    // トラフィック配分に基づいてランダム割り当て
    variantId = assignVariant(test.traffic_split);

    await supabase.from("ab_assignments").insert({
      ab_test_id: test.id,
      session_id,
      variant_id: variantId,
    });
  }

  // バリアント本文を取得
  const { data: variant } = await supabase
    .from("episode_variants")
    .select("body_md, body_html")
    .eq("ab_test_id", test.id)
    .eq("variant_id", variantId)
    .single();

  return NextResponse.json({
    variant: variant
      ? { variant_id: variantId, body_md: variant.body_md, body_html: variant.body_html }
      : null,
  });
}

// トラフィック配分に基づくランダム割り当て
// traffic_split: {"A": 50, "B": 50} → 50%の確率でA、50%でB
function assignVariant(trafficSplit: Record<string, number>): string {
  const entries = Object.entries(trafficSplit);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  const rand = Math.random() * total;

  let cumulative = 0;
  for (const [variantId, weight] of entries) {
    cumulative += weight;
    if (rand < cumulative) return variantId;
  }

  // フォールバック（通常到達しない）
  return entries[0][0];
}
