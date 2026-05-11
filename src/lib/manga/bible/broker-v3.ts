import type {
  Aspect,
  BibleSnapshotV2,
  BibleSnapshotV3,
  EntityNode,
  FactNode,
  FactPov,
  Layer,
} from "../schemas-v2";
import type { Scene } from "../scene-graph/schema";
import { summarizeCharacterForEpisode } from "./broker";
import { v2ToV3 } from "./v3-adapter";

export type Visibility =
  | "in_world_only"
  | "in_world_plus_revealed_up_to_vol"
  | "author_omniscient";

export type BibleQuery = {
  visibility: Visibility;
  at_volume: number;
  at_episode?: number;
  aspects?: Aspect[];
  entity_ids?: string[];
  include_entities?: boolean;
  pov?: FactPov;
  char_budget?: { min: number; max: number };
  token_budget?: { min: number; max: number };
};

export type BibleQueryResult = {
  facts: FactNode[];
  entities?: EntityNode[];
  truncated: boolean;
  layer_breakdown: Record<Layer, number>;
  warnings: string[];
};

type SummaryTier = "deep" | "medium" | "minimal";
type CostumeSpecLike = BibleSnapshotV2["costumes"][number]["spec"];
type DefaultOutfitSpecLike = NonNullable<BibleSnapshotV2["characters"][number]["spec"]["outfit_default"]>;
type MotifEntryLike = BibleSnapshotV2["visual_motifs"][number];
type RelationshipStateLike = ReturnType<typeof import("./broker").relationshipStateAt>;

const TIER_LIMITS: Record<SummaryTier, { min: number; max: number }> = {
  deep: { min: 800, max: 1500 },
  medium: { min: 400, max: 800 },
  minimal: { min: 150, max: 250 },
};

const LAYERS: Layer[] = [
  "in_world_belief",
  "revealed_at_volume",
  "meta_truth",
  "system_specification",
  "character_arc_state",
];

export function queryBible(bible: BibleSnapshotV3, q: BibleQuery): BibleQueryResult {
  const warnings: string[] = [];
  const entityIds = q.entity_ids ? new Set(q.entity_ids) : null;
  const aspects = q.aspects ? new Set(q.aspects) : null;
  const candidateFacts = bible.facts
    .filter((fact) => visibleAt(fact, q))
    .filter((fact) => (aspects ? aspects.has(fact.aspect) : true))
    .filter((fact) => (entityIds ? fact.entity_id !== null && entityIds.has(fact.entity_id) : true))
    .filter((fact) => activeAtEpisode(fact, q.at_episode))
    .filter((fact) => povMatches(fact, q.pov))
    .sort(compareFacts);

  const budget = q.char_budget ?? tokenBudgetToCharBudget(q.token_budget);
  const { facts, truncated } = applyCharBudget(candidateFacts, budget);
  if (budget && textLength(facts) < budget.min) {
    warnings.push(`char_budget_min_not_reached:${textLength(facts)}/${budget.min}`);
  }
  if (truncated) warnings.push(`char_budget_truncated:${budget?.max ?? 0}`);

  const layer_breakdown = emptyLayerBreakdown();
  for (const fact of facts) {
    layer_breakdown[fact.layer] += 1;
  }

  const result: BibleQueryResult = {
    facts,
    truncated,
    layer_breakdown,
    warnings,
  };
  if (q.include_entities) {
    const returnedEntityIds = new Set(facts.map((fact) => fact.entity_id).filter((id): id is string => id !== null));
    result.entities = bible.entities.filter((entity) =>
      entityIds ? entityIds.has(entity.id) : returnedEntityIds.has(entity.id)
    );
  }
  return result;
}

export function contextForScene(
  bible: BibleSnapshotV3,
  scene: Pick<Scene, "location_id" | "cast" | "mode" | "beat_type" | "key_visual_intent"> & {
    arc_position?: { volume: number; episode?: number };
    time_axis?: Scene["time_axis"] | { era?: string; relative_time?: string };
  },
  visibility: Visibility,
  budget?: { char?: { min: number; max: number }; token?: { min: number; max: number } },
): {
  characters: FactNode[];
  location: FactNode[];
  world_rules: FactNode[];
  motifs: FactNode[];
  props: FactNode[];
  active_costumes: { character_id: string; costume_id: string }[];
  premise_excerpt: string;
} {
  const atVolume = scene.arc_position?.volume ?? 1;
  const atEpisode = scene.arc_position?.episode;
  const charBudget = budget?.char ?? tokenBudgetToCharBudget(budget?.token);
  const castIds = scene.cast.map((entry) => entry.character_id);
  const base = {
    visibility,
    at_volume: atVolume,
    at_episode: atEpisode,
    char_budget: charBudget,
  };

  const characters = queryBible(bible, {
    ...base,
    entity_ids: castIds,
    aspects: ["identity", "appearance", "psychology", "backstory", "relationship", "speech"],
  }).facts;
  const location = scene.location_id
    ? queryBible(bible, {
        ...base,
        entity_ids: [scene.location_id],
        aspects: ["location_layout", "location_history"],
      }).facts
    : [];
  const world_rules = scoreFactsForScene(
    queryBible(bible, { ...base, aspects: ["world_rule", "system_param"] }).facts,
    sceneTokens(bible, scene),
  );
  const motifs = scoreFactsForScene(
    queryBible(bible, { ...base, aspects: ["motif_directive", "motif_meaning"] }).facts,
    sceneTokens(bible, scene),
  );
  const props = queryBible(bible, {
    ...base,
    entity_ids: propEntityIdsForScene(bible, castIds, scene.location_id),
    aspects: ["prop_function", "prop_provenance"],
  }).facts;

  return {
    characters,
    location,
    world_rules,
    motifs,
    props,
    active_costumes: activeCostumesFromV3(bible, castIds, atEpisode ?? 1),
    premise_excerpt: firstFactBody(bible, "world.premise"),
  };
}

export function contextForSceneV2(
  v2: BibleSnapshotV2,
  scene: Parameters<typeof contextForScene>[1],
  visibility: Visibility,
  budget?: Parameters<typeof contextForScene>[3],
): ReturnType<typeof contextForScene> {
  const v3 = v2ToV3(v2);
  return contextForScene(v3, scene, visibility, budget);
}

export function summarizeCharacterForEpisodeV3(
  v3: BibleSnapshotV3,
  episodeNo: number,
  characterId: string,
  options?: { tier?: "deep" | "medium" | "minimal" },
): string {
  const tier = options?.tier ?? "minimal";
  const limits = TIER_LIMITS[tier];
  const character = v3.entities.find((entity) => entity.kind === "character" && entity.id === characterId);
  if (!character) {
    return fitSummary(`Character ${characterId}: bible entry missing. Keep identity conservative.`, limits);
  }

  const volume = volumeForEpisode(v3, episodeNo);
  const visibleFacts = v3.facts
    .filter((fact) => fact.entity_id === characterId)
    .filter((fact) => visibleCharacterFactAtVolume(fact, volume))
    .sort(compareFacts);

  const appearance = factsByAspectText(visibleFacts, "appearance");
  const psychology = factsByAspectText(visibleFacts, "psychology");
  const backstory = factsByAspectText(visibleFacts, "backstory");
  const identity = factsByAspectText(visibleFacts, "identity");
  const speechSamples = visibleFacts
    .filter((fact) => fact.aspect === "speech")
    .slice(0, 3)
    .map((fact) => fact.body);
  const relationships = visibleFacts
    .filter((fact) => fact.aspect === "relationship")
    .slice(0, tier === "minimal" ? 1 : 2)
    .map((fact) => fact.body);
  const role = entityRole(character);
  const psychologyFallback = joinNonEmpty([psychology, backstory, identity], " ") || specIdentity(character);

  if (tier === "minimal") {
    return fitSummary(
      joinNonEmpty(
        [
          `${character.name} (${character.id}, ${role}) ep.${episodeNo}.`,
          `外見: ${firstChars(appearance || identity || specIdentity(character), 78)}`,
          `心理: ${firstChars(psychologyFallback, 78)}`,
        ],
        "\n",
      ),
      limits,
    );
  }

  return fitSummary(
    joinNonEmpty(
      [
        `${character.name} (${character.id}, ${role}) ep.${episodeNo} vol.${volume}.`,
        `外見記号: ${appearance || identity || specIdentity(character)}`,
        `心理/背景: ${psychologyFallback}`,
        speechSamples.length > 0 ? `声: ${speechSamples.join(" / ")}` : null,
        relationships.length > 0 ? `関係: ${relationships.map((body) => firstChars(body, 120)).join(" / ")}` : null,
        identity ? `固定アンカー: ${firstChars(identity, tier === "deep" ? 260 : 180)}` : null,
      ],
      "\n",
    ),
    limits,
  );
}

export function summarizeCharacterForEpisodeV3FromV2(
  v2: BibleSnapshotV2,
  episodeNo: number,
  characterId: string,
  options?: { tier?: "deep" | "medium" | "minimal" },
): string {
  return summarizeCharacterForEpisodeV3(v2ToV3(v2), episodeNo, characterId, options);
}

export function activeCostumeForV3(
  v3: BibleSnapshotV3,
  episodeNo: number,
  characterId: string,
): {
  source: "costume";
  costume_id?: string;
  spec?: CostumeSpecLike;
} | {
  source: "default";
  spec?: DefaultOutfitSpecLike;
} | {
  source: "missing";
} {
  const matchingFacts = v3.facts
    .filter((fact) => fact.aspect === "identity" && fact.entity_id === characterId && fact.episode_range)
    .filter((fact) => {
      const range = fact.episode_range;
      if (!range) return false;
      const until = range.to ?? Number.POSITIVE_INFINITY;
      return range.from <= episodeNo && episodeNo <= until;
    })
    .sort((a, b) => (b.episode_range?.from ?? 0) - (a.episode_range?.from ?? 0) || compareFacts(a, b));

  const costumeFact = matchingFacts[0];
  if (costumeFact) {
    const costume = costumeFromFact(v3, costumeFact);
    return {
      source: "costume",
      costume_id: costume?.id,
      spec: costume?.spec ?? costumeSpecFromFact(costumeFact),
    };
  }

  const defaultSpec = defaultOutfitFor(v3, characterId);
  if (defaultSpec) return { source: "default", spec: defaultSpec };
  return { source: "missing" };
}

export function activeCostumeForV3FromV2(v2: BibleSnapshotV2, episodeNo: number, characterId: string) {
  return activeCostumeForV3(v2ToV3(v2), episodeNo, characterId);
}

export function relationshipStateAtV3(
  v3: BibleSnapshotV3,
  episodeNo: number,
  pair: [string, string],
): RelationshipStateLike {
  const volume = volumeForEpisode(v3, episodeNo);
  const facts = v3.facts
    .filter((fact) => fact.aspect === "relationship")
    .filter((fact) => fact.pov === "specific_character")
    .filter((fact) => pair.includes(fact.pov_character_id ?? ""))
    .filter((fact) => relationshipFactMatchesPair(fact, pair))
    .filter((fact) => visibleRelationshipFactAtVolume(fact, volume))
    .sort(compareFacts);

  if (facts.length === 0) return { found: false };

  const firstRelation = relationObjectFromFact(facts[0]);
  const reversed =
    firstRelation?.from_character_id === pair[1] &&
    firstRelation?.to_character_id === pair[0];

  return {
    found: true,
    description: facts.map((fact) => relationshipDescription(fact)).filter(Boolean).join(" / "),
    bidirectional_a_to_b: firstRelation
      ? reversed
        ? firstRelation.bidirectional_b_to_a
        : firstRelation.bidirectional_a_to_b
      : undefined,
    bidirectional_b_to_a: firstRelation
      ? reversed
        ? firstRelation.bidirectional_a_to_b
        : firstRelation.bidirectional_b_to_a
      : undefined,
    per_volume_delta: firstRelation?.per_volume_delta,
  };
}

export function relationshipStateAtV3FromV2(v2: BibleSnapshotV2, episodeNo: number, pair: [string, string]) {
  return relationshipStateAtV3(v2ToV3(v2), episodeNo, pair);
}

export function relevantWorldRulesV3(
  v3: BibleSnapshotV3,
  scene: Pick<Scene, "location_id" | "beat_type" | "mode">,
  options?: { charBudget?: { min: number; max: number } },
): string[] {
  const worldRuleFacts = v3.facts
    .filter((fact) => fact.entity_id === null && fact.aspect === "world_rule")
    .filter((fact) => fact.layer === "in_world_belief" || fact.layer === "system_specification");
  const query = sceneTokens(v3, { ...scene, key_visual_intent: "" });
  const visible = worldRuleFacts.sort(compareFacts);
  const scored = visible
    .map((fact, index) => ({ fact, index, score: tokenScore(fact.body, query) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const budget = options?.charBudget?.max ?? 800;
  const result: string[] = [];
  let totalChars = 0;

  for (const { fact } of scored) {
    if (result.length > 0 && totalChars + fact.body.length > budget) break;
    if (result.length === 0 && fact.body.length > budget) continue;
    result.push(fact.body);
    totalChars += fact.body.length;
  }

  return result.length > 0 ? result : visible.slice(0, 4).map((fact) => fact.body);
}

export function relevantWorldRulesV3FromV2(
  v2: BibleSnapshotV2,
  scene: Pick<Scene, "location_id" | "beat_type" | "mode">,
  options?: { charBudget?: { min: number; max: number } },
): string[] {
  return relevantWorldRulesV3(v2ToV3(v2), scene, options);
}

export function relevantMotifsV3(
  v3: BibleSnapshotV3,
  scene: Pick<Scene, "beat_type" | "location_id" | "mode" | "key_visual_intent">,
): MotifEntryLike[] {
  const location = v3.entities.find((entity) => entity.kind === "location" && entity.id === scene.location_id);
  const locationSpec = location?.spec as { atmosphere?: string; location_type?: string } | undefined;
  const query = tokens([
    scene.beat_type,
    scene.mode,
    scene.key_visual_intent,
    scene.location_id,
    location?.name,
    locationSpec?.atmosphere,
    locationSpec?.location_type,
  ]);
  const motifs = v3.entities
    .filter((entity) => entity.kind === "motif")
    .map((entity) => motifFromEntity(v3, entity))
    .filter((motif): motif is MotifEntryLike => motif !== null);

  const scored = motifs
    .map((motif, index) => ({ motif, index, score: motifScoreV3(motif, query, scene.mode) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 3)
    .map((item) => item.motif);

  return scored.length > 0 ? scored : motifs.slice(0, 3);
}

export function relevantMotifsV3FromV2(
  v2: BibleSnapshotV2,
  scene: Pick<Scene, "beat_type" | "location_id" | "mode" | "key_visual_intent">,
): MotifEntryLike[] {
  return relevantMotifsV3(v2ToV3(v2), scene);
}

export function summarizeWorldRulesForSceneV3(
  v3: BibleSnapshotV3,
  scene: Pick<Scene, "location_id" | "beat_type" | "mode" | "time_axis">,
  options?: { tier?: "deep" | "medium" | "minimal" },
): string {
  const tier = options?.tier ?? "minimal";
  const rules = relevantWorldRulesV3(v3, scene, { charBudget: { min: 100, max: tier === "minimal" ? 400 : 800 } });
  return rules.length > 0 ? rules.map((rule) => `- ${rule}`).join("\n") : "";
}

export function summarizeWorldRulesForSceneV3FromV2(
  v2: BibleSnapshotV2,
  scene: Pick<Scene, "location_id" | "beat_type" | "mode" | "time_axis">,
  options?: { tier?: "deep" | "medium" | "minimal" },
): string {
  return summarizeWorldRulesForSceneV3(v2ToV3(v2), scene, options);
}

export function summarizeLocationForSceneV3(
  v3: BibleSnapshotV3,
  scene: Pick<Scene, "location_id" | "mode" | "beat_type">,
  options?: { tier?: "deep" | "medium" | "minimal" },
): string {
  const tier = options?.tier ?? "minimal";
  const locationId = scene.location_id ?? "";
  const location = v3.entities.find((entity) => entity.kind === "location" && entity.id === locationId);
  if (!location) return `Location ${locationId}: bible entry missing. Mode=${scene.mode}, beat=${scene.beat_type}.`;

  const spec = location.spec as {
    spec?: {
      atmosphere?: string;
      lighting_default?: string;
      visual_description?: string;
      sensory_textures?: string;
      iconic_objects?: Array<{ name?: string; description?: string }>;
    };
    continuity_anchors?: string[];
  } | undefined;
  const layout = v3.facts
    .filter((fact) => fact.entity_id === locationId && fact.aspect === "location_layout")
    .map((fact) => fact.body)
    .join(" / ");
  const history = v3.facts
    .filter((fact) => fact.entity_id === locationId && fact.aspect === "location_history")
    .map((fact) => fact.body)
    .join(" / ");

  if (tier === "minimal") {
    const atmosphere = joinNonEmpty(
      [spec?.spec?.atmosphere, spec?.spec?.lighting_default, spec?.spec?.visual_description, layout, history],
      " / ",
    ) || "場所の雰囲気は既存 spec に従う。";
    return fitSummary(`${location.name} (${location.id}). 雰囲気: ${firstChars(atmosphere, 150)}`, { min: 120, max: 220 });
  }

  const iconic = (spec?.spec?.iconic_objects ?? [])
    .slice(0, 4)
    .map((item) => joinNonEmpty([item.name, item.description], ": "))
    .filter((item) => item.length > 0)
    .join(" / ");
  const fallback = joinNonEmpty([spec?.spec?.atmosphere, spec?.spec?.lighting_default], " / ");
  return fitSummary(
    joinNonEmpty(
      [
        `${location.name} (${location.id}) scene mode=${scene.mode}, beat=${scene.beat_type}.`,
        spec?.spec?.visual_description || layout || fallback || "場所の視覚説明は未着手。既存 spec から雰囲気と照明を維持する。",
        spec?.spec?.sensory_textures ? `感覚: ${spec.spec.sensory_textures}` : null,
        iconic || layout ? `象徴物: ${joinNonEmpty([iconic, layout], " / ")}` : null,
        history ? `履歴: ${history}` : null,
        spec?.continuity_anchors && spec.continuity_anchors.length > 0 ? `固定: ${spec.continuity_anchors.slice(0, 4).join(" / ")}` : null,
      ],
      "\n",
    ),
    { min: 300, max: 600 },
  );
}

export function summarizeLocationForSceneV3FromV2(
  v2: BibleSnapshotV2,
  scene: Pick<Scene, "location_id" | "mode" | "beat_type">,
  options?: { tier?: "deep" | "medium" | "minimal" },
): string {
  return summarizeLocationForSceneV3(v2ToV3(v2), scene, options);
}

export function summarizeMotifForPanelV3(
  v3: BibleSnapshotV3,
  panel: { panel_no: number },
  scene: Pick<Scene, "beat_type" | "location_id" | "mode" | "key_visual_intent"> & {
    visual_motif_anchors?: Array<{ motif_id?: string; motif_name?: string; intensity?: number }>;
  },
  options?: { tier?: "deep" | "medium" | "minimal" },
): string {
  const tier = options?.tier ?? "minimal";
  const anchored = motifsFromAnchorsV3(v3, scene.visual_motif_anchors);
  const motifs = anchored.length > 0 ? anchored : relevantMotifsV3(v3, { ...scene, key_visual_intent: "" });
  if (tier === "minimal") {
    const motif = motifs[0];
    if (!motif) return `Panel ${panel.panel_no} motif: restrained scene symbolism.`;
    return fitSummary(
      `Panel ${panel.panel_no} motif: ${motif.name}. draw=${firstChars(motif.draw_directive || motif.meaning, 150)}`,
      { min: 100, max: 220 },
    );
  }
  const text = motifs
    .slice(0, 3)
    .map((motif) => `${motif.name}: ${motif.meaning}. draw=${motif.draw_directive}`)
    .join("\n");
  return fitSummary(`Panel ${panel.panel_no} motif directives:\n${text || "No motif selected; keep scene symbolism restrained."}`, {
    min: 200,
    max: 400,
  });
}

export function summarizeMotifForPanelV3FromV2(
  v2: BibleSnapshotV2,
  panel: { panel_no: number },
  scene: Pick<Scene, "beat_type" | "location_id" | "mode" | "key_visual_intent"> & {
    visual_motif_anchors?: Array<{ motif_id?: string; motif_name?: string; intensity?: number }>;
  },
  options?: { tier?: "deep" | "medium" | "minimal" },
): string {
  return summarizeMotifForPanelV3(v2ToV3(v2), panel, scene, options);
}

export function attributeTagsForV3(v3: BibleSnapshotV3, characterId: string): string[] {
  const character = v3.entities.find((entity) => entity.kind === "character" && entity.id === characterId);
  const spec = character?.spec as { attribute_classifier?: Record<string, unknown> } | undefined;
  return Object.entries(spec?.attribute_classifier ?? {})
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0)
    .map(([key, value]) => `${key}:${value.trim()}`);
}

export function attributeTagsForV3FromV2(v2: BibleSnapshotV2, characterId: string): string[] {
  return attributeTagsForV3(v2ToV3(v2), characterId);
}

export function continuityAnchorTextForV3(v3: BibleSnapshotV3, characterId: string): string {
  const character = v3.entities.find((entity) => entity.kind === "character" && entity.id === characterId);
  if (!character) return `continuity: ${characterId}`;
  const anchors = v3.facts
    .filter((fact) => fact.entity_id === characterId && fact.aspect === "identity" && fact.layer === "in_world_belief" && !fact.episode_range)
    .sort(compareFacts)
    .slice(0, 5)
    .map((fact) => fact.body);
  return `${character.name} continuity: ${anchors.join(" / ") || "顔・髪・衣装の同一性を維持"}`;
}

export function continuityAnchorTextForV3FromV2(v2: BibleSnapshotV2, characterId: string): string {
  return continuityAnchorTextForV3(v2ToV3(v2), characterId);
}

export function sceneOverrideTextForV3(
  v3: BibleSnapshotV3,
  scene: Pick<Scene, "mode" | "beat_type">,
): string | null {
  const overrides = v3.style_directives?.scene_overrides ?? {};
  return overrides[scene.mode] ?? overrides[scene.beat_type] ?? null;
}

export function sceneOverrideTextForV3FromV2(
  v2: BibleSnapshotV2,
  scene: Pick<Scene, "mode" | "beat_type">,
): string | null {
  return sceneOverrideTextForV3(v2ToV3(v2), scene);
}

function visibleAt(fact: FactNode, q: BibleQuery): boolean {
  if (q.visibility === "author_omniscient") return true;
  if (q.visibility === "in_world_only") {
    return fact.layer !== "meta_truth" && fact.layer !== "revealed_at_volume";
  }
  if (fact.layer === "meta_truth") return false;
  if (fact.layer !== "revealed_at_volume") return true;
  return (fact.revealed_at_volume ?? Number.POSITIVE_INFINITY) <= q.at_volume;
}

function activeAtEpisode(fact: FactNode, episodeNo: number | undefined): boolean {
  if (episodeNo === undefined || !fact.episode_range) return true;
  const to = fact.episode_range.to ?? Number.POSITIVE_INFINITY;
  return fact.episode_range.from <= episodeNo && episodeNo <= to;
}

function povMatches(fact: FactNode, pov: FactPov | undefined): boolean {
  if (!pov) return true;
  return fact.pov === undefined || fact.pov === pov;
}

function compareFacts(a: FactNode, b: FactNode): number {
  return (a.priority ?? 0) - (b.priority ?? 0) || a.fact_id.localeCompare(b.fact_id);
}

function tokenBudgetToCharBudget(budget: { min: number; max: number } | undefined): { min: number; max: number } | undefined {
  if (!budget) return undefined;
  return { min: budget.min * 4, max: budget.max * 4 };
}

function applyCharBudget(facts: FactNode[], budget: { min: number; max: number } | undefined): { facts: FactNode[]; truncated: boolean } {
  if (!budget) return { facts, truncated: false };
  const out: FactNode[] = [];
  let length = 0;
  for (const fact of facts) {
    const next = length + fact.body.length;
    if (out.length > 0 && next > budget.max) {
      return { facts: out, truncated: true };
    }
    if (next > budget.max) {
      return { facts: [], truncated: true };
    }
    out.push(fact);
    length = next;
  }
  return { facts: out, truncated: false };
}

function textLength(facts: FactNode[]): number {
  return facts.reduce((sum, fact) => sum + fact.body.length, 0);
}

function emptyLayerBreakdown(): Record<Layer, number> {
  return Object.fromEntries(LAYERS.map((layer) => [layer, 0])) as Record<Layer, number>;
}

function sceneTokens(
  bible: BibleSnapshotV3,
  scene: Pick<Scene, "location_id" | "mode" | "beat_type" | "key_visual_intent">,
): Set<string> {
  const location = bible.entities.find((entity) => entity.id === scene.location_id);
  return tokens([scene.location_id, scene.mode, scene.beat_type, scene.key_visual_intent, location?.name]);
}

function scoreFactsForScene(facts: FactNode[], query: Set<string>): FactNode[] {
  return facts
    .map((fact, index) => ({ fact, index, score: tokenScore(fact.body, query) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.fact);
}

function tokenScore(text: string, query: Set<string>): number {
  let score = 0;
  for (const token of tokens([text])) {
    if (query.has(token)) score += 1;
  }
  return score;
}

function propEntityIdsForScene(bible: BibleSnapshotV3, castIds: string[], locationId: string | null | undefined): string[] {
  const cast = new Set(castIds);
  const location = locationId ? bible.entities.find((entity) => entity.id === locationId) : undefined;
  const locationTokens = tokens([locationId, location?.name]);
  return bible.entities
    .filter((entity) => entity.kind === "prop")
    .filter((entity) => {
      const spec = entity.spec as { owner_character_id?: string; name?: string; spec?: unknown } | undefined;
      if (spec?.owner_character_id && cast.has(spec.owner_character_id)) return true;
      return intersects(tokens([entity.name, stringify(spec?.spec)]), locationTokens);
    })
    .map((entity) => entity.id);
}

function activeCostumesFromV3(
  bible: BibleSnapshotV3,
  castIds: string[],
  episodeNo: number,
): { character_id: string; costume_id: string }[] {
  const cast = new Set(castIds);
  return bible.entities
    .filter((entity) => entity.kind === "costume")
    .map((entity) => entity.spec as { id?: string; character_id?: string; valid_from_episode?: number; valid_until_episode?: number | null } | undefined)
    .filter((costume): costume is { id: string; character_id: string; valid_from_episode: number; valid_until_episode?: number | null } =>
      typeof costume?.id === "string" &&
      typeof costume.character_id === "string" &&
      typeof costume.valid_from_episode === "number" &&
      cast.has(costume.character_id)
    )
    .filter((costume) => {
      const until = costume.valid_until_episode ?? Number.POSITIVE_INFINITY;
      return costume.valid_from_episode <= episodeNo && episodeNo <= until;
    })
    .map((costume) => ({ character_id: costume.character_id, costume_id: costume.id }));
}

function costumeFromFact(
  bible: BibleSnapshotV3,
  fact: FactNode,
): { id?: string; spec?: CostumeSpecLike } | null {
  const parsed = parseRecord(fact.body);
  const costumeId = stringField(parsed, "id");
  const entity = costumeId ? bible.entities.find((item) => item.kind === "costume" && item.id === costumeId) : undefined;
  const entitySpec = entity?.spec as { id?: string; spec?: CostumeSpecLike } | undefined;
  const factSpec = recordField(parsed, "spec") as CostumeSpecLike | undefined;
  return {
    id: costumeId ?? entitySpec?.id,
    spec: factSpec ?? entitySpec?.spec,
  };
}

function costumeSpecFromFact(fact: FactNode): CostumeSpecLike | undefined {
  const parsed = parseRecord(fact.body);
  return recordField(parsed, "spec") as CostumeSpecLike | undefined;
}

function defaultOutfitFor(bible: BibleSnapshotV3, characterId: string): DefaultOutfitSpecLike | undefined {
  const character = bible.entities.find((entity) => entity.kind === "character" && entity.id === characterId);
  const spec = character?.spec as { spec?: { outfit_default?: DefaultOutfitSpecLike } } | undefined;
  return spec?.spec?.outfit_default;
}

function visibleRelationshipFactAtVolume(fact: FactNode, volume: number): boolean {
  if (fact.layer === "in_world_belief") return true;
  if (fact.layer === "revealed_at_volume") return (fact.revealed_at_volume ?? Number.POSITIVE_INFINITY) <= volume;
  if (fact.layer === "character_arc_state") return fact.arc_at_volume === volume;
  return false;
}

function relationshipFactMatchesPair(fact: FactNode, pair: [string, string]): boolean {
  const body = parseRecord(fact.body);
  const from = stringField(body, "from_character_id") ?? fact.pov_character_id ?? fact.entity_id;
  const to = stringField(body, "to_character_id") ?? stringField(body, "partner_id");
  if (!from || !pair.includes(from)) return false;
  if (!to) return true;
  return pair.includes(to);
}

function relationObjectFromFact(fact: FactNode): BibleSnapshotV2["relations"][number] | null {
  const body = parseRecord(fact.body);
  if (!body) return null;
  if (!stringField(body, "from_character_id") || !stringField(body, "to_character_id")) return null;
  return body as unknown as BibleSnapshotV2["relations"][number];
}

function relationshipDescription(fact: FactNode): string {
  const body = parseRecord(fact.body);
  return stringField(body, "description") ?? fact.body;
}

function motifFromEntity(bible: BibleSnapshotV3, entity: EntityNode): MotifEntryLike | null {
  const spec = entity.spec as Partial<MotifEntryLike> | undefined;
  const facts = bible.facts.filter((fact) => fact.entity_id === entity.id && (fact.aspect === "motif_directive" || fact.aspect === "motif_meaning"));
  const parsedFacts = facts.map((fact) => parseRecord(fact.body)).filter((value): value is Record<string, unknown> => value !== null);
  const meaning =
    spec?.meaning ??
    stringField(parsedFacts.find((fact) => stringField(fact, "meaning")), "meaning") ??
    facts.find((fact) => fact.aspect === "motif_meaning")?.body ??
    "";
  const drawDirective =
    spec?.draw_directive ??
    stringField(parsedFacts.find((fact) => stringField(fact, "draw_directive")), "draw_directive") ??
    facts.find((fact) => fact.aspect === "motif_directive")?.body ??
    "";
  return {
    name: spec?.name ?? entity.name,
    meaning,
    draw_directive: drawDirective,
    symbolic_lineage: spec?.symbolic_lineage,
    reference_scenes: spec?.reference_scenes,
  };
}

function motifsFromAnchorsV3(
  bible: BibleSnapshotV3,
  anchors: Array<{ motif_id?: string; motif_name?: string; intensity?: number }> | undefined,
): MotifEntryLike[] {
  if (!anchors || anchors.length === 0) return [];
  return anchors
    .map((anchor) => {
      const key = anchor.motif_id ?? anchor.motif_name;
      if (!key) return null;
      const entity = bible.entities.find((item) => item.kind === "motif" && (item.id === key || item.name === key));
      return entity ? motifFromEntity(bible, entity) : null;
    })
    .filter((motif): motif is MotifEntryLike => motif !== null);
}

function motifScoreV3(motif: MotifEntryLike, query: Set<string>, mode: Scene["mode"]): number {
  const motifTokens = tokens([motif.name, motif.meaning, motif.draw_directive, motif.symbolic_lineage, ...(motif.reference_scenes ?? [])]);
  let score = 0;
  for (const token of motifTokens) {
    if (query.has(token)) score += 2;
  }
  if (mode === "silence" && intersects(motifTokens, new Set(["silence", "silent", "sleep", "眠", "睡眠", "沈黙", "無音"]))) {
    score += 5;
  }
  return score;
}

function firstFactBody(bible: BibleSnapshotV3, sourcePath: string): string {
  return bible.facts.find((fact) => fact.evidence.source_path === sourcePath)?.body ?? "";
}

function visibleCharacterFactAtVolume(fact: FactNode, volume: number): boolean {
  if (fact.layer === "in_world_belief") return true;
  if (fact.layer === "revealed_at_volume") {
    return (fact.revealed_at_volume ?? Number.POSITIVE_INFINITY) <= volume;
  }
  if (fact.layer === "character_arc_state") {
    return fact.arc_at_volume === volume;
  }
  return false;
}

function factsByAspectText(facts: FactNode[], aspect: Aspect): string {
  return facts
    .filter((fact) => fact.aspect === aspect)
    .map((fact) => fact.body)
    .join(" / ");
}

function volumeForEpisode(bible: BibleSnapshotV3, episodeNo: number): number {
  const perVolume = Math.max(1, bible.meta.target_episodes_per_volume);
  return Math.max(1, Math.ceil(Math.max(1, episodeNo) / perVolume));
}

function entityRole(entity: EntityNode): string {
  const spec = entity.spec as { role?: unknown } | undefined;
  return typeof spec?.role === "string" && spec.role.trim().length > 0 ? spec.role : "character";
}

function specIdentity(entity: EntityNode): string {
  const spec = entity.spec as { appearance_notes?: unknown; spec?: unknown } | undefined;
  if (typeof spec?.appearance_notes === "string" && spec.appearance_notes.trim().length > 0) {
    return spec.appearance_notes.trim();
  }
  return stringify(entity.spec) || "existing V3 entity spec";
}

function joinNonEmpty(values: Array<string | null | undefined>, separator: string): string {
  return values
    .map((value) => value?.trim())
    .filter((value): value is string => value !== undefined && value.length > 0)
    .join(separator);
}

function firstChars(text: string, max: number): string {
  const normalized = text.replace(/\s+/gu, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 3))}...`;
}

function fitSummary(text: string, limits: { min: number; max: number }): string {
  const normalized = text.replace(/[ \t]+/gu, " ").replace(/\n{3,}/gu, "\n\n").trim();
  if (normalized.length > limits.max) {
    return `${normalized.slice(0, Math.max(0, limits.max - 3)).trimEnd()}...`;
  }
  if (normalized.length >= limits.min) return normalized;

  const padding = " 補足: 未着手の深掘り項目は既存 spec と continuity anchor を優先し、顔・髪・衣装・関係距離の同一性を崩さない。";
  let out = normalized;
  while (out.length < limits.min && out.length + padding.length <= limits.max) {
    out += padding;
  }
  return out;
}

function tokens(values: Array<string | undefined | null>): Set<string> {
  const out = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    for (const token of value.toLowerCase().split(/[^a-z0-9一-龯ぁ-んァ-ヶー]+/u)) {
      const trimmed = token.trim();
      if (trimmed) out.add(trimmed);
    }
  }
  return out;
}

function intersects(a: Set<string>, b: Set<string>): boolean {
  for (const item of a) {
    if (b.has(item)) return true;
  }
  return false;
}

function parseRecord(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function stringField(record: Record<string, unknown> | null | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function recordField(record: Record<string, unknown> | null | undefined, key: string): Record<string, unknown> | undefined {
  const value = record?.[key];
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  return JSON.stringify(value);
}
