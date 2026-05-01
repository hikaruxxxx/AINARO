/**
 * Month 1 Week 2 page-director スモークテスト
 *
 * 合成 storyboard データを mapStoryboardToPages に通し、validatePagePlan で
 * 構造的不正がないか検査する。実際の DB / Codex CLI 不要で動く。
 *
 * 実行: npx tsx scripts/manga/page-director-smoketest.ts
 *
 * 検査項目:
 *   - splitIntoPages のページ分割が想定範囲のコマ数に収まる
 *   - selectBestTemplate がテンプレを返す
 *   - assignSlots が全 panel に slot を割当てる
 *   - validatePagePlan が ok=true を返す
 *   - reportPageMapperWarnings が予期せぬ警告を出さない
 */

import {
  mapStoryboardToPages,
  reportPageMapperWarnings,
  validatePagePlan,
  splitIntoPages,
} from "@/lib/manga/page-director";
import type { ShotlistPanelEntry } from "@/lib/manga/schemas";
import type { RenderConstraints } from "@/lib/manga/page-director";

// ============================================================
// 合成データ: 1エピソード 24コマ × 4ページ想定
// ============================================================

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
    camera: args.camera ?? "medium" as ShotlistPanelEntry["camera"],
    tempo: args.tempo ?? "slow",
    characters: args.characters ?? [],
    location: args.location ?? null,
    ...args,
  } as ShotlistPanelEntry;
}

// 合成 storyboard: 1話22コマ。期待される分割:
//  page1: setup    5コマ (scene-1)
//  page2: dialogue 6コマ (scene-2)
//  page3: action   6コマ (scene-3、reveal含む)
//  page4: splash単独 (panel 18)
//  page5: cliffhanger 4コマ (scene-4)
const STORYBOARD: ShotlistPanelEntry[] = [
  // page1: setup
  panel(1, { role: "opening", aspect: "panel_landscape", scene_id: "s1", narrative_function: "establishing", purpose: "学園の朝", change_from_prev: "話の冒頭", visual_focus: "校門" }),
  panel(2, { role: "information", aspect: "panel_square", scene_id: "s1", camera: "full_body", narrative_function: "inform", dialogue: [{ speaker_id: "c1", text: "おはよう" }] }),
  panel(3, { role: "emotion", aspect: "panel_square", scene_id: "s1", camera: "face_close", narrative_function: "emote" }),
  panel(4, { role: "transition", aspect: "panel_landscape", scene_id: "s1", narrative_function: "pause" }),
  panel(5, { role: "information", aspect: "panel_square", scene_id: "s1", narrative_function: "inform", dialogue: [{ speaker_id: "c1", text: "そういえばさ" }] }),
  // page2: dialogue (scene 切替)
  panel(6, { role: "transition", aspect: "panel_landscape", scene_id: "s2", narrative_function: "establishing", cut_type: "smash_cut" }),
  panel(7, { role: "information", aspect: "panel_square", scene_id: "s2", camera: "face_close", dialogue: [{ speaker_id: "c1", text: "本当に行くの?" }] }),
  panel(8, { role: "emotion", aspect: "panel_square", scene_id: "s2", camera: "face_close", narrative_function: "reaction", dialogue: [{ speaker_id: "c2", text: "決めたんだ" }] }),
  panel(9, { role: "information", aspect: "panel_square", scene_id: "s2", dialogue: [{ speaker_id: "c1", text: "でも..." }] }),
  panel(10, { role: "emotion", aspect: "panel_square", scene_id: "s2", camera: "face_close", narrative_function: "emote" }),
  panel(11, { role: "transition", aspect: "panel_landscape", scene_id: "s2", narrative_function: "silence" }),
  // page3: action + reveal
  panel(12, { role: "action", aspect: "panel_landscape", scene_id: "s3", narrative_function: "establishing", cut_type: "smash_cut" }),
  panel(13, { role: "action", aspect: "panel_portrait", scene_id: "s3", camera: "wide" }),
  panel(14, { role: "action", aspect: "panel_square", scene_id: "s3" }),
  panel(15, { role: "emotion", aspect: "panel_square", scene_id: "s3", narrative_function: "reaction", camera: "face_close" }),
  panel(16, { role: "action", aspect: "big", scene_id: "s3", narrative_function: "reveal", camera: "wide" }),
  panel(17, { role: "emotion", aspect: "panel_square", scene_id: "s3", narrative_function: "emote", camera: "face_close" }),
  // page4: splash + cliffhanger
  panel(18, { role: "action", aspect: "splash", scene_id: "s4", narrative_function: "reveal", cut_type: "scale_jump" }),
  // page5: cliffhanger
  panel(19, { role: "transition", aspect: "panel_landscape", scene_id: "s4", narrative_function: "pause" }),
  panel(20, { role: "emotion", aspect: "panel_square", scene_id: "s4", narrative_function: "emote", camera: "face_close" }),
  panel(21, { role: "information", aspect: "panel_square", scene_id: "s4", dialogue: [{ speaker_id: "c2", text: "嘘だろ..." }] }),
  panel(22, { role: "cliffhanger", aspect: "panel_tall", scene_id: "s4", narrative_function: "beat_button", camera: "wide" }),
];

// ============================================================
// 合成 RenderConstraints (gpt-image-2 暫定値)
// ============================================================

const CONSTRAINTS: RenderConstraints = {
  max_panels_per_page: 8,
  avg_panels_per_page: 6,
  max_dialogue_bubbles_per_panel: 3,
  max_closeups_per_page: 3,
  allow_action_pages: true,
  forbidden_panel_types: [],
  allowed_size_classes: [
    "tiny",
    "small",
    "medium",
    "large",
    "extra_large",
    "splash",
  ],
};

// ============================================================
// テスト
// ============================================================

function check(label: string, ok: boolean, detail?: string): boolean {
  const prefix = ok ? "  ✅" : "  ❌";
  console.log(`${prefix} ${label}${detail ? ": " + detail : ""}`);
  return ok;
}

async function main(): Promise<void> {
  console.log("[smoketest] page-director Month 1 Week 2");
  console.log(`  storyboard panels: ${STORYBOARD.length}`);

  let passed = 0;
  let failed = 0;
  const trk = (ok: boolean) => {
    if (ok) passed += 1;
    else failed += 1;
  };

  // === 1. splitIntoPages の単体動作 ===
  console.log("\n[1] splitIntoPages");
  const groups = splitIntoPages(STORYBOARD, {
    targetPagePanels: 6,
    maxPanelsPerPage: 8,
  });
  console.log(`  分割: ${groups.length}ページ → ${groups.map((g) => g.panels.length).join(", ")}コマ`);
  trk(check("ページが2つ以上に分割される", groups.length >= 2));
  trk(
    check(
      "splash 単独ページが存在する",
      groups.some((g) => g.panels.length === 1 && g.panels[0].aspect === "splash")
    )
  );
  trk(
    check(
      "全ページが maxPanelsPerPage 以下",
      groups.every((g) => g.panels.length <= 8)
    )
  );
  trk(
    check(
      "全コマが消費される",
      groups.reduce((s, g) => s + g.panels.length, 0) === STORYBOARD.length
    )
  );

  // === 2. mapStoryboardToPages 結合 ===
  console.log("\n[2] mapStoryboardToPages");
  const pages = mapStoryboardToPages(STORYBOARD, {
    constraints: CONSTRAINTS,
    targetPagePanels: 6,
    readingDirection: "rtl",
    recommendedStrategy: "panel_composite",
  });
  console.log(`  生成: ${pages.length}ページ`);
  for (const p of pages) {
    console.log(
      `    page ${p.page_idx} [${p.page_side}] role=${p.page_role} density=${p.visual_density}/${p.dialogue_density} turn=${p.turn_strength} tmpl=${p.layout_template_id} panels=${p.actual_panel_count}`
    );
  }
  trk(check("ページが生成された", pages.length >= 2));
  trk(
    check(
      "末尾ページが cliffhanger",
      pages[pages.length - 1].page_role === "cliffhanger"
    )
  );
  trk(
    check(
      "splash 単独ページは render_strategy=page_one_shot",
      pages.find(
        (p) => p.actual_panel_count === 1 && p.layout_template_id === "splash_single"
      )?.render_strategy === "page_one_shot"
    )
  );
  trk(
    check(
      "page_one_shot ページに blueprint がある",
      pages
        .filter((p) => p.render_strategy === "page_one_shot")
        .every((p) => p.page_prompt_blueprint != null)
    )
  );

  // === 3. validatePagePlan 全ページ通過 ===
  console.log("\n[3] validatePagePlan");
  let allOk = true;
  for (const p of pages) {
    const r = validatePagePlan(p, { constraints: CONSTRAINTS });
    if (!r.ok) {
      allOk = false;
      console.log(`    page ${p.page_idx} 失敗:`);
      for (const e of r.errors) console.log(`      [${e.rule}] ${e.message}`);
    }
    if (r.warnings.length > 0) {
      for (const w of r.warnings) {
        console.log(`    page ${p.page_idx} 警告 [${w.rule}] ${w.message}`);
      }
    }
  }
  trk(check("全ページ validatePagePlan ok", allOk));

  // === 4. reportPageMapperWarnings ===
  console.log("\n[4] reportPageMapperWarnings");
  const warnings = reportPageMapperWarnings(pages, STORYBOARD);
  for (const w of warnings) {
    console.log(`    page ${w.page_idx} [${w.kind}] ${w.detail}`);
  }
  trk(check("予期しない panel_overflow 警告なし", !warnings.some((w) => w.kind === "panel_overflow")));

  // === 5. action ページ抑制の検査 ===
  console.log("\n[5] action ページ抑制 (allow_action_pages=false)");
  const restricted: RenderConstraints = { ...CONSTRAINTS, allow_action_pages: false };
  const pages2 = mapStoryboardToPages(STORYBOARD, {
    constraints: restricted,
    targetPagePanels: 6,
    recommendedStrategy: "panel_composite",
  });
  trk(
    check(
      "action ページ抑制時、role=action のページが消える or 別 role になる",
      pages2.every((p) => p.page_role !== "action")
    )
  );

  // === まとめ ===
  console.log("");
  console.log("=========================================");
  console.log(`[smoketest] DONE ${passed}通過 / ${failed}失敗`);
  console.log("=========================================");
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[smoketest] FAILED:", err);
  process.exit(1);
});
