/**
 * content/works/_index.json を再生成する。
 *
 * 各 <slug>/work.json を正本として読み込み、エージェント/オーケストレータが
 * 参照するための集約ビューを生成する。work.json が無い作品は legacy として記録。
 *
 * 実行: npx tsx scripts/utils/rebuild-works-index.ts
 */

import fs from "node:fs";
import path from "node:path";

const WORKS_DIR = path.join(process.cwd(), "content", "works");
const OUT = path.join(WORKS_DIR, "_index.json");

type WorkEntry = {
  path: string;
  state: string;
  category: "screened" | "legacy";
  sourceBatch?: string;
  hitProbability?: number;
  llmTotal?: number;
  episodes?: number;
  genre?: string;
};

function detectGenre(slug: string): string | undefined {
  if (slug.startsWith("vill-rom")) return "悪役令嬢_恋愛";
  if (slug.startsWith("vill-fan")) return "悪役令嬢_ファンタジー";
  if (slug.startsWith("isekai-pure")) return "異世界_純愛";
  return undefined;
}

function countEpisodes(workPath: string): number {
  const epsDir = path.join(workPath, "episodes");
  if (fs.existsSync(epsDir) && fs.statSync(epsDir).isDirectory()) {
    return fs.readdirSync(epsDir).filter((f) => f.endsWith(".md")).length;
  }
  // legacy: ep001.md など作品ルート直下
  return fs.readdirSync(workPath).filter((f) => /^ep\d+\.md$/.test(f)).length;
}

function main() {
  const works: Record<string, WorkEntry> = {};
  const slugs = fs
    .readdirSync(WORKS_DIR)
    .filter((d) => {
      const p = path.join(WORKS_DIR, d);
      return fs.statSync(p).isDirectory();
    })
    .sort();

  for (const slug of slugs) {
    const workPath = path.join(WORKS_DIR, slug);
    const wjsonPath = path.join(workPath, "work.json");
    const entry: WorkEntry = {
      path: `content/works/${slug}`,
      state: "legacy",
      category: "legacy",
    };

    if (fs.existsSync(wjsonPath)) {
      const wd = JSON.parse(fs.readFileSync(wjsonPath, "utf-8"));
      entry.category = "screened";
      entry.state = wd.state ?? "unknown";
      if (wd.sourceBatch) entry.sourceBatch = wd.sourceBatch;
      if (wd.hitProbability != null) entry.hitProbability = wd.hitProbability;
      if (wd.llmTotal != null) entry.llmTotal = wd.llmTotal;
      if (wd.episodes != null) entry.episodes = wd.episodes;
    } else {
      entry.episodes = countEpisodes(workPath);
    }

    const genre = detectGenre(slug);
    if (genre) entry.genre = genre;

    works[slug] = entry;
  }

  const index = {
    lastUpdated: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    schemaVersion: 1,
    description:
      "content/works/ 配下の作品メタデータ集約。エージェント/オーケストレータはこれを参照して対象作品を特定する。各作品の正本は <slug>/work.json（存在する場合）。legacy 作品は work.json 未生成。",
    works,
  };

  fs.writeFileSync(OUT, JSON.stringify(index, null, 2) + "\n");
  console.log(`✓ ${OUT} を再生成しました（${Object.keys(works).length} 作品）`);

  // ステータスサマリ
  const byCategory: Record<string, number> = {};
  const byState: Record<string, number> = {};
  for (const w of Object.values(works)) {
    byCategory[w.category] = (byCategory[w.category] ?? 0) + 1;
    byState[w.state] = (byState[w.state] ?? 0) + 1;
  }
  console.log("  category:", byCategory);
  console.log("  state:   ", byState);
}

main();
