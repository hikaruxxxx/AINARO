/**
 * generate-panels-from-snapshot.ts のスモークテスト
 *
 * 1. 一時ディレクトリにダミー refs (PNG マジックのみ) と合成 storyboard.json を配置
 * 2. CLI を --dry-run=true で実行し、manifest.json を確認
 * 3. 期待: 各 panel に referenceImagePaths が group_id 経由で注入される
 *
 * 実行: npx tsx scripts/manga/generate-panels-from-snapshot-smoketest.ts
 */

import {
  existsSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
} from "fs";
import { spawnSync } from "child_process";
import path from "path";
import { loadBibleSnapshot } from "./load-bible-snapshot";
import { snapshotToBibleRows } from "@/lib/manga/bible/snapshot-adapter";
import type { ShotlistData, ShotlistPanelEntry } from "@/lib/manga/schemas";

const SNAPSHOT_PATH = "data/manga/bible/work-1-dungeon-explorer/snapshot.json";
const TMP_REFS_ROOT = path.resolve(".tmp-smoketest-refs");
const TMP_OUTPUT_ROOT = path.resolve(".tmp-smoketest-output");
const TMP_STORYBOARD_PATH = path.resolve(
  ".tmp-smoketest-storyboard.json"
);

function safeName(name: string): string {
  return name.replace(/[^\w぀-ゟ゠-ヿ一-龯-]/g, "_");
}

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

function dummyPng(p: string): void {
  const dir = path.dirname(p);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(p, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
}

function cleanup() {
  for (const p of [TMP_REFS_ROOT, TMP_OUTPUT_ROOT, TMP_STORYBOARD_PATH]) {
    try {
      rmSync(p, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

async function main() {
  cleanup();
  process.on("exit", cleanup);

  const { snapshot } = loadBibleSnapshot(SNAPSHOT_PATH);
  const { characters, locations } = snapshotToBibleRows(snapshot);

  const protagonist = characters.find(
    (c) => c.character_name === "シノザキ・カナデ"
  );
  const guildHall = locations.find(
    (l) => l.location_name === "「真銀の翼」冒険者ギルド受付ホール"
  );
  if (!protagonist || !guildHall) {
    throw new Error("snapshot から想定キャラ・ロケが取得できません");
  }

  // ダミー refs 配置 (refsRoot/<slug>/refs/characters/<safe>/...)
  const slugRefsRoot = path.join(TMP_REFS_ROOT, snapshot.meta.slug, "refs");
  const charDir = path.join(slugRefsRoot, "characters", "shinozaki_kanade");
  const guildDir = path.join(
    slugRefsRoot,
    "locations",
    safeName(guildHall.location_name)
  );
  for (const v of ["front", "side", "expr_joy", "expr_anger", "expr_sad"]) {
    dummyPng(path.join(charDir, `${v}.png`));
  }
  for (const v of ["wide", "front", "from_door"]) {
    dummyPng(path.join(guildDir, `${v}.png`));
  }
  console.log(`[smoketest] ダミー refs 配置: ${TMP_REFS_ROOT}`);

  // 合成 storyboard.json (4 panel: 全部 protagonist + guildHall)
  const panels: ShotlistPanelEntry[] = [
    panel(0, {
      role: "establishing",
      aspect: "panel_landscape",
      scene_id: "s1",
      characters: [protagonist.id],
      location: guildHall.id,
    }),
    panel(1, {
      role: "dialogue",
      aspect: "panel_square",
      scene_id: "s1",
      characters: [protagonist.id],
      location: guildHall.id,
    }),
    panel(2, {
      role: "reaction",
      aspect: "panel_portrait",
      scene_id: "s1",
      characters: [protagonist.id],
      location: guildHall.id,
    }),
    panel(3, {
      role: "cliffhanger",
      aspect: "panel_landscape",
      scene_id: "s1",
      characters: [protagonist.id],
      location: guildHall.id,
    }),
  ];
  const shotlist: ShotlistData = {
    rhythm_curve: [],
    panels,
    pages: [],
    episode_target_pages: 1,
    meta: {
      total_panels: panels.length,
      total_height_px_estimate: 0,
      generated_by: "smoketest",
      generation_version: "smoketest-v1",
    },
  };

  // storyboard.json を CLI が探す場所 (content/manga/<slug>/ep001/storyboard.json) に配置するか、
  // --storyboard で直接渡す。後者が簡単。
  writeFileSync(
    TMP_STORYBOARD_PATH,
    JSON.stringify({ plot: {}, shotlist }, null, 2),
    "utf-8"
  );
  console.log(`[smoketest] 合成 storyboard.json: ${TMP_STORYBOARD_PATH}`);

  // CLI を dry-run で実行
  console.log("");
  console.log(`[smoketest] CLI 実行 (dry-run)...`);
  const result = spawnSync(
    "npx",
    [
      "tsx",
      "scripts/manga/generate-panels-from-snapshot.ts",
      `--snapshot=${SNAPSHOT_PATH}`,
      `--ep=1`,
      `--storyboard=${TMP_STORYBOARD_PATH}`,
      `--refs-root=${TMP_REFS_ROOT}`,
      `--output-root=${TMP_OUTPUT_ROOT}`,
      `--dry-run=true`,
    ],
    { encoding: "utf-8", stdio: "pipe" }
  );

  if (result.stdout) console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
  if (result.status !== 0) {
    console.error(`[smoketest] CLI exit=${result.status}`);
    process.exit(1);
  }

  // manifest.json 検証
  const manifestPath = path.join(
    TMP_OUTPUT_ROOT,
    snapshot.meta.slug,
    "ep001",
    "manifest.json"
  );
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
    panels: Array<{
      panel_idx: number;
      prompt: string;
      referenceImagePaths: string[];
    }>;
  };

  console.log("");
  console.log(`[smoketest] manifest.json 検証:`);
  console.log(`  panels: ${manifest.panels.length}`);

  let assertionFailed = false;
  for (const m of manifest.panels) {
    console.log(
      `  panel ${m.panel_idx}: refs=${m.referenceImagePaths.length} prompt=${m.prompt.length}chars`
    );
    // 各 panel に refs が 1 つ以上付いていることを期待 (主人公 character_id 経由)
    if (m.referenceImagePaths.length === 0) {
      console.error(`    ❌ panel ${m.panel_idx}: refs が空`);
      assertionFailed = true;
    }
    // refs に shinozaki_kanade のパスが含まれていることを確認
    const hasProtagonistRef = m.referenceImagePaths.some((p) =>
      p.includes("shinozaki_kanade")
    );
    if (!hasProtagonistRef) {
      console.error(
        `    ❌ panel ${m.panel_idx}: 主人公の参照画像パスが含まれていない`
      );
      assertionFailed = true;
    }
    // refs にギルドホールの location 参照も含まれていることを確認 (continuity_group_ids 経由)
    const hasLocationRef = m.referenceImagePaths.some(
      (p) => p.includes("locations") && p.includes("真銀の翼")
    );
    if (!hasLocationRef) {
      console.error(
        `    ❌ panel ${m.panel_idx}: ロケ参照画像 (loc_guild_hall_v1) が含まれていない`
      );
      assertionFailed = true;
    }
  }

  if (assertionFailed) {
    console.error("");
    console.error("[smoketest] FAILED");
    process.exit(1);
  }
  console.log("");
  console.log("[smoketest] ✅ PASS");
}

main().catch((err) => {
  console.error("[smoketest] ERROR:", err);
  process.exit(1);
});
