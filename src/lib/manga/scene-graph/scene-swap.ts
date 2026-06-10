/**
 * Scene Swap (Phase β B5-2/3)
 *
 * scene-graph 上で特定の scene 範囲を別 pattern で再生成して置換する操作。
 * L4-1 (opening hook) と L4-9 (cliffhanger) の panel-level merge を撤回し、
 * 物語論理の中間表現 = scene-graph 上で swap を行うことで panel patch 衝突を解消する。
 *
 * 仕様: docs/plans/manga/scene-graph-l3-5.md "9. L4-1 / L4-9 を scene swap に格上げる"
 *
 * B5-2 (本ファイル): pure swap 操作 + opening-hook パターン経由の再生成 skeleton。
 * B5-3: cliffhanger 用の規格化 (本ファイル swapScenes を流用)。
 */

import type { Scene, SceneGraphV1 } from "./schema";
import { runTier1, type GenerationContext, type ScoringLoopConfig } from "./scoring-loop";

// ============================================================================
// Pure swap operation
// ============================================================================

export type SceneSwapRange = {
  /** swap 対象の最初の scene_id (含む) */
  start_scene_id: string;
  /** swap 対象の最後の scene_id (含む) */
  end_scene_id: string;
};

/**
 * scene-graph 内で `range` の scene 列を `newScenes` に置換する。
 * prev/next リンクと scene_no を再採番し、新 scene-graph を返す。
 *
 * 制約:
 *   - 入力 newScenes は range 範囲の page_range / panel_range を維持していること
 *   - newScenes 各要素の scene_id / scene_no は本関数で再採番される
 *   - swap 後は呼び出し側で validateSceneGraph を必ず走らせること
 */
export function swapScenes(
  sceneGraph: SceneGraphV1,
  range: SceneSwapRange,
  newScenes: Omit<Scene, "scene_id" | "scene_no" | "prev_scene_id" | "next_scene_id">[]
): SceneGraphV1 {
  const startIdx = sceneGraph.scenes.findIndex((s) => s.scene_id === range.start_scene_id);
  const endIdx = sceneGraph.scenes.findIndex((s) => s.scene_id === range.end_scene_id);
  if (startIdx < 0 || endIdx < 0 || startIdx > endIdx) {
    throw new Error(
      `[scene-swap] invalid range: start=${range.start_scene_id} (idx=${startIdx}), end=${range.end_scene_id} (idx=${endIdx})`
    );
  }

  const before = sceneGraph.scenes.slice(0, startIdx);
  const after = sceneGraph.scenes.slice(endIdx + 1);
  const newSceneId = (i: number): string => `S${String(i + 1).padStart(2, "0")}`;

  // 新 scene 列に scene_id / scene_no / prev/next を採番
  const renumbered: Scene[] = [];
  const allBuilt: Array<Omit<Scene, "prev_scene_id" | "next_scene_id">> = [
    ...before.map((s) => ({ ...s })),
    ...newScenes.map((ns, i) => ({
      ...ns,
      scene_id: "", // 後で fill
      scene_no: 0,
    })),
    ...after.map((s) => ({ ...s })),
  ];
  for (let i = 0; i < allBuilt.length; i++) {
    const id = newSceneId(i);
    allBuilt[i].scene_id = id;
    allBuilt[i].scene_no = i + 1;
  }
  for (let i = 0; i < allBuilt.length; i++) {
    const prev = i === 0 ? null : allBuilt[i - 1].scene_id;
    const next = i === allBuilt.length - 1 ? null : allBuilt[i + 1].scene_id;
    renumbered.push({
      ...allBuilt[i],
      prev_scene_id: prev,
      next_scene_id: next,
    });
  }

  return {
    ...sceneGraph,
    scenes: renumbered,
    generated_at: new Date().toISOString(),
  };
}

// ============================================================================
// Opening hook 再生成 (B5-2)
// ============================================================================

export type OpeningHookSwapResult = {
  scene_graph: SceneGraphV1;
  swapped_range: SceneSwapRange;
  pattern_id: string;
  candidates_per_scene: number;
};

/**
 * opening-hook pattern に従って scene-graph 冒頭 (S01-S0N) を再生成する。
 *
 * 流れ:
 *   1. range 内の各 scene に対して runTier1 で候補生成 → 採用 (B3 採点ループ)
 *   2. 生成された scene 列で swapScenes 実行
 *   3. validateSceneGraph で検証 (B5-1)
 *   4. 結果を返す
 *
 * 注意:
 *   - opening-hook pattern (data/generation/opening-hook-patterns.json) の panel-level 構造は
 *     生成 prompt のヒントとして渡すのみ。scene-graph 上では beat_type / mode / page_budget で再表現する
 *   - L4 storyboard (B5-5) が新 scene-graph から panel を再展開する責任
 */
export async function regenerateOpeningHookScenes(
  sceneGraph: SceneGraphV1,
  range: SceneSwapRange,
  patternId: string,
  context: GenerationContext,
  config: ScoringLoopConfig
): Promise<OpeningHookSwapResult> {
  const startIdx = sceneGraph.scenes.findIndex((s) => s.scene_id === range.start_scene_id);
  const endIdx = sceneGraph.scenes.findIndex((s) => s.scene_id === range.end_scene_id);
  if (startIdx < 0 || endIdx < 0 || startIdx > endIdx) {
    throw new Error(`[scene-swap] regenerateOpeningHookScenes: invalid range ${JSON.stringify(range)}`);
  }
  const targetScenes = sceneGraph.scenes.slice(startIdx, endIdx + 1);

  const newScenes: Scene[] = [];
  const finalizedScenes = sceneGraph.scenes.slice(0, startIdx);
  for (const slot of targetScenes) {
    const slotForCtx = {
      scene_id: slot.scene_id,
      scene_no: slot.scene_no,
      prev_scene_id: slot.prev_scene_id,
      next_scene_id: slot.next_scene_id,
      page_range: slot.page_range,
      panel_range: slot.panel_range,
      arc_position: slot.arc_position,
      location_id: slot.location_id,
      sub_locations: slot.sub_locations,
    };
    const ctx: GenerationContext = {
      ...context,
      finalizedScenes,
    };
    // pattern_id は B5-2 段階では runTier1 内部で参照されない (将来 wire の拡張ポイント)。
    // 採用後の scene の layout_pattern_id に明示的に書き込み、L4 panel 化で参照させる。
    const t1 = await runTier1(slotForCtx, ctx, config);
    const adopted: Scene = {
      ...t1.selected,
      layout_pattern_id: t1.selected.layout_pattern_id ?? patternId,
    };
    newScenes.push(adopted);
    finalizedScenes.push(adopted);
  }

  const swapped = swapScenes(
    sceneGraph,
    range,
    newScenes.map(({ scene_id: _id, scene_no: _no, prev_scene_id: _p, next_scene_id: _n, ...rest }) => rest)
  );

  return {
    scene_graph: swapped,
    swapped_range: range,
    pattern_id: patternId,
    candidates_per_scene: config.candidatesPerScene,
  };
}

// ============================================================================
// Cliffhanger swap (B5-3 placeholder)
// ============================================================================

/**
 * 最終 scene (cliff beat) を pattern に従って再生成する。
 * B5-3 で具体実装。当面は regenerateOpeningHookScenes と同じ構造を呼び分ける形を想定。
 */
export async function regenerateCliffhangerScene(
  sceneGraph: SceneGraphV1,
  patternId: string,
  context: GenerationContext,
  config: ScoringLoopConfig
): Promise<OpeningHookSwapResult> {
  const last = sceneGraph.scenes[sceneGraph.scenes.length - 1];
  if (!last) throw new Error("[scene-swap] empty scene-graph cannot be cliff-swapped");
  if (last.beat_type !== "cliff") {
    throw new Error(
      `[scene-swap] regenerateCliffhangerScene: last scene ${last.scene_id} is not cliff (beat=${last.beat_type})`
    );
  }
  return regenerateOpeningHookScenes(
    sceneGraph,
    { start_scene_id: last.scene_id, end_scene_id: last.scene_id },
    patternId,
    context,
    config
  );
}
