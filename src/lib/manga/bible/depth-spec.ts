import type { BibleSnapshotV2 } from "../schemas-v2";

export type DepthRule = {
  /** 計測対象の path (dynamic getter で解釈) */
  path: string;
  /** ラベル (lint message 用) */
  label: string;
  /** path がアクセスする bible 上のスコープ (LintFinding.scope に対応) */
  scope: "character" | "location" | "prop" | "costume" | "relation" | "motif" | "world" | "global";
  /** 何を計測するか */
  metric:
    | { kind: "min_chars"; min: number; ideal: number }
    | { kind: "min_count"; min: number; min_chars_each?: number; ideal?: number }
    | { kind: "min_count_only"; min: number };
  /** 主役・脇役・敵の区別 (character のみ、role による min/ideal の切替に使う) */
  applies_to_role?: "protagonist" | "supporting" | "antagonist";
};

export type DepthSpec = {
  schema_version: 1;
  /** ルール一覧 */
  rules: DepthRule[];
  /** 全体目安 (a07 想定 300,000-800,000 字) */
  bible_total_target: { min_chars: number; ideal_chars: number };
};

export const BIBLE_DEPTH_SPEC: DepthSpec = {
  schema_version: 1,
  rules: [
    { path: "characters[role=protagonist].backstory", label: "characters.protagonist.backstory", scope: "character", applies_to_role: "protagonist", metric: { kind: "min_chars", min: 3000, ideal: 8000 } },
    { path: "characters[role=protagonist].childhood_episodes", label: "characters.protagonist.childhood_episodes", scope: "character", applies_to_role: "protagonist", metric: { kind: "min_count", min: 5, min_chars_each: 400 } },
    { path: "characters[role=protagonist].appearance_notes", label: "characters.protagonist.appearance_notes", scope: "character", applies_to_role: "protagonist", metric: { kind: "min_chars", min: 1500, ideal: 4000 } },
    { path: "characters[role=protagonist].psychology_deep", label: "characters.protagonist.psychology_deep", scope: "character", applies_to_role: "protagonist", metric: { kind: "min_chars", min: 2000, ideal: 6000 } },
    { path: "characters[role=protagonist].defense_mechanisms", label: "characters.protagonist.defense_mechanisms", scope: "character", applies_to_role: "protagonist", metric: { kind: "min_chars", min: 800, ideal: 2500 } },
    { path: "characters[role=protagonist].worldview_filter", label: "characters.protagonist.worldview_filter", scope: "character", applies_to_role: "protagonist", metric: { kind: "min_chars", min: 800, ideal: 2500 } },
    { path: "characters[role=protagonist].voice_samples", label: "characters.protagonist.voice_samples", scope: "character", applies_to_role: "protagonist", metric: { kind: "min_count", min: 30, ideal: 100 } },
    { path: "characters[role=protagonist].typical_day_in_life", label: "characters.protagonist.typical_day_in_life", scope: "character", applies_to_role: "protagonist", metric: { kind: "min_chars", min: 1500, ideal: 4000 } },
    { path: "characters[role=protagonist].relationship_per_partner", label: "characters.protagonist.relationship_per_partner", scope: "character", applies_to_role: "protagonist", metric: { kind: "min_chars", min: 800, ideal: 2500 } },
    { path: "characters[role=protagonist].growth_per_volume", label: "characters.protagonist.growth_per_volume", scope: "character", applies_to_role: "protagonist", metric: { kind: "min_chars", min: 1500, ideal: 4000 } },

    { path: "characters[role=supporting].backstory", label: "characters.supporting.backstory", scope: "character", applies_to_role: "supporting", metric: { kind: "min_chars", min: 1000, ideal: 3000 } },
    { path: "characters[role=supporting].voice_samples", label: "characters.supporting.voice_samples", scope: "character", applies_to_role: "supporting", metric: { kind: "min_count", min: 10, ideal: 30 } },

    { path: "characters[role=antagonist].origin_wound_deep", label: "characters.antagonist.origin_wound_deep", scope: "character", applies_to_role: "antagonist", metric: { kind: "min_chars", min: 2000, ideal: 6000 } },
    { path: "characters[role=antagonist].ideology_argument", label: "characters.antagonist.ideology_argument", scope: "character", applies_to_role: "antagonist", metric: { kind: "min_chars", min: 2000, ideal: 5000 } },
    { path: "characters[role=antagonist].dark_mirror_to_protagonist", label: "characters.antagonist.dark_mirror_to_protagonist", scope: "character", applies_to_role: "antagonist", metric: { kind: "min_chars", min: 1500, ideal: 4000 } },

    { path: "locations[*].spec.visual_description", label: "locations.main.visual_description", scope: "location", metric: { kind: "min_chars", min: 1500, ideal: 4000 } },
    { path: "locations[*].spec.history", label: "locations.main.history", scope: "location", metric: { kind: "min_chars", min: 800, ideal: 2500 } },
    { path: "locations[*].spec.socioeconomic_context", label: "locations.main.socioeconomic_context", scope: "location", metric: { kind: "min_chars", min: 600, ideal: 2000 } },
    { path: "locations[*].spec.sensory_textures", label: "locations.main.sensory_textures", scope: "location", metric: { kind: "min_chars", min: 800, ideal: 2500 } },
    { path: "locations[*].spec.who_typically_inhabits", label: "locations.main.who_typically_inhabits", scope: "location", metric: { kind: "min_chars", min: 500, ideal: 1500 } },
    { path: "locations[*].spec.iconic_objects", label: "locations.main.iconic_objects", scope: "location", metric: { kind: "min_count", min: 5, min_chars_each: 200 } },

    { path: "world.history.timeline", label: "world.history_timeline", scope: "world", metric: { kind: "min_count", min: 30, min_chars_each: 200 } },
    { path: "world.power_system_logic", label: "world.power_system_logic", scope: "world", metric: { kind: "min_chars", min: 5000, ideal: 15000 } },
    { path: "world.cosmology", label: "world.cosmology", scope: "world", metric: { kind: "min_chars", min: 1500, ideal: 5000 } },
    { path: "world.economic_system", label: "world.economic_system", scope: "world", metric: { kind: "min_chars", min: 3000, ideal: 8000 } },
    { path: "world.social_strata", label: "world.social_strata", scope: "world", metric: { kind: "min_chars", min: 2000, ideal: 6000 } },
    { path: "world.daily_life_textures", label: "world.daily_life_textures", scope: "world", metric: { kind: "min_chars", min: 5000, ideal: 15000 } },
    { path: "world.factions[*].summary", label: "world.factions_each", scope: "world", metric: { kind: "min_chars", min: 1500, ideal: 4000 } },
    { path: "world.language_and_naming", label: "world.language_and_naming", scope: "world", metric: { kind: "min_chars", min: 1500, ideal: 4000 } },
    { path: "world.forbidden_lore", label: "world.forbidden_lore", scope: "world", metric: { kind: "min_chars", min: 2000, ideal: 6000 } },

    { path: "visual_motifs[*].meaning", label: "visual_motifs.each.meaning", scope: "motif", metric: { kind: "min_chars", min: 300, ideal: 1000 } },
    { path: "visual_motifs[*].draw_directive", label: "visual_motifs.each.draw_directive", scope: "motif", metric: { kind: "min_chars", min: 500, ideal: 2000 } },
    { path: "visual_motifs[*].symbolic_lineage", label: "visual_motifs.each.symbolic_lineage", scope: "motif", metric: { kind: "min_chars", min: 300, ideal: 1500 } },
    { path: "visual_motifs[*].reference_scenes", label: "visual_motifs.each.reference_scenes", scope: "motif", metric: { kind: "min_count", min: 5, ideal: 20 } },
    { path: "visual_motifs[*].negative_examples", label: "visual_motifs.each.negative_examples", scope: "motif", metric: { kind: "min_count_only", min: 3 } },

    { path: "props[*].spec.distinguishing_features", label: "props.each.visual_description", scope: "prop", metric: { kind: "min_chars", min: 400, ideal: 1500 } },
    { path: "props[*].spec.provenance", label: "props.each.provenance", scope: "prop", metric: { kind: "min_chars", min: 300, ideal: 1000 } },
    { path: "props[*].spec.function_and_lore", label: "props.each.function_and_lore", scope: "prop", metric: { kind: "min_chars", min: 500, ideal: 2000 } },
    { path: "props[*].spec.who_can_see_it", label: "props.each.who_can_see_it", scope: "prop", metric: { kind: "min_chars", min: 200, ideal: 200 } },

    { path: "costumes[*].spec.notes", label: "costumes.each.visual_description", scope: "costume", metric: { kind: "min_chars", min: 800, ideal: 2500 } },
    { path: "costumes[*].spec.change_reason", label: "costumes.each.change_reason", scope: "costume", metric: { kind: "min_chars", min: 300, ideal: 1500 } },

    { path: "relations[*].description", label: "relations.each_pair.bidirectional_a_to_b", scope: "relation", metric: { kind: "min_chars", min: 800, ideal: 2500 } },
    { path: "relations[*].bidirectional_b_to_a", label: "relations.each_pair.bidirectional_b_to_a", scope: "relation", metric: { kind: "min_chars", min: 800, ideal: 2500 } },
    { path: "relations[*].catalyst_events", label: "relations.each_pair.catalyst_events", scope: "relation", metric: { kind: "min_count", min: 3, min_chars_each: 300 } },
    { path: "relations[*].per_volume_delta", label: "relations.each_pair.per_volume_delta", scope: "relation", metric: { kind: "min_chars", min: 400, ideal: 400 } },
  ],
  bible_total_target: { min_chars: 300000, ideal_chars: 800000 },
};

type PathStep =
  | { kind: "field"; key: string }
  | { kind: "wildcard" }
  | { kind: "index"; index: number }
  | { kind: "filter"; key: string; value: string };

/** path を解釈して bible から値を取り出す。配列ワイルドカード "[*]" 対応。 */
export function resolvePath(bible: BibleSnapshotV2, path: string): unknown[] {
  let current: unknown[] = [bible];
  for (const step of tokenizePath(path)) {
    current = applyStep(current, step);
  }
  return current;
}

/** path 内のテキスト総文字数を計測 (string なら length、object/array は walkStrings) */
export function measureChars(value: unknown): number {
  if (typeof value === "string") return Array.from(value).length;
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + measureChars(item), 0);
  if (typeof value === "object" && value !== null) {
    return Object.values(value).reduce((sum, item) => sum + measureChars(item), 0);
  }
  return 0;
}

/** path 内の配列要素数を計測 */
export function measureCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function tokenizePath(path: string): PathStep[] {
  const steps: PathStep[] = [];
  for (const segment of path.split(".")) {
    if (segment.length === 0) continue;
    const field = /^[^[\]]+/u.exec(segment)?.[0];
    if (field) steps.push({ kind: "field", key: field });

    const selectors = segment.matchAll(/\[([^\]]+)\]/gu);
    for (const selector of selectors) {
      const body = selector[1];
      if (body === "*") {
        steps.push({ kind: "wildcard" });
      } else if (/^\d+$/u.test(body)) {
        steps.push({ kind: "index", index: Number(body) });
      } else {
        const [key, ...rest] = body.split("=");
        steps.push({ kind: "filter", key, value: rest.join("=") });
      }
    }
  }
  return steps;
}

function applyStep(values: unknown[], step: PathStep): unknown[] {
  const out: unknown[] = [];
  for (const value of values) {
    switch (step.kind) {
      case "field":
        out.push(readField(value, step.key));
        break;
      case "wildcard":
        if (Array.isArray(value)) out.push(...value);
        break;
      case "index":
        if (Array.isArray(value)) out.push(value[step.index]);
        break;
      case "filter":
        if (Array.isArray(value)) {
          out.push(...value.filter((item) => String(readField(item, step.key)) === step.value));
        }
        break;
    }
  }
  return out;
}

function readField(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  return (value as Record<string, unknown>)[key];
}
