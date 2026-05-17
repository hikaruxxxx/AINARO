/**
 * L3.5 Scene-Graph bootstrap from L2b SceneSkeleton (2026-05-13 物語OS再設計)
 *
 * L02b の VolumePlot.episodes[].scenes (SceneSkeleton[]) を読み取り、
 * scoring-loop 用の slot source となる最小限の SceneGraphV1 を組み立てる。
 *
 * 用途:
 *   1. L03_5 --mode generate の slot source として scene_graph.json を初期化
 *   2. 上流の L2b 設計 (scene_id / page_range / location_id / cast_ids / directing_intent) を
 *      scene-graph に確実に伝播 (LLM 任せにしない)
 *
 * NOTE: 内部フィールド (dialogue_plan, foreshadow_setup, relationship_state_delta 等) は
 *       空 or デフォルト値で埋める。後続の L03_5 --mode generate --live で Codex が肉付けする。
 */
import type {
  VolumePlot,
  VolumeEpisodePlan,
  SceneSkeleton,
  DirectingIntent,
} from "../storyboard-v2/volume-plot";
import type {
  Scene,
  SceneGraphV1,
  ArcPhase,
  BeatType,
  SceneMode,
  CastEntry,
  PresenceMode,
  TimeAxis,
} from "./schema";

/**
 * Bootstrap 用デフォルト値:
 *   - 1 page あたり 5 panel と仮定して panel_range を割当
 *   - L4 で実際の panel 数が決まれば validate で再算出される
 */
const PANELS_PER_PAGE_DEFAULT = 5;

function inferBeatType(di: DirectingIntent | undefined, isLast: boolean): BeatType {
  if (!di) return isLast ? "cliff" : "setup";
  switch (di.kind) {
    case "opening_hook":
      return "introduce";
    case "world_anchor":
      return "setup";
    case "midpoint_turn":
      return "turn";
    case "cliffhanger_setup":
      return "cliff";
    case "final_pull":
      return "cliff";
    case "normal":
    default:
      return isLast ? "cliff" : "setup";
  }
}

function inferSceneMode(di: DirectingIntent | undefined): SceneMode {
  if (!di) return "dialogue";
  switch (di.kind) {
    case "opening_hook":
      return "establishing";
    case "world_anchor":
      return "introspection";
    case "midpoint_turn":
      return "dialogue";
    case "cliffhanger_setup":
      return "action";
    case "final_pull":
      return "silence";
    case "normal":
    default:
      return "dialogue";
  }
}

/** volume_position (L2b) → arc_phase (scene-graph) */
function inferArcPhase(volumePosition: VolumeEpisodePlan["volume_position"]): ArcPhase {
  switch (volumePosition) {
    case "opening":
      return "introduce";
    case "rising":
      return "rising";
    case "midpoint":
      return "rising";
    case "falling":
      return "falling";
    case "climax":
      return "climax";
    case "cliffhanger":
      return "resolution";
    default:
      return "introduce";
  }
}

/** time_of_day テキスト → TimeAxis.duration_hint の素朴な近似 */
function inferTimeAxis(timeOfDay: string, sceneNo: number): TimeAxis {
  const lower = timeOfDay ?? "";
  let duration: TimeAxis["duration_hint"] = "minutes";
  if (/(夜明け前|早朝|朝|昼|正午|夕方|夕|夜|深夜)/.test(lower)) {
    duration = "minutes";
  } else if (/(翌日|数日|週)/.test(lower)) {
    duration = "day_boundary";
  } else if (/(瞬間|一瞬)/.test(lower)) {
    duration = "moments";
  }
  return {
    label: timeOfDay || "unspecified",
    order: sceneNo,
    is_flashback: false,
    is_flashforward: false,
    duration_hint: duration,
  };
}

function buildCast(castIds: string[]): CastEntry[] {
  return castIds.map(
    (id): CastEntry => ({
      character_id: id,
      presence: "in_person" as PresenceMode,
    }),
  );
}

/** key_visual_intent の決定: directing_intent.key_visual > skeleton.key_action */
function pickKeyVisualIntent(skeleton: SceneSkeleton): string {
  const di = skeleton.directing_intent;
  if (di && (di.kind === "opening_hook" || di.kind === "final_pull")) {
    return di.kind === "opening_hook" ? di.key_visual : di.pull_visual;
  }
  return skeleton.key_action ?? skeleton.purpose ?? "";
}

/**
 * L2b SceneSkeleton[] を scoring-loop slot source の Scene[] に変換する。
 * dialogue_plan / foreshadow_setup 等は空でセットし、後続 LIVE 採点で肉付けする想定。
 */
export function bootstrapScenesFromSkeleton(
  skeletons: SceneSkeleton[],
  context: {
    volumeNo: number;
    episodeNo: number;
    volumePosition: VolumeEpisodePlan["volume_position"];
    protagonistArc: VolumeEpisodePlan["protagonist_arc"];
  },
): Scene[] {
  const total = skeletons.length;
  return skeletons.map((sk, idx): Scene => {
    const isLast = idx === total - 1;
    const sceneId = `S${String(sk.scene_no).padStart(2, "0")}`;
    const prevId = idx > 0 ? `S${String(skeletons[idx - 1].scene_no).padStart(2, "0")}` : null;
    const nextId = idx < total - 1 ? `S${String(skeletons[idx + 1].scene_no).padStart(2, "0")}` : null;
    const pageStart = sk.page_range[0];
    const pageEnd = sk.page_range[1];
    const pageCount = Math.max(1, pageEnd - pageStart + 1);
    // panel_range: 全話通算の panel_no を仮置き (page_no 起点 × PANELS_PER_PAGE_DEFAULT)
    const startPanelNo = (pageStart - 1) * PANELS_PER_PAGE_DEFAULT + 1;
    const endPanelNo = pageEnd * PANELS_PER_PAGE_DEFAULT;
    const beatType = inferBeatType(sk.directing_intent, isLast);
    const sceneMode = inferSceneMode(sk.directing_intent);

    // protagonist_arc_state: ep の start/turn/end を scene の位置で割当
    const epArc = context.protagonistArc;
    const arcText = idx === 0 ? epArc.start : isLast ? epArc.end : epArc.turn;
    return {
      scene_id: sceneId,
      scene_no: sk.scene_no,
      prev_scene_id: prevId,
      next_scene_id: nextId,
      page_range: { start: pageStart, end: pageEnd },
      panel_range: { start_panel_no: startPanelNo, end_panel_no: endPanelNo },
      arc_position: {
        volume: context.volumeNo,
        episode_in_volume: context.episodeNo,
        arc_phase: inferArcPhase(context.volumePosition),
        arc_position_normalized: total > 1 ? idx / (total - 1) : 0.5,
      },
      beat_type: beatType,
      cast: buildCast(sk.cast_ids),
      dialogue_plan: { key_lines: [] },
      foreshadow_setup: [],
      foreshadow_payoff: [],
      protagonist_arc_state: {
        belief: arcText,
        goal: sk.purpose,
        emotion: "tension",
        delta_from_prev: idx === 0 ? "scene 開始" : skeletons[idx - 1].connection_to_next,
      },
      relationship_state_delta: [],
      time_axis: inferTimeAxis(sk.time_of_day, sk.scene_no),
      location_id: sk.location_id,
      sub_locations: [],
      page_budget: { min: pageCount, max: pageCount, preferred: pageCount },
      mode: sceneMode,
      turn_anchor: { at_panel_no: null, type: beatType === "turn" ? "reveal_turn" : "none" },
      layout_pattern_id: null,
      subtype_directive: { external_social: false, gacha_ui: false, hybrid: false },
      render_strategy: "page_one_shot",
      key_visual_intent: pickKeyVisualIntent(sk),
      // E 系: directing_intent を skeleton から継承
      directing_intent: sk.directing_intent,
    };
  });
}

/**
 * VolumePlot から指定 episode の SceneSkeleton[] を取り出し、
 * 完全な SceneGraphV1 オブジェクトを bootstrap する。
 */
export function bootstrapSceneGraphFromVolumePlot(args: {
  volumePlot: VolumePlot;
  episodeNo: number;
  bibleSnapshotPath: string;
  briefPath: string;
  shotlistPath: string;
}): SceneGraphV1 {
  const ep = args.volumePlot.episodes.find((e) => e.episode_no === args.episodeNo);
  if (!ep) {
    throw new Error(
      `bootstrap: volume_plot に episode_no=${args.episodeNo} が見つかりません (vol=${args.volumePlot.volume_no})`,
    );
  }
  if (!ep.scenes || ep.scenes.length === 0) {
    throw new Error(
      `bootstrap: ep${args.episodeNo} に scenes (L2b skeleton) がありません。L02b --phase=volume で再生成してください`,
    );
  }
  const scenes = bootstrapScenesFromSkeleton(ep.scenes, {
    volumeNo: args.volumePlot.volume_no,
    episodeNo: args.episodeNo,
    volumePosition: ep.volume_position,
    protagonistArc: ep.protagonist_arc,
  });
  // pull_link 型は schemas-v2 と scene-graph で is_volume_end の optional 性が異なるため正規化
  const pullLink = ep.pull_link
    ? {
        current_episode_cliff: ep.pull_link.current_episode_cliff,
        next_opening_hook_hint: ep.pull_link.next_opening_hook_hint,
        is_volume_end: ep.pull_link.is_volume_end ?? false,
        next_volume_teaser: ep.pull_link.next_volume_teaser,
      }
    : undefined;
  return {
    schema_version: 1,
    episode_id: `${args.volumePlot.slug}-ep${String(args.episodeNo).padStart(2, "0")}`,
    scenes,
    pull_link: pullLink,
    generated_at: new Date().toISOString(),
    source: {
      brief_path: args.briefPath,
      shotlist_path: args.shotlistPath,
      bible_snapshot_path: args.bibleSnapshotPath,
      volume_plot_path: `volumes/v${String(args.volumePlot.volume_no).padStart(2, "0")}/plot.json`,
    },
    _note:
      "Bootstrap from L2b SceneSkeleton (2026-05-13). dialogue_plan / foreshadow / relationship_delta は空。L03_5 --mode generate --live で肉付け推奨。",
  };
}
