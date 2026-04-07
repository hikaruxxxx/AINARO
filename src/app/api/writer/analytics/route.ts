import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWriterApi } from "@/lib/supabase/auth";

/**
 * GET /api/writer/analytics?days=30
 * 作家の全作品のサマリー統計
 */
export async function GET(req: NextRequest) {
  try {
    const authCheck = await requireWriterApi();
    if (!authCheck.authorized) return authCheck.response;

    const { searchParams } = new URL(req.url);
    const days = Math.min(Number(searchParams.get("days") || "30"), 90);
    const novelId = searchParams.get("novel_id");

    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceDate = since.toISOString().split("T")[0];

    const supabase = createAdminClient();

    // 自分の作品IDを取得
    let novelIds: string[];
    if (novelId) {
      // 指定作品が自分のものか確認
      const { data } = await supabase
        .from("novels")
        .select("id")
        .eq("id", novelId)
        .eq("author_id", authCheck.userId)
        .single();
      if (!data) {
        return NextResponse.json({ error: "作品が見つかりません" }, { status: 404 });
      }
      novelIds = [novelId];
    } else {
      const { data: novels } = await supabase
        .from("novels")
        .select("id")
        .eq("author_id", authCheck.userId)
        .eq("author_type", "external");
      novelIds = (novels || []).map((n) => n.id);
    }

    if (novelIds.length === 0) {
      return NextResponse.json({
        summary: { pv: 0, unique_users: 0, avg_completion_rate: null, avg_next_episode_rate: null, followers: 0 },
        by_novel: [],
        daily: [],
      });
    }

    // daily_stats から集計
    const { data: dailyStats } = await supabase
      .from("daily_stats")
      .select("date, novel_id, pv, unique_users, completion_rate, next_episode_rate, bookmark_rate")
      .in("novel_id", novelIds)
      .gte("date", sinceDate)
      .order("date", { ascending: true });

    const stats = dailyStats || [];

    // サマリー計算
    const totalPv = stats.reduce((sum, s) => sum + (s.pv || 0), 0);
    const totalUniqueUsers = stats.reduce((sum, s) => sum + (s.unique_users || 0), 0);

    const completionRates = stats
      .filter((s) => s.completion_rate != null)
      .map((s) => s.completion_rate!);
    const avgCompletionRate = completionRates.length > 0
      ? completionRates.reduce((a, b) => a + b, 0) / completionRates.length
      : null;

    const nextRates = stats
      .filter((s) => s.next_episode_rate != null)
      .map((s) => s.next_episode_rate!);
    const avgNextRate = nextRates.length > 0
      ? nextRates.reduce((a, b) => a + b, 0) / nextRates.length
      : null;

    // フォロワー数
    const { count: followers } = await supabase
      .from("novel_follows")
      .select("id", { count: "exact", head: true })
      .in("novel_id", novelIds);

    // 作品別サマリー
    const byNovel = new Map<string, { pv: number; unique_users: number; rates: number[] }>();
    for (const s of stats) {
      const existing = byNovel.get(s.novel_id) || { pv: 0, unique_users: 0, rates: [] };
      existing.pv += s.pv || 0;
      existing.unique_users += s.unique_users || 0;
      if (s.completion_rate != null) existing.rates.push(s.completion_rate);
      byNovel.set(s.novel_id, existing);
    }

    // 作品名を取得
    const { data: novelInfos } = await supabase
      .from("novels")
      .select("id, title, total_pv, total_bookmarks")
      .in("id", novelIds);

    const byNovelResult = (novelInfos || []).map((n) => {
      const s = byNovel.get(n.id);
      return {
        novel_id: n.id,
        title: n.title,
        total_pv: n.total_pv,
        total_bookmarks: n.total_bookmarks,
        period_pv: s?.pv || 0,
        period_unique_users: s?.unique_users || 0,
        avg_completion_rate: s && s.rates.length > 0
          ? s.rates.reduce((a, b) => a + b, 0) / s.rates.length
          : null,
      };
    });

    // 日別推移（全作品合算）
    const byDate = new Map<string, { pv: number; unique_users: number }>();
    for (const s of stats) {
      const existing = byDate.get(s.date) || { pv: 0, unique_users: 0 };
      existing.pv += s.pv || 0;
      existing.unique_users += s.unique_users || 0;
      byDate.set(s.date, existing);
    }
    const daily = Array.from(byDate.entries())
      .map(([date, d]) => ({ date, ...d }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      summary: {
        pv: totalPv,
        unique_users: totalUniqueUsers,
        avg_completion_rate: avgCompletionRate,
        avg_next_episode_rate: avgNextRate,
        followers: followers || 0,
      },
      by_novel: byNovelResult,
      daily,
    });
  } catch {
    return NextResponse.json({ error: "統計の取得に失敗しました" }, { status: 500 });
  }
}
