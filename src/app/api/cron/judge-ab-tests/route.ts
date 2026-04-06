import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCronAuth } from "@/lib/cron-auth";
import { chiSquareTest } from "@/lib/statistics";
import type { ABTestJudgment } from "@/types/learning-loop";

/**
 * A/Bテスト自動判定Cron (毎週日曜 UTC 6:00 = JST 15:00)
 * 実行中のA/Bテストを統計的に判定し、パターンの確認/棄却を行う
 */
export async function GET(req: NextRequest) {
  const authError = verifyCronAuth(req);
  if (authError) return authError;

  const supabase = createAdminClient();

  // 1. 実行中のA/Bテストを取得
  const { data: tests, error: testError } = await supabase
    .from("ab_tests")
    .select("*")
    .eq("status", "running");

  if (testError || !tests || tests.length === 0) {
    return NextResponse.json({
      success: true,
      message: "判定対象のA/Bテストなし",
      judgments: [],
    });
  }

  const judgments: ABTestJudgment[] = [];

  for (const test of tests) {
    const variants = test.variants as { id: string; name: string }[];
    if (!variants || variants.length < 2) continue;

    const variantA = variants[0];
    const variantB = variants[1];

    // 2. バリアント別のreading_eventsを集計
    const { data: events } = await supabase
      .from("reading_events")
      .select("event_type, variant_id")
      .in("variant_id", [variantA.id, variantB.id]);

    if (!events || events.length === 0) continue;

    // primary_metricに基づいて集計
    const metric = test.primary_metric || "completion_rate";
    const isCompletionMetric = metric === "completion_rate";

    const eventsA = events.filter(e => e.variant_id === variantA.id);
    const eventsB = events.filter(e => e.variant_id === variantB.id);

    const startsA = eventsA.filter(e => e.event_type === "start").length;
    const startsB = eventsB.filter(e => e.event_type === "start").length;

    let successA: number, successB: number, totalA: number, totalB: number;

    if (isCompletionMetric) {
      // 読了率: complete / start
      successA = eventsA.filter(e => e.event_type === "complete").length;
      successB = eventsB.filter(e => e.event_type === "complete").length;
      totalA = startsA;
      totalB = startsB;
    } else {
      // 次話遷移率: next / complete
      const completesA = eventsA.filter(e => e.event_type === "complete").length;
      const completesB = eventsB.filter(e => e.event_type === "complete").length;
      successA = eventsA.filter(e => e.event_type === "next").length;
      successB = eventsB.filter(e => e.event_type === "next").length;
      totalA = completesA;
      totalB = completesB;
    }

    // 3. サンプル数チェック
    const minSample = 30; // 各群最低30サンプル
    if (totalA < minSample || totalB < minSample) {
      // 2週間以上経過していたらinconclusiveで終了
      const createdAt = new Date(test.created_at);
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

      if (createdAt < twoWeeksAgo) {
        judgments.push({
          test_id: test.id,
          winner: "inconclusive",
          p_value: 1,
          sample_size_a: totalA,
          sample_size_b: totalB,
          metric_a: totalA > 0 ? successA / totalA : 0,
          metric_b: totalB > 0 ? successB / totalB : 0,
          pattern_id: null,
          new_status: "hypothesis", // 仮説に戻す
        });

        // テスト終了
        await supabase
          .from("ab_tests")
          .update({ status: "completed" })
          .eq("id", test.id);
      }
      continue;
    }

    // 4. カイ二乗検定
    const result = chiSquareTest(successA, totalA, successB, totalB);

    const metricA = totalA > 0 ? successA / totalA : 0;
    const metricB = totalB > 0 ? successB / totalB : 0;

    let winner: "a" | "b" | "inconclusive";
    let newStatus: "confirmed" | "rejected" | "hypothesis";

    if (result.significant) {
      winner = metricB > metricA ? "b" : "a";
      // バリアントBがトリートメント（パターン適用）
      newStatus = winner === "b" ? "confirmed" : "rejected";
    } else {
      winner = "inconclusive";
      newStatus = "hypothesis";
    }

    judgments.push({
      test_id: test.id,
      winner,
      p_value: result.pValue,
      sample_size_a: totalA,
      sample_size_b: totalB,
      metric_a: Math.round(metricA * 10000) / 10000,
      metric_b: Math.round(metricB * 10000) / 10000,
      pattern_id: null, // 後で紐付け
      new_status: newStatus,
    });

    // 5. テストとパターンのステータスを更新
    if (result.significant) {
      await supabase
        .from("ab_tests")
        .update({ status: "completed" })
        .eq("id", test.id);

      // 紐付けられたパターンのステータスを更新
      const { data: patterns } = await supabase
        .from("discovered_patterns")
        .select("id")
        .eq("ab_test_id", test.id)
        .eq("status", "testing");

      if (patterns) {
        for (const pattern of patterns) {
          await supabase
            .from("discovered_patterns")
            .update({ status: newStatus })
            .eq("id", pattern.id);

          judgments[judgments.length - 1].pattern_id = pattern.id;
        }
      }
    }
  }

  return NextResponse.json({
    success: true,
    tests_evaluated: tests.length,
    judgments,
    judged_at: new Date().toISOString(),
  });
}
