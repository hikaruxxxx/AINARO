// 長編生成パイプライン v3 - 進捗ステータス確認
//
// 1作品の各レイヤ完成状況、生成済み話数、監査結果を一覧表示。
// LLM呼び出しなし。
//
// 使い方:
//   個別: npx tsx scripts/generation/longform-status.ts <slug>
//   全体: npx tsx scripts/generation/longform-status.ts

import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const WORKS_DIR = "data/generation/works";

interface MetaJson {
  slug: string;
  profile_type: string;
  current_layer: number;
  completed_layers: number[];
  target_episodes: number | string;
  target_chapters: number | string;
  expected_total: number;
  current_episode?: number;
  audited_episodes?: Array<{ ep: number; judgment: "A" | "B" | "C" }>;
  status: string;
}

function loadMeta(slug: string): MetaJson | null {
  const p = join(WORKS_DIR, slug, "longform", "_meta.json");
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8")) as MetaJson;
}

function listLongformWorks(): string[] {
  if (!existsSync(WORKS_DIR)) return [];
  const dirs = readdirSync(WORKS_DIR).filter((d) => {
    const longformDir = join(WORKS_DIR, d, "longform");
    return existsSync(longformDir) && statSync(longformDir).isDirectory();
  });
  return dirs;
}

function countEpisodes(slug: string): { generated: number; audited: number; max_ep: number } {
  const dir = join(WORKS_DIR, slug, "longform", "episodes");
  if (!existsSync(dir)) return { generated: 0, audited: 0, max_ep: 0 };
  const files = readdirSync(dir);
  const epFiles = files.filter((f) => /^ep\d{4}\.md$/.test(f));
  const auditFiles = files.filter((f) => /^ep\d{4}_audit\.md$/.test(f));
  let maxEp = 0;
  for (const f of epFiles) {
    const m = f.match(/^ep(\d{4})\.md$/);
    if (m) maxEp = Math.max(maxEp, parseInt(m[1], 10));
  }
  return { generated: epFiles.length, audited: auditFiles.length, max_ep: maxEp };
}

function checkLayerCompletion(slug: string): {
  layer1_world_bible: boolean;
  layer2_protagonist: boolean;
  layer3_relationship: boolean;
  layer4_arcs: boolean;
  layer5_patterns: boolean;
} {
  const baseDir = join(WORKS_DIR, slug, "longform");
  return {
    layer1_world_bible: existsSync(join(baseDir, "world_bible", "ability_system.json")),
    layer2_protagonist: existsSync(join(baseDir, "protagonist.md")),
    layer3_relationship: existsSync(join(baseDir, "relationship_graph.json")),
    layer4_arcs: existsSync(join(baseDir, "story_arcs.md")),
    layer5_patterns: existsSync(join(baseDir, "episode_patterns.yaml")),
  };
}

function aggregateAuditResults(slug: string): { A: number; B: number; C: number; total: number } {
  const meta = loadMeta(slug);
  if (!meta || !meta.audited_episodes) return { A: 0, B: 0, C: 0, total: 0 };
  const counts = { A: 0, B: 0, C: 0, total: meta.audited_episodes.length };
  for (const a of meta.audited_episodes) {
    counts[a.judgment]++;
  }
  return counts;
}

function showSingle(slug: string): void {
  const meta = loadMeta(slug);
  if (!meta) {
    console.error(`[ERROR] not found: ${slug}`);
    console.error(`To init: npx tsx scripts/generation/longform-init.ts ${slug} hellmode_type`);
    process.exit(1);
  }

  const layers = checkLayerCompletion(slug);
  const eps = countEpisodes(slug);
  const audit = aggregateAuditResults(slug);

  console.log(`=== ${slug} ===`);
  console.log(`プロファイル: ${meta.profile_type}`);
  console.log(`目標: ${meta.target_episodes}話 / ${meta.target_chapters}章 / ${meta.expected_total}+点`);
  console.log("");
  console.log("レイヤ完成状況:");
  console.log(`  Layer 0 init:               ✅`);
  console.log(`  Layer 1 world_bible:        ${layers.layer1_world_bible ? "✅" : "❌"}`);
  console.log(`  Layer 2 protagonist:        ${layers.layer2_protagonist ? "✅" : "❌"}`);
  console.log(`  Layer 3 relationship_graph: ${layers.layer3_relationship ? "✅" : "❌"}`);
  console.log(`  Layer 4 story_arcs:         ${layers.layer4_arcs ? "✅" : "❌"}`);
  console.log(`  Layer 5 episode_patterns:   ${layers.layer5_patterns ? "✅" : "❌"}`);
  console.log("");
  console.log(`Layer 6 生成済み話数: ${eps.generated} (最大 ep${eps.max_ep})`);
  console.log(`Layer 7 監査済み話数: ${eps.audited}`);
  console.log("");
  if (audit.total > 0) {
    console.log(`監査結果サマリー:`);
    console.log(`  A判定: ${audit.A} (${((audit.A / audit.total) * 100).toFixed(1)}%)`);
    console.log(`  B判定: ${audit.B}`);
    console.log(`  C判定: ${audit.C}`);
    if (audit.A / audit.total >= 25 / 30) {
      console.log(`  → MVP 合格基準を満たしている (A判定 ≥ 25/30)`);
    }
  }
  console.log("");
  console.log("次のステップ:");
  if (!layers.layer1_world_bible) {
    console.log(`  /build-world-bible ${slug}`);
  } else if (!layers.layer2_protagonist) {
    console.log(`  /build-protagonist ${slug}`);
  } else if (!layers.layer3_relationship) {
    console.log(`  /build-relationship-graph ${slug}`);
  } else if (!layers.layer4_arcs) {
    console.log(`  /build-story-arcs ${slug}`);
  } else if (!layers.layer5_patterns) {
    console.log(`  /build-episode-patterns ${slug}`);
  } else if (eps.max_ep === 0) {
    console.log(`  /generate-longform-episode ${slug} 1`);
  } else {
    const next = eps.max_ep + 1;
    console.log(`  /generate-longform-episode ${slug} ${next}`);
  }
}

function showAll(): void {
  const slugs = listLongformWorks();
  if (slugs.length === 0) {
    console.log("No longform works found. To create one:");
    console.log("  npx tsx scripts/generation/longform-init.ts <slug> hellmode_type");
    return;
  }
  console.log(`=== Longform works: ${slugs.length} ===`);
  console.log("");
  for (const slug of slugs) {
    const meta = loadMeta(slug);
    if (!meta) continue;
    const eps = countEpisodes(slug);
    const audit = aggregateAuditResults(slug);
    console.log(
      `${slug.padEnd(30)} | ${meta.profile_type.padEnd(20)} | ep ${String(eps.max_ep).padStart(3)}/${meta.target_episodes} | A:${audit.A} B:${audit.B} C:${audit.C}`,
    );
  }
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    showAll();
  } else {
    showSingle(args[0]);
  }
}

main();
