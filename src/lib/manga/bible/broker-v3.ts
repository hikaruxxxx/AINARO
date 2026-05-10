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
import {
  activeCostumeFor,
  relationshipStateAt,
  relevantMotifs,
  relevantWorldRules,
  summarizeCharacterForEpisode,
  summarizeWorldRulesForScene,
} from "./broker";
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

export function summarizeCharacterForEpisodeV3(
  v2: BibleSnapshotV2,
  episodeNo: number,
  characterId: string,
  options?: { tier?: "deep" | "medium" | "minimal" },
): string {
  v2ToV3(v2);
  return summarizeCharacterForEpisode(v2, episodeNo, characterId, options);
}

export function activeCostumeForV3(v2: BibleSnapshotV2, episodeNo: number, characterId: string) {
  v2ToV3(v2);
  return activeCostumeFor(v2, episodeNo, characterId);
}

export function relationshipStateAtV3(v2: BibleSnapshotV2, episodeNo: number, pair: [string, string]) {
  v2ToV3(v2);
  return relationshipStateAt(v2, episodeNo, pair);
}

export function relevantWorldRulesV3(
  v2: BibleSnapshotV2,
  scene: Pick<Scene, "location_id" | "beat_type" | "mode">,
): string[] {
  v2ToV3(v2);
  return relevantWorldRules(v2, scene);
}

export function relevantMotifsV3(
  v2: BibleSnapshotV2,
  scene: Pick<Scene, "beat_type" | "location_id" | "mode" | "key_visual_intent">,
) {
  v2ToV3(v2);
  return relevantMotifs(v2, scene);
}

export function summarizeWorldRulesForSceneV3(
  v2: BibleSnapshotV2,
  scene: Pick<Scene, "location_id" | "beat_type" | "mode" | "time_axis">,
  options?: { tier?: "deep" | "medium" | "minimal" },
): string {
  v2ToV3(v2);
  return summarizeWorldRulesForScene(v2, scene, options);
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

function firstFactBody(bible: BibleSnapshotV3, sourcePath: string): string {
  return bible.facts.find((fact) => fact.evidence.source_path === sourcePath)?.body ?? "";
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

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  return JSON.stringify(value);
}
