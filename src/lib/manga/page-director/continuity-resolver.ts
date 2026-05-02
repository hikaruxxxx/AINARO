/**
 * Continuity Resolver — PagePlan の各 panel に continuity_group_ids を充填
 *
 * 流れ:
 *   1. ShotlistPanelEntry[] を splitIntoPages で再分割し、PageGroup を再現
 *   2. MangaPagePlan[i].panels[j] と PageGroup[i].panels[j] を panel_idx で対応付け
 *   3. ShotlistPanelEntry.characters (character_id[]) と location (location_id) を
 *      character_name / location_name に解決
 *   4. BibleSnapshot.continuity_seeds から target_name 一致の group_id を集める
 *   5. PagePanel.continuity_group_ids に書き込む
 *   6. ページ全体の和集合を MangaPagePlan.page_continuity_group_ids に書き込む
 *
 * 純関数。snapshot がなければ no-op (既存挙動維持)。
 */

import { splitIntoPages } from "./page-mapper";
import type { MangaPagePlan } from "./types";
import type { ShotlistPanelEntry } from "../schemas";
import type { BibleSnapshot } from "../bible/bible-snapshot";

export type ContinuityResolverArgs = {
  pages: MangaPagePlan[];
  shotlistPanels: ShotlistPanelEntry[];
  /** 同じ targetPagePanels / maxPanelsPerPage で page-mapper が呼ばれている前提 */
  targetPagePanels: number;
  maxPanelsPerPage: number;
  /** character_id → character_name の lookup */
  characterIdToName: Map<string, string>;
  /** location_id → location_name の lookup */
  locationIdToName: Map<string, string>;
  /** snapshot.continuity_seeds から target_name → group_id[] を引く */
  snapshot: BibleSnapshot;
};

/**
 * snapshot から「target_name → group_id[]」逆引き map を作る
 */
function buildNameToGroupIds(snapshot: BibleSnapshot): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const seed of snapshot.continuity_seeds) {
    if (!seed.target_name || seed.target_name.startsWith("TODO")) continue;
    const arr = map.get(seed.target_name) ?? [];
    arr.push(seed.group_id);
    map.set(seed.target_name, arr);
  }
  return map;
}

/**
 * PagePlan の各 panel に continuity_group_ids を埋める。
 * 元配列を破壊変更せず、新しい配列を返す。
 */
export function resolveContinuityGroupIds(
  args: ContinuityResolverArgs
): MangaPagePlan[] {
  const nameToGroupIds = buildNameToGroupIds(args.snapshot);

  // page-mapper と同じ分割を再現
  const groups = splitIntoPages(args.shotlistPanels, {
    targetPagePanels: args.targetPagePanels,
    maxPanelsPerPage: args.maxPanelsPerPage,
  });

  // ページ数が一致しない場合、対応付けが崩れているので no-op (フェイルセーフ)
  if (groups.length !== args.pages.length) {
    console.warn(
      `[continuity-resolver] page count mismatch (groups=${groups.length} pages=${args.pages.length}). 連続性ID注入をスキップします。`
    );
    return args.pages;
  }

  return args.pages.map((page, pageIdx) => {
    const group = groups[pageIdx];
    const groupIdsAccPage = new Set<string>();

    const newPanels = page.panels.map((panel) => {
      const sb = group.panels[panel.panel_idx];
      // splitIntoPages 後にテンプレ slot 数で truncate される場合がある
      // (page-mapper.ts:553) ので、対応がない panel_idx は continuity を空にする
      if (!sb) {
        return panel;
      }

      const groupIds = new Set<string>();

      // characters[] から
      for (const charId of sb.characters ?? []) {
        const name = args.characterIdToName.get(charId);
        if (!name) continue;
        for (const gid of nameToGroupIds.get(name) ?? []) {
          groupIds.add(gid);
          groupIdsAccPage.add(gid);
        }
      }

      // location から
      if (sb.location) {
        const locName = args.locationIdToName.get(sb.location);
        if (locName) {
          for (const gid of nameToGroupIds.get(locName) ?? []) {
            groupIds.add(gid);
            groupIdsAccPage.add(gid);
          }
        }
      }

      return {
        ...panel,
        continuity_group_ids:
          groupIds.size > 0 ? Array.from(groupIds) : undefined,
      };
    });

    return {
      ...page,
      panels: newPanels,
      page_continuity_group_ids:
        groupIdsAccPage.size > 0 ? Array.from(groupIdsAccPage) : undefined,
    };
  });
}
