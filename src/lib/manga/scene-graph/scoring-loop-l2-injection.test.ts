import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Scene } from "./schema";
import {
  buildAnchorComparePrompt,
  buildPairwisePrompt,
  buildSceneCandidatePrompt,
  formatVolumeContextSection,
  loadVolumeContext,
  type BibleContextForSlot,
  type SceneSlot,
} from "./scoring-loop";

const a07VolPlotPath = path.join(
  process.cwd(),
  "data/manga/works/a07-modern-dungeon/volumes/v01/plot.json"
);

function slot(): SceneSlot {
  return {
    scene_id: "S01",
    scene_no: 1,
    prev_scene_id: null,
    next_scene_id: "S02",
    page_range: { start: 1, end: 2 },
    panel_range: { start_panel_no: 1, end_panel_no: 8 },
    arc_position: { volume: 1, episode_in_volume: 1, arc_phase: "introduce", arc_position_normalized: 0.1 },
    location_id: "loc_store",
    sub_locations: [],
  };
}

function bibleContext(): BibleContextForSlot {
  return {
    characters: [{ id: "char_ren", name: "桐生レン", role: "protagonist" }],
    costumes: [{ id: "costume_ren", character_id: "char_ren", name: "黒フード" }],
    motifCandidates: [{ id: "motif_blue", name: "青光", description: "ナビの声が視覚化される" }],
    worldRuleCandidates: ["Fランクは1F限定で入域できる。"],
    propCandidates: [{ id: "prop_phone", name: "ヒビ入りスマホ" }],
  };
}

function scene(patch: Partial<Scene> = {}): Scene {
  return {
    ...slot(),
    beat_type: "setup",
    cast: [{ character_id: "char_ren", presence: "in_person" }],
    dialogue_plan: {
      key_lines: [{ speaker: "char_ren", text: "頼む。", uniqueness: "scene_exclusive", intent: "cliff" }],
    },
    foreshadow_setup: [],
    foreshadow_payoff: [],
    protagonist_arc_state: { belief: "諦めている", goal: "数字の意味を知る", emotion: "tension", delta_from_prev: "声を検証する" },
    relationship_state_delta: [],
    time_axis: { label: "early morning", order: 1, is_flashback: false, is_flashforward: false, duration_hint: "minutes" },
    page_budget: { min: 1, max: 2, preferred: 2 },
    mode: "dialogue",
    turn_anchor: { at_panel_no: null, type: "reveal_turn" },
    layout_pattern_id: null,
    subtype_directive: { external_social: false, gacha_ui: false, hybrid: false },
    render_strategy: "panel_composite",
    key_visual_intent: "青い導線を見上げるレン",
    ...patch,
  };
}

describe("scoring-loop L2 volume context injection", () => {
  it("loadVolumeContext: a07 v01 plot.json を読んで ep1 の current_episode を返す", async () => {
    const vc = await loadVolumeContext(a07VolPlotPath, 1);

    expect(vc?.current_episode?.protagonist_arc.start.length).toBeGreaterThan(0);
    expect(vc?.current_episode?.must_include_events.length).toBeGreaterThanOrEqual(3);
    expect(vc?.next_episode_brief?.episode_no).toBe(2);
    expect(vc?.prev_episode_brief).toBeNull();
    expect(vc?.foreshadows_seeded_here.length).toBeGreaterThanOrEqual(1);
  });

  it("loadVolumeContext: 存在しない path / 存在しない ep_no で null/空を返す", async () => {
    await expect(loadVolumeContext("/nonexistent", 1)).resolves.toBeNull();

    const vc = await loadVolumeContext(a07VolPlotPath, 999);
    expect(vc?.current_episode).toBeNull();
    expect(vc?.volume_no).toBe(1);
    expect(vc?.volume_theme.length).toBeGreaterThan(0);
    expect(vc?.foreshadows_seeded_here).toEqual([]);
  });

  it("formatVolumeContextSection: null/空入力で空文字を返す", () => {
    expect(formatVolumeContextSection(null)).toBe("");
    expect(formatVolumeContextSection({
      volume_no: 1,
      volume_theme: "theme",
      current_episode: null,
      prev_episode_brief: null,
      next_episode_brief: null,
      foreshadows_seeded_here: [],
      foreshadows_paid_off_here: [],
    })).toBe("");
  });

  it("formatVolumeContextSection: 主要 section が含まれる", async () => {
    const vc = await loadVolumeContext(a07VolPlotPath, 1);
    const section = formatVolumeContextSection(vc);

    expect(section).toContain("## 巻内位置");
    expect(section).toContain("### 当 episode の役割");
    expect(section).toContain(vc?.current_episode?.must_include_events[0]);
  });

  it("buildSceneCandidatePrompt: volumeContext 引数あり/なしで行が増減する", async () => {
    const vc = await loadVolumeContext(a07VolPlotPath, 1);
    const baseSlot = slot();
    const context = {
      slug: "a07-modern-dungeon",
      episode: 1,
      bibleSnapshotPath: "bible.json",
      briefPath: "_brief.v2.md",
      volumePlotPath: a07VolPlotPath,
      finalizedScenes: [],
    };
    const bc = bibleContext();

    const without = buildSceneCandidatePrompt(baseSlot, context, 5, bc);
    const withContext = buildSceneCandidatePrompt(baseSlot, context, 5, bc, undefined, vc);

    expect(without).not.toContain("## 巻内位置");
    expect(withContext).toContain("## 巻内位置");
    expect(withContext).toContain(vc?.current_episode?.theme);
    expect(withContext).toContain("## scene slot");
    expect(withContext).toContain("## bible 抜粋");
    expect(withContext).toContain("## 指示");
  });

  it("buildPairwisePrompt / buildAnchorComparePrompt も vc 渡しで巻内位置が追加される", async () => {
    const vc = await loadVolumeContext(a07VolPlotPath, 1);
    const pairwiseWithout = buildPairwisePrompt(scene(), scene({ key_visual_intent: "別案" }), 0, 1);
    const pairwiseWith = buildPairwisePrompt(scene(), scene({ key_visual_intent: "別案" }), 0, 1, vc);
    const anchorWithout = buildAnchorComparePrompt(scene(), "battle_dungeon", [
      { anchor: { anchorId: "a1", ncode: "N1", title: "A", band: "hit", globalPoint: 1000, episodes: 10 }, layer3: "anchor text" },
    ]);
    const anchorWith = buildAnchorComparePrompt(scene(), "battle_dungeon", [
      { anchor: { anchorId: "a1", ncode: "N1", title: "A", band: "hit", globalPoint: 1000, episodes: 10 }, layer3: "anchor text" },
    ], vc);

    expect(pairwiseWithout).not.toContain("## 巻内位置");
    expect(pairwiseWith).toContain("## 巻内位置");
    expect(anchorWithout).not.toContain("## 巻内位置");
    expect(anchorWith).toContain("## 巻内位置");
  });
});
