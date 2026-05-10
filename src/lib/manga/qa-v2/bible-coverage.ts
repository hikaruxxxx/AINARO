import type { BibleSnapshotV2, EpisodeStoryboardV2 } from "../schemas-v2";
import type { SceneGraphV1 } from "../scene-graph/schema";

type CoverageBucket = {
  total: number;
  referenced: number;
};

export type BibleCoverageReport = {
  schema_version: 1;
  episode_id: string;
  bible_fields_referenced: {
    characters: CoverageBucket;
    locations: CoverageBucket;
    props: CoverageBucket;
    costumes: CoverageBucket;
    visual_motifs: CoverageBucket;
    relations: CoverageBucket;
  };
  motif_panel_density: number;
  voice_bible_reflection_rate: number;
  unused_bible_fields: string[];
  total_score: number;
  recommendations: string[];
};

type MotifWithOptionalId = BibleSnapshotV2["visual_motifs"][number] & { id?: string };

type CoverageKey =
  | "characters"
  | "locations"
  | "props"
  | "costumes"
  | "visual_motifs"
  | "relations";

const COVERAGE_KEYS: CoverageKey[] = [
  "characters",
  "locations",
  "props",
  "costumes",
  "visual_motifs",
  "relations",
];

export function computeBibleCoverage(args: {
  bible: BibleSnapshotV2;
  sceneGraph?: SceneGraphV1;
  storyboard?: EpisodeStoryboardV2;
  episodeId: string;
}): BibleCoverageReport {
  const { bible, sceneGraph, storyboard, episodeId } = args;
  const totals = buildTotals(bible);
  const referenced = {
    characters: new Set<string>(),
    locations: new Set<string>(),
    props: new Set<string>(),
    costumes: new Set<string>(),
    visual_motifs: new Set<string>(),
    relations: new Set<string>(),
  };

  let motifAnchorCount = 0;

  for (const scene of sceneGraph?.scenes ?? []) {
    referenced.locations.add(scene.location_id);
    for (const locationId of scene.sub_locations ?? []) referenced.locations.add(locationId);
    for (const cast of scene.cast) referenced.characters.add(cast.character_id);
    for (const ws of scene.wardrobe_state ?? []) {
      referenced.characters.add(ws.character_id);
      referenced.costumes.add(ws.costume_id);
    }
    for (const anchor of scene.visual_motif_anchors ?? []) {
      referenced.visual_motifs.add(anchor.motif_id);
      motifAnchorCount += 1;
    }
    for (const prop of scene.props_in_play ?? []) {
      referenced.props.add(prop.prop_id);
      if (prop.held_by) referenced.characters.add(prop.held_by);
    }
    for (const delta of scene.relationship_state_delta) {
      const [forward, backward] = relationKeysForPair(delta.pair[0], delta.pair[1]);
      referenced.relations.add(forward);
      referenced.relations.add(backward);
    }
  }

  const panels = storyboard?.pages.flatMap((page) => page.panels) ?? [];
  for (const panel of panels) {
    referenced.locations.add(panel.entities.location_id);
    for (const character of panel.entities.characters) referenced.characters.add(character.character_id);
    for (const prop of panel.entities.props) {
      referenced.props.add(prop.prop_id);
      if (prop.held_by_character_id) referenced.characters.add(prop.held_by_character_id);
    }
    for (const line of panel.dialogue) referenced.characters.add(line.character_id);
    for (const line of panel.monologue) referenced.characters.add(line.character_id);
  }

  const fields = {
    characters: bucket(totals.characters, referenced.characters),
    locations: bucket(totals.locations, referenced.locations),
    props: bucket(totals.props, referenced.props),
    costumes: bucket(totals.costumes, referenced.costumes),
    visual_motifs: bucket(totals.visual_motifs, referenced.visual_motifs),
    relations: bucket(totals.relations, referenced.relations),
  };

  const ratios = COVERAGE_KEYS.map((key) => ratio(fields[key]));
  const totalScore = round2((ratios.reduce((sum, value) => sum + value, 0) / COVERAGE_KEYS.length) * 100);

  return {
    schema_version: 1,
    episode_id: episodeId,
    bible_fields_referenced: fields,
    motif_panel_density: panels.length > 0 ? round2(motifAnchorCount / panels.length) : 0,
    voice_bible_reflection_rate: computeVoiceReflectionRate(bible, panels),
    unused_bible_fields: collectUnusedFields(bible, referenced),
    total_score: totalScore,
    recommendations: buildRecommendations(fields),
  };
}

function buildTotals(bible: BibleSnapshotV2): Record<CoverageKey, Set<string>> {
  return {
    characters: new Set(bible.characters.map((character) => character.id)),
    locations: new Set(bible.locations.map((location) => location.id)),
    props: new Set(bible.props.map((prop) => prop.id)),
    costumes: new Set(bible.costumes.map((costume) => costume.id)),
    visual_motifs: new Set(bible.visual_motifs.map((motif) => motifKey(motif))),
    relations: new Set(bible.relations.map((relation) => relationKey(relation.from_character_id, relation.to_character_id))),
  };
}

function bucket(totalIds: Set<string>, referencedIds: Set<string>): CoverageBucket {
  let referenced = 0;
  for (const id of totalIds) {
    if (referencedIds.has(id)) referenced += 1;
  }
  return { total: totalIds.size, referenced };
}

function ratio(bucketValue: CoverageBucket): number {
  if (bucketValue.total === 0) return 0;
  return bucketValue.referenced / bucketValue.total;
}

function motifKey(motif: BibleSnapshotV2["visual_motifs"][number]): string {
  const withId: MotifWithOptionalId = motif;
  return withId.id ?? motif.name;
}

function relationKey(a: string, b: string): string {
  return `${a}->${b}`;
}

function relationKeysForPair(a: string, b: string): [string, string] {
  return [relationKey(a, b), relationKey(b, a)];
}

function computeVoiceReflectionRate(
  bible: BibleSnapshotV2,
  panels: EpisodeStoryboardV2["pages"][number]["panels"]
): number {
  // voice_samples は schema 上 Array<{ line: string; ... }> だが、Codex CLI が
  // Array<string> や { line }/{ text }/{ utterance } 等の表記揺れで返すことが
  // あるため defensive に複数フィールドから抽出する。
  const voiceLines = bible.characters.flatMap((character) =>
    (character.voice_samples ?? []).map((sample) => {
      if (typeof sample === "string") return sample.trim();
      const candidate =
        (sample as { line?: string; text?: string; utterance?: string }).line ??
        (sample as { line?: string; text?: string; utterance?: string }).text ??
        (sample as { line?: string; text?: string; utterance?: string }).utterance ??
        "";
      return typeof candidate === "string" ? candidate.trim() : "";
    }).filter((line) => line.length > 0)
  );
  if (voiceLines.length === 0) return 0;

  const storyboardDialogue = panels.flatMap((panel) => panel.dialogue.map((line) => line.text));
  const matched = voiceLines.filter((sample) => storyboardDialogue.some((text) => text.includes(sample))).length;
  return round2(matched / voiceLines.length);
}

function collectUnusedFields(
  bible: BibleSnapshotV2,
  referenced: Record<CoverageKey, Set<string>>
): string[] {
  const unused: string[] = [];
  bible.characters.forEach((character, index) => {
    if (!referenced.characters.has(character.id)) unused.push(`characters[${index}].id`);
  });
  bible.locations.forEach((location, index) => {
    if (!referenced.locations.has(location.id)) unused.push(`locations[${index}].id`);
  });
  bible.props.forEach((prop, index) => {
    if (!referenced.props.has(prop.id)) unused.push(`props[${index}].id`);
  });
  bible.costumes.forEach((costume, index) => {
    if (!referenced.costumes.has(costume.id)) unused.push(`costumes[${index}].id`);
  });
  bible.visual_motifs.forEach((motif, index) => {
    if (!referenced.visual_motifs.has(motifKey(motif))) unused.push(`visual_motifs[${index}].${"id" in motif ? "id" : "name"}`);
  });
  bible.relations.forEach((relation, index) => {
    const [forward, backward] = relationKeysForPair(relation.from_character_id, relation.to_character_id);
    if (!referenced.relations.has(forward) && !referenced.relations.has(backward)) unused.push(`relations[${index}]`);
  });
  return unused;
}

function buildRecommendations(fields: BibleCoverageReport["bible_fields_referenced"]): string[] {
  const labels: Record<CoverageKey, string> = {
    characters: "Phase 4 で scene.cast / panel.entities.characters を充填",
    locations: "Phase 4 で scene.location_id / panel.entities.location_id を充填",
    props: "Phase 4 で props_in_play / panel.entities.props を充填",
    costumes: "Phase 4 で wardrobe_state を充填",
    visual_motifs: "Phase 4 で visual_motif_anchors を 1-3 個指定",
    relations: "Phase 4 で relationship_state_delta を bible.relations に接続",
  };
  return COVERAGE_KEYS.filter((key) => ratio(fields[key]) < 0.5).map((key) => labels[key]);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
