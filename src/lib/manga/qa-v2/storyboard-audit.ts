export type StoryboardAuditCategory =
  | "continuity"
  | "pacing"
  | "clarity"
  | "dialogue"
  | "entity_binding"
  | "shot_type_variation"
  | "focus_entity_coherence"
  | "opening_hook_priority";

export type StoryboardAuditSeverity = "ok" | "minor" | "major" | "critical";

export type StoryboardAuditIssue = {
  category: StoryboardAuditCategory;
  description: string;
  panel_id?: string;
  page_no?: number;
};

export type StoryboardAuditVariant = {
  proposal_id: string;
  generation_profile?: "balanced" | "cinematic" | "clarity-first";
  severity: StoryboardAuditSeverity;
  issues: StoryboardAuditIssue[];
  strengths: string;
  suggested_fix: string;
};

export type StoryboardAuditReport = {
  schema_version: 1;
  slug: string;
  episode: number;
  audited_at: string;
  audited_by: string;
  proposals: StoryboardAuditVariant[];
  cross_variant_notes: string;
  summary: {
    by_severity: Record<StoryboardAuditSeverity, number>;
    recommended_proposal_id: string;
  };
};

export const STORYBOARD_AUDIT_CATEGORIES: readonly StoryboardAuditCategory[] = [
  "continuity",
  "pacing",
  "clarity",
  "dialogue",
  "entity_binding",
  "shot_type_variation",
  "focus_entity_coherence",
  "opening_hook_priority",
];

export const STORYBOARD_AUDIT_SEVERITIES: readonly StoryboardAuditSeverity[] = [
  "ok",
  "minor",
  "major",
  "critical",
];

export function emptyStoryboardAuditSeverityCounts(): Record<StoryboardAuditSeverity, number> {
  return { ok: 0, minor: 0, major: 0, critical: 0 };
}
