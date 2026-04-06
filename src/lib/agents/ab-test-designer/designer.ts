/**
 * A/Bテスト自動設計エンジン
 * 発見されたパターン仮説を自動的にA/Bテスト化する
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { ABTestDesign, DiscoveredPattern } from "@/types/learning-loop";

/**
 * 未テストの仮説パターンからA/Bテストを自動設計・作成する
 * extract-patterns Cronの後に呼ばれる想定
 */
export async function designAndCreateABTests(): Promise<{
  testsCreated: number;
  designs: ABTestDesign[];
}> {
  const supabase = createAdminClient();

  // 1. テスト可能な仮説を取得（confidence medium以上、まだテスト未実施）
  const { data: patterns } = await supabase
    .from("discovered_patterns")
    .select("*")
    .eq("status", "hypothesis")
    .in("confidence", ["medium", "high"])
    .is("ab_test_id", null)
    .order("discovered_at", { ascending: true })
    .limit(3); // 同時に3テストまで

  if (!patterns || patterns.length === 0) {
    return { testsCreated: 0, designs: [] };
  }

  // 2. 現在実行中のテスト数を確認（同時実行制限）
  const { count: runningCount } = await supabase
    .from("ab_tests")
    .select("*", { count: "exact", head: true })
    .eq("status", "running");

  const maxConcurrent = 5;
  const available = maxConcurrent - (runningCount ?? 0);
  if (available <= 0) {
    return { testsCreated: 0, designs: [] };
  }

  const designs: ABTestDesign[] = [];
  let testsCreated = 0;

  for (const pattern of patterns.slice(0, available)) {
    const design = createDesign(pattern);
    if (!design) continue;

    // 3. A/Bテストを作成
    const { data: test, error } = await supabase
      .from("ab_tests")
      .insert({
        name: design.name,
        description: `自動設計: ${design.hypothesis}`,
        status: "running",
        variants: [
          { id: crypto.randomUUID(), name: "control", description: design.variant_a_description },
          { id: crypto.randomUUID(), name: "treatment", description: design.variant_b_description },
        ],
        traffic_split: [50, 50],
        primary_metric: design.target_metric,
      })
      .select()
      .single();

    if (error || !test) continue;

    // 4. パターンとテストを紐付け
    await supabase
      .from("discovered_patterns")
      .update({
        status: "testing",
        ab_test_id: test.id,
      })
      .eq("id", pattern.id);

    designs.push(design);
    testsCreated++;
  }

  return { testsCreated, designs };
}

/**
 * パターンからA/Bテスト設計を生成
 */
function createDesign(pattern: DiscoveredPattern): ABTestDesign | null {
  if (!pattern.actionable_rule) return null;

  const targetMetric: "completion_rate" | "next_episode_rate" =
    pattern.pattern_type === "negative" ? "completion_rate" : "next_episode_rate";

  return {
    name: `auto_${pattern.id.slice(0, 8)}`,
    hypothesis: pattern.finding,
    pattern_id: pattern.id,
    variant_a_description: `コントロール群: 通常の生成ルール（パターン未適用）`,
    variant_b_description: `トリートメント群: ${pattern.actionable_rule}`,
    target_metric: targetMetric,
    // 各群30サンプル以上で検出力0.8を確保する目安
    required_sample_size: 30,
  };
}
