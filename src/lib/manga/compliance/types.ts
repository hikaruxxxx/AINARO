import type { BibleSnapshotV2, EpisodeStoryboardV2 } from "../schemas-v2";
import type { SceneGraphV1 } from "../scene-graph/schema";

export type Severity = "fatal" | "warn";

export type ComplianceSuggestion = {
  type: string;
  fictional_name_hint?: string;
  description: string;
};

export type ComplianceFinding = {
  severity: Severity;
  category: string;
  matched_term: string;
  field_path: string;
  line?: number;
  text_excerpt: string;
  position: number;
  suggestion?: ComplianceSuggestion;
};

export type Blocklist = {
  schema_version: number;
  _meta?: Record<string, unknown>;
  safe_substitutes?: Record<string, ComplianceSuggestion>;
  category_severity?: {
    fatal?: string[];
    warn?: string[];
    _note?: string;
  };
  [category: string]: unknown;
};

export type FalsePositiveContextExclude = {
  term: string;
  reason: string;
  context_check_required?: boolean;
  added_at?: string;
};

export type FalsePositives = {
  schema_version: number;
  _meta?: Record<string, unknown>;
  exact_term_excludes?: string[];
  context_excludes?: FalsePositiveContextExclude[];
};

export type ScanTextOptions = {
  fieldPath?: string;
  additionalForbiddenTerms?: string[];
};

export type { BibleSnapshotV2, EpisodeStoryboardV2, SceneGraphV1 };
