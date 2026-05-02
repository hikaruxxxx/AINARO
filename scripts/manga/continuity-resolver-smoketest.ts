/**
 * Continuity Resolver スモークテスト
 *
 * 合成 storyboard + 作品1 snapshot で resolveContinuityGroupIds が
 * PagePlan の各 panel に group_id を埋めるか確認する。
 *
 * 実行: npx tsx scripts/manga/continuity-resolver-smoketest.ts
 */

import {
  mapStoryboardToPages,
  resolveContinuityGroupIds,
} from "@/lib/manga/page-director";
import type { RenderConstraints } from "@/lib/manga/page-director";
import type { ShotlistPanelEntry } from "@/lib/manga/schemas";
import { loadBibleSnapshot } from "./load-bible-snapshot";
import { snapshotToBibleRows } from "@/lib/manga/bible/snapshot-adapter";

function panel(
  idx: number,
  args: Partial<ShotlistPanelEntry> & {
    role: ShotlistPanelEntry["role"];
    aspect: ShotlistPanelEntry["aspect"];
    scene_id: string;
  }
): ShotlistPanelEntry {
  return {
    idx,
    camera: (args.camera ?? "medium") as ShotlistPanelEntry["camera"],
    tempo: args.tempo ?? "slow",
    characters: args.characters ?? [],
    location: args.location ?? null,
    ...args,
  } as ShotlistPanelEntry;
}

async function main() {
  const { snapshot } = loadBibleSnapshot(
    "data/manga/bible/work-1-dungeon-explorer/snapshot.json"
  );
  const { characters, locations } = snapshotToBibleRows(snapshot);

  console.log(`[smoketest] snapshot loaded: ${snapshot.meta.slug}`);
  console.log(`  characters: ${characters.map((c) => c.character_name).join(", ")}`);
  console.log(`  locations: ${locations.map((l) => l.location_name).join(", ")}`);
  console.log(`  continuity_seeds: ${snapshot.continuity_seeds.length} 件`);

  const protagonist = characters.find(
    (c) => c.character_name === "シノザキ・カナデ"
  );
  const guildHall = locations.find(
    (l) => l.location_name === "「真銀の翼」冒険者ギルド受付ホール"
  );
  const dungeonEntry = locations.find(
    (l) => l.location_name === "ダンジョン1階層 入口広間"
  );
  if (!protagonist || !guildHall || !dungeonEntry) {
    throw new Error("snapshot から想定キャラ・ロケが取得できません");
  }

  // 12コマ合成 storyboard:
  //   panel 0-3: ギルドホール、主人公単独
  //   panel 4-7: ダンジョン入口、主人公単独
  //   panel 8-11: ロケなし、主人公単独
  const panels: ShotlistPanelEntry[] = [
    panel(0, { role: "establishing", aspect: "panel_landscape", scene_id: "s1", characters: [protagonist.id], location: guildHall.id }),
    panel(1, { role: "dialogue", aspect: "panel_square", scene_id: "s1", characters: [protagonist.id], location: guildHall.id }),
    panel(2, { role: "dialogue", aspect: "panel_square", scene_id: "s1", characters: [protagonist.id], location: guildHall.id }),
    panel(3, { role: "reaction", aspect: "panel_portrait", scene_id: "s1", characters: [protagonist.id], location: guildHall.id }),
    panel(4, { role: "establishing", aspect: "panel_landscape", scene_id: "s2", characters: [protagonist.id], location: dungeonEntry.id }),
    panel(5, { role: "action", aspect: "panel_square", scene_id: "s2", characters: [protagonist.id], location: dungeonEntry.id }),
    panel(6, { role: "action", aspect: "panel_square", scene_id: "s2", characters: [protagonist.id], location: dungeonEntry.id }),
    panel(7, { role: "reaction", aspect: "panel_portrait", scene_id: "s2", characters: [protagonist.id], location: dungeonEntry.id }),
    panel(8, { role: "establishing", aspect: "panel_landscape", scene_id: "s3", characters: [protagonist.id], location: null }),
    panel(9, { role: "dialogue", aspect: "panel_square", scene_id: "s3", characters: [protagonist.id], location: null }),
    panel(10, { role: "reaction", aspect: "panel_portrait", scene_id: "s3", characters: [protagonist.id], location: null }),
    panel(11, { role: "cliffhanger", aspect: "panel_landscape", scene_id: "s3", characters: [protagonist.id], location: null }),
  ];

  const constraints: RenderConstraints = {
    max_panels_per_page: 7,
    avg_panels_per_page: 5,
    max_dialogue_bubbles_per_panel: 2,
    max_closeups_per_page: 2,
    allow_action_pages: true,
    forbidden_panel_types: [],
    allowed_size_classes: ["small", "medium", "large", "extra_large", "splash"],
  };

  const targetPagePanels = constraints.avg_panels_per_page;
  const maxPanelsPerPage = constraints.max_panels_per_page;

  const pages = mapStoryboardToPages(panels, {
    constraints,
    targetPagePanels,
    readingDirection: "rtl",
    recommendedStrategy: "panel_composite",
  });

  console.log("");
  console.log(`[smoketest] mapStoryboardToPages: ${pages.length} pages`);
  for (const p of pages) {
    console.log(
      `  page ${p.page_idx} role=${p.page_role} panels=${p.actual_panel_count} template=${p.layout_template_id}`
    );
  }

  const characterIdToName = new Map(
    characters.map((c) => [c.id, c.character_name])
  );
  const locationIdToName = new Map(
    locations.map((l) => [l.id, l.location_name])
  );

  const resolved = resolveContinuityGroupIds({
    pages,
    shotlistPanels: panels,
    targetPagePanels,
    maxPanelsPerPage,
    characterIdToName,
    locationIdToName,
    snapshot,
  });

  console.log("");
  console.log(`[smoketest] resolveContinuityGroupIds 結果:`);
  let totalPanels = 0;
  let panelsWithGroups = 0;
  for (const p of resolved) {
    console.log(`  page ${p.page_idx}: page_continuity_group_ids = ${JSON.stringify(p.page_continuity_group_ids)}`);
    for (const panel of p.panels) {
      totalPanels++;
      const ids = panel.continuity_group_ids;
      if (ids && ids.length > 0) panelsWithGroups++;
      console.log(
        `    panel ${panel.panel_idx} (slot=${panel.slot_id}) continuity=${JSON.stringify(ids ?? [])}`
      );
    }
  }

  console.log("");
  console.log(`[smoketest] サマリ: ${panelsWithGroups}/${totalPanels} panels に group_id 注入済み`);

  // 期待値: 主人公が登場する全 panel に char_kanade_face_v1 / char_kanade_outfit_v1 / prop_monocle_v1 が付くはず
  const expectedCharGroups = ["char_kanade_face_v1", "char_kanade_outfit_v1", "prop_monocle_v1"];
  let assertionFailed = false;
  for (const p of resolved) {
    for (const panel of p.panels) {
      const ids = new Set(panel.continuity_group_ids ?? []);
      for (const expected of expectedCharGroups) {
        if (!ids.has(expected)) {
          console.error(
            `  ❌ page ${p.page_idx} panel ${panel.panel_idx}: expected group ${expected} 不足 (got: ${[...ids].join(",")})`
          );
          assertionFailed = true;
        }
      }
    }
  }

  // ロケ group: ギルドホール(loc_guild_hall_v1) / ダンジョン入口(loc_dungeon_entry_v1) が
  // それぞれの panel に最低限付いているか
  const guildHallPanels = panels.filter((p) => p.location === guildHall.id);
  const dungeonEntryPanels = panels.filter((p) => p.location === dungeonEntry.id);
  console.log(
    `  期待ギルドホール panels=${guildHallPanels.length}, ダンジョン入口 panels=${dungeonEntryPanels.length}`
  );

  if (assertionFailed) {
    console.error("");
    console.error("[smoketest] FAILED: 期待 group_id が付いていない panel がある");
    process.exit(1);
  } else {
    console.log("");
    console.log("[smoketest] ✅ PASS");
  }
}

main().catch((err) => {
  console.error("[smoketest] ERROR:", err);
  process.exit(1);
});
