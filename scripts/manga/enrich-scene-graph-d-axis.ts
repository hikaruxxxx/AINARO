/**
 * Existing scene_graph.json の A/B/C 系を保持し、D 系 bible 伝搬軸だけを後付け充填する。
 *
 * Usage:
 *   npx tsx scripts/manga/enrich-scene-graph-d-axis.ts --slug a07-modern-dungeon --episode 1 --dry-run
 *   npx tsx scripts/manga/enrich-scene-graph-d-axis.ts --slug a07-modern-dungeon --episode 1 --concurrency 3
 */
import "./_env";
import { promises as fs } from "node:fs";
import path from "node:path";
import { bibleSnapshotPath, sceneGraphPath } from "./layers/_paths";
import type { BibleSnapshotV2 } from "../../src/lib/manga/schemas-v2";
import {
  isSceneGraphV1,
  validateSceneGraph,
  type Scene,
  type SceneGraphV1,
} from "../../src/lib/manga/scene-graph/schema";
import {
  relevantMotifs,
  relevantProps,
  relevantWorldRules,
} from "../../src/lib/manga/bible/broker";
import { runCodexText } from "../../src/lib/manga/llm/codex-text";

type Args = {
  slug: string;
  episode: number;
  concurrency: number;
  dryRun: boolean;
};

type EnrichDAxisPatch = {
  wardrobe_state?: Array<{ character_id: string; costume_id: string }>;
  visual_motif_anchors?: Array<{
    motif_id: string;
    intensity: "subtle" | "clear" | "dominant";
  }>;
  world_rules_active?: string[];
  props_in_play?: Array<{ prop_id: string; held_by?: string }>;
  theme_subtext?: { theme_id: string; how_it_surfaces: string };
};

type Candidates = {
  slug: string;
  episode: number;
  costumes: BibleSnapshotV2["costumes"];
  motifs: BibleSnapshotV2["visual_motifs"];
  worldRules: string[];
  props: BibleSnapshotV2["props"];
};

function parseArgs(): Args {
  const parsed: Partial<Args> = { concurrency: 3, dryRun: false };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }

    const eq = arg.match(/^--([^=]+)=(.*)$/);
    const key = eq?.[1] ?? (arg.startsWith("--") ? arg.slice(2) : null);
    const value = eq?.[2] ?? (key ? argv[++i] : undefined);
    if (!key || value == null) continue;

    if (key === "slug") parsed.slug = value;
    else if (key === "episode") parsed.episode = Number(value);
    else if (key === "concurrency") parsed.concurrency = Number(value);
  }

  if (!parsed.slug || !Number.isFinite(parsed.episode)) {
    throw new Error("--slug and --episode required");
  }
  if (!Number.isFinite(parsed.concurrency) || parsed.concurrency! < 1) {
    throw new Error("--concurrency must be a positive number");
  }

  return {
    slug: parsed.slug,
    episode: parsed.episode!,
    concurrency: Math.floor(parsed.concurrency!),
    dryRun: parsed.dryRun ?? false,
  };
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, "utf-8")) as T;
}

function hasAllDAxisFields(scene: Scene): boolean {
  return Boolean(
    scene.wardrobe_state &&
      scene.visual_motif_anchors &&
      scene.world_rules_active &&
      scene.props_in_play &&
      scene.theme_subtext
  );
}

function candidatesFor(
  slug: string,
  episode: number,
  bible: BibleSnapshotV2,
  scene: Scene
): Candidates {
  const castIds = new Set(scene.cast.map((entry) => entry.character_id));
  return {
    slug,
    episode,
    costumes: bible.costumes.filter((costume) => castIds.has(costume.character_id)),
    motifs: relevantMotifs(bible, scene),
    worldRules: relevantWorldRules(bible, scene),
    props: relevantProps(bible, scene),
  };
}

function compactJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function formatCast(scene: Scene, bible: BibleSnapshotV2): string {
  return scene.cast
    .map((entry) => {
      const character = bible.characters.find((c) => c.id === entry.character_id);
      return `- ${entry.character_id}${character?.name ? ` (${character.name})` : ""}: ${entry.presence}`;
    })
    .join("\n");
}

function buildEnrichDAxisPrompt(
  scene: Scene,
  bible: BibleSnapshotV2,
  candidates: Candidates
): string {
  const costumeCandidates = candidates.costumes.map((costume) => ({
    id: costume.id,
    character_id: costume.character_id,
    valid_from_episode: costume.valid_from_episode,
    valid_until_episode: costume.valid_until_episode,
    spec: costume.spec,
  }));
  const motifCandidates = candidates.motifs.map((motif) => {
    const maybeWithId = motif as typeof motif & { id?: string };
    return {
      id: maybeWithId.id,
      name: motif.name,
      meaning: motif.meaning,
      draw_directive: motif.draw_directive,
    };
  });
  const propCandidates = candidates.props.map((prop) => ({
    id: prop.id,
    name: prop.name,
    owner_character_id: prop.owner_character_id,
    spec: prop.spec,
  }));

  return [
    "あなたは AINARO 漫画 v2 scene-graph の D 系軸 (視覚演出層) 充填エージェントです。",
    `slug=${candidates.slug}, episode=${candidates.episode}, scene=${scene.scene_id}`,
    "",
    "## 既存 scene の固定情報 (変更禁止)",
    `- scene_id: ${scene.scene_id}`,
    `- beat_type: ${scene.beat_type}`,
    `- mode: ${scene.mode}`,
    `- location_id: ${scene.location_id}`,
    `- cast:\n${formatCast(scene, bible) || "(none)"}`,
    `- key_visual_intent: ${scene.key_visual_intent}`,
    `- protagonist_arc_state: ${compactJson(scene.protagonist_arc_state)}`,
    "",
    "## 候補 (この中から選ぶこと、bible に存在しない id 禁止)",
    "",
    "### 衣装 (bible.costumes、cast キャラ向けにフィルタ済)",
    compactJson(costumeCandidates),
    "",
    "### 視覚 motif (broker.relevantMotifs)",
    compactJson(motifCandidates),
    "",
    "### この場所で active な world.rules (broker.relevantWorldRules)",
    compactJson(candidates.worldRules),
    "",
    "### この場所/cast で取り回しうる props (broker.relevantProps)",
    compactJson(propCandidates),
    "",
    "## 指示",
    "以下 5 つのフィールドだけを埋めて返してください。それ以外のフィールドは返さないこと。",
    "",
    '- wardrobe_state: cast の各キャラに着衣 costume_id を割り当て (cast に居ないキャラは禁止)',
    '- visual_motif_anchors: 1-3 個。motif_id は候補 list の name または id を使用、intensity は "subtle"/"clear"/"dominant"',
    "- world_rules_active: 0-4 件。候補 list から原文ママで複写 (truncate 禁止)",
    "- props_in_play: 0-3 個。prop_id と held_by (cast キャラ id) を指定、cast に居ないキャラ禁止",
    `- theme_subtext: { theme_id, how_it_surfaces } の object。theme_id は "ad_hoc_${scene.scene_id}" を使い、how_it_surfaces に 1 行 15-40 字で scene の情緒主題を一句に凝縮`,
    "",
    "## 出力形式",
    "```json",
    "{",
    '  "wardrobe_state": [{ "character_id": "...", "costume_id": "..." }],',
    '  "visual_motif_anchors": [{ "motif_id": "...", "intensity": "..." }],',
    '  "world_rules_active": ["..."],',
    '  "props_in_play": [{ "prop_id": "...", "held_by": "..." }],',
    `  "theme_subtext": { "theme_id": "ad_hoc_${scene.scene_id}", "how_it_surfaces": "..." }`,
    "}",
    "```",
  ].join("\n");
}

function sanitizePatch(raw: unknown, scene: Scene, candidates: Candidates): EnrichDAxisPatch | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const castIds = new Set(scene.cast.map((entry) => entry.character_id));
  const costumeIds = new Set(candidates.costumes.map((costume) => costume.id));
  const motifIds = new Set(
    candidates.motifs.flatMap((motif) => {
      const maybeWithId = motif as typeof motif & { id?: string };
      return [maybeWithId.id, motif.name].filter((v): v is string => typeof v === "string" && v.length > 0);
    })
  );
  const worldRules = new Set(candidates.worldRules);
  const propIds = new Set(candidates.props.map((prop) => prop.id));

  const patch: EnrichDAxisPatch = {};

  if (value.wardrobe_state !== undefined) {
    if (!Array.isArray(value.wardrobe_state)) return null;
    const wardrobe = value.wardrobe_state.map((entry) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return null;
      const item = entry as Record<string, unknown>;
      if (typeof item.character_id !== "string" || typeof item.costume_id !== "string") return null;
      if (!castIds.has(item.character_id) || !costumeIds.has(item.costume_id)) return null;
      return { character_id: item.character_id, costume_id: item.costume_id };
    });
    if (wardrobe.some((entry) => entry === null)) return null;
    patch.wardrobe_state = wardrobe as EnrichDAxisPatch["wardrobe_state"];
  }

  if (value.visual_motif_anchors !== undefined) {
    if (!Array.isArray(value.visual_motif_anchors)) return null;
    const anchors = value.visual_motif_anchors.map((entry) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return null;
      const item = entry as Record<string, unknown>;
      if (typeof item.motif_id !== "string") return null;
      if (item.intensity !== "subtle" && item.intensity !== "clear" && item.intensity !== "dominant") return null;
      if (!motifIds.has(item.motif_id)) return null;
      return { motif_id: item.motif_id, intensity: item.intensity };
    });
    if (anchors.some((entry) => entry === null) || anchors.length > 3) return null;
    patch.visual_motif_anchors = anchors as EnrichDAxisPatch["visual_motif_anchors"];
  }

  if (value.world_rules_active !== undefined) {
    if (!Array.isArray(value.world_rules_active)) return null;
    if (value.world_rules_active.length > 4) return null;
    const rules = value.world_rules_active.map((rule) => (typeof rule === "string" ? rule : null));
    if (rules.some((rule) => rule === null || !worldRules.has(rule))) return null;
    patch.world_rules_active = rules as string[];
  }

  if (value.props_in_play !== undefined) {
    if (!Array.isArray(value.props_in_play)) return null;
    if (value.props_in_play.length > 3) return null;
    const props = value.props_in_play.map((entry) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return null;
      const item = entry as Record<string, unknown>;
      if (typeof item.prop_id !== "string" || !propIds.has(item.prop_id)) return null;
      if (item.held_by !== undefined && (typeof item.held_by !== "string" || !castIds.has(item.held_by))) {
        return null;
      }
      return {
        prop_id: item.prop_id,
        ...(typeof item.held_by === "string" ? { held_by: item.held_by } : {}),
      };
    });
    if (props.some((entry) => entry === null)) return null;
    patch.props_in_play = props as EnrichDAxisPatch["props_in_play"];
  }

  if (value.theme_subtext !== undefined) {
    if (
      typeof value.theme_subtext !== "object" ||
      value.theme_subtext === null ||
      Array.isArray(value.theme_subtext)
    ) {
      return null;
    }
    const themeSubtext = value.theme_subtext as Record<string, unknown>;
    if (typeof themeSubtext.theme_id !== "string" || typeof themeSubtext.how_it_surfaces !== "string") {
      return null;
    }
    const themeId = themeSubtext.theme_id.trim();
    const howItSurfaces = themeSubtext.how_it_surfaces.trim();
    if (themeId.length < 1 || howItSurfaces.length < 1 || howItSurfaces.length > 200) return null;
    patch.theme_subtext = { theme_id: themeId, how_it_surfaces: howItSurfaces };
  }

  return patch;
}

async function enrichScene(
  args: Args,
  bible: BibleSnapshotV2,
  scene: Scene
): Promise<{ scene: Scene; enriched: boolean; error?: string }> {
  if (hasAllDAxisFields(scene)) return { scene, enriched: false };

  const candidates = candidatesFor(args.slug, args.episode, bible, scene);
  const task = buildEnrichDAxisPrompt(scene, bible, candidates);
  const result = await runCodexText<unknown>({
    task,
    format: "json",
    cwd: process.env.AINARO_REPO_ROOT ?? process.cwd(),
    timeoutMs: 8 * 60 * 1000,
    maxRetries: 1,
  });

  const patch = sanitizePatch(result.parsed, scene, candidates);
  if (!patch) {
    return {
      scene,
      enriched: false,
      error: `${scene.scene_id}: invalid D-axis JSON patch, skipped`,
    };
  }

  return {
    scene: { ...scene, ...patch },
    enriched: true,
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

function validationBrief(sceneGraph: SceneGraphV1) {
  return {
    episode_id: sceneGraph.episode_id,
    cast: Array.from(
      new Set(sceneGraph.scenes.flatMap((scene) => scene.cast.map((entry) => entry.character_id)))
    ),
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const biblePath = bibleSnapshotPath(args.slug);
  const sgPath = sceneGraphPath(args.slug, args.episode);
  const [bible, sceneGraphRaw] = await Promise.all([
    readJson<BibleSnapshotV2>(biblePath),
    readJson<unknown>(sgPath),
  ]);

  if (!isSceneGraphV1(sceneGraphRaw)) {
    throw new Error(`${sgPath} is not a valid SceneGraphV1 document`);
  }
  const sceneGraph = sceneGraphRaw;

  if (args.dryRun) {
    const target = sceneGraph.scenes.find((scene) => !hasAllDAxisFields(scene)) ?? sceneGraph.scenes[0];
    if (!target) throw new Error("scene_graph has no scenes");
    console.log(buildEnrichDAxisPrompt(target, bible, candidatesFor(args.slug, args.episode, bible, target)));
    return;
  }

  const backupPath = path.join(
    path.dirname(sgPath),
    `scene_graph.bak-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  await fs.copyFile(sgPath, backupPath);
  console.log(`[enrich-d-axis] backup=${backupPath}`);

  const results = await mapWithConcurrency(sceneGraph.scenes, args.concurrency, (scene) =>
    enrichScene(args, bible, scene)
  );
  for (const result of results) {
    if (result.error) console.warn(`[enrich-d-axis] ${result.error}`);
  }

  const enrichedGraph: SceneGraphV1 = {
    ...sceneGraph,
    scenes: results.map((result) => result.scene),
  };
  const validation = validateSceneGraph(enrichedGraph, bible, validationBrief(enrichedGraph));
  console.log("=== Scene-Graph Validation ===");
  console.log(`ok: ${validation.ok}`);
  console.log(`errors: ${validation.errors.length}`);
  for (const error of validation.errors) console.log(`  ✗ ${error}`);
  console.log(`warnings: ${validation.warnings.length}`);
  for (const warning of validation.warnings) console.log(`  ⚠ ${warning}`);

  await fs.writeFile(sgPath, `${JSON.stringify(enrichedGraph, null, 2)}\n`, "utf-8");
  const enriched = results.filter((result) => result.enriched).length;
  const errors = results.filter((result) => result.error).length;
  const skipped = results.length - enriched - errors;
  console.log(`summary: enriched=${enriched} skipped=${skipped} errors=${errors}`);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
