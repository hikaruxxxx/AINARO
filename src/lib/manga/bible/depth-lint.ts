import type { LintFinding, LintSeverity } from "../qa-v2/bible-lint";
import type { Aspect, BibleSnapshotV2, BibleSnapshotV3, FactNode, Layer } from "../schemas-v2";
import { BIBLE_DEPTH_SPEC, measureChars, measureCount, resolvePath, type DepthRule } from "./depth-spec";
import { v2ToV3 } from "./v3-adapter";

export type DepthCoverageReport = {
  rule: DepthRule;
  matched_count: number;
  per_match: Array<{
    target_id?: string;
    chars: number;
    count?: number;
    coverage_pct: number;
    severity: "ok" | "warn" | "fatal";
  }>;
  aggregate: {
    total_chars: number;
    avg_chars_per_match: number;
    fatal_count: number;
    warn_count: number;
    ok_count: number;
  };
};

type DepthSeverity = "ok" | "warn" | "fatal";

export function depthLint(bible: BibleSnapshotV2): LintFinding[] {
  return depthCoverageReport(bible).flatMap((report) =>
    report.per_match.flatMap((match) => {
      if (match.severity === "ok") return [];
      return [toLintFinding(report.rule, match)];
    }),
  );
}

export function depthLintV3(v3: BibleSnapshotV3, options?: { layerFilter?: Layer[] }): LintFinding[] {
  return BIBLE_DEPTH_SPEC.rules.flatMap((rule) => {
    const unfilteredFacts = factsForDepthRule(v3, rule, undefined);
    const facts = factsForDepthRule(v3, rule, options);
    if (options?.layerFilter && unfilteredFacts.length > 0 && facts.length === 0) return [];
    const groups = groupsForDepthRule(facts, rule);
    const normalizedGroups =
      groups.length > 0 ? groups : [{ target_id: undefined, facts: [] }];

    return normalizedGroups.flatMap((group) => {
      const chars = group.facts.reduce((sum, fact) => sum + Array.from(fact.body).length, 0);
      const count = group.facts.length;
      const severity = severityFor(rule, group.facts, chars, count, group.facts.length);
      if (severity === "ok") return [];
      return [
        toLintFinding(rule, {
          ...(group.target_id ? { target_id: group.target_id } : {}),
          chars,
          ...(usesCount(rule) ? { count } : {}),
          coverage_pct: coveragePct(rule, chars, count),
          severity,
        }),
      ];
    });
  });
}

export function depthLintWithFlag(bible: BibleSnapshotV2, useBibleV3: boolean): LintFinding[] {
  return useBibleV3 ? depthLintV3(v2ToV3(bible)) : depthLint(bible);
}

/** V3: 同 entity 同 aspect で layer 違い fact が存在する場合の reveal 検出 */
export function detectLayerReveals(v3: BibleSnapshotV3): LintFinding[] {
  const findings: LintFinding[] = [];
  const groups = new Map<string, FactNode[]>();
  for (const fact of v3.facts) {
    const key = `${fact.entity_id ?? "_world"}|${fact.aspect}`;
    const arr = groups.get(key) ?? [];
    arr.push(fact);
    groups.set(key, arr);
  }

  for (const [key, facts] of groups) {
    if (facts.length < 2) continue;
    const layers = new Set(facts.map((fact) => fact.layer));
    if (layers.size < 2) continue;
    const layerList = [...layers].join("/");
    findings.push({
      severity: "info",
      scope: "layer_consistency",
      rule: "layer_reveal_present",
      message: `${key}: ${facts.length} facts across layers (${layerList}) — reveal 構造として正常`,
    });
  }
  return findings;
}

export function depthCoverageReport(bible: BibleSnapshotV2): DepthCoverageReport[] {
  return BIBLE_DEPTH_SPEC.rules.map((rule) => {
    const values = resolvePath(bible, rule.path);
    const targetIds = targetIdsForRule(bible, rule);
    const normalizedValues = values.length > 0 ? values : [undefined];
    const perMatch = normalizedValues.map((value, index) => {
      const chars = measureChars(value);
      const count = measureCount(value);
      const severity = severityFor(rule, value, chars, count, values.length);
      return {
        ...(targetIds[index] ? { target_id: targetIds[index] } : {}),
        chars,
        ...(usesCount(rule) ? { count } : {}),
        coverage_pct: coveragePct(rule, chars, count),
        severity,
      };
    });
    const totalChars = perMatch.reduce((sum, match) => sum + match.chars, 0);
    return {
      rule,
      matched_count: values.length,
      per_match: perMatch,
      aggregate: {
        total_chars: totalChars,
        avg_chars_per_match: perMatch.length > 0 ? totalChars / perMatch.length : 0,
        fatal_count: perMatch.filter((match) => match.severity === "fatal").length,
        warn_count: perMatch.filter((match) => match.severity === "warn").length,
        ok_count: perMatch.filter((match) => match.severity === "ok").length,
      },
    };
  });
}

function severityFor(rule: DepthRule, value: unknown, chars: number, count: number, matchedCount: number): DepthSeverity {
  if (matchedCount === 0) return "fatal";
  if (value === undefined) return "warn";

  switch (rule.metric.kind) {
    case "min_chars":
      if (chars < rule.metric.min) return "fatal";
      if (chars < rule.metric.ideal) return "warn";
      return "ok";
    case "min_count": {
      if (count < rule.metric.min) return "fatal";
      const ideal = rule.metric.ideal;
      const averageChars = count > 0 ? chars / count : 0;
      if (rule.metric.min_chars_each !== undefined && averageChars < rule.metric.min_chars_each) return "warn";
      if (ideal !== undefined && count < ideal) return "warn";
      return "ok";
    }
    case "min_count_only":
      return count < rule.metric.min ? "fatal" : "ok";
  }
}

function coveragePct(rule: DepthRule, chars: number, count: number): number {
  const denominator =
    rule.metric.kind === "min_chars"
      ? rule.metric.ideal
      : rule.metric.kind === "min_count"
        ? (rule.metric.ideal ?? rule.metric.min)
        : rule.metric.min;
  const numerator = rule.metric.kind === "min_chars" ? chars : count;
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

function usesCount(rule: DepthRule): boolean {
  return rule.metric.kind === "min_count" || rule.metric.kind === "min_count_only";
}

function factsForDepthRule(v3: BibleSnapshotV3, rule: DepthRule, options: { layerFilter?: Layer[] } | undefined): FactNode[] {
  const pathFilter = pathFilterForRule(rule.path);
  const role = /\[role=([^\]]+)\]/u.exec(rule.path)?.[1];
  const ruleLayers = rule.layerFilter;
  const optionLayers = options?.layerFilter;
  const ruleAspects = rule.aspectFilter;

  return v3.facts.filter((fact) => {
    if (pathFilter && !pathFilter(fact)) return false;
    if (ruleLayers && !ruleLayers.includes(fact.layer)) return false;
    if (optionLayers && !optionLayers.includes(fact.layer)) return false;
    if (ruleAspects && !ruleAspects.includes(fact.aspect)) return false;
    if (role !== undefined && !entityHasRole(v3, fact.entity_id, role)) return false;
    return true;
  });
}

function groupsForDepthRule(facts: FactNode[], rule: DepthRule): Array<{ target_id?: string; facts: FactNode[] }> {
  if (rule.scope !== "character" && rule.scope !== "location" && rule.scope !== "prop" && rule.scope !== "costume" && rule.scope !== "motif" && rule.scope !== "relation") {
    return facts.length > 0 ? [{ facts }] : [];
  }

  const groups = new Map<string, FactNode[]>();
  for (const fact of facts) {
    const key = fact.entity_id ?? "_world";
    const arr = groups.get(key) ?? [];
    arr.push(fact);
    groups.set(key, arr);
  }
  return [...groups].map(([target_id, groupFacts]) => ({
    ...(target_id !== "_world" ? { target_id } : {}),
    facts: groupFacts,
  }));
}

function pathFilterForRule(path: string): ((fact: FactNode) => boolean) | undefined {
  if (path === "world.premise") {
    return (fact) => fact.entity_id === null && fact.aspect === "world_rule" && fact.layer === "in_world_belief" && fact.evidence.source_path === "world.premise";
  }
  if (path === "world.rules[*]") {
    return (fact) => fact.entity_id === null && fact.aspect === "world_rule" && fact.layer === "in_world_belief" && /^world\.rules\[\d+\]$/u.test(fact.evidence.source_path ?? "");
  }
  if (path === "world.system") return worldPath("system_param", "system_specification", path);
  if (path === "world.history.timeline") return sourcePathPrefix("history_event", "world.history.timeline");
  if (path === "world.power_system_logic") return sourcePathPrefix("world_rule", path);
  if (path === "world.cosmology") return worldPath("world_rule", "meta_truth", path);
  if (path === "world.economic_system") return worldPath("world_rule", "in_world_belief", path);
  if (path === "world.social_strata") return worldPath("faction_dynamics", "in_world_belief", path);
  if (path === "world.daily_life_textures") return worldPath("faction_dynamics", "in_world_belief", path);
  if (path === "world.factions[*].summary") return (fact) => fact.aspect === "faction_dynamics" && sourcePathStartsWith(fact, "world.factions[");
  if (path === "world.language_and_naming") return worldPath("speech", "in_world_belief", path);
  if (path === "world.forbidden_lore") return sourcePathPrefix("world_rule", path);

  if (path.startsWith("characters[")) return characterPathFilter(path);
  if (path.startsWith("locations[")) return locationPathFilter(path);
  if (path.startsWith("props[")) return (fact) => fact.aspect === "prop_function" && sourcePathStartsWith(fact, "props[");
  if (path.startsWith("costumes[")) return (fact) => fact.aspect === "identity" && sourcePathStartsWith(fact, "costumes[");
  if (path.startsWith("relations[")) return (fact) => fact.aspect === "relationship" && sourcePathStartsWith(fact, "relations[");
  if (path.startsWith("visual_motifs[")) return (fact) => fact.aspect === "motif_directive" && sourcePathStartsWith(fact, "visual_motifs[");
  return undefined;
}

function characterPathFilter(path: string): (fact: FactNode) => boolean {
  const field = path.split(".").at(-1) ?? "";
  const byField: Record<string, { aspect: Aspect; layer?: Layer; sourceSuffix?: string }> = {
    backstory: { aspect: "backstory", layer: "in_world_belief", sourceSuffix: ".backstory" },
    childhood_episodes: { aspect: "backstory", layer: "in_world_belief", sourceSuffix: ".childhood_episodes[" },
    appearance_notes: { aspect: "appearance", layer: "in_world_belief", sourceSuffix: ".appearance_notes" },
    psychology_deep: { aspect: "psychology", sourceSuffix: ".psychology_deep" },
    defense_mechanisms: { aspect: "psychology", layer: "in_world_belief", sourceSuffix: ".defense_mechanisms" },
    worldview_filter: { aspect: "psychology", layer: "in_world_belief", sourceSuffix: ".worldview_filter" },
    voice_samples: { aspect: "speech", layer: "in_world_belief", sourceSuffix: ".voice_samples[" },
    typical_day_in_life: { aspect: "backstory", layer: "in_world_belief", sourceSuffix: ".typical_day_in_life" },
    relationship_per_partner: { aspect: "relationship", layer: "in_world_belief", sourceSuffix: ".relationship_per_partner[" },
    growth_per_volume: { aspect: "psychology", layer: "character_arc_state", sourceSuffix: ".growth_per_volume[" },
    origin_wound_deep: { aspect: "psychology", layer: "meta_truth", sourceSuffix: ".origin_wound_deep" },
    ideology_argument: { aspect: "psychology", layer: "meta_truth", sourceSuffix: ".ideology_argument" },
    dark_mirror_to_protagonist: { aspect: "psychology", layer: "meta_truth", sourceSuffix: ".dark_mirror_to_protagonist" },
  };
  const spec = byField[field];
  if (!spec) return () => false;
  return (fact) =>
    fact.aspect === spec.aspect &&
    (spec.layer === undefined || fact.layer === spec.layer) &&
    fact.layer !== "system_specification" &&
    (spec.sourceSuffix === undefined || (fact.evidence.source_path ?? "").includes(spec.sourceSuffix));
}

function locationPathFilter(path: string): (fact: FactNode) => boolean {
  if (path.endsWith(".who_typically_inhabits")) return (fact) => fact.aspect === "location_history" && sourcePathIncludes(fact, ".spec.who_typically_inhabits");
  if (path.endsWith(".iconic_objects")) return (fact) => fact.aspect === "location_layout" && sourcePathIncludes(fact, ".spec.iconic_objects[");
  if (path.endsWith(".history")) return (fact) => fact.aspect === "location_history" && sourcePathIncludes(fact, ".spec.history");
  return (fact) => (fact.aspect === "location_layout" || fact.aspect === "location_history") && sourcePathStartsWith(fact, "locations[");
}

function worldPath(aspect: Aspect, layer: Layer, sourcePath: string): (fact: FactNode) => boolean {
  return (fact) => fact.entity_id === null && fact.aspect === aspect && fact.layer === layer && fact.evidence.source_path === sourcePath;
}

function sourcePathPrefix(aspect: Aspect, sourcePath: string): (fact: FactNode) => boolean {
  return (fact) => fact.entity_id === null && fact.aspect === aspect && sourcePathStartsWith(fact, sourcePath);
}

function sourcePathStartsWith(fact: FactNode, prefix: string): boolean {
  return (fact.evidence.source_path ?? "").startsWith(prefix);
}

function sourcePathIncludes(fact: FactNode, value: string): boolean {
  return (fact.evidence.source_path ?? "").includes(value);
}

function entityHasRole(v3: BibleSnapshotV3, entityId: string | null, role: string): boolean {
  const spec = v3.entities.find((entity) => entity.id === entityId)?.spec;
  return typeof spec === "object" && spec !== null && (spec as Record<string, unknown>).role === role;
}

function toLintFinding(
  rule: DepthRule,
  match: {
    target_id?: string;
    chars: number;
    count?: number;
    coverage_pct: number;
    severity: DepthSeverity;
  },
): LintFinding {
  const message = isUnstarted(rule, match)
    ? `[${rule.label}] target=${match.target_id ?? "—"} 未着手 chars=0 (min=${minText(rule)}, ideal=${idealText(rule)}, coverage=${match.coverage_pct}%)`
    : `[${rule.label}] target=${match.target_id ?? "—"} chars=${match.chars}${match.count !== undefined ? ` count=${match.count}` : ""} (min=${minText(rule)}, ideal=${idealText(rule)}, coverage=${match.coverage_pct}%)`;
  return {
    severity: match.severity as LintSeverity,
    scope: rule.scope,
    ...(match.target_id ? { target_id: match.target_id } : {}),
    rule: `depth:${rule.path}`,
    message,
  };
}

function isUnstarted(rule: DepthRule, match: { chars: number; count?: number; severity: DepthSeverity }): boolean {
  return match.severity === "warn" && match.chars === 0 && (match.count === undefined || match.count === 0) && rule.metric.kind !== "min_count_only";
}

function minText(rule: DepthRule): string {
  switch (rule.metric.kind) {
    case "min_chars":
      return String(rule.metric.min);
    case "min_count":
      return rule.metric.min_chars_each === undefined
        ? `${rule.metric.min}件`
        : `${rule.metric.min}件×${rule.metric.min_chars_each}字`;
    case "min_count_only":
      return `${rule.metric.min}件`;
  }
}

function idealText(rule: DepthRule): string {
  if (rule.metric.kind === "min_chars") return String(rule.metric.ideal);
  if (rule.metric.kind === "min_count") return rule.metric.ideal === undefined ? "—" : `${rule.metric.ideal}件`;
  return "—";
}

function targetIdsForRule(bible: BibleSnapshotV2, rule: DepthRule): string[] {
  if (rule.path.startsWith("characters[")) {
    const role = /\[role=([^\]]+)\]/u.exec(rule.path)?.[1];
    return bible.characters
      .filter((character) => role === undefined || character.role === role)
      .map((character) => character.id);
  }
  if (rule.path.startsWith("locations[")) return bible.locations.map((location) => location.id);
  if (rule.path.startsWith("props[")) return bible.props.map((prop) => prop.id);
  if (rule.path.startsWith("costumes[")) return bible.costumes.map((costume) => costume.id);
  if (rule.path.startsWith("relations[")) {
    return bible.relations.map((relation) => `${relation.from_character_id}->${relation.to_character_id}`);
  }
  if (rule.path.startsWith("visual_motifs[")) {
    return bible.visual_motifs.map((motif) => motif.name);
  }
  if (rule.path.startsWith("world.factions[")) {
    return bible.world.factions.map((faction) => faction.name);
  }
  return [];
}
