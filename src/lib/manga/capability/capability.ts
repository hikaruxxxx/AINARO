/**
 * ModelCapabilityProfile loader & types
 *
 * data/manga/capability/{model}.json を型付きで読み込む。
 */
import { promises as fs } from "node:fs";

export type RefApiCapability = {
  ref_role_tagging: boolean;
  ref_role_tagging_note?: string;
  ref_weighting: boolean;
  ref_weighting_note?: string;
  ref_mask_binding: boolean;
  ref_mask_binding_note?: string;
  ref_negative: boolean;
  ref_negative_note?: string;
};

export type CapabilityProfile = {
  schema_version: number;
  model: string;
  profile_id: string;
  measured_at: string;
  api_status: string;
  api_endpoint_notes?: string;
  size_options: Array<{ width: number; height: number; label: string; mode: string }>;
  reference_image_max: number;
  reference_image_optimal: number;
  reference_image_degradation_note?: string;
  ref_api_capability: RefApiCapability;
  prompt_style: string;
  prompt_max_chars_practical: number;
  usable_styles: string[];
  allowed_shot_scales: string[];
  weak_shot_scales?: string[];
  max_characters_per_panel: number;
  multi_character_treatment: string;
  reliable_effects: string[];
  postprocess_required: string[];
  forbidden_panel_types: string[];
  negative_space_success_rate: number;
  character_consistency_success_rate: number;
  page_one_shot_success_rate: number;
  panel_composite_success_rate: number;
  recommended_strategy: "page_one_shot" | "panel_composite" | "hybrid";
  recommended_page_constraints: {
    avg_panels_per_page: number;
    max_panels_per_page: number;
    max_dialogue_bubbles_per_panel: number;
    max_closeups_per_page: number;
    allow_action_pages: boolean;
    establishing_per_episode: number;
  };
  cost_per_image_estimate: Record<string, unknown>;
  lora_phase3_required: boolean;
  comparison_baseline?: Record<string, unknown>;
  production_decision: {
    primary_model: string;
    primary_invocation: string;
    fallback_model: string | null;
    decided_at: string;
    decision_basis: string;
  };
};

export async function loadCapabilityProfile(filePath: string): Promise<CapabilityProfile> {
  const txt = await fs.readFile(filePath, "utf-8");
  const parsed = JSON.parse(txt) as CapabilityProfile;
  if (parsed.schema_version !== 1) {
    throw new Error(`capability schema_version mismatch: ${parsed.schema_version}`);
  }
  return parsed;
}
