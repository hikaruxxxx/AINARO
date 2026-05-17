/**
 * L3.5 Scene-Graph (Phase β B2 skeleton)
 *
 * 物語論理 × 頁演出 × 評価選別の交差ハブを生成・検証する CLI。
 *
 * Phase β B2 (本ファイル): validate モードのみ実装。既存 scene_graph.json を読んで validateSceneGraph を走らせる。
 * Phase β B3: generate モード実装 (3 段採点ループ)。bible + shotlist + brief から scene_graph を新規生成。
 *
 * Usage:
 *   npx tsx scripts/manga/layers/L03_5-scene-graph.ts --slug a07-modern-dungeon --episode 1 --mode validate
 *   npx tsx scripts/manga/layers/L03_5-scene-graph.ts --slug a07-modern-dungeon --episode 1 --mode generate (B3)
 *
 * 仕様: docs/plans/manga/scene-graph-l3-5.md
 */
import "../_env";
import { promises as fs } from "node:fs";
import {
  bibleSnapshotPath,
  episodeBriefV2Path,
  sceneGraphPath,
  storyboardPath,
  volumePlotPath,
} from "./_paths";
import {
  validateSceneGraph,
  validatePanelSceneInheritance,
  buildForeshadowDag,
  isSceneGraphV1,
  type SceneGraphV1,
  type EpisodeBriefMinimal,
  type StoryboardLikeShape,
} from "../../../src/lib/manga/scene-graph/schema";
import {
  computeEpisodeMetrics,
  formatMetricsReport,
} from "../../../src/lib/manga/scene-graph/episode-metrics";
import type { BibleSnapshotV2 } from "../../../src/lib/manga/schemas-v2";
import type { VolumePlot } from "../../../src/lib/manga/storyboard-v2/volume-plot";

type Mode = "validate" | "generate" | "bootstrap";
type Args = { slug: string; episode: number; mode: Mode; live: boolean };

function parseArgs(): Args {
  const a: Partial<Args> = { mode: "validate", live: false };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    let key: string | null = null;
    let val: string | boolean | null = null;
    const eq = arg.match(/^--([^=]+)=(.*)$/);
    if (eq) [, key, val] = eq;
    else {
      const flag = arg.match(/^--(.+)$/);
      if (flag && i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
        key = flag[1];
        val = argv[++i];
      } else if (flag) {
        key = flag[1];
        val = true;
      }
    }
    if (!key || val === null) continue;
    if (key === "live") {
      if (val === true) a.live = true;
      else if (val === "true") a.live = true;
      else if (val === "false") a.live = false;
      else throw new Error(`unknown --live "${val}", expected true|false`);
      continue;
    }
    if (typeof val !== "string") continue;
    if (key === "slug") a.slug = val;
    else if (key === "episode") a.episode = Number(val);
    else if (key === "mode") {
      if (val === "validate" || val === "generate" || val === "bootstrap") a.mode = val;
      else throw new Error(`unknown --mode "${val}", expected validate|generate|bootstrap`);
    }
  }
  if (!a.slug || !a.episode) throw new Error("--slug and --episode required");
  return a as Args;
}

/**
 * _brief.v2.md から minimal な episode brief を抽出する。
 * フォーマットは L02b (build-volume-plot) が出力する markdown。
 *
 * cast 抽出戦略 (優先順):
 *   1. brief 内に `<!-- cast: char_X, char_Y -->` 形式の明示コメントがあればそれを使う (推奨)
 *   2. 無ければ char_<...>_v<N> 形式の ID を直接拾う
 *   3. それも無ければ bible.characters[].name (姓+名 / コンパクト / 姓 / 名) で本文照合 (false-positive リスクあり)
 *   4. 全部空なら validation Rule 2 をスキップ + warning
 *
 * 将来 (B3 以降): brief を構造化 (cast/events/cliff フィールドを明示) する parser に置換。
 */
async function loadEpisodeBriefMinimal(
  slug: string,
  episode: number,
  bible: BibleSnapshotV2
): Promise<EpisodeBriefMinimal> {
  const path = episodeBriefV2Path(slug, episode);
  let raw = "";
  try {
    raw = await fs.readFile(path, "utf-8");
  } catch {
    console.warn(`[L03.5] brief not found at ${path}, using empty cast (validation Rule 2 will skip cast subset check)`);
    return { episode_id: `${slug}-ep${String(episode).padStart(2, "0")}`, cast: [] };
  }

  // 1: 明示コメント
  const explicitCast = extractCastFromHtmlComment(raw);
  if (explicitCast.length > 0) {
    console.log(`[L03.5] brief cast (explicit comment): ${explicitCast.length} entries`);
    return { episode_id: `${slug}-ep${String(episode).padStart(2, "0")}`, cast: explicitCast };
  }

  // 2: char_*_v<N> ID 直接抽出
  const directIds = extractCharacterIdsFromText(raw);
  if (directIds.length > 0) {
    console.log(`[L03.5] brief cast (direct char_ id match): ${directIds.length} entries`);
    return { episode_id: `${slug}-ep${String(episode).padStart(2, "0")}`, cast: directIds };
  }

  // 3: bible.characters[].name で本文照合
  const nameBased = extractCharIdsByNameMatch(raw, bible);
  if (nameBased.length > 0) {
    console.log(`[L03.5] brief cast (bible name match): ${nameBased.length} entries (false-positive risk)`);
    return { episode_id: `${slug}-ep${String(episode).padStart(2, "0")}`, cast: nameBased };
  }

  console.warn(`[L03.5] brief cast extraction returned 0 entries — validation Rule 2 will surface false errors`);
  return { episode_id: `${slug}-ep${String(episode).padStart(2, "0")}`, cast: [] };
}

function extractCastFromHtmlComment(text: string): string[] {
  // <!-- cast: char_X, char_Y --> または <!-- cast: char_X, char_Y, "ナビ"=char_Z -->
  const re = /<!--\s*cast\s*:\s*([^>]+?)\s*-->/i;
  const m = text.match(re);
  if (!m) return [];
  const inner = m[1];
  const ids = inner.match(/char_[^\s,，、)\]｝}"'`=]+_v\d+/g);
  return ids ? Array.from(new Set(ids)) : [];
}

function extractCharacterIdsFromText(text: string): string[] {
  const re = /char_[^\s,，、）)\]｝}】」"'`]+_v\d+/g;
  const set = new Set<string>();
  for (const m of text.matchAll(re)) {
    set.add(m[0]);
  }
  return Array.from(set);
}

function extractCharIdsByNameMatch(text: string, bible: BibleSnapshotV2): string[] {
  const cast = new Set<string>();
  for (const c of bible.characters) {
    const name = c.name ?? "";
    if (!name) continue;
    const compact = name.replace(/\s+/g, "");
    const parts = name.split(/\s+/).filter((p) => p.length > 0);
    if (text.includes(compact) || text.includes(name)) {
      cast.add(c.id);
      continue;
    }
    for (const p of parts) {
      if (p.length >= 2 && text.includes(p)) {
        cast.add(c.id);
        break;
      }
    }
  }
  return Array.from(cast);
}

async function modeValidate(args: Args): Promise<void> {
  const sgPath = sceneGraphPath(args.slug, args.episode);
  const biblePath = bibleSnapshotPath(args.slug);
  console.log(`[L03.5] mode=validate slug=${args.slug} ep=${args.episode}`);
  console.log(`[L03.5] reading scene_graph: ${sgPath}`);
  console.log(`[L03.5] reading bible: ${biblePath}`);

  const sgRaw = JSON.parse(await fs.readFile(sgPath, "utf-8"));
  if (!isSceneGraphV1(sgRaw)) {
    console.error(`[L03.5] FAIL: ${sgPath} is not a valid SceneGraphV1 document`);
    process.exit(2);
  }
  const sceneGraph = sgRaw as SceneGraphV1;
  const bible = JSON.parse(await fs.readFile(biblePath, "utf-8")) as BibleSnapshotV2;
  const brief = await loadEpisodeBriefMinimal(args.slug, args.episode, bible);

  // total pages / panels の参照は storyboard が既にあれば使う (なくても validate は走る)
  let totalPages: number | undefined;
  let totalPanels: number | undefined;
  let storyboard: StoryboardLikeShape | null = null;
  try {
    const sbRaw = JSON.parse(
      await fs.readFile(storyboardPath(args.slug, args.episode), "utf-8")
    );
    if (sbRaw && typeof sbRaw === "object") {
      totalPages = (sbRaw as { total_pages?: number }).total_pages;
      const pages = (sbRaw as { pages?: { panels?: unknown[] }[] }).pages ?? [];
      totalPanels = pages.reduce((n, p) => n + (p.panels?.length ?? 0), 0);
      storyboard = sbRaw as StoryboardLikeShape;
    }
  } catch {
    // storyboard 未生成なら Rule 7 と panel-scene 継承検査はスキップ
  }

  let volumeForeshadowMap: VolumePlot["foreshadow_map"] | undefined;
  try {
    // TODO: 巻番号は arc_position から導出する。現状は v01 固定。
    const vpRaw = await fs.readFile(volumePlotPath(args.slug, 1), "utf-8");
    const vp = JSON.parse(vpRaw) as VolumePlot;
    volumeForeshadowMap = vp.foreshadow_map;
  } catch {
    // volume_plot 無しは optional
  }

  const result = validateSceneGraph(sceneGraph, bible, brief, {
    totalPages,
    totalPanels,
    volumeForeshadowMap,
    episodeNo: args.episode,
  });
  const dag = buildForeshadowDag(sceneGraph);

  // B5-1: panel-scene 継承検査 (storyboard があれば実行)
  let inheritance: { ok: boolean; errors: string[]; warnings: string[] } | null = null;
  if (storyboard) {
    inheritance = validatePanelSceneInheritance(storyboard, sceneGraph);
  }

  console.log("");
  console.log("=== Scene-Graph Validation ===");
  console.log(`ok: ${result.ok}`);
  console.log(`errors: ${result.errors.length}`);
  for (const e of result.errors) console.log(`  ✗ ${e}`);
  console.log(`warnings: ${result.warnings.length}`);
  for (const w of result.warnings) console.log(`  ⚠ ${w}`);

  if (inheritance) {
    console.log("");
    console.log("=== Panel-Scene Inheritance (B5-1) ===");
    console.log(`ok: ${inheritance.ok}`);
    console.log(`errors: ${inheritance.errors.length}`);
    for (const e of inheritance.errors) console.log(`  ✗ ${e}`);
    console.log(`warnings: ${inheritance.warnings.length}`);
    for (const w of inheritance.warnings) console.log(`  ⚠ ${w}`);
  } else {
    console.log("");
    console.log("=== Panel-Scene Inheritance ===");
    console.log("(storyboard.json not found, skipping inheritance check)");
  }

  console.log("");
  console.log("=== Foreshadow DAG ===");
  console.log(`setups: ${dag.setup_count}, payoffs: ${dag.payoff_count}`);
  if (dag.orphan_setups.length > 0) {
    console.log(`orphan_setups (this_episode hint だが payoff なし): ${dag.orphan_setups.join(", ")}`);
  }
  if (dag.payoff_without_setup.length > 0) {
    console.log(`payoff_without_setup: ${dag.payoff_without_setup.join(", ")}`);
  }
  if (dag.pending_cross_episode.length > 0) {
    console.log(`pending_cross_episode (next_episode/later_in_volume/cross_volume 待ち):`);
    for (const p of dag.pending_cross_episode) {
      console.log(`  ${p.token} → ${p.expected_in}`);
    }
  }

  // B4: episode-level metrics
  const metrics = computeEpisodeMetrics(sceneGraph);
  console.log("");
  console.log("=== Episode Metrics (B4) ===");
  console.log(formatMetricsReport(metrics));

  if (!result.ok || (inheritance && !inheritance.ok)) process.exit(2);
}

async function modeGenerate(args: Args): Promise<void> {
  // B3 scoring loop: dry-run by default; pass --live to run candidate/pairwise/anchor/predict-hit via Codex CLI.
  const { runEpisodeScoringLoop, estimateCost, DEFAULT_SCORING_CONFIG } = await import(
    "../../../src/lib/manga/scene-graph/scoring-loop"
  );

  const sgPath = sceneGraphPath(args.slug, args.episode);
  const biblePath = bibleSnapshotPath(args.slug);
  const briefPath = episodeBriefV2Path(args.slug, args.episode);
  const epId = `${args.slug}-ep${String(args.episode).padStart(2, "0")}`;

  console.log(`[L03.5] mode=generate slug=${args.slug} ep=${args.episode}`);
  console.log(`[L03.5] ${args.live ? "LIVE" : "dry-run"} mode (use --live to run Codex CLI scoring)`);

  // 既存 scene_graph.json があれば slot として再利用 (panel_range / page_range / location_id を引き継ぐ)
  // 無ければ shotlist / brief から slot を構築する必要があるため、現状は既存 scene_graph.json を slot source とする
  let slots;
  try {
    const existing = JSON.parse(await fs.readFile(sgPath, "utf-8"));
    slots = existing.scenes.map((s: unknown) => {
      const sc = s as {
        scene_id: string;
        scene_no: number;
        prev_scene_id: string | null;
        next_scene_id: string | null;
        page_range: { start: number; end: number };
        panel_range: { start_panel_no: number; end_panel_no: number };
        arc_position: unknown;
        location_id: string;
        sub_locations?: string[];
      };
      return {
        scene_id: sc.scene_id,
        scene_no: sc.scene_no,
        prev_scene_id: sc.prev_scene_id,
        next_scene_id: sc.next_scene_id,
        page_range: sc.page_range,
        panel_range: sc.panel_range,
        arc_position: sc.arc_position,
        location_id: sc.location_id,
        sub_locations: sc.sub_locations,
      };
    });
    console.log(`[L03.5] reusing ${slots.length} scene slots from existing scene_graph.json`);
  } catch {
    console.error(`[L03.5] generate-mode requires existing scene_graph.json (slot source) at this stage.`);
    console.error(`[L03.5] Create or keep scene_graph.json first, then rerun generate mode.`);
    process.exit(3);
  }

  // コスト見積もり
  const config = { ...DEFAULT_SCORING_CONFIG, dry_run: !args.live };
  const est = estimateCost(slots.length, config);
  if (args.live) {
    console.log(
      `[L03.5] LIVE mode: candidates_per_scene=${config.candidatesPerScene}, total_candidates=${config.candidatesPerScene * slots.length}`
    );
  }
  console.log("");
  console.log("=== Cost Estimate ===");
  console.log(`scenes=${est.scenes}, candidates_per_scene=${est.candidates_per_scene}`);
  console.log(`est_tokens_per_episode=${est.est_tokens_per_episode.toLocaleString()}`);
  console.log(`est_tokens_per_volume=${est.est_tokens_per_volume.toLocaleString()} (10 ep)`);
  console.log(`fits_in_max5h: ${est.fits_in_max5h}`);
  for (const n of est.notes) console.log(`  - ${n}`);

  // 採点ループ (--live 未指定なら dry-run)
  const vpPath = volumePlotPath(args.slug, 1); // TODO: 巻番号は arc_position から導出
  const result = await runEpisodeScoringLoop(
    slots,
    {
      slug: args.slug,
      episode: args.episode,
      bibleSnapshotPath: biblePath,
      briefPath,
      volumePlotPath: vpPath,
      finalizedScenes: [],
    },
    config,
    epId
  );

  console.log("");
  console.log(`=== Scoring Loop Result (${args.live ? "live" : "dry-run"}) ===`);
  console.log(`tier_breakdown: tier1=${result.tier_breakdown.tier1}, tier2=${result.tier_breakdown.tier2}, tier3=${result.tier_breakdown.tier3}`);
  console.log(`total_candidates_generated: ${result.total_candidates_generated}`);
  console.log(`scenes_in_output: ${result.scene_graph.scenes.length}`);
  console.log("");
  console.log(`[L03.5] ${args.live ? "live" : "dry-run"} complete.`);
}

async function modeBootstrap(args: Args): Promise<void> {
  // L2b 物語OS再設計: VolumePlot.episodes[].scenes (SceneSkeleton[]) から
  // 最小限の SceneGraphV1 を組み立てて scene_graph.json に書き出す。
  const { bootstrapSceneGraphFromVolumePlot } = await import(
    "../../../src/lib/manga/scene-graph/bootstrap-from-skeleton"
  );
  const sgPath = sceneGraphPath(args.slug, args.episode);
  // 既存ファイルがあれば backup を取って上書き
  try {
    await fs.access(sgPath);
    const backupPath = `${sgPath}.pre-bootstrap.backup`;
    await fs.copyFile(sgPath, backupPath);
    console.log(`[L03.5] backup existing scene_graph: ${backupPath}`);
  } catch {
    // 無ければそのまま進む
  }
  // 巻番号: 当面 1 固定 (TODO: arc_position から導出)
  const volumeNo = 1;
  const vp = JSON.parse(
    await fs.readFile(volumePlotPath(args.slug, volumeNo), "utf-8"),
  ) as VolumePlot;
  const sceneGraph = bootstrapSceneGraphFromVolumePlot({
    volumePlot: vp,
    episodeNo: args.episode,
    bibleSnapshotPath: bibleSnapshotPath(args.slug),
    briefPath: episodeBriefV2Path(args.slug, args.episode),
    shotlistPath: storyboardPath(args.slug, args.episode).replace(
      /storyboard\.json$/,
      "shotlist.json",
    ),
  });
  await fs.writeFile(sgPath, JSON.stringify(sceneGraph, null, 2));
  console.log(
    `[L03.5] bootstrap DONE: ${sgPath} (scenes=${sceneGraph.scenes.length} from L2b skeleton)`,
  );
  // bootstrap 後の summary
  const diSummary = sceneGraph.scenes
    .map(
      (s) =>
        `  - ${s.scene_id} (p${s.page_range.start}-p${s.page_range.end}, beat=${s.beat_type}, mode=${s.mode}, di=${(s.directing_intent as { kind?: string } | undefined)?.kind ?? "none"})`,
    )
    .join("\n");
  console.log(`[L03.5] scenes:\n${diSummary}`);
  console.log(`[L03.5] 次のステップ: --mode generate --live で scoring loop で肉付け可能`);
}

async function main() {
  const args = parseArgs();
  if (args.mode === "validate") await modeValidate(args);
  else if (args.mode === "generate") await modeGenerate(args);
  else if (args.mode === "bootstrap") await modeBootstrap(args);
}

main().catch((e) => {
  console.error("[L03.5] FAILED:", e);
  process.exit(1);
});
