import { detectUndefinedReferences } from "../qa-v2/undefined-reference-detector";
import type {
  BibleSnapshotV2,
  BibleSnapshotV3,
  CharacterEntryV2,
  FactNode,
  Layer,
} from "../schemas-v2";
import { v2ToV3 } from "./v3-adapter";

export type RoleEnumViolation = {
  character_id: string;
  character_name: string;
  current_role: string;
  recommended_role:
    | "supporting"
    | "deuteragonist"
    | "antagonist"
    | "love_interest";
  recommended_subrole?: "heroine" | "villain_lieutenant" | "comic_relief";
  reason: string;
};

export type MigrationResult = {
  v3: BibleSnapshotV3;
  needsReview: FactNode[];
  unresolvedReferences: ReturnType<typeof detectUndefinedReferences>;
  roleEnumViolations: RoleEnumViolation[];
  factSourcePathIndex: Record<string, string>;
};

export function runMigration(v2: BibleSnapshotV2): MigrationResult {
  const v3 = v2ToV3(v2);
  const unresolvedReferences = detectUndefinedReferences(v2);
  const roleEnumViolations = findRoleEnumViolations(v2);
  const needsReview = v3.facts.filter(
    (fact) => (fact.evidence?.confidence ?? fact.confidence ?? 1.0) < 0.7
  );
  const factSourcePathIndex = Object.fromEntries(
    v3.facts.map((fact) => [fact.fact_id, fact.evidence?.source_path ?? ""])
  );

  return {
    v3,
    needsReview,
    unresolvedReferences,
    roleEnumViolations,
    factSourcePathIndex,
  };
}

export function findRoleEnumViolations(
  v2: BibleSnapshotV2
): RoleEnumViolation[] {
  const validRoles = new Set([
    "protagonist",
    "deuteragonist",
    "antagonist",
    "supporting",
    "mentor",
    "rival",
    "love_interest",
  ]);
  const out: RoleEnumViolation[] = [];

  for (const character of v2.characters) {
    const role = String((character as CharacterEntryV2).role);
    if (validRoles.has(role)) continue;

    let recommendedRole: RoleEnumViolation["recommended_role"] = "supporting";
    let recommendedSubrole:
      | RoleEnumViolation["recommended_subrole"]
      | undefined;
    let reason = `role="${role}" is not in valid enum`;

    if (role === "heroine") {
      recommendedRole = "supporting";
      recommendedSubrole = "heroine";
      reason = "role=heroine は enum 違反。supporting + subrole=heroine を推奨";
    }

    out.push({
      character_id: character.id,
      character_name: character.name,
      current_role: role,
      recommended_role: recommendedRole,
      recommended_subrole: recommendedSubrole,
      reason,
    });
  }

  return out;
}

export function countFactsByLayer(v3: BibleSnapshotV3): Record<Layer, number> {
  return v3.facts.reduce(
    (acc, fact) => {
      acc[fact.layer] += 1;
      return acc;
    },
    {
      in_world_belief: 0,
      revealed_at_volume: 0,
      meta_truth: 0,
      system_specification: 0,
      character_arc_state: 0,
    } satisfies Record<Layer, number>
  );
}
