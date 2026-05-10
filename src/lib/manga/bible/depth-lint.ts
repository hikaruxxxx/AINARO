import type { LintFinding, LintSeverity } from "../qa-v2/bible-lint";
import type { BibleSnapshotV2 } from "../schemas-v2";
import { BIBLE_DEPTH_SPEC, measureChars, measureCount, resolvePath, type DepthRule } from "./depth-spec";

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
