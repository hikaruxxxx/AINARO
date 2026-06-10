/**
 * Intensity Propagation: L02b beat → scene → panel への感情強度伝播。
 *
 * 2026-05-20 S1 Domain C (品質ガード) で追加。
 *
 * 既存問題:
 * - L02b の beats[].emotional_intensity (0-1) は存在するが、scene → panel まで降りない
 * - storyboard.json の panels[].emotional_intensity が全 0.00 のまま
 * - 結果として「page 単位の感情曲線」を機械測定できない (audit-emotional-amplitude が
 *   検査できない)
 *
 * 本モジュールは以下の段階で intensity を伝播する:
 *   1. scene.scene_emotion.intensity が明示されていればそれを採用
 *   2. ない場合: scene.page_range に重なる episode.beats[] のうち最大 intensity を採用
 *   3. panel が属する scene の intensity を基本値とし、direction に応じて
 *      scene 内の panel index で微調整する (rise: 増加、fall: 減少、shock: spike、etc)
 *
 * 詳細: /Users/hikarumori/.claude/plans/10-90-codex-wild-goblet.md Section 5.2
 */
import type { EpisodeBeat, SceneSkeleton, SceneEmotion, VolumeEpisodePlan } from "./volume-plot";
import type { PanelV2, StoryboardPageV2 } from "../schemas-v2";

export type PanelIntensityResult = {
  panel_no: number;
  page_no: number;
  scene_id: string | null;
  intensity: number;
};

export type ScenePropagatedEmotion = {
  scene_id: string;
  page_range: [number, number];
  intensity: number;
  direction: SceneEmotion["direction"];
  source: "scene_emotion_explicit" | "beat_max_in_range" | "fallback_default";
};

/**
 * scene ごとに intensity を確定する。
 * - scene.scene_emotion があればそれを使う (source="scene_emotion_explicit")
 * - なければ episode.beats の page_range 重なりで最大 intensity を採用 (source="beat_max_in_range")
 * - どれも該当しない場合 0.5 を fallback (source="fallback_default")
 */
export function resolveSceneIntensities(args: {
  scenes: SceneSkeleton[];
  beats: EpisodeBeat[];
  pageTarget: number;
}): ScenePropagatedEmotion[] {
  return args.scenes.map((scene) => {
    if (scene.scene_emotion) {
      return {
        scene_id: scene.scene_id,
        page_range: scene.page_range,
        intensity: clamp01(scene.scene_emotion.intensity),
        direction: scene.scene_emotion.direction,
        source: "scene_emotion_explicit",
      };
    }
    // beat の page_range 重なりを推定する。
    // beats[] は page を直接持たないため、beat_idx から episode 内の相対位置を推定する。
    const sceneCenterPage = (scene.page_range[0] + scene.page_range[1]) / 2;
    const sceneCenterPct = args.pageTarget > 0 ? sceneCenterPage / args.pageTarget : 0;
    const beatCount = Math.max(1, args.beats.length);
    // 各 beat に均等な page 範囲を仮定し、scene center が属する beat を求める
    const beatIdxFloat = sceneCenterPct * beatCount;
    const beatIdx = Math.min(
      args.beats.length - 1,
      Math.max(0, Math.floor(beatIdxFloat)),
    );
    const beat = args.beats[beatIdx];
    const intensity = beat?.emotional_intensity ?? 0.5;
    const direction = deriveDirectionFromBeatLabel(beat?.label);
    return {
      scene_id: scene.scene_id,
      page_range: scene.page_range,
      intensity: clamp01(intensity),
      direction,
      source: beat ? "beat_max_in_range" : "fallback_default",
    };
  });
}

/**
 * panel ごとに intensity を伝播する。
 * - scene 単位の intensity が基本値
 * - panel が scene 内のどの位置 (序盤/中盤/終盤) かと direction から微調整
 *
 *   - rise:    序盤 -0.1 → 終盤 +0.1
 *   - fall:    序盤 +0.1 → 終盤 -0.1
 *   - hold:    全 panel intensity (±0)
 *   - shock:   scene 内の任意の 1 panel に +0.15、他は基本値
 *   - release: scene 内の最終 panel に -0.15、他は基本値
 */
export function propagatePanelIntensities(args: {
  scenes: ScenePropagatedEmotion[];
  pages: StoryboardPageV2[];
}): PanelIntensityResult[] {
  const results: PanelIntensityResult[] = [];

  // 各 page を 1 つの scene に紐付け (page_no が scene.page_range に含まれるなら)
  const pageToScene = new Map<number, ScenePropagatedEmotion>();
  for (const page of args.pages) {
    const scene = args.scenes.find(
      (s) => page.page_no >= s.page_range[0] && page.page_no <= s.page_range[1],
    );
    if (scene) pageToScene.set(page.page_no, scene);
  }

  for (const page of args.pages) {
    const scene = pageToScene.get(page.page_no);
    if (!scene) {
      // scene 紐付けできない page は 0.5 fallback
      for (const panel of page.panels) {
        results.push({
          panel_no: panel.panel_no,
          page_no: page.page_no,
          scene_id: null,
          intensity: 0.5,
        });
      }
      continue;
    }
    const base = scene.intensity;
    const totalPanelsInScene = countPanelsInScene(args.pages, scene.page_range);
    const sceneStartPanelIdx = panelIndexInScene(
      args.pages,
      scene.page_range,
      page.page_no,
      page.panels[0]?.panel_no ?? 0,
    );

    page.panels.forEach((panel, panelIdxInPage) => {
      const globalIdx = sceneStartPanelIdx + panelIdxInPage;
      const positionPct = totalPanelsInScene > 1
        ? globalIdx / (totalPanelsInScene - 1)
        : 0.5;
      const adjusted = applyDirectionAdjustment(base, scene.direction, positionPct, globalIdx, totalPanelsInScene);
      results.push({
        panel_no: panel.panel_no,
        page_no: page.page_no,
        scene_id: scene.scene_id,
        intensity: clamp01(adjusted),
      });
    });
  }

  return results;
}

/**
 * 完全パイプライン: episode の beats + scenes + storyboard を渡し、panel intensity を埋めて返す。
 * 副作用なし: 結果 list を返すので、呼出側で panels[].emotional_intensity に代入する。
 */
export function propagateIntensityForEpisode(args: {
  episode: VolumeEpisodePlan;
  storyboard: { pages: StoryboardPageV2[] };
}): {
  scenes: ScenePropagatedEmotion[];
  panels: PanelIntensityResult[];
} {
  const scenes = resolveSceneIntensities({
    scenes: args.episode.scenes ?? [],
    beats: args.episode.beats,
    pageTarget: args.episode.page_target,
  });
  const panels = propagatePanelIntensities({
    scenes,
    pages: args.storyboard.pages,
  });
  return { scenes, panels };
}

/**
 * 副作用版: storyboard.pages[].panels[].emotional_intensity を破壊的に埋める。
 * 既存 emotional_intensity > 0 の panel は上書きしない (LLM 出力を尊重)。
 */
export function applyIntensityInPlace(args: {
  episode: VolumeEpisodePlan;
  storyboard: { pages: StoryboardPageV2[] };
  /** true: 既存 intensity を上書き、false (既定): 0 / undefined のみ埋める */
  overwrite?: boolean;
}): { filled: number; skipped: number; total: number } {
  const overwrite = args.overwrite ?? false;
  const { panels } = propagateIntensityForEpisode(args);
  const panelMap = new Map<string, number>();
  for (const p of panels) {
    panelMap.set(`${p.page_no}/${p.panel_no}`, p.intensity);
  }
  let filled = 0;
  let skipped = 0;
  let total = 0;
  for (const page of args.storyboard.pages) {
    for (const panel of page.panels) {
      total++;
      const key = `${page.page_no}/${panel.panel_no}`;
      const newIntensity = panelMap.get(key);
      if (newIntensity === undefined) {
        skipped++;
        continue;
      }
      const current = panel.emotional_intensity;
      if (!overwrite && typeof current === "number" && current > 0) {
        skipped++;
        continue;
      }
      panel.emotional_intensity = newIntensity;
      filled++;
    }
  }
  return { filled, skipped, total };
}

// --- 内部ヘルパー ---

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0.5;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function deriveDirectionFromBeatLabel(
  label: EpisodeBeat["label"] | undefined,
): SceneEmotion["direction"] {
  switch (label) {
    case "hook":
      return "shock";
    case "buildup":
      return "rise";
    case "turn":
      return "shock";
    case "climax":
      return "rise";
    case "resolution":
      return "fall";
    case "cliffhanger":
      return "shock";
    default:
      return "hold";
  }
}

function countPanelsInScene(
  pages: StoryboardPageV2[],
  pageRange: [number, number],
): number {
  let count = 0;
  for (const page of pages) {
    if (page.page_no >= pageRange[0] && page.page_no <= pageRange[1]) {
      count += page.panels.length;
    }
  }
  return Math.max(1, count);
}

function panelIndexInScene(
  pages: StoryboardPageV2[],
  pageRange: [number, number],
  currentPage: number,
  _firstPanelNo: number,
): number {
  let idx = 0;
  for (const page of pages) {
    if (page.page_no >= pageRange[0] && page.page_no < currentPage) {
      idx += page.panels.length;
    }
  }
  return idx;
}

function applyDirectionAdjustment(
  base: number,
  direction: SceneEmotion["direction"],
  positionPct: number,
  globalIdx: number,
  totalPanels: number,
): number {
  switch (direction) {
    case "rise":
      // -0.1 → +0.1
      return base + (positionPct - 0.5) * 0.2;
    case "fall":
      // +0.1 → -0.1
      return base + (0.5 - positionPct) * 0.2;
    case "hold":
      return base;
    case "shock": {
      // 中央 panel に +0.15、他は base
      const centerIdx = Math.floor(totalPanels / 2);
      return globalIdx === centerIdx ? base + 0.15 : base;
    }
    case "release": {
      // 最終 panel に -0.15、他は base
      return globalIdx === totalPanels - 1 ? base - 0.15 : base;
    }
    default:
      return base;
  }
}
