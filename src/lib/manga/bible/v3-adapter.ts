import { createHash } from "node:crypto";

import type {
  Aspect,
  BibleSnapshotV2,
  BibleSnapshotV3,
  CharacterEntryV2,
  CharacterRelationV2,
  CostumeEntryV2,
  EntityKind,
  EntityNode,
  EntityRelation,
  FactNode,
  FactPov,
  Layer,
  LocationEntryV2,
  PropEntryV2,
  VisualMotifV2,
  WorldFaction,
  WorldSpec,
} from "../schemas-v2";

type JsonishRecord = Record<string, unknown>;

const ADAPTER_GENERATED_AT = new Date(0).toISOString();

export function deriveFactId(args: {
  entity_id: string | null;
  aspect: string;
  layer: string;
  source_path?: string;
  source_span?: [number, number];
  segment_index?: number;
}): string {
  const segment =
    args.segment_index !== undefined ? `|seg${args.segment_index}` : "";
  const seed = [
    args.entity_id ?? "_world",
    args.aspect,
    args.layer,
    args.source_path ?? "",
    args.source_span?.[0] ?? 0,
    `${args.source_span?.[1] ?? 0}${segment}`,
  ].join("|");
  const hash = createHash("sha1").update(seed).digest("hex").slice(0, 12);
  return `fact_${args.entity_id ?? "world"}_${args.aspect}_${args.layer}_${hash}`;
}

export function v2ToV3(v2: BibleSnapshotV2): BibleSnapshotV3 {
  const entities: EntityNode[] = [];
  const relations: EntityRelation[] = [];
  const facts: FactNode[] = [];
  const entityById = new Map<string, EntityNode>();

  const addEntity = (entity: EntityNode): EntityNode => {
    const existing = entityById.get(entity.id);
    if (existing) return existing;
    entities.push(entity);
    entityById.set(entity.id, entity);
    return entity;
  };

  const attachFact = (entityId: string | null, factId: string): void => {
    if (!entityId) return;
    const entity = entityById.get(entityId);
    if (entity && !entity.fact_ids.includes(factId)) {
      entity.fact_ids.push(factId);
    }
  };

  const addFact = (args: {
    entity_id: string | null;
    aspect: Aspect;
    layer: Layer;
    body: unknown;
    source_path: string;
    json_pointer: string;
    priority: number;
    pov?: FactPov;
    pov_character_id?: string | null;
    arc_at_volume?: number;
    revealed_at_volume?: number | null;
    episode_range?: { from: number; to: number | null };
  }): FactNode | null => {
    const body = bodyToText(args.body);
    if (!body) return null;
    const source_span: [number, number] = [0, body.length];
    const fact_id = deriveFactId({
      entity_id: args.entity_id,
      aspect: args.aspect,
      layer: args.layer,
      source_path: args.source_path,
      source_span,
    });
    const fact: FactNode = {
      fact_id,
      entity_id: args.entity_id,
      aspect: args.aspect,
      layer: args.layer,
      body,
      priority: args.priority,
      evidence: {
        source_path: args.source_path,
        json_pointer: args.json_pointer,
        source_span,
        generated_by: {
          stage: "v2-to-v3-adapter",
          model: "deterministic",
          ts: ADAPTER_GENERATED_AT,
        },
        confidence: 1.0,
      },
    };
    if (args.pov) fact.pov = args.pov;
    if (args.pov_character_id !== undefined) {
      fact.pov_character_id = args.pov_character_id;
    }
    if (args.arc_at_volume !== undefined) fact.arc_at_volume = args.arc_at_volume;
    if (args.revealed_at_volume !== undefined) {
      fact.revealed_at_volume = args.revealed_at_volume;
    }
    if (args.episode_range) fact.episode_range = args.episode_range;
    facts.push(fact);
    attachFact(args.entity_id, fact.fact_id);
    return fact;
  };

  addEntity({
    id: "world_v2",
    kind: "rule",
    name: "World V2 Spec",
    spec: v2.world,
    fact_ids: [],
    appears_in_volumes: [],
  });

  let priority = 0;
  addFact({
    entity_id: null,
    aspect: "world_rule",
    layer: "in_world_belief",
    body: v2.world.premise,
    source_path: "world.premise",
    json_pointer: "/world/premise",
    priority: priority++,
  });
  v2.world.rules.forEach((rule, i) =>
    addFact({
      entity_id: null,
      aspect: "world_rule",
      layer: "in_world_belief",
      body: rule,
      source_path: `world.rules[${i}]`,
      json_pointer: `/world/rules/${i}`,
      priority: priority++,
    })
  );
  addFact({
    entity_id: null,
    aspect: "system_param",
    layer: "system_specification",
    body: v2.world.system,
    source_path: "world.system",
    json_pointer: "/world/system",
    priority: priority++,
  });
  addFact({
    entity_id: null,
    aspect: "history_event",
    layer: "in_world_belief",
    body: v2.world.timeline,
    source_path: "world.timeline",
    json_pointer: "/world/timeline",
    priority: priority++,
  });
  v2.world.history?.timeline?.forEach((event, i) => {
    const id = `event_${shortHash(`history:${i}:${event.year_or_era}:${event.event}`)}`;
    addEntity({
      id,
      kind: "event",
      name: event.event,
      spec: event,
      fact_ids: [],
      appears_in_volumes: [],
    });
    addFact({
      entity_id: null,
      aspect: "history_event",
      layer: "in_world_belief",
      body: event,
      source_path: `world.history.timeline[${i}]`,
      json_pointer: `/world/history/timeline/${i}`,
      priority: priority++,
    });
  });
  addObjectOrScalarFacts({
    value: unknownWorld(v2.world).power_system_logic,
    sourcePath: "world.power_system_logic",
    pointer: "/world/power_system_logic",
    aspect: "world_rule",
    layer: "system_specification",
    addFact,
    nextPriority: () => priority++,
  });
  addFact({
    entity_id: null,
    aspect: "world_rule",
    layer: "meta_truth",
    body: v2.world.cosmology,
    source_path: "world.cosmology",
    json_pointer: "/world/cosmology",
    priority: priority++,
  });
  addFact({
    entity_id: null,
    aspect: "world_rule",
    layer: "in_world_belief",
    body: v2.world.economic_system,
    source_path: "world.economic_system",
    json_pointer: "/world/economic_system",
    priority: priority++,
  });
  addFact({
    entity_id: null,
    aspect: "faction_dynamics",
    layer: "in_world_belief",
    body: v2.world.social_strata,
    source_path: "world.social_strata",
    json_pointer: "/world/social_strata",
    priority: priority++,
  });
  addFact({
    entity_id: null,
    aspect: "faction_dynamics",
    layer: "in_world_belief",
    body: v2.world.daily_life_textures,
    source_path: "world.daily_life_textures",
    json_pointer: "/world/daily_life_textures",
    priority: priority++,
  });
  addFact({
    entity_id: null,
    aspect: "speech",
    layer: "in_world_belief",
    body: v2.world.language_and_naming,
    source_path: "world.language_and_naming",
    json_pointer: "/world/language_and_naming",
    priority: priority++,
  });
  if (Array.isArray(v2.world.forbidden_lore)) {
    v2.world.forbidden_lore.forEach((lore, i) =>
      addFact({
        entity_id: null,
        aspect: "world_rule",
        layer: "meta_truth",
        body: lore,
        source_path: `world.forbidden_lore[${i}]`,
        json_pointer: `/world/forbidden_lore/${i}`,
        priority: priority++,
        revealed_at_volume: lore.revealed_in_volume ?? null,
      })
    );
  } else {
    addObjectOrScalarFacts({
      value: unknownWorld(v2.world).forbidden_lore,
      sourcePath: "world.forbidden_lore",
      pointer: "/world/forbidden_lore",
      aspect: "world_rule",
      layer: "meta_truth",
      addFact,
      nextPriority: () => priority++,
    });
  }
  v2.world.factions.forEach((faction, i) => {
    const id = `faction_${shortHash(`${faction.name}:${i}`)}`;
    addEntity({
      id,
      kind: "faction",
      name: faction.name,
      spec: faction,
      fact_ids: [],
      appears_in_volumes: [],
    });
    addFact({
      entity_id: id,
      aspect: "faction_dynamics",
      layer: "in_world_belief",
      body: faction,
      source_path: `world.factions[${i}]`,
      json_pointer: `/world/factions/${i}`,
      priority: priority++,
    });
  });

  v2.characters.forEach((character, i) => {
    addEntity({
      id: character.id,
      kind: "character",
      name: character.name,
      spec: character,
      fact_ids: [],
      appears_in_volumes: character.appears_in_volumes ?? [],
    });
    addCharacterFacts(character, i, addFact, () => priority++);
  });

  v2.locations.forEach((location, i) => {
    addEntity({
      id: location.id,
      kind: "location",
      name: location.name,
      spec: location,
      fact_ids: [],
      appears_in_volumes: [],
      appears_in_episodes: location.appears_in_episodes ?? [],
    });
    const spec = location.spec as JsonishRecord;
    addFact({
      entity_id: location.id,
      aspect: "location_history",
      layer: "in_world_belief",
      body: spec.who_typically_inhabits,
      source_path: `locations[${i}].spec.who_typically_inhabits`,
      json_pointer: `/locations/${i}/spec/who_typically_inhabits`,
      priority: priority++,
    });
    const iconicObjects = Array.isArray(spec.iconic_objects)
      ? spec.iconic_objects
      : [];
    iconicObjects.forEach((object, j) =>
      addFact({
        entity_id: location.id,
        aspect: "location_layout",
        layer: "in_world_belief",
        body: object,
        source_path: `locations[${i}].spec.iconic_objects[${j}]`,
        json_pointer: `/locations/${i}/spec/iconic_objects/${j}`,
        priority: priority++,
      })
    );
  });

  v2.props.forEach((prop, i) => {
    addEntity({
      id: prop.id,
      kind: "prop",
      name: prop.name,
      spec: prop,
      fact_ids: [],
      appears_in_volumes: [],
    });
    addFact({
      entity_id: prop.id,
      aspect: "prop_function",
      layer: "in_world_belief",
      body: prop,
      source_path: `props[${i}]`,
      json_pointer: `/props/${i}`,
      priority: priority++,
    });
  });

  v2.costumes.forEach((costume, i) => {
    addEntity({
      id: costume.id,
      kind: "costume",
      name: costume.id,
      spec: costume,
      fact_ids: [],
      appears_in_volumes: [],
      appears_in_episodes: [
        costume.valid_from_episode,
        ...(costume.valid_until_episode === null
          ? []
          : [costume.valid_until_episode]),
      ],
    });
    addFact({
      entity_id: costume.character_id,
      aspect: "identity",
      layer: "in_world_belief",
      body: costume,
      source_path: `costumes[${i}]`,
      json_pointer: `/costumes/${i}`,
      priority: priority++,
      episode_range: {
        from: costume.valid_from_episode,
        to: costume.valid_until_episode,
      },
    });
  });

  v2.visual_motifs.forEach((motif, i) => {
    const id = `motif_${shortHash(`${motif.name}:${i}`)}`;
    addEntity({
      id,
      kind: "motif",
      name: motif.name,
      spec: motif,
      fact_ids: [],
      appears_in_volumes: [],
    });
    addFact({
      entity_id: id,
      aspect: "motif_directive",
      layer: "in_world_belief",
      body: motif,
      source_path: `visual_motifs[${i}]`,
      json_pointer: `/visual_motifs/${i}`,
      priority: priority++,
    });
  });

  v2.relations.forEach((relation, i) => {
    const fact = addFact({
      entity_id: relation.from_character_id,
      aspect: "relationship",
      layer: "in_world_belief",
      body: relation,
      source_path: `relations[${i}]`,
      json_pointer: `/relations/${i}`,
      priority: priority++,
      pov: "specific_character",
      pov_character_id: relation.from_character_id,
    });
    relations.push({
      rel_id: `rel_${shortHash(`${relation.from_character_id}:${relation.to_character_id}:${relation.relation_type}:${i}`)}`,
      from_id: relation.from_character_id,
      to_id: relation.to_character_id,
      rel_type: relationTypeToV3(relation.relation_type),
      fact_ids: fact ? [fact.fact_id] : [],
      spec: relation,
    });
  });

  return {
    schema_version: 3,
    meta: v2.meta,
    generated_from: v2.generated_from,
    narration_style_guide: v2.narration_style_guide,
    nav_full_spec: v2.nav_full_spec,
    style_directives: v2.style_directives,
    world_lexicon: v2.world.lexicon,
    entities,
    relations,
    facts,
    volumes: {
      1: {
        volume_no: 1,
        theme: v2.volume_synopsis.theme,
        summary: v2.volume_synopsis.summary,
        cliffhanger: v2.volume_synopsis.cliffhanger ?? "",
        reveals_fact_ids: [],
        invalidates_fact_ids: [],
      },
    },
    continuity_seeds: v2.continuity_seeds.filter((seed) =>
      seed.target_id ? entityById.has(seed.target_id) : true
    ),
    generated_at: v2.generated_at,
  };
}

export function v3ToV2(v3: BibleSnapshotV3): BibleSnapshotV2 {
  const worldFromSpec = v3.entities.find((entity) => entity.id === "world_v2")
    ?.spec as WorldSpec | undefined;
  const world = worldFromSpec ?? worldFromFacts(v3);

  return {
    schema_version: 2,
    generated_at: v3.generated_at,
    generated_from:
      v3.generated_from ?? { source_type: "v3_adapter", source_path: "" },
    meta: v3.meta,
    world,
    characters: specsByKind<CharacterEntryV2>(v3, "character"),
    locations: specsByKind<LocationEntryV2>(v3, "location"),
    props: specsByKind<PropEntryV2>(v3, "prop"),
    costumes: specsByKind<CostumeEntryV2>(v3, "costume"),
    relations: v3.relations
      .map((relation) => relation.spec)
      .filter(isRecord)
      .map((relation) => relation as CharacterRelationV2),
    style_directives: v3.style_directives,
    visual_motifs: specsByKind<VisualMotifV2>(v3, "motif"),
    continuity_seeds: v3.continuity_seeds,
    narration_style_guide: v3.narration_style_guide,
    nav_full_spec: v3.nav_full_spec,
    volume_synopsis: {
      theme: v3.volumes[1]?.theme ?? "",
      summary: v3.volumes[1]?.summary ?? "",
      cliffhanger: v3.volumes[1]?.cliffhanger,
    },
  };
}

function addCharacterFacts(
  character: CharacterEntryV2,
  index: number,
  addFact: (args: {
    entity_id: string | null;
    aspect: Aspect;
    layer: Layer;
    body: unknown;
    source_path: string;
    json_pointer: string;
    priority: number;
    pov?: FactPov;
    pov_character_id?: string | null;
    arc_at_volume?: number;
  }) => FactNode | null,
  nextPriority: () => number
): void {
  const base = `characters[${index}]`;
  const ptr = `/characters/${index}`;
  const charId = character.id;
  addFact({
    entity_id: charId,
    aspect: "appearance",
    layer: "in_world_belief",
    body: character.appearance_notes,
    source_path: `${base}.appearance_notes`,
    json_pointer: `${ptr}/appearance_notes`,
    priority: nextPriority(),
  });
  addFact({
    entity_id: charId,
    aspect: "backstory",
    layer: "in_world_belief",
    body: character.backstory,
    source_path: `${base}.backstory`,
    json_pointer: `${ptr}/backstory`,
    priority: nextPriority(),
  });
  addFact({
    entity_id: charId,
    aspect: "psychology",
    layer: "meta_truth",
    body: character.psychology_deep,
    source_path: `${base}.psychology_deep`,
    json_pointer: `${ptr}/psychology_deep`,
    priority: nextPriority(),
  });
  addFact({
    entity_id: charId,
    aspect: "psychology",
    layer: "in_world_belief",
    body: character.defense_mechanisms,
    source_path: `${base}.defense_mechanisms`,
    json_pointer: `${ptr}/defense_mechanisms`,
    priority: nextPriority(),
  });
  addFact({
    entity_id: charId,
    aspect: "psychology",
    layer: "in_world_belief",
    body: character.worldview_filter,
    source_path: `${base}.worldview_filter`,
    json_pointer: `${ptr}/worldview_filter`,
    priority: nextPriority(),
  });
  addFact({
    entity_id: charId,
    aspect: "backstory",
    layer: "in_world_belief",
    body: character.typical_day_in_life,
    source_path: `${base}.typical_day_in_life`,
    json_pointer: `${ptr}/typical_day_in_life`,
    priority: nextPriority(),
  });
  character.voice_samples?.forEach((sample, i) =>
    addFact({
      entity_id: charId,
      aspect: "speech",
      layer: "in_world_belief",
      body: sample,
      source_path: `${base}.voice_samples[${i}]`,
      json_pointer: `${ptr}/voice_samples/${i}`,
      priority: nextPriority(),
    })
  );
  character.relationship_per_partner?.forEach((partner, i) =>
    addFact({
      entity_id: charId,
      aspect: "relationship",
      layer: "in_world_belief",
      body: partner,
      source_path: `${base}.relationship_per_partner[${i}]`,
      json_pointer: `${ptr}/relationship_per_partner/${i}`,
      priority: nextPriority(),
      pov: "specific_character",
      pov_character_id: charId,
    })
  );
  character.growth_per_volume?.forEach((growth, i) =>
    addFact({
      entity_id: charId,
      aspect: "psychology",
      layer: "character_arc_state",
      body: growth.description,
      source_path: `${base}.growth_per_volume[${i}]`,
      json_pointer: `${ptr}/growth_per_volume/${i}`,
      priority: nextPriority(),
      arc_at_volume: growth.volume,
    })
  );
  character.childhood_episodes?.forEach((episode, i) =>
    addFact({
      entity_id: charId,
      aspect: "backstory",
      layer: "in_world_belief",
      body: episode,
      source_path: `${base}.childhood_episodes[${i}]`,
      json_pointer: `${ptr}/childhood_episodes/${i}`,
      priority: nextPriority(),
    })
  );
  character.continuity_anchors.forEach((anchor, i) =>
    addFact({
      entity_id: charId,
      aspect: "identity",
      layer: "in_world_belief",
      body: anchor,
      source_path: `${base}.continuity_anchors[${i}]`,
      json_pointer: `${ptr}/continuity_anchors/${i}`,
      priority: nextPriority(),
    })
  );
  if (character.role === "antagonist") {
    addFact({
      entity_id: charId,
      aspect: "psychology",
      layer: "meta_truth",
      body: character.origin_wound_deep,
      source_path: `${base}.origin_wound_deep`,
      json_pointer: `${ptr}/origin_wound_deep`,
      priority: nextPriority(),
    });
    addFact({
      entity_id: charId,
      aspect: "psychology",
      layer: "meta_truth",
      body: character.ideology_argument,
      source_path: `${base}.ideology_argument`,
      json_pointer: `${ptr}/ideology_argument`,
      priority: nextPriority(),
    });
    addFact({
      entity_id: charId,
      aspect: "psychology",
      layer: "meta_truth",
      body: character.dark_mirror_to_protagonist,
      source_path: `${base}.dark_mirror_to_protagonist`,
      json_pointer: `${ptr}/dark_mirror_to_protagonist`,
      priority: nextPriority(),
    });
  }
}

function addObjectOrScalarFacts(args: {
  value: unknown;
  sourcePath: string;
  pointer: string;
  aspect: Aspect;
  layer: Layer;
  addFact: (fact: {
    entity_id: string | null;
    aspect: Aspect;
    layer: Layer;
    body: unknown;
    source_path: string;
    json_pointer: string;
    priority: number;
  }) => FactNode | null;
  nextPriority: () => number;
}): void {
  if (isRecord(args.value)) {
    const value = args.value;
    Object.keys(value)
      .sort()
      .forEach((key) =>
        args.addFact({
          entity_id: null,
          aspect: args.aspect,
          layer: args.layer,
          body: value[key],
          source_path: `${args.sourcePath}.${key}`,
          json_pointer: `${args.pointer}/${escapeJsonPointer(key)}`,
          priority: args.nextPriority(),
        })
      );
    return;
  }
  args.addFact({
    entity_id: null,
    aspect: args.aspect,
    layer: args.layer,
    body: args.value,
    source_path: args.sourcePath,
    json_pointer: args.pointer,
    priority: args.nextPriority(),
  });
}

function specsByKind<T>(v3: BibleSnapshotV3, kind: EntityKind): T[] {
  return v3.entities
    .filter((entity) => entity.kind === kind)
    .map((entity) => entity.spec)
    .filter(isRecord)
    .map((spec) => spec as T);
}

function worldFromFacts(v3: BibleSnapshotV3): WorldSpec {
  const sortedFacts = [...v3.facts].sort(
    (a, b) => (a.priority ?? 0) - (b.priority ?? 0) || a.fact_id.localeCompare(b.fact_id)
  );
  const worldRuleFacts = sortedFacts.filter(
    (fact) => fact.entity_id === null && fact.aspect === "world_rule"
  );
  const historyFacts = sortedFacts.filter(
    (fact) => fact.entity_id === null && fact.aspect === "history_event"
  );
  const systemFact = sortedFacts.find(
    (fact) => fact.entity_id === null && fact.aspect === "system_param"
  );
  return {
    premise:
      worldRuleFacts.find((fact) => fact.layer === "in_world_belief")?.body ??
      "",
    rules: worldRuleFacts.map((fact) => fact.body),
    system: systemFact?.body ?? "",
    timeline: historyFacts[0]?.body ?? "",
    factions: specsByKind<WorldFaction>(v3, "faction"),
    history: {
      timeline: v3.entities
        .filter((entity) => entity.kind === "event")
        .map((entity) => entity.spec)
        .filter(isRecord)
        .map((event) => event as { year_or_era: string; event: string; impact?: string }),
    },
    lexicon: v3.world_lexicon,
  };
}

function relationTypeToV3(value: string): EntityRelation["rel_type"] {
  if (value === "owns") return "owns";
  if (value === "lives_in") return "lives_in";
  if (value === "member_of") return "member_of";
  if (value === "knows_about") return "knows_about";
  if (value === "child_of") return "child_of";
  if (value === "rivals_with" || value === "rival") return "rivals_with";
  return "interpersonal";
}

function bodyToText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value === undefined || value === null) return "";
  return stableStringify(value);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "";
}

function shortHash(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 12);
}

function isRecord(value: unknown): value is JsonishRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unknownWorld(world: WorldSpec): JsonishRecord {
  return world as unknown as JsonishRecord;
}

function escapeJsonPointer(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}
