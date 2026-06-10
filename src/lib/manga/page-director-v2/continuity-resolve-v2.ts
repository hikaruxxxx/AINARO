/**
 * L6 Continuity Resolve v2
 *
 * page_plan.json の各 panel に対して bible.continuity_seeds から
 * 該当する group_id を注入する。
 *
 * ルール:
 * - panel.entities.characters[].character_id ∈ seed.target_id (kind=character_face/outfit/back)
 *   → seed.group_id を inject
 * - panel.entities.location_id ∈ seed.target_id (kind=location_layout)
 *   → seed.group_id を inject
 * - panel.entities.props[].prop_id ∈ seed.target_id (kind=prop)
 *   → seed.group_id を inject
 * - on_screen_via=tv の character は kind=tv_variant の seed があれば優先 inject
 * - shot_type=close_up は character_face/back を優先
 * - shot_type=medium は character_outfit/face を優先
 * - shot_type=wide/establishing は location_layout のみ
 */
import type {
  BibleSnapshotV2,
  ContinuitySeedV2,
  EpisodeStoryboardV2,
  PagePlanV2,
  PanelV2,
} from "../schemas-v2";

type SeedIndex = {
  byTarget: Map<string, ContinuitySeedV2[]>;
};

function indexSeeds(bible: BibleSnapshotV2): SeedIndex {
  const byTarget = new Map<string, ContinuitySeedV2[]>();
  for (const s of bible.continuity_seeds) {
    const arr = byTarget.get(s.target_id) ?? [];
    arr.push(s);
    byTarget.set(s.target_id, arr);
  }
  return { byTarget };
}

function pickCharacterSeeds(
  seeds: ContinuitySeedV2[],
  panelEntityChar: PanelV2["entities"]["characters"][number],
  shotType: PanelV2["shot_type"]
): ContinuitySeedV2[] {
  // tv 越しならまず tv_variant
  if (panelEntityChar.on_screen_via === "tv") {
    const tv = seeds.find((s) => s.kind === "tv_variant");
    if (tv) return [tv];
  }
  if (shotType === "close_up") {
    const face = seeds.find((s) => s.kind === "character_face");
    return face ? [face] : [];
  }
  if (shotType === "medium") {
    const result: ContinuitySeedV2[] = [];
    const outfit = seeds.find((s) => s.kind === "character_outfit");
    const face = seeds.find((s) => s.kind === "character_face");
    if (outfit) result.push(outfit);
    if (face) result.push(face);
    return result;
  }
  if (shotType === "wide" || shotType === "establishing") {
    // wide でキャラがいれば silhouette/back を優先
    const back = seeds.find((s) => s.kind === "character_back");
    if (back) return [back];
    const outfit = seeds.find((s) => s.kind === "character_outfit");
    return outfit ? [outfit] : [];
  }
  return [];
}

export function injectContinuityGroupIds(args: {
  pagePlan: PagePlanV2;
  storyboard: EpisodeStoryboardV2;
  bible: BibleSnapshotV2;
}): PagePlanV2 {
  const seedIdx = indexSeeds(args.bible);
  const storyboardPanelById = new Map<string, PanelV2>();
  for (const page of args.storyboard.pages) {
    for (const panel of page.panels) storyboardPanelById.set(panel.panel_id, panel);
  }

  const updatedPages = args.pagePlan.pages.map((page) => {
    const panels = page.panels.map((pp) => {
      const sb = storyboardPanelById.get(pp.panel_id);
      if (!sb) return pp;

      const groupIds = new Set<string>();

      // characters (voice_off は画面外なので continuity 不要)
      for (const ch of sb.entities.characters) {
        if (ch.on_screen_via === "voice_off") continue;
        const seeds = seedIdx.byTarget.get(ch.character_id) ?? [];
        for (const s of pickCharacterSeeds(seeds, ch, sb.shot_type)) {
          groupIds.add(s.group_id);
        }
      }

      // location
      const locSeeds = seedIdx.byTarget.get(sb.entities.location_id) ?? [];
      for (const s of locSeeds) {
        if (s.kind === "location_layout") groupIds.add(s.group_id);
      }

      // props
      for (const pr of sb.entities.props) {
        const propSeeds = seedIdx.byTarget.get(pr.prop_id) ?? [];
        for (const s of propSeeds) {
          if (s.kind === "prop") groupIds.add(s.group_id);
        }
      }

      return { ...pp, continuity_group_ids: [...groupIds] };
    });

    // page_one_shot 用に page-level の集約 group_ids も保持
    const pageGroupIds = new Set<string>();
    for (const p of panels) {
      for (const g of p.continuity_group_ids ?? []) pageGroupIds.add(g);
    }

    return { ...page, panels, page_continuity_group_ids: [...pageGroupIds] };
  });

  return { ...args.pagePlan, pages: updatedPages };
}
