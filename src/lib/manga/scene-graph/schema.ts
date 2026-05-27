/**
 * L3.5 Scene-Graph Schema (Phase β B2)
 *
 * 物語論理 × 頁演出 × 評価選別の交差ハブ。
 * pipeline-v2 の L3 (Shotlist) と L4 (Storyboard) の間に新設される中間表現。
 *
 * 仕様: docs/plans/manga/scene-graph-l3-5.md
 *
 * 依存禁止:
 *   - panel.entities.location_id / characters は scene から継承される (panel で書き換え禁止)
 *   - cliffhanger 等の scene_exclusive 台詞は所有 scene 以外で書けない
 *   - cast は brief.cast の subset でなければならない (氷室 ep01 不在のような ep level 制約)
 */

import type { BibleSnapshotV2 } from "../schemas-v2";
import type { EpisodeSpine } from "../storyboard-v2/episode-spine";
import type { DirectingIntent, SceneEmotion } from "../storyboard-v2/volume-plot";

// ============================================================================
// Schema Version
// ============================================================================

export const SCENE_GRAPH_SCHEMA_VERSION = 1 as const;

// ============================================================================
// Top-Level Document
// ============================================================================

export type SceneGraphV1 = {
  schema_version: 1;
  episode_id: string;
  scenes: Scene[];
  episode_metrics?: EpisodeMetrics;
  pull_link?: PullLink;
  generated_at: string; // ISO8601
  source: {
    brief_path: string;
    shotlist_path: string;
    bible_snapshot_path: string;
    /** 巻全体 plot からの位置参照 (任意、cross-volume validator で利用) */
    volume_plot_path?: string;
  };
  /** 開発時の自由メモ。本番生成では空が望ましい */
  _note?: string;
};

// ============================================================================
// Scene
// ============================================================================

export type Scene = {
  // === 識別 ===
  scene_id: string; // "S01", "S02", ...
  scene_no: number;
  prev_scene_id: string | null;
  next_scene_id: string | null;
  page_range: { start: number; end: number };
  panel_range: { start_panel_no: number; end_panel_no: number };

  // === A 系: 物語論理 ===
  arc_position: ArcPosition;
  beat_type: BeatType;
  cast: CastEntry[];
  dialogue_plan: DialoguePlan;
  foreshadow_setup: ForeshadowSetup[];
  foreshadow_payoff: string[]; // setup 側の token を回収
  protagonist_arc_state: ProtagonistArcState;
  relationship_state_delta: RelationshipDelta[];
  time_axis: TimeAxis;

  // === B 系: 頁演出 ===
  location_id: string;
  sub_locations?: string[];
  page_budget: PageBudget;
  mode: SceneMode;
  turn_anchor: TurnAnchor;
  layout_pattern_id: string | null;
  subtype_directive: SubtypeDirective;
  render_strategy: RenderStrategy;
  render_constraints?: RenderConstraints;
  key_visual_intent: string;

  // === C 系: 選別ループ (B3 採点後に充填) ===
  selection?: SceneSelection;

  // === D 系: bible 伝搬軸 (Phase 4 新設、すべて optional でローンチ) ===
  wardrobe_state?: Array<{
    character_id: string; // bible.characters[].id
    costume_id: string; // bible.costumes[].id (active range 内)
  }>;
  visual_motif_anchors?: Array<{
    motif_id: string; // bible.visual_motifs[].id (or name)
    intensity: "subtle" | "clear" | "dominant";
  }>;
  world_rules_active?: string[]; // bible.world.rules[] の subset
  props_in_play?: Array<{
    prop_id: string; // bible.props[].id
    held_by?: string; // bible.characters[].id (任意)
  }>;
  theme_subtext?: {
    theme_id: string; // bible.themes_and_subtexts[].id (Phase 3 完了前提)
    how_it_surfaces: string;
  } | null;
  attribute_tags_focus?: Record<string, string[]>; // character_id → active tags
  panel_archetype_hint?: string | null; // bible.visual_grammar.panel_archetypes[].id (Phase 3 完了前提)
  cliffhanger_pattern?: string | null; // bible.genre_grammar.cliffhanger_palette[].id (Phase 3 完了前提)
  voice_bible_active_traits?: Record<
    string,
    {
      characteristic_phrase?: string;
      speech_register?: string;
    }
  >;

  // === E 系: L2b directing_intent 継承 (Phase 物語OS再設計、optional) ===
  /**
   * L2b SceneSkeleton.directing_intent をそのまま継承する。
   * 通常は L3.5 scoring-loop が scene_id 一致から自動コピーする。
   *   - opening_hook: 当 scene の最初 panel に narration_lines / key_visual を強制反映
   *   - world_anchor: 当 scene のいずれかの panel に target_facts のナレを必須配置
   *   - midpoint_turn: scene 末で reveal を panel 化
   *   - cliffhanger_setup: scene 内で build_up を段階展開
   *   - final_pull: 最終 panel に pull_visual と次話 hook を配置
   */
  directing_intent?: DirectingIntent;

  scene_emotion?: SceneEmotion;
  reader_state_after?: {
    knows: string[];
    feels: string;
    questions: string[];
    attachments: string[];
  };
  /** 1 scene に複数イベントが同居する可能性 (ep01 S05/S06 で payback + title_anchor 等) に備え配列化 */
  episode_spine_links?: Array<{
    event_kind: "humiliation" | "secret_or_treasure" | "awakening" | "payback" | "title_anchor";
    expected_page: number;
    expected_intensity_target?: number;
  }>;
  /** plot.json の SceneSkeleton.primary_channels をそのまま継承 */
  primary_channels?: string[];
};

// ============================================================================
// A 系: 物語論理
// ============================================================================

export type ArcPosition = {
  volume: number;
  episode_in_volume: number;
  arc_phase: ArcPhase;
  /** 0..1, volume 全体での相対位置 */
  arc_position_normalized: number;
};

export type ArcPhase =
  | "introduce"
  | "rising"
  | "climax"
  | "falling"
  | "resolution";

export type BeatType =
  | "introduce"
  | "setup"
  | "reveal"
  | "turn"
  | "payoff"
  | "cliff"
  | "aftermath"
  | "transition";

export type CastEntry = {
  character_id: string;
  presence: PresenceMode;
};

export type PresenceMode =
  /** 対面 */
  | "in_person"
  /** 声のみ (ナビ響など) */
  | "voice_off"
  /** テレビ越し (灯里のニュース) */
  | "tv"
  /** スマホ画面越し */
  | "phone_screen"
  /** 主人公の回想内 */
  | "memory"
  /** モニター/ログ等の静止画/記録として登場 (cross-cut 等) */
  | "log_visual";

export type DialoguePlan = {
  key_lines: KeyLine[];
};

export type KeyLine = {
  speaker: string;
  text: string;
  uniqueness: "scene_exclusive" | "may_repeat";
  intent: "establish" | "hook" | "reveal" | "cliff" | "callback";
};

export type ForeshadowSetup = {
  /** 命名規則: F_<topic>_<detail> 例: F_navi_xp_multiplier_condition */
  token: string;
  payoff_episode_hint: PayoffEpisodeHint;
};

export type PayoffEpisodeHint =
  | "this_episode"
  | "next_episode"
  | "later_in_volume"
  | "cross_volume";

export type ProtagonistArcState = {
  belief: string;
  goal: string;
  emotion: ProtagonistEmotion;
  delta_from_prev: string;
};

export type ProtagonistEmotion =
  | "despair"
  | "resignation"
  | "curiosity"
  | "determination"
  | "fear"
  | "elation"
  | "tension"
  | "calm";

export type RelationshipDelta = {
  /** [character_id, character_id] アルファベット順で正規化 */
  pair: [string, string];
  direction: RelationshipDirection;
  /** -2..+2 */
  intensity: number;
  trigger: string;
};

export type RelationshipDirection =
  | "closer"
  | "farther"
  | "tense"
  | "trust+"
  | "trust-"
  | "rival+"
  | "unchanged";

export type TimeAxis = {
  label: string;
  /** episode 内の時系列 order (整数、flashback は負、flashforward は大値) */
  order: number;
  is_flashback: boolean;
  is_flashforward: boolean;
  duration_hint: "moments" | "minutes" | "hours" | "day_boundary";
};

// ============================================================================
// B 系: 頁演出
// ============================================================================

export type PageBudget = {
  min: number;
  max: number;
  preferred: number;
};

export type SceneMode =
  | "silence"
  | "dialogue"
  | "action"
  | "introspection"
  | "external_social"
  | "transition_montage"
  | "establishing";

export type TurnAnchor = {
  /** L4 panel 化後にバインド (B5 以降)。B2 段階では null */
  at_panel_no: number | null;
  type: "reveal_turn" | "cliff_turn" | "tension_turn" | "none";
};

export type SubtypeDirective = {
  external_social: boolean;
  gacha_ui: boolean;
  hybrid: boolean;
};

export type RenderStrategy = "page_one_shot" | "panel_composite";

export type RenderConstraints = {
  /** 1ページあたりの最小吹き出し数 (speech bubble + inner thought + SFX 合算)。default 8 */
  bubble_density_min?: number;
  /** 1ページ内 panel area の分散度 (max area - min area) / max area。default 0.5 (即ち 50% 以上のサイズ差) */
  panel_size_variance_min?: number;
  /** 1ページあたりの TAME パネル最小数 (background なし or pure object) default 1 */
  tame_panel_count_min?: number;
};

// ============================================================================
// C 系: 選別ループ
// ============================================================================

export type SceneSelection = {
  tier: 1 | 2 | 3;
  iterations: number;
  candidate_count: number;
  pairwise_score: number;
  predict_hit: { v12_ep1: number; v12_longform: number; ensemble: number };
  anchor_diff: {
    top3_anchor_ids: string[];
    cosine_avg: number;
    /** 0..1, anchor との absolute 品質採点 */
    llm_score: number;
  };
  template_collision: {
    collision_rate: number;
    nearest_template: string | null;
  };
  decision_log: {
    selected_at: string;
    tier3_human_decision?: string;
  };
};

// ============================================================================
// Episode Metrics (B4 で充填)
// ============================================================================

export type EpisodeMetrics = {
  pattern_match: { matched_pattern_id: string; distance: number };
  template_collision_avg: number;
  foreshadow_dag: ForeshadowDag;
  pacing_curve: { in_anchor_range: boolean; deviation_score: number };
  /** 巻終了到達点との一致 */
  relationship_terminal_consistency: boolean;
};

export type ForeshadowDag = {
  setup_count: number;
  payoff_count: number;
  /** 同 episode 内 setup で payoff されなかった token (warnings 候補) */
  orphan_setups: string[];
  /** setup されずに payoff されている token (errors) */
  payoff_without_setup: string[];
  /** payoff_episode_hint == "next_episode" 等で別 ep 待ちの token */
  pending_cross_episode: { token: string; expected_in: PayoffEpisodeHint }[];
};

export type PullLink = {
  current_episode_cliff: string;
  next_opening_hook_hint: string;
  is_volume_end: boolean;
};

// ============================================================================
// Episode Brief (B2 で必要、簡易型)
// ============================================================================

/**
 * episodes/epNN/_brief.v2.md から抽出する cast 制約や must_include_events。
 * 完全な brief schema は L02b 等で別途定義済み。ここでは validator 入力用の minimal subset。
 */
export type EpisodeBriefMinimal = {
  episode_id: string;
  cast: string[]; // character_id[]
  must_include_events?: string[];
  page_target?: number;
};

// ============================================================================
// Validator
// ============================================================================

export type ValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

export type RenderConstraintPageStats = {
  page_no: number;
  /** dialogue + monologue(inner thought) + sfx count for the page */
  bubble_count?: number;
  /** (max panel area - min panel area) / max panel area */
  panel_size_variance?: number;
  /** background なし or pure object panel count */
  tame_panel_count?: number;
};

/**
 * Scene-graph 全体を検証する。
 * Rule 1-22 の実装は scene-graph-l3-5.md "5. validator" 章を参照。
 * (Rule 21/22 は S1 codex-compressed-marshmallow plan で追加、SSoT 更新待ち)
 */
export function validateSceneGraph(
  sceneGraph: SceneGraphV1,
  bible: BibleSnapshotV2,
  brief: EpisodeBriefMinimal,
  options?: {
    totalPages?: number;
    totalPanels?: number;
    /** 当 episode の volume foreshadow_map (seed/payoff 件数整合の coarse check 用) */
    volumeForeshadowMap?: Array<{
      seed_in_episode: number;
      payoff_in_episode: number;
      description: string;
    }>;
    /** validateSceneGraph 内で「当 episode の episode_no」を解決するための番号。
        指定なしなら sceneGraph.scenes[0].arc_position.episode_in_volume を fallback。 */
    episodeNo?: number;
    /** storyboard/page_plan から呼び出し側が計算した page-level stats。未指定なら Rule 16-18 は deferred として skip。 */
    renderConstraintPageStats?: RenderConstraintPageStats[];
    /** 当 episode の episode_spine。Rule 22 の ep1 spine 欠落検査で利用。 */
    episodeSpine?: EpisodeSpine;
  }
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const charSet = new Set(bible.characters.map((c) => c.id));
  const locSet = new Set(bible.locations.map((l) => l.id));
  const briefCastSet = new Set(brief.cast);
  const sceneIdSet = new Set(sceneGraph.scenes.map((s) => s.scene_id));
  const renderConstraintPageStats = options?.renderConstraintPageStats
    ? new Map(options.renderConstraintPageStats.map((stats) => [stats.page_no, stats]))
    : null;

  // === Rule 1: scene.location_id ⊂ bible.locations ===
  // === Rule 2: scene.cast ⊂ bible.characters かつ ⊂ brief.cast ===
  // === Rule 3: dialogue_plan.key_lines[].speaker ⊂ scene.cast ===
  // === Rule 4: scene_exclusive text は所有 scene 以外で再出現不可 ===
  const keyLineTextScenes = new Map<
    string,
    Map<string, { scene_id: string; hasSceneExclusive: boolean }>
  >();
  for (const scene of sceneGraph.scenes) {
    for (const kl of scene.dialogue_plan.key_lines) {
      if (!kl.text) continue;
      const scenesForText = keyLineTextScenes.get(kl.text) ?? new Map();
      const entry = scenesForText.get(scene.scene_id) ?? {
        scene_id: scene.scene_id,
        hasSceneExclusive: false,
      };
      if (kl.uniqueness === "scene_exclusive") {
        entry.hasSceneExclusive = true;
      }
      scenesForText.set(scene.scene_id, entry);
      keyLineTextScenes.set(kl.text, scenesForText);
    }
  }

  for (const [text, scenesForText] of keyLineTextScenes) {
    if (scenesForText.size <= 1) continue;
    const owner = Array.from(scenesForText.values()).find((entry) => entry.hasSceneExclusive);
    if (!owner) continue;
    for (const sceneEntry of scenesForText.values()) {
      if (sceneEntry.scene_id === owner.scene_id) continue;
      errors.push(
        `scene_exclusive text "${text}" (owned by ${owner.scene_id}) は ${sceneEntry.scene_id} でも出現 (uniqueness 問わず禁止)`
      );
    }
  }

  for (const scene of sceneGraph.scenes) {
    const sid = scene.scene_id;

    // Rule 1
    if (!locSet.has(scene.location_id)) {
      errors.push(`${sid}: unknown location_id "${scene.location_id}"`);
    }
    for (const sub of scene.sub_locations ?? []) {
      if (!locSet.has(sub)) {
        errors.push(`${sid}: unknown sub_location "${sub}"`);
      }
    }

    // Rule 2
    const sceneCastIds = scene.cast.map((c) => c.character_id);
    for (const c of scene.cast) {
      if (!charSet.has(c.character_id)) {
        errors.push(`${sid}: cast has unknown character_id "${c.character_id}"`);
      }
      if (!briefCastSet.has(c.character_id)) {
        errors.push(
          `${sid}: cast member "${c.character_id}" not in brief.cast (episode-level constraint)`
        );
      }
    }

    // Rule 3
    for (const kl of scene.dialogue_plan.key_lines) {
      if (!sceneCastIds.includes(kl.speaker)) {
        errors.push(
          `${sid}: key_line speaker "${kl.speaker}" not in scene.cast`
        );
      }
    }

    // === Rule 12: wardrobe_state 整合 ===
    // scene.wardrobe_state の character_id ⊂ scene.cast、costume_id ⊂ bible.costumes。
    // active range check は episode_no が無いと不可、bible-coverage 側で扱う。
    if (scene.wardrobe_state) {
      for (const ws of scene.wardrobe_state) {
        if (!sceneCastIds.includes(ws.character_id)) {
          errors.push(`${sid}: wardrobe_state.character_id "${ws.character_id}" not in scene.cast`);
        }
        const costume = bible.costumes.find((c) => c.id === ws.costume_id);
        if (!costume) {
          errors.push(`${sid}: wardrobe_state.costume_id "${ws.costume_id}" not in bible.costumes`);
        }
      }
    }

    // === Rule 13: visual_motif_anchors 整合 ===
    // motif_id ⊂ bible.visual_motifs[].id (または .name)。
    if (scene.visual_motif_anchors) {
      const motifIds = new Set(
        bible.visual_motifs.map((m) => {
          const withId = m as typeof m & { id?: string };
          return withId.id ?? m.name;
        })
      );
      for (const anchor of scene.visual_motif_anchors) {
        if (!motifIds.has(anchor.motif_id)) {
          errors.push(`${sid}: visual_motif_anchors.motif_id "${anchor.motif_id}" not in bible.visual_motifs`);
        }
      }
    }

    // === Rule 14: theme_subtext.theme_id 整合 ===
    // Phase 3 前の bible ではフィールド自体が無いので warning に留める。
    if (scene.theme_subtext) {
      const themes =
        (bible as unknown as { themes_and_subtexts?: Array<{ id: string }> }).themes_and_subtexts ?? [];
      if (themes.length > 0 && !themes.some((t) => t.id === scene.theme_subtext!.theme_id)) {
        warnings.push(`${sid}: theme_subtext.theme_id "${scene.theme_subtext.theme_id}" not in bible.themes_and_subtexts`);
      }
    }

    // === Rule 15: props_in_play 整合 ===
    if (scene.props_in_play) {
      const propIds = new Set(bible.props.map((p) => p.id));
      for (const p of scene.props_in_play) {
        if (!propIds.has(p.prop_id)) {
          errors.push(`${sid}: props_in_play.prop_id "${p.prop_id}" not in bible.props`);
        }
        if (p.held_by && !sceneCastIds.includes(p.held_by)) {
          errors.push(`${sid}: props_in_play.held_by "${p.held_by}" not in scene.cast`);
        }
      }
    }

    // === Rule 16: render_constraints.bubble_density_min ===
    // Actual per-page counts require storyboard/page_plan and are supplied by caller.
    if (scene.render_constraints?.bubble_density_min != null) {
      const min = scene.render_constraints.bubble_density_min;
      if (!Number.isFinite(min) || min < 0 || !Number.isInteger(min)) {
        warnings.push(`${sid}: render_constraints.bubble_density_min must be a non-negative integer, got ${min}`);
      } else if (renderConstraintPageStats) {
        for (let pageNo = scene.page_range.start; pageNo <= scene.page_range.end; pageNo++) {
          const bubbleCount = renderConstraintPageStats.get(pageNo)?.bubble_count;
          if (bubbleCount != null && bubbleCount < min) {
            warnings.push(`${sid}: Rule 16 bubble_density_min=${min} unmet on page ${pageNo}: bubble_count=${bubbleCount}`);
          }
        }
      }
    }

    // === Rule 17: render_constraints.panel_size_variance_min ===
    // Actual panel geometry is intentionally deferred unless page stats are supplied.
    if (scene.render_constraints?.panel_size_variance_min != null) {
      const min = scene.render_constraints.panel_size_variance_min;
      if (!Number.isFinite(min) || min < 0 || min > 1) {
        warnings.push(`${sid}: render_constraints.panel_size_variance_min must be between 0 and 1, got ${min}`);
      } else if (renderConstraintPageStats) {
        for (let pageNo = scene.page_range.start; pageNo <= scene.page_range.end; pageNo++) {
          const variance = renderConstraintPageStats.get(pageNo)?.panel_size_variance;
          if (variance != null && variance < min) {
            warnings.push(`${sid}: Rule 17 panel_size_variance_min=${min} unmet on page ${pageNo}: panel_size_variance=${variance}`);
          }
        }
      }
    }

    // === Rule 18: render_constraints.tame_panel_count_min ===
    // TAME 判定 (background なし or pure object) も caller-provided stats がある時だけ検証する。
    if (scene.render_constraints?.tame_panel_count_min != null) {
      const min = scene.render_constraints.tame_panel_count_min;
      if (!Number.isFinite(min) || min < 0 || !Number.isInteger(min)) {
        warnings.push(`${sid}: render_constraints.tame_panel_count_min must be a non-negative integer, got ${min}`);
      } else if (renderConstraintPageStats) {
        for (let pageNo = scene.page_range.start; pageNo <= scene.page_range.end; pageNo++) {
          const tamePanelCount = renderConstraintPageStats.get(pageNo)?.tame_panel_count;
          if (tamePanelCount != null && tamePanelCount < min) {
            warnings.push(`${sid}: Rule 18 tame_panel_count_min=${min} unmet on page ${pageNo}: tame_panel_count=${tamePanelCount}`);
          }
        }
      }
    }

    // === Rule 19: panel_archetype_hint 整合 ===
    // Phase 3 前の bible ではフィールド自体が無いので warning に留める。
    if (scene.panel_archetype_hint) {
      const archetypes =
        (bible as unknown as { visual_grammar?: { panel_archetypes?: Array<{ id: string }> } }).visual_grammar
          ?.panel_archetypes ?? [];
      if (archetypes.length > 0 && !archetypes.some((a) => a.id === scene.panel_archetype_hint)) {
        warnings.push(`${sid}: panel_archetype_hint "${scene.panel_archetype_hint}" not in bible.visual_grammar.panel_archetypes`);
      }
    }

    // === Rule 20: cliffhanger_pattern は cliff scene のみ ===
    if (scene.cliffhanger_pattern && scene.beat_type !== "cliff") {
      errors.push(`${sid}: cliffhanger_pattern "${scene.cliffhanger_pattern}" specified but beat_type=${scene.beat_type} (cliff のみ可)`);
    }

    // === Rule 21: scene_emotion_intensity_below_expected ===
    if (scene.scene_emotion?.intensity != null) {
      for (const link of scene.episode_spine_links ?? []) {
        if (link.expected_intensity_target == null) continue;
        if (scene.scene_emotion.intensity < link.expected_intensity_target) {
          warnings.push(
            `${sid}: Rule 21 scene_emotion_intensity_below_expected event_kind=${link.event_kind} expected=${link.expected_intensity_target} actual=${scene.scene_emotion.intensity}`,
          );
        }
      }
    }
  }

  // === Rule 22: ep1_spine_events_missing ===
  if (options?.episodeNo === 1 && options.episodeSpine) {
    const expectedKinds = new Set<NonNullable<Scene["episode_spine_links"]>[number]["event_kind"]>();
    if (options.episodeSpine.humiliation_event) expectedKinds.add("humiliation");
    if (options.episodeSpine.secret_or_treasure_event) expectedKinds.add("secret_or_treasure");
    if (options.episodeSpine.awakening_event) expectedKinds.add("awakening");
    if (options.episodeSpine.payback_event) expectedKinds.add("payback");
    if (options.episodeSpine.title_anchor) expectedKinds.add("title_anchor");

    const actualKinds = new Set<NonNullable<Scene["episode_spine_links"]>[number]["event_kind"]>();
    for (const scene of sceneGraph.scenes) {
      for (const link of scene.episode_spine_links ?? []) {
        actualKinds.add(link.event_kind);
      }
    }

    const missingKinds = Array.from(expectedKinds).filter((kind) => !actualKinds.has(kind));
    if (missingKinds.length > 0) {
      warnings.push(`Rule 22 ep1_spine_events_missing: missing event_kind(s) ${missingKinds.join(", ")}`);
    }
  }

  // === Rule 5: foreshadow DAG ===
  // 同 episode 内 setup → payoff の整合
  const setupTokenToScene = new Map<string, { scene: string; hint: PayoffEpisodeHint }>();
  const payoffTokens = new Set<string>();
  for (const scene of sceneGraph.scenes) {
    for (const f of scene.foreshadow_setup) {
      if (setupTokenToScene.has(f.token)) {
        warnings.push(
          `${scene.scene_id}: foreshadow setup "${f.token}" duplicated (also in ${setupTokenToScene.get(f.token)!.scene})`
        );
      } else {
        setupTokenToScene.set(f.token, { scene: scene.scene_id, hint: f.payoff_episode_hint });
      }
    }
    for (const p of scene.foreshadow_payoff) {
      payoffTokens.add(p);
    }
  }
  for (const token of payoffTokens) {
    if (!setupTokenToScene.has(token)) {
      errors.push(`payoff_without_setup: "${token}" appears in foreshadow_payoff but never set up in this episode`);
    }
  }
  for (const [token, info] of setupTokenToScene) {
    const paid = payoffTokens.has(token);
    if (info.hint === "this_episode" && !paid) {
      errors.push(`${info.scene}: foreshadow_setup "${token}" hint=this_episode but no payoff in this episode`);
    } else if (info.hint !== "this_episode" && !paid) {
      // cross-episode pending: Rule 5 では warning ではなく metrics に積むが、validator では情報通知のみ
      // (errors / warnings には乗せない)
    }
  }
  if (options?.volumeForeshadowMap) {
    const episodeNo = options.episodeNo ?? sceneGraph.scenes[0]?.arc_position.episode_in_volume;
    if (episodeNo != null) {
      const expectedSeedCount = options.volumeForeshadowMap.filter((f) => f.seed_in_episode === episodeNo).length;
      const expectedPayoffCount = options.volumeForeshadowMap.filter((f) => f.payoff_in_episode === episodeNo).length;
      const actualSeedCount = sceneGraph.scenes.reduce((n, scene) => n + scene.foreshadow_setup.length, 0);
      const actualPayoffCount = sceneGraph.scenes.reduce((n, scene) => n + scene.foreshadow_payoff.length, 0);
      if (actualSeedCount < expectedSeedCount) {
        warnings.push(`volume_plot expects ${expectedSeedCount} seeds in ep${episodeNo} but scene_graph only sets up ${actualSeedCount}`);
      }
      if (actualSeedCount > expectedSeedCount + 2) {
        warnings.push(`volume_plot expects ${expectedSeedCount} seeds in ep${episodeNo} but scene_graph sets up ${actualSeedCount} (over-foreshadowed)`);
      }
      if (actualPayoffCount < expectedPayoffCount) {
        warnings.push(`volume_plot expects ${expectedPayoffCount} payoffs in ep${episodeNo} but scene_graph only pays off ${actualPayoffCount}`);
      }
      if (actualPayoffCount > expectedPayoffCount + 1) {
        warnings.push(`volume_plot expects ${expectedPayoffCount} payoffs in ep${episodeNo} but scene_graph pays off ${actualPayoffCount} (over-payoffed)`);
      }

      const expectedThisEpisodeCount = options.volumeForeshadowMap.filter(
        (f) => f.seed_in_episode === episodeNo && f.payoff_in_episode === episodeNo
      ).length;
      const expectedCrossCount = options.volumeForeshadowMap.filter(
        (f) => f.seed_in_episode === episodeNo && f.payoff_in_episode > episodeNo
      ).length;
      const setupHints = Array.from(setupTokenToScene.values()).map((info) => info.hint);
      if (expectedThisEpisodeCount > 0 && setupHints.length > 0 && setupHints.every((hint) => hint !== "this_episode")) {
        warnings.push(`volume_plot expects in-episode payoff for ${expectedThisEpisodeCount} foreshadow(s) in ep${episodeNo} but all foreshadow_setup hints are non-this_episode`);
      }
      if (expectedCrossCount > 0 && setupHints.length > 0 && setupHints.every((hint) => hint === "this_episode")) {
        warnings.push(`volume_plot expects cross-episode payoff for ${expectedCrossCount} foreshadow(s) in ep${episodeNo} but all foreshadow_setup hints are this_episode`);
      }
    }
  }

  // === Rule 6: time_axis.order DAG / prev/next 整合 ===
  for (let i = 0; i < sceneGraph.scenes.length; i++) {
    const scene = sceneGraph.scenes[i];
    const expectedPrev = i === 0 ? null : sceneGraph.scenes[i - 1].scene_id;
    const expectedNext =
      i === sceneGraph.scenes.length - 1 ? null : sceneGraph.scenes[i + 1].scene_id;
    if (scene.prev_scene_id !== expectedPrev) {
      errors.push(`${scene.scene_id}: prev_scene_id="${scene.prev_scene_id}" but expected "${expectedPrev}"`);
    }
    if (scene.next_scene_id !== expectedNext) {
      errors.push(`${scene.scene_id}: next_scene_id="${scene.next_scene_id}" but expected "${expectedNext}"`);
    }
    if (scene.prev_scene_id && !sceneIdSet.has(scene.prev_scene_id)) {
      errors.push(`${scene.scene_id}: prev_scene_id "${scene.prev_scene_id}" not found in scenes`);
    }
    if (scene.next_scene_id && !sceneIdSet.has(scene.next_scene_id)) {
      errors.push(`${scene.scene_id}: next_scene_id "${scene.next_scene_id}" not found in scenes`);
    }
  }

  // === Rule 7: page_budget / panel_range 合計が episode 範囲に収まる ===
  if (options?.totalPages != null) {
    const totalPages = options.totalPages;
    // page_range の和集合 (重複可) を計算
    const pagesCovered = new Set<number>();
    for (const scene of sceneGraph.scenes) {
      for (let p = scene.page_range.start; p <= scene.page_range.end; p++) {
        pagesCovered.add(p);
      }
    }
    if (pagesCovered.size !== totalPages) {
      warnings.push(
        `Rule 7: page_range union covers ${pagesCovered.size} pages, episode total=${totalPages}`
      );
    }
    // preferred 合計と total_pages の ±10% 比較は scene 重複があると過大になるので参考値
    const sumPreferred = sceneGraph.scenes.reduce((n, s) => n + s.page_budget.preferred, 0);
    const tolerance = totalPages * 0.15;
    if (Math.abs(sumPreferred - totalPages) > tolerance) {
      warnings.push(
        `Rule 7: sum(page_budget.preferred)=${sumPreferred}, total_pages=${totalPages} (tolerance ±${tolerance.toFixed(1)})`
      );
    }
  }
  if (options?.totalPanels != null) {
    const panelsCovered = new Set<number>();
    for (const scene of sceneGraph.scenes) {
      for (let p = scene.panel_range.start_panel_no; p <= scene.panel_range.end_panel_no; p++) {
        panelsCovered.add(p);
      }
    }
    if (panelsCovered.size !== options.totalPanels) {
      warnings.push(
        `Rule 7: panel_range union covers ${panelsCovered.size} panels, episode total=${options.totalPanels}`
      );
    }
  }

  // === Rule 8: arc_phase 連続性 (cliff/transition/memory 例外あり) ===
  const phaseOrder: Record<ArcPhase, number> = {
    introduce: 0,
    rising: 1,
    climax: 2,
    falling: 3,
    resolution: 4,
  };
  for (let i = 1; i < sceneGraph.scenes.length; i++) {
    const prev = sceneGraph.scenes[i - 1];
    const cur = sceneGraph.scenes[i];
    const prevPhase = phaseOrder[prev.arc_position.arc_phase];
    const curPhase = phaseOrder[cur.arc_position.arc_phase];
    const isException =
      cur.beat_type === "cliff" ||
      cur.beat_type === "transition" ||
      cur.cast.some((c) => c.presence === "memory") ||
      cur.time_axis.is_flashback;
    if (curPhase < prevPhase && !isException) {
      errors.push(
        `${cur.scene_id}: arc_phase regressed (${prev.arc_position.arc_phase} → ${cur.arc_position.arc_phase}) without exception (cliff/transition/memory)`
      );
    }
  }

  // === Rule 10: cliff beat は最終 scene のみ ===
  for (let i = 0; i < sceneGraph.scenes.length; i++) {
    const scene = sceneGraph.scenes[i];
    const isLast = i === sceneGraph.scenes.length - 1;
    if (scene.beat_type === "cliff" && !isLast) {
      errors.push(`${scene.scene_id}: cliff beat must be on the final scene`);
    }
  }

  // === Rule 11: memory/flashback は前 scene の arc_phase を継承し belief は固定 ===
  for (let i = 1; i < sceneGraph.scenes.length; i++) {
    const prev = sceneGraph.scenes[i - 1];
    const cur = sceneGraph.scenes[i];
    const isFlashbackScene =
      cur.time_axis.is_flashback || cur.cast.some((c) => c.presence === "memory");
    if (isFlashbackScene) {
      if (cur.arc_position.arc_phase !== prev.arc_position.arc_phase) {
        warnings.push(
          `${cur.scene_id}: flashback/memory scene should inherit arc_phase from prev (${prev.arc_position.arc_phase}), got ${cur.arc_position.arc_phase}`
        );
      }
    }
  }

  // === Rule (additional): scene_id uniqueness と scene_no 連番 ===
  const seenScene = new Set<string>();
  for (const scene of sceneGraph.scenes) {
    if (seenScene.has(scene.scene_id)) {
      errors.push(`scene_id "${scene.scene_id}" duplicated`);
    }
    seenScene.add(scene.scene_id);
  }
  for (let i = 0; i < sceneGraph.scenes.length; i++) {
    if (sceneGraph.scenes[i].scene_no !== i + 1) {
      warnings.push(
        `${sceneGraph.scenes[i].scene_id}: scene_no=${sceneGraph.scenes[i].scene_no}, expected ${i + 1}`
      );
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

// ============================================================================
// Panel-Scene Inheritance Validator (B5-1)
// ============================================================================

/**
 * panel が scene から継承するルールを検査する。L4-storyboard 出力後の整合検査。
 *
 * 検査項目:
 *   - panel.entities.location_id が当該 scene の location_id または sub_locations のいずれかに含まれる
 *   - panel.entities.characters が scene.cast の subset (panel で新規 character_id を持ち込めない)
 *   - panel.dialogue + panel.monologue の text に scene_exclusive 違反がない
 *     (他 scene が排他所有する key_line.text を当該 panel が含んでいないこと)
 *   - panel.panel_no が必ず何らかの scene.panel_range に属する (孤立 panel 検出)
 *
 * panel と scene の対応は scene.panel_range から決定的に逆引きする。
 * panel に scene_id を埋め込む必要はない (B5-2 以降で panel.scene_id を schema に追加する場合は不要に)。
 */
export type PanelLikeShape = {
  panel_no: number;
  panel_id?: string;
  entities: {
    location_id: string;
    characters: Array<{ character_id: string } | string>;
  };
  dialogue?: Array<{ character_id?: string; text?: string }>;
  monologue?: Array<{ character_id?: string; text?: string }>;
  narration?: string[];
  key_visual?: string;
};

export type StoryboardLikeShape = {
  pages: Array<{
    page_no: number;
    panels: PanelLikeShape[];
  }>;
};

function extractKeywords(text: string): string[] {
  return text
    .replace(/[、。！？「」『』（）\s,.\-_:;/]+/g, " ")
    .split(" ")
    .map((w) => w.trim())
    .filter((w) => w.length >= 2);
}

export function validatePanelSceneInheritance(
  storyboard: StoryboardLikeShape,
  sceneGraph: SceneGraphV1
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // panel_no -> Scene の逆引き
  const panelToScene = new Map<number, Scene>();
  for (const scene of sceneGraph.scenes) {
    for (
      let p = scene.panel_range.start_panel_no;
      p <= scene.panel_range.end_panel_no;
      p++
    ) {
      if (panelToScene.has(p)) {
        warnings.push(
          `panel ${p} is covered by both ${panelToScene.get(p)!.scene_id} and ${scene.scene_id}`
        );
      }
      panelToScene.set(p, scene);
    }
  }

  // scene_exclusive text -> 所有 scene_id
  const exclusiveTextOwner = new Map<string, string>();
  for (const scene of sceneGraph.scenes) {
    for (const kl of scene.dialogue_plan.key_lines) {
      if (kl.uniqueness === "scene_exclusive" && kl.text) {
        exclusiveTextOwner.set(kl.text, scene.scene_id);
      }
    }
  }

  for (const page of storyboard.pages) {
    for (const panel of page.panels) {
      const scene = panelToScene.get(panel.panel_no);
      const ref = panel.panel_id ?? `panel#${panel.panel_no}`;

      if (!scene) {
        warnings.push(
          `${ref} (page ${page.page_no}): not covered by any scene.panel_range`
        );
        continue;
      }

      // location 継承
      const allowedLocs = [scene.location_id, ...(scene.sub_locations ?? [])];
      if (!allowedLocs.includes(panel.entities.location_id)) {
        errors.push(
          `${ref} (scene ${scene.scene_id}): location_id "${panel.entities.location_id}" not in scene's [${allowedLocs.join(", ")}]`
        );
      }

      // cast 継承
      const sceneCastIds = new Set(scene.cast.map((c) => c.character_id));
      const panelCharIds = panel.entities.characters.map((c) =>
        typeof c === "string" ? c : c.character_id
      );
      for (const cid of panelCharIds) {
        if (!sceneCastIds.has(cid)) {
          errors.push(
            `${ref} (scene ${scene.scene_id}): character "${cid}" not in scene.cast (allowed: ${Array.from(sceneCastIds).join(", ")})`
          );
        }
      }

      // scene_exclusive text 違反
      const dialogueTexts = [
        ...(panel.dialogue ?? []),
        ...(panel.monologue ?? []),
      ]
        .map((d) => d.text ?? "")
        .filter((t) => t.length > 0);
      for (const t of dialogueTexts) {
        const owner = exclusiveTextOwner.get(t);
        if (owner && owner !== scene.scene_id) {
          errors.push(
            `${ref} (scene ${scene.scene_id}): contains scene_exclusive text "${t}" owned by ${owner}`
          );
        }
      }

      // Gap 4: page_range 逸脱チェック
      if (
        page.page_no < scene.page_range.start ||
        page.page_no > scene.page_range.end
      ) {
        errors.push(
          `${ref} (scene ${scene.scene_id}): placed on page ${page.page_no} but scene.page_range is ${scene.page_range.start}-${scene.page_range.end}`
        );
      }
    }
  }

  // Gap 1: directing_intent.narration_lines 転記チェック
  // Gap 2: key_lines 全量配置チェック
  // Gap 3: key_visual キーワード重複チェック
  // scene 単位で panel の narration/dialogue/monologue を集約して検証
  for (const scene of sceneGraph.scenes) {
    const scenePanels: PanelLikeShape[] = [];
    const scenePanelPages: number[] = [];
    for (const page of storyboard.pages) {
      for (const panel of page.panels) {
        if (
          panel.panel_no >= scene.panel_range.start_panel_no &&
          panel.panel_no <= scene.panel_range.end_panel_no
        ) {
          scenePanels.push(panel);
          scenePanelPages.push(page.page_no);
        }
      }
    }

    // Gap 1: narration_lines
    const di = scene.directing_intent;
    if (di && di.kind !== "normal" && "narration_lines" in di && di.narration_lines) {
      const allNarration = scenePanels.flatMap((p) => p.narration ?? []).join("\n");
      for (const line of di.narration_lines) {
        if (!allNarration.includes(line)) {
          const nums = line.match(/[\d０-９一二三四五六七八九十百千万億]+/g) ?? [];
          const hasNumberMatch = nums.length > 0 && nums.every((n) => allNarration.includes(n));
          if (hasNumberMatch) {
            warnings.push(
              `scene ${scene.scene_id}: narration_line "${line}" — 文全体は不一致だが数値は一致 (軽微な改変の可能性)`
            );
          } else {
            errors.push(
              `scene ${scene.scene_id}: narration_line "${line}" が storyboard panels の narration に見つからない`
            );
          }
        }
      }
    }

    // Gap 1b: world_anchor target_facts
    if (di && di.kind === "world_anchor") {
      const allText = scenePanels
        .flatMap((p) => [
          ...(p.narration ?? []),
          ...(p.dialogue ?? []).map((d) => d.text ?? ""),
          ...(p.monologue ?? []).map((d) => d.text ?? ""),
        ])
        .join("\n");
      for (const fact of di.target_facts) {
        if (!allText.includes(fact)) {
          warnings.push(
            `scene ${scene.scene_id}: world_anchor target_fact "${fact}" が storyboard panels のテキストに見つからない`
          );
        }
      }
    }

    // Gap 2: key_lines 全量配置
    const allDialogueMonologue = scenePanels
      .flatMap((p) => [
        ...(p.dialogue ?? []).map((d) => d.text ?? ""),
        ...(p.monologue ?? []).map((d) => d.text ?? ""),
      ])
      .filter((t) => t.length > 0);
    for (const kl of scene.dialogue_plan.key_lines) {
      if (!kl.text) continue;
      if (!allDialogueMonologue.includes(kl.text)) {
        errors.push(
          `scene ${scene.scene_id}: key_line "${kl.text}" (speaker=${kl.speaker}) が storyboard panels の dialogue/monologue に見つからない`
        );
      }
    }

    // Gap 3: key_visual キーワード重複 (opening_hook のみ、warn)
    if (di && di.kind === "opening_hook" && di.key_visual && scenePanels.length > 0) {
      const firstPanel = scenePanels[0];
      if (firstPanel.key_visual) {
        const diKeywords = extractKeywords(di.key_visual);
        const panelKeywords = extractKeywords(firstPanel.key_visual);
        const overlap = diKeywords.filter((k) => panelKeywords.includes(k));
        const overlapRate = diKeywords.length > 0 ? overlap.length / diKeywords.length : 1;
        if (overlapRate < 0.3) {
          warnings.push(
            `scene ${scene.scene_id}: opening_hook key_visual のキーワード重複率が低い (${Math.round(overlapRate * 100)}%): DI="${di.key_visual}" vs panel="${firstPanel.key_visual}"`
          );
        }
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

// ============================================================================
// Helper: Foreshadow DAG 集計 (B4 episode_metrics 用)
// ============================================================================

export function buildForeshadowDag(sceneGraph: SceneGraphV1): ForeshadowDag {
  const setups = new Map<string, { scene: string; hint: PayoffEpisodeHint }>();
  const payoffs = new Set<string>();
  for (const scene of sceneGraph.scenes) {
    for (const s of scene.foreshadow_setup) {
      setups.set(s.token, { scene: scene.scene_id, hint: s.payoff_episode_hint });
    }
    for (const p of scene.foreshadow_payoff) {
      payoffs.add(p);
    }
  }
  const orphan_setups: string[] = [];
  const pending_cross_episode: { token: string; expected_in: PayoffEpisodeHint }[] = [];
  for (const [token, info] of setups) {
    if (payoffs.has(token)) continue;
    if (info.hint === "this_episode") {
      orphan_setups.push(token);
    } else {
      pending_cross_episode.push({ token, expected_in: info.hint });
    }
  }
  const payoff_without_setup: string[] = [];
  for (const p of payoffs) {
    if (!setups.has(p)) payoff_without_setup.push(p);
  }
  return {
    setup_count: setups.size,
    payoff_count: payoffs.size,
    orphan_setups,
    payoff_without_setup,
    pending_cross_episode,
  };
}

// ============================================================================
// Type guard
// ============================================================================

export function isSceneGraphV1(v: unknown): v is SceneGraphV1 {
  if (typeof v !== "object" || v === null) return false;
  const x = v as Partial<SceneGraphV1>;
  return (
    x.schema_version === SCENE_GRAPH_SCHEMA_VERSION &&
    typeof x.episode_id === "string" &&
    Array.isArray(x.scenes)
  );
}
