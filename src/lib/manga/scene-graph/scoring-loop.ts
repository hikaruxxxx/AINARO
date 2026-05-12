/**
 * L3.5 Scene-Graph 採点ループ (Phase β B3 skeleton)
 *
 * 3 段ループ:
 *   Tier 1: candidates×5 → pairwise tournament → predict-hit (v12 アンサンブル)
 *           → anchor pool 比較 (cosine + LLM 採点) → 採用 1 個
 *   Tier 2: anchor 下位 50% で再生成発火、最大 2 周
 *   Tier 3: 2 周しても閾値未達なら Console UI で人間 review (Phase γ)
 *
 * B3 skeleton (本ファイル): 型と関数 signature、dry-run 実装。
 * 実 LLM 呼び出し / predict-hit Python script 連携 / anchor pool cosine は
 * 後続コミットで段階的に wire する。
 *
 * 依存:
 *   - candidate generation: pairwise-judge / batch-eval agent (.claude/commands/)
 *   - predict-hit: scripts/predict/predict-hit-v12.py (project_hit_models_v12)
 *   - anchor pool: data/generation/anchors/ (project_anchor_pool_v1)
 *
 * 仕様: docs/plans/manga/scene-graph-l3-5.md "2. scene-graph (L3.5) — 3 系統ナレッジの交差ハブ" / "C 系: 選別ループ"
 */

import { promises as fs } from "node:fs";
import type {
  SceneGraphV1,
  Scene,
  SceneSelection,
  PayoffEpisodeHint,
} from "./schema";
import type { BibleSnapshotV2 } from "../schemas-v2";
import {
  relevantMotifs,
  relevantWorldRules,
  relevantProps,
} from "../bible/broker";
import { contextForSceneV2 } from "../bible/broker-v3";
import { runCodexText } from "../llm/codex-text";
import type { VolumeEpisodePlan, VolumePlot } from "../storyboard-v2/volume-plot";

// ============================================================================
// Configuration
// ============================================================================

export type ScoringLoopConfig = {
  /** Tier 1 で生成する候補数 (デフォルト 5) */
  candidatesPerScene: number;
  /** Tier 2 を発火する anchor 下位パーセンタイル (デフォルト 0.50 = 下位 50%) */
  tier2_threshold_pct: number;
  /** Tier 2 の最大再生成回数 (デフォルト 2) */
  tier2_max_iterations: number;
  /** Tier 3 escalation を許可するか (false なら Tier 2 失敗で error) */
  tier3_enabled: boolean;
  /** dry-run: 実 LLM / predict-hit を呼ばず、模擬値で動作 */
  dry_run: boolean;
  /** anchor pool root (data/generation/anchors/) */
  anchor_pool_root?: string;
  /** predict-hit script path */
  predict_hit_script?: string;
};

export const DEFAULT_SCORING_CONFIG: ScoringLoopConfig = {
  candidatesPerScene: 5,
  tier2_threshold_pct: 0.50,
  tier2_max_iterations: 2,
  tier3_enabled: true,
  dry_run: true,
};

// ============================================================================
// Candidate generation (Tier 1 入口)
// ============================================================================

/**
 * 1 scene について N 個の candidate を生成する。
 *
 * 入力:
 *   - sceneSlot: 既に scene_no / page_range / panel_range / arc_position / location_id 等が
 *     決まっている「scene 枠」(skeleton scene)。
 *   - context: bible / brief / 周辺 scene / volume_plot 等の生成 context。
 *
 * 出力: 物語論理 + 頁演出を埋めた Scene の配列 (同 scene_id を持つ N 候補)。
 *
 * 実装: B3 中盤で agent invocation (build-protagonist + build-relationship-graph + build-story-arcs +
 * cliffhanger-architect 等) を組み合わせて 1 scene の中身を生成。dry-run mode は seed-based stub。
 */
export type SceneSlot = Pick<
  Scene,
  | "scene_id"
  | "scene_no"
  | "prev_scene_id"
  | "next_scene_id"
  | "page_range"
  | "panel_range"
  | "arc_position"
  | "location_id"
  | "sub_locations"
>;

export type GenerationContext = {
  slug: string;
  episode: number;
  bibleSnapshotPath: string;
  briefPath: string;
  volumePlotPath?: string;
  /** 既に確定済みの周辺 scene (なければ空) */
  finalizedScenes: Scene[];
};

export type Tier2Feedback = {
  /** 前周回で「採用したものの低スコア」だった候補 */
  prev_selected: Scene;
  /** 前周回 anchor_llm_score */
  prev_anchor_score: number;
  /** 前周回 pairwise_score (winner の win_rate) */
  prev_pairwise_score: number;
  /** 周回番号 (2 = 1 回目の Tier 2、3 = 2 回目) */
  iteration: number;
  /** anchor 比較で LLM が指摘した不足点 */
  anchor_feedback_text?: string;
};

export type BibleContextForSlot = {
  characters: Array<{ id: string; name: string; role: string }>;
  costumes: Array<{ id: string; character_id: string; name?: string }>;
  motifCandidates: Array<{ id?: string; name: string; description?: string }>;
  worldRuleCandidates: string[];
  propCandidates: Array<{ id: string; name: string }>;
};

// ============================================================================
// L2 (volume_plot) context (prompt 注入用)
// ============================================================================

/**
 * volume_plot.json から当 episode に関係する section を抽出した中間表現。
 * generateSceneCandidates / buildPairwisePrompt / compareToAnchorPool の prompt に共通注入する。
 */
export type VolumeContext = {
  volume_no: number;
  title_working?: string;
  volume_theme: string;
  /** 当 ep の VolumeEpisodePlan (見つからなければ null) */
  current_episode: {
    episode_no: number;
    title_working: string;
    theme: string;
    protagonist_arc: { start: string; turn: string; end: string };
    core_hook_usage?: string;
    pairing_progression?: string;
    must_include_events: string[];
    cliffhanger_hook: string;
    /** beats summary を 1 行/beat で連結 (空文字許容) */
    beats_summary_lines: string[];
  } | null;
  /** 周辺 ep (prev / next) の theme + cliffhanger だけ短く */
  prev_episode_brief: { episode_no: number; title_working?: string; theme: string; cliffhanger_hook: string } | null;
  next_episode_brief: { episode_no: number; title_working?: string; theme: string; cliffhanger_hook: string } | null;
  /** 当 ep が seed 側に出現する foreshadow_map 要素 */
  foreshadows_seeded_here: Array<{ payoff_in_episode: number; description: string }>;
  /** 当 ep が payoff 側に出現する foreshadow_map 要素 */
  foreshadows_paid_off_here: Array<{ seed_in_episode: number; description: string }>;
};

/**
 * volume_plot.json を fs から読み、当 episode に関係する section を抽出する。
 * 失敗時 (ファイル無し / parse 失敗) は null を返す。
 */
export async function loadVolumeContext(
  volumePlotPath: string | undefined,
  episodeNo: number
): Promise<VolumeContext | null> {
  if (!volumePlotPath) return null;
  try {
    const raw = await fs.readFile(volumePlotPath, "utf-8");
    const volumePlot = JSON.parse(raw) as VolumePlot;
    const current = volumePlot.episodes.find((ep) => ep.episode_no === episodeNo);
    const prev = volumePlot.episodes.find((ep) => ep.episode_no === episodeNo - 1);
    const next = volumePlot.episodes.find((ep) => ep.episode_no === episodeNo + 1);
    if (!current) {
      return {
        volume_no: volumePlot.volume_no,
        title_working: volumePlot.title_working,
        volume_theme: volumePlot.volume_theme,
        current_episode: null,
        prev_episode_brief: null,
        next_episode_brief: null,
        foreshadows_seeded_here: [],
        foreshadows_paid_off_here: [],
      };
    }
    return {
      volume_no: volumePlot.volume_no,
      title_working: volumePlot.title_working,
      volume_theme: volumePlot.volume_theme,
      current_episode: toCurrentVolumeEpisode(current),
      prev_episode_brief: prev ? toEpisodeBrief(prev) : null,
      next_episode_brief: next ? toEpisodeBrief(next) : null,
      foreshadows_seeded_here: volumePlot.foreshadow_map
        .filter((f) => f.seed_in_episode === episodeNo)
        .map((f) => ({ payoff_in_episode: f.payoff_in_episode, description: f.description })),
      foreshadows_paid_off_here: volumePlot.foreshadow_map
        .filter((f) => f.payoff_in_episode === episodeNo)
        .map((f) => ({ seed_in_episode: f.seed_in_episode, description: f.description })),
    };
  } catch {
    return null;
  }
}

function toCurrentVolumeEpisode(ep: VolumeEpisodePlan): NonNullable<VolumeContext["current_episode"]> {
  return {
    episode_no: ep.episode_no,
    title_working: ep.title_working,
    theme: ep.theme,
    protagonist_arc: ep.protagonist_arc,
    core_hook_usage: ep.core_hook_usage,
    pairing_progression: ep.pairing_progression,
    must_include_events: ep.must_include_events,
    cliffhanger_hook: ep.cliffhanger_hook,
    beats_summary_lines: ep.beats.map((b) => `[${b.label}] ${b.summary}`),
  };
}

function toEpisodeBrief(ep: VolumeEpisodePlan): NonNullable<VolumeContext["prev_episode_brief"]> {
  return {
    episode_no: ep.episode_no,
    title_working: ep.title_working,
    theme: ep.theme,
    cliffhanger_hook: ep.cliffhanger_hook,
  };
}

/**
 * VolumeContext を prompt 用 markdown section (## 巻内位置) に整形する。
 * vc が null か current_episode が null なら空文字を返す。
 */
export function formatVolumeContextSection(vc: VolumeContext | null): string {
  if (!vc?.current_episode) return "";
  const ep = vc.current_episode;
  const prev = vc.prev_episode_brief;
  const next = vc.next_episode_brief;
  const foreshadowLines = [
    ...vc.foreshadows_seeded_here.map(
      (f) => `- (seed in ep${ep.episode_no}) → payoff in ep${f.payoff_in_episode}: ${f.description}`
    ),
    ...vc.foreshadows_paid_off_here.map(
      (f) => `- (payoff in ep${ep.episode_no}) ← seed in ep${f.seed_in_episode}: ${f.description}`
    ),
  ];
  return [
    `## 巻内位置 (L2 volume_plot より)`,
    "",
    `### 巻全体`,
    `- volume_no: ${vc.volume_no}`,
    vc.title_working ? `- title: ${vc.title_working}` : null,
    `- volume_theme: ${truncatePromptText(vc.volume_theme, 400)}`,
    "",
    `### 当 episode の役割`,
    `- episode_no: ${ep.episode_no}`,
    `- title: ${ep.title_working}`,
    `- theme: ${ep.theme}`,
    `- protagonist_arc:`,
    `  - start: ${ep.protagonist_arc.start}`,
    `  - turn: ${ep.protagonist_arc.turn}`,
    `  - end: ${ep.protagonist_arc.end}`,
    ep.core_hook_usage ? `- core_hook_usage: ${ep.core_hook_usage}` : null,
    ep.pairing_progression ? `- pairing_progression: ${ep.pairing_progression}` : null,
    `- must_include_events:`,
    ...ep.must_include_events.slice(0, 8).map((event) => `  - ${event}`),
    `- cliffhanger_hook: ${ep.cliffhanger_hook}`,
    `- beats:`,
    ...ep.beats_summary_lines.slice(0, 8).map((line) => `  - ${line}`),
    "",
    `### 周辺 episode`,
    prev ? `- prev: ep${prev.episode_no} 「${prev.title_working ?? ""}」` : `- prev: (none)`,
    prev ? `  - theme: ${prev.theme}` : null,
    prev ? `  - cliffhanger_hook: ${prev.cliffhanger_hook}` : null,
    next ? `- next: ep${next.episode_no} 「${next.title_working ?? ""}」` : `- next: (none)`,
    next ? `  - theme: ${next.theme}` : null,
    next ? `  - cliffhanger_hook: ${next.cliffhanger_hook}` : null,
    "",
    `### 当 episode が関わる巻またぎ伏線 (volume_plot.foreshadow_map より)`,
    foreshadowLines.length > 0 ? foreshadowLines.join("\n") : `- (none)`,
    `- (※ payoff_in_episode > current の場合 = 巻またぎ伏線。setup 側 scene の foreshadow_setup.payoff_episode_hint`,
    `  は "later_in_volume" / "cross_volume" を選び、当 ep 内で payoff させない)`,
    "",
    `### 使い方の指示`,
    `- 当 scene が当 episode の beats のどの位置 (arc_position) に対応するかを意識する`,
    `- 巻またぎ伏線は当 ep の foreshadow_setup として埋めるが、payoff_episode_hint は描写を当 ep に閉じさせない`,
    `  (later_in_volume / cross_volume を選ぶ)`,
    `- 当 ep が payoff 側になっている伏線がある場合、scene の foreshadow_payoff にそれを反映する`,
  ].filter((line): line is string => line !== null).join("\n");
}

function truncatePromptText(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

export function buildBibleContextForSlot(
  bible: BibleSnapshotV2,
  slot: SceneSlot,
  useBibleV3: boolean
): BibleContextForSlot {
  const placeholderScene = {
    beat_type: "transition" as const,
    mode: "transition_montage" as const,
    cast: [] as Scene["cast"],
    location_id: slot.location_id,
    key_visual_intent: "",
  };
  const brokerContext = useBibleV3
    ? (() => {
        const v3ctx = contextForSceneV2(
          bible,
          placeholderScene,
          "in_world_plus_revealed_up_to_vol",
        );
        return {
          motifCandidates: v3ctx.motifs.map((fact) => ({
            id: undefined,
            name: motifNameForFact(bible, fact.evidence.json_pointer) ?? fact.body.slice(0, 40),
            description: fact.body,
          })),
          worldRuleCandidates: v3ctx.world_rules.map((fact) => fact.body),
          propCandidates: v3ctx.props.map((fact) => ({
            id: fact.entity_id ?? "",
            name: fact.body.slice(0, 40),
          })),
        };
      })()
    : {
        motifCandidates: relevantMotifs(bible, placeholderScene).map((motif) => ({
          id: "id" in motif && typeof motif.id === "string" ? motif.id : undefined,
          name: motif.name,
          description: motif.meaning || motif.draw_directive,
        })),
        worldRuleCandidates: relevantWorldRules(bible, placeholderScene),
        propCandidates: relevantProps(bible, placeholderScene).map((prop) => ({
          id: prop.id,
          name: prop.name,
        })),
      };

  return {
    characters: bible.characters.map((character) => ({
      id: character.id,
      name: character.name,
      role: character.role,
    })),
    costumes: bible.costumes.map((costume) => ({
      id: costume.id,
      character_id: costume.character_id,
      name: "name" in costume && typeof costume.name === "string" ? costume.name : undefined,
    })),
    ...brokerContext,
  };
}

function motifNameForFact(bible: BibleSnapshotV2, jsonPointer: string | undefined): string | undefined {
  const match = jsonPointer?.match(/^\/visual_motifs\/(\d+)$/);
  if (!match) return undefined;
  const motif = bible.visual_motifs[Number(match[1])];
  return motif?.name;
}

export async function generateSceneCandidates(
  slot: SceneSlot,
  context: GenerationContext,
  config: ScoringLoopConfig,
  feedback?: Tier2Feedback
): Promise<Scene[]> {
  if (config.dry_run) {
    return Array.from({ length: config.candidatesPerScene }, (_, i) =>
      stubCandidate(slot, i)
    );
  }

  const useBibleV3 = process.env.USE_BIBLE_V3 !== "false";
  const bible = await loadBibleSnapshot(context.bibleSnapshotPath);
  const bibleContext = buildBibleContextForSlot(bible, slot, useBibleV3);
  const volumeContext = await loadVolumeContext(context.volumePlotPath, context.episode);

  const task = buildSceneCandidatePrompt(slot, context, config.candidatesPerScene, bibleContext, feedback, volumeContext);
  const result = await runCodexText<{ candidates: Partial<Scene>[] }>({
    task,
    format: "json",
    cwd: process.env.AINARO_REPO_ROOT ?? process.cwd(),
    timeoutMs: 8 * 60 * 1000,
    maxRetries: 1,
  });
  if (!result.parsed || !Array.isArray(result.parsed.candidates)) {
    throw new Error(
      `[scoring-loop] generateSceneCandidates: codex returned unparseable JSON for ${slot.scene_id}. stdout head: ${result.stdout.slice(0, 300)}`
    );
  }
  // codex 出力は scene のうち A 系・B 系フィールドを埋める想定。
  // 識別フィールド (scene_id / scene_no / panel_range / arc_position 等) は slot から継承。
  return result.parsed.candidates.slice(0, config.candidatesPerScene).map((c) => ({
    ...stubCandidate(slot, 0),
    ...c,
    scene_id: slot.scene_id,
    scene_no: slot.scene_no,
    prev_scene_id: slot.prev_scene_id,
    next_scene_id: slot.next_scene_id,
    page_range: slot.page_range,
    panel_range: slot.panel_range,
    arc_position: slot.arc_position,
    location_id: slot.location_id,
    sub_locations: slot.sub_locations,
  }));
}

async function loadBibleSnapshot(bibleSnapshotPath: string): Promise<BibleSnapshotV2> {
  const bibleRaw = await fs.readFile(bibleSnapshotPath, "utf-8");
  return JSON.parse(bibleRaw) as BibleSnapshotV2;
}

/**
 * scene 候補生成用の Codex prompt を構築する。
 *
 * 入力: slot (識別 + arc_position + location 確定済み)、context (bible / brief / 周辺 scene)
 * 出力 (期待 JSON):
 *   { candidates: [{ beat_type, cast, dialogue_plan, foreshadow_setup, foreshadow_payoff,
 *                     protagonist_arc_state, relationship_state_delta, time_axis,
 *                     mode, turn_anchor, layout_pattern_id, subtype_directive,
 *                     render_strategy, key_visual_intent }, ...] }
 */
export function buildSceneCandidatePrompt(
  slot: SceneSlot,
  context: GenerationContext,
  candidates: number,
  bibleContext: BibleContextForSlot,
  feedback?: Tier2Feedback,
  volumeContext?: VolumeContext | null
): string {
  const finalized = context.finalizedScenes
    .map(
      (s) =>
        `  - ${s.scene_id} (${s.beat_type}, ${s.location_id}): "${s.protagonist_arc_state.belief}" → "${s.protagonist_arc_state.goal}"`
    )
    .join("\n");
  const finalizedExclusiveLines = context.finalizedScenes.flatMap((s) =>
    s.dialogue_plan.key_lines
      .filter((kl) => kl.uniqueness === "scene_exclusive" && kl.text.length > 0)
      .map((kl) => `- [${s.scene_id} ${kl.speaker}] 「${kl.text}」`)
  );
  const finalizedExclusiveSection =
    finalizedExclusiveLines.length > 0
      ? [
          `## 過去 scene で確定済みの scene_exclusive 台詞 (絶対重複禁止)`,
          "",
          finalizedExclusiveLines.join("\n"),
          "",
          `**重要**: 上記の text と完全一致する text を当 scene の key_lines に含めてはいけません`,
          `(uniqueness を may_repeat にしても禁止)。意図的な callback の場合は、台詞を 1 字以上`,
          `変えるか、別の表現に置き換えてください。`,
        ].join("\n")
      : null;
  const feedbackSection = feedback ? buildTier2FeedbackSection(feedback) : null;
  const volumeContextSection = formatVolumeContextSection(volumeContext ?? null);
  const motifListLines = bibleContext.motifCandidates
    .map((m) => (m.id ? `- ${m.id} | name="${m.name}"` : `- name="${m.name}"`))
    .join("\n");
  const motifRoleLines = bibleContext.motifCandidates
    .filter((m) => m.description && m.description.trim().length > 0)
    .map((m) => {
      const motifLabel = m.id ? `${m.id} (${m.name})` : `name="${m.name}"`;
      return `- ${motifLabel}: ${m.description}`;
    })
    .join("\n");
  const motifRoleSection =
    motifRoleLines.length > 0 ? [`#### motif の役割 (参考)`, motifRoleLines].join("\n") : null;
  return [
    `あなたは AINARO 漫画 v2 scene-graph の scene 候補生成エージェントです。`,
    `slug=${context.slug}, episode=${context.episode}, scene=${slot.scene_id}`,
    `bible: ${context.bibleSnapshotPath}`,
    `brief: ${context.briefPath}`,
    `volume_plot: ${context.volumePlotPath ?? "(none)"}`,
    "",
    volumeContextSection || null,
    volumeContextSection ? "" : null,
    `## scene slot (固定フィールド)`,
    `- scene_id: ${slot.scene_id} / scene_no: ${slot.scene_no}`,
    `- page_range: P${slot.page_range.start}-P${slot.page_range.end}`,
    `- panel_range: panel#${slot.panel_range.start_panel_no}-${slot.panel_range.end_panel_no}`,
    `- arc_position: vol${slot.arc_position.volume} ep${slot.arc_position.episode_in_volume} / phase=${slot.arc_position.arc_phase} / norm=${slot.arc_position.arc_position_normalized}`,
    `- location_id: ${slot.location_id}`,
    slot.sub_locations && slot.sub_locations.length > 0
      ? `- sub_locations: ${slot.sub_locations.join(", ")}`
      : "- sub_locations: (none)",
    "",
    `## 周辺シーン (採用済み、prev → ...)`,
    finalized || "  (no prev scenes yet)",
    "",
    finalizedExclusiveSection,
    finalizedExclusiveSection ? "" : null,
    `## bible 抜粋 (D 系参照用)`,
    "",
    `### 登場可能キャラクター (bible.characters)`,
    bibleContext.characters.map((c) => `- ${c.id} (${c.name}, ${c.role})`).join("\n"),
    "",
    `### 衣装 ID (bible.costumes)`,
    bibleContext.costumes
      .map((c) => `- ${c.id} (character=${c.character_id}${c.name ? `, name=${c.name}` : ""})`)
      .join("\n"),
    "",
    `### この場所で使用候補の visual motif (broker.relevantMotifs)`,
    "",
    `(motif_id は左側の id を「そのまま」使用してください。description / name 本文を motif_id に書き込んではいけません。)`,
    "",
    motifListLines,
    "",
    motifRoleSection,
    "",
    `### この場所で active な world.rules (broker.relevantWorldRules)`,
    bibleContext.worldRuleCandidates.map((r) => `- ${r.slice(0, 120)}`).join("\n"),
    "",
    `### この場所で取り回しうる props (broker.relevantProps)`,
    bibleContext.propCandidates.map((p) => `- ${p.id} (${p.name})`).join("\n"),
    "",
    `## 指示`,
    `1. 上記 slot に対して ${candidates} 個の scene 候補を生成してください。`,
    `2. 各候補は scene-graph schema の A 系 (beat_type / cast / dialogue_plan / foreshadow / protagonist_arc_state / relationship_state_delta / time_axis) と B 系 (mode / turn_anchor / layout_pattern_id / subtype_directive / render_strategy / key_visual_intent) を埋めてください。`,
    `3. (D 系) 各候補は以下の D 系軸も埋めてください。値は上記「bible 抜粋」内の候補から選んでください。bible に存在しない id を返してはいけません:`,
    `   - wardrobe_state: cast の各キャラについて、どの costume_id を着ているか (cast に含まれるキャラのみ)`,
    `   - visual_motif_anchors: この scene で前景化する visual motif を 1-3 個`,
    `     * motif_id は上記「visual motif (broker.relevantMotifs)」 list の左側の id (motif_xxx 形式) を「そのまま」コピーして使う。description 文・name の本文・抜粋・要約を motif_id に書き込まない。id が示されていない motif は name (引用符内) をそのまま使う`,
    `     * intensity は "subtle" / "clear" / "dominant" のいずれか`,
    `   - world_rules_active: この scene で読者に意識させる world rule の本文を最大 4 件 (bible 抜粋から選択、原文ママで複写)`,
    `   - props_in_play: この scene で実際に登場する prop。prop_id と held_by (cast 内のキャラ id) を指定`,
    `   - theme_subtext: この scene が情緒的に投影する 1 行の theme (15-40 字程度)`,
    `4. (多様性確保) 候補間で D 系の選択 (motif / props / wardrobe) を変えて視覚的バラつきを作ること。同じ motif/prop ばかり繰り返さない。`,
    `5. cast は brief.cast の subset とし、bible.characters に存在する character_id のみを使用してください。`,
    `6. dialogue_plan.key_lines の uniqueness は cliffhanger 等の決め台詞のみ "scene_exclusive" とし、それ以外は "may_repeat" としてください。`,
    `7. foreshadow_setup の payoff_episode_hint は "this_episode" / "next_episode" / "later_in_volume" / "cross_volume" から選んでください。`,
    `8. 候補間で beat 解釈・演出 mode・key_visual_intent を変えて多様性を確保してください (scene_exclusive 台詞も候補間で重複させない)。`,
    `9. 仕様詳細: docs/plans/manga/scene-graph-l3-5.md`,
    volumeContextSection ? `10. (L2 連携) 上記「## 巻内位置」が提供されている場合:` : null,
    volumeContextSection ? `    - 各候補の protagonist_arc_state.belief / goal / delta_from_prev は` : null,
    volumeContextSection ? `      当 episode の protagonist_arc (start/turn/end) に整合させる` : null,
    volumeContextSection ? `    - foreshadow_setup の payoff_episode_hint は volume_plot.foreshadow_map の seed/payoff 距離に合わせる` : null,
    volumeContextSection ? `      (seed と payoff が同 episode → "this_episode"、隣 episode → "next_episode"、` : null,
    volumeContextSection ? `       同巻内別 episode → "later_in_volume"、別巻 → "cross_volume")` : null,
    volumeContextSection ? `    - 当 episode が payoff 側になっている伏線 (## 当 episode が関わる巻またぎ伏線 で seed が` : null,
    volumeContextSection ? `      過去 episode のもの) は、scene のどこかで foreshadow_payoff に対応 token を含める` : null,
    volumeContextSection ? `    - cliffhanger 系 scene (arc_position.arc_phase=resolution / cliffhanger 等) では` : null,
    volumeContextSection ? `      cliffhanger_hook の方向性 + pull_link.next_opening_hook_hint を反映する` : null,
    "",
    feedbackSection,
    feedbackSection ? "" : null,
    `## 出力形式`,
    `\`\`\`json`,
    `{`,
    `  "candidates": [`,
    `    {`,
    `      "beat_type": "...",`,
    `      "cast": [...],`,
    `      "...A系/B系...": "...",`,
    `      "wardrobe_state": [{ "character_id": "char_xxx_v1", "costume_id": "cos_xxx" }],`,
    `      "visual_motif_anchors": [{ "motif_id": "...", "intensity": "clear" }],`,
    `      "world_rules_active": ["..."],`,
    `      "props_in_play": [{ "prop_id": "...", "held_by": "char_xxx_v1" }],`,
    `      "theme_subtext": "..."`,
    `    }`,
    `  ]`,
    `}`,
    `\`\`\``,
  ].filter((line): line is string => line !== null).join("\n");
}

function buildTier2FeedbackSection(feedback: Tier2Feedback): string {
  const prev = feedback.prev_selected;
  return [
    `## 再生成 (Tier 2 / 周回 ${feedback.iteration})`,
    "",
    `前周回で生成した候補の最良は以下でしたが、anchor pool 採点が低く (llm_score=${feedback.prev_anchor_score})、`,
    `再生成が発火しました。改善した候補を生成してください。`,
    "",
    `### 前回の最良候補`,
    `- beat: ${prev.beat_type} / mode: ${prev.mode}`,
    `- key_visual_intent: ${prev.key_visual_intent}`,
    `- protagonist belief: ${prev.protagonist_arc_state.belief}`,
    `- pairwise_win_rate: ${feedback.prev_pairwise_score}`,
    "",
    `### 改善方針`,
    `1. 既存 anchor pool (商業漫画) と比べて何が不足だったかを推定`,
    `2. key_visual_intent をより具体的・映像的に`,
    `3. dialogue_plan.key_lines の uniqueness と intent を吟味`,
    `4. bible motifs (黒フード、ヒビ端末、Fランク ID、青光、朱色公的光等) を確実に組み込む`,
    `5. world.premise の哲学 (情報持つ側の恐怖 / 持たない側の怒り、測定文化、制度の翻訳) と整合させる`,
    `6. 巻内位置 (volume_theme + 当 ep の protagonist_arc + 周辺 ep) との整合をより強める`,
    feedback.anchor_feedback_text
      ? `7. anchor 比較の指摘点も改善する: ${feedback.anchor_feedback_text}`
      : null,
  ].filter((line): line is string => line !== null).join("\n");
}

function stubCandidate(slot: SceneSlot, idx: number): Scene {
  return {
    ...slot,
    beat_type: "transition",
    cast: [],
    dialogue_plan: { key_lines: [] },
    foreshadow_setup: [],
    foreshadow_payoff: [],
    protagonist_arc_state: {
      belief: `[stub-cand-${idx}]`,
      goal: `[stub-cand-${idx}]`,
      emotion: "calm",
      delta_from_prev: `[stub-cand-${idx}]`,
    },
    relationship_state_delta: [],
    time_axis: {
      label: "[stub]",
      order: idx,
      is_flashback: false,
      is_flashforward: false,
      duration_hint: "moments",
    },
    page_budget: { min: 1, max: 1, preferred: 1 },
    mode: "transition_montage",
    turn_anchor: { at_panel_no: null, type: "none" },
    layout_pattern_id: null,
    subtype_directive: { external_social: false, gacha_ui: false, hybrid: false },
    render_strategy: "page_one_shot",
    key_visual_intent: `[stub-cand-${idx}] ${slot.scene_id}`,
  };
}

// ============================================================================
// Pairwise tournament
// ============================================================================

export type PairwiseResult = {
  candidate_id: string; // candidate index を encode する (例: "c0", "c1"...)
  wins: number;
  losses: number;
  win_rate: number;
};

/**
 * N 候補の総当り pairwise tournament を行う。C(N, 2) = N(N-1)/2 マッチ。
 * 実装: pairwise-judge agent を 2 候補ごとに呼び出して勝者を判定。
 */
export async function runPairwiseTournament(
  candidates: Scene[],
  context: GenerationContext,
  config: ScoringLoopConfig
): Promise<PairwiseResult[]> {
  if (config.dry_run) {
    return candidates.map((_, i) => ({
      candidate_id: `c${i}`,
      wins: candidates.length - 1 - i,
      losses: i,
      win_rate: (candidates.length - 1 - i) / Math.max(1, candidates.length - 1),
    }));
  }
  const volumeContext = await loadVolumeContext(context.volumePlotPath, context.episode);
  // 総当たり C(N,2) マッチを Codex に並列実行させる。
  // 1 マッチ = 2 候補のテキスト + scene 文脈 → 勝者を返す。
  const wins = new Array<number>(candidates.length).fill(0);
  const losses = new Array<number>(candidates.length).fill(0);
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      pairs.push([i, j]);
    }
  }
  const results = await Promise.all(
    pairs.map(async ([i, j]) => {
      const task = buildPairwisePrompt(candidates[i], candidates[j], i, j, volumeContext);
      const r = await runCodexText<{ winner: "a" | "b"; reason?: string }>({
        task,
        format: "json",
        cwd: process.env.AINARO_REPO_ROOT ?? process.cwd(),
        timeoutMs: 5 * 60 * 1000,
        maxRetries: 1,
      });
      const winner = r.parsed?.winner ?? "a";
      return { i, j, winner };
    })
  );
  for (const { i, j, winner } of results) {
    if (winner === "a") {
      wins[i]++;
      losses[j]++;
    } else {
      wins[j]++;
      losses[i]++;
    }
  }
  const total = candidates.length - 1;
  return candidates.map((_, i) => ({
    candidate_id: `c${i}`,
    wins: wins[i],
    losses: losses[i],
    win_rate: total > 0 ? wins[i] / total : 0,
  }));
}

/**
 * pairwise-judge 用の prompt を構築する。a 候補と b 候補のテキスト + 共通 scene 文脈を渡し、
 * 勝者を JSON で返してもらう。
 */
export function buildPairwisePrompt(
  a: Scene,
  b: Scene,
  iA: number,
  iB: number,
  volumeContext?: VolumeContext | null
): string {
  const volumeContextSection = formatVolumeContextSection(volumeContext ?? null);
  return [
    `あなたは AINARO 漫画 v2 scene 候補の pairwise judge です。`,
    `同じ scene slot (${a.scene_id}) に対する 2 候補のうち、より「商業漫画として面白い」方を選んでください。`,
    "",
    volumeContextSection || null,
    volumeContextSection ? "" : null,
    `## 候補 a (idx=${iA})`,
    `beat: ${a.beat_type} / mode: ${a.mode}`,
    `key_visual: ${a.key_visual_intent}`,
    `protagonist: belief="${a.protagonist_arc_state.belief}" / goal="${a.protagonist_arc_state.goal}" / emotion=${a.protagonist_arc_state.emotion}`,
    `dialogue:`,
    a.dialogue_plan.key_lines
      .map((kl) => `  - [${kl.speaker}] 「${kl.text}」 (${kl.intent})`)
      .join("\n") || "  (none)",
    "",
    `## 候補 b (idx=${iB})`,
    `beat: ${b.beat_type} / mode: ${b.mode}`,
    `key_visual: ${b.key_visual_intent}`,
    `protagonist: belief="${b.protagonist_arc_state.belief}" / goal="${b.protagonist_arc_state.goal}" / emotion=${b.protagonist_arc_state.emotion}`,
    `dialogue:`,
    b.dialogue_plan.key_lines
      .map((kl) => `  - [${kl.speaker}] 「${kl.text}」 (${kl.intent})`)
      .join("\n") || "  (none)",
    "",
    `## 評価軸 (重要度順)`,
    `1. 物語論理: 主人公の信念遷移 / 関係性 delta / 伏線の整合と読者期待のコントロール`,
    `2. 商業漫画品質: 「読める」B- ではなく「商業作家として通用する」A-`,
    `3. 演出: 1 ページめくり位置 / silence panel / 緊張ピークでのコマ形状`,
    `4. 独自性ではなく「ヒット型を質高く実行」`,
    volumeContextSection ? `5. (L2 連携) 上記「## 巻内位置」が提供されている場合、当 episode の` : null,
    volumeContextSection ? `   protagonist_arc (start/turn/end) と must_include_events、巻またぎ伏線への整合をより満たす方を優先する。` : null,
    volumeContextSection ? `   巻全体テーマ (volume_theme) との一貫性も加味する。` : null,
    "",
    `## 出力形式`,
    `\`\`\`json`,
    `{ "winner": "a" | "b", "reason": "1-2 行" }`,
    `\`\`\``,
  ].filter((line): line is string => line !== null).join("\n");
}

// ============================================================================
// Predict-hit (v12 アンサンブル)
// ============================================================================

export type PredictHitScore = {
  v12_ep1: number; // AUC 0.746 のテキスト hit predictor
  v12_longform: number; // Top5% precision 69.5% の longform predictor
  ensemble: number; // 幾何平均
};

/**
 * scene 候補のテキスト (action / dialogue_plan / key_visual_intent) を predict-hit-v12 に投げる。
 *
 * 注意 (feedback_hit_predictor_distribution_match):
 *   predict-hit-v12 は episode 全体 (5000-10000 字) で訓練・推論される設計。
 *   scene 単体 (~500-2000 字) は訓練分布外で精度が出ない。
 *   scene 単位の絶対品質は anchor pool 比較 (compareToAnchorPool) で代替し、
 *   predict-hit は episode 全体に対して 1 回だけ実行する (scoreEpisodePredictHit を使う)。
 *
 *   この関数は dry-run でのみ「scene 候補ごとの擬似 hit-score」を提供し、Tier 1 の
 *   weighted score 計算に使う。実 LLM mode では呼ばないことを推奨。
 */
export async function scorePredictHit(
  candidate: Scene,
  config: ScoringLoopConfig
): Promise<PredictHitScore> {
  if (config.dry_run) {
    // seed-based stub: scene_id ハッシュで擬似値
    const seed = hashSeed(candidate.scene_id + candidate.key_visual_intent);
    const ep1 = 0.4 + (seed % 100) / 250; // 0.4..0.8
    const longform = 0.3 + ((seed >> 8) % 100) / 200; // 0.3..0.8
    return {
      v12_ep1: round2(ep1),
      v12_longform: round2(longform),
      ensemble: round2(Math.sqrt(ep1 * longform)),
    };
  }
  // 実 LLM mode では scene 単体の predict-hit は分布外なので適用しない
  // 代わりに anchor pool llm_score を使うこと
  throw new Error(
    "[scoring-loop] scorePredictHit: scene 単位の predict-hit は distribution mismatch。anchor pool 経由で代替してください。episode 全体は scoreEpisodePredictHit を使用。"
  );
}

/**
 * episode 全体の scene-graph を予測モデル (v12-ep1 + v12-longform) に投げる。
 *
 * 流れ:
 *   1. scene-graph の全 scene の {action / key_visual_intent / dialogue_plan / monologue 相当} を
 *      連結して 5000-10000 字程度のテキストにする (serializeSceneGraphForPrediction)
 *   2. 一時ファイルに書き出す
 *   3. python3 scripts/predict/predict-hit-v12.py --slug <slug> --episode <ep> --text-file <tmp>
 *      を subprocess 実行
 *   4. 標準出力 (JSON) を parse して PredictHitScore を返す
 *
 * 訓練/推論分布一致: feedback_hit_predictor_distribution_match.md
 *   - v12-ep1: GP/ep top20% 予測 (AUC 0.746)
 *   - v12-longform: totalEpisodes>=50 で長編化予測 (Top 5% Precision 69.5%)
 *   - ensemble: 幾何平均 (predict-hit-v12.py がジャンル別加重も適用)
 */
export async function scoreEpisodePredictHit(
  sceneGraph: SceneGraphV1,
  options: {
    slug: string;
    episode: number;
    pythonBin?: string;
    scriptPath?: string;
  },
  config: ScoringLoopConfig
): Promise<PredictHitScore> {
  if (config.dry_run) {
    const seed = hashSeed(sceneGraph.episode_id + JSON.stringify(sceneGraph.scenes.map((s) => s.scene_id)));
    const ep1 = 0.45 + (seed % 100) / 300;
    const longform = 0.4 + ((seed >> 8) % 100) / 250;
    return {
      v12_ep1: round2(ep1),
      v12_longform: round2(longform),
      ensemble: round2(Math.sqrt(ep1 * longform)),
    };
  }

  // live mode
  const { spawn } = await import("node:child_process");
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");

  const text = serializeSceneGraphForPrediction(sceneGraph);
  if (text.length < 1000) {
    throw new Error(
      `[scoring-loop] scoreEpisodePredictHit: serialized text too short (${text.length} chars). Min 1000 expected for predict-hit-v12 distribution match.`
    );
  }

  // Python script は REPO_ROOT 経由の絶対パスで解決 (cwd 非依存)
  const repoRoot = process.env.AINARO_REPO_ROOT ?? process.cwd();
  const py = options.pythonBin ?? "python3";
  const script = options.scriptPath
    ? path.isAbsolute(options.scriptPath)
      ? options.scriptPath
      : path.join(repoRoot, options.scriptPath)
    : path.join(repoRoot, "scripts/predict/predict-hit-v12.py");

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "scene-graph-predict-"));
  const tmpFile = path.join(tmpDir, `${options.slug}_ep${options.episode}.md`);

  try {
    await fs.writeFile(tmpFile, text, "utf-8");
    return await new Promise<PredictHitScore>((resolve, reject) => {
      const child = spawn(py, [
        script,
        "--slug", options.slug,
        "--episode", String(options.episode),
        "--text-file", tmpFile,
      ]);
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (b) => (stdout += b.toString()));
      child.stderr.on("data", (b) => (stderr += b.toString()));
      child.on("error", (err) => reject(err));
      child.on("close", (code) => {
        if (code !== 0) {
          return reject(new Error(`[scoring-loop] predict-hit exit code ${code}: ${stderr}`));
        }
        // predict-hit-v12.py は JSON とフッタ "\n保存: <path>" を出力する。
        // フッタを除去してから JSON.parse、失敗時は最初の {...} ブロックを抽出して再試行。
        const beforeFooter = stdout.split(/\n保存:\s/)[0].trim();
        let parsed: Record<string, unknown> | null = null;
        try {
          parsed = JSON.parse(beforeFooter);
        } catch {
          const m = stdout.match(/\{[\s\S]*?\n\}/);
          if (m) {
            try {
              parsed = JSON.parse(m[0]);
            } catch {
              parsed = null;
            }
          }
        }
        if (!parsed) {
          return reject(
            new Error(`[scoring-loop] predict-hit output not parseable: ${stdout.slice(0, 500)}`)
          );
        }
        const j = parsed as {
          hitProbability?: number;
          hitProbabilityEqual?: number;
          hitProbabilityEp1?: number;
          hitProbabilityLongform?: number;
        };
        const ep1 = (j.hitProbabilityEp1 ?? 0) / 100;
        const longform = (j.hitProbabilityLongform ?? 0) / 100;
        const ensemble = (j.hitProbability ?? j.hitProbabilityEqual ?? 0) / 100;
        resolve({ v12_ep1: round2(ep1), v12_longform: round2(longform), ensemble: round2(ensemble) });
      });
    });
  } finally {
    // 例外発生時を含めて必ず tmpDir を掃除
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      /* cleanup best-effort */
    }
  }
}

/**
 * scene-graph を predict-hit-v12 入力用テキストに連結する。
 *
 * フォーマット (各 scene を chapter として):
 *   # 第 N 話
 *   ## scene S01 (page X-Y, location: ...)
 *   key_visual: ...
 *   protagonist: belief=... goal=... emotion=...
 *   dialogue:
 *     [話者] 台詞
 *   ...
 *
 * 字数の目安: 1 scene ~ 500-1000 字、10 scene で 5000-10000 字 (v12 の訓練分布)
 */
export function serializeSceneGraphForPrediction(sceneGraph: SceneGraphV1): string {
  const lines: string[] = [];
  lines.push(`# ${sceneGraph.episode_id}`);
  lines.push("");
  for (const scene of sceneGraph.scenes) {
    lines.push(
      `## ${scene.scene_id} (page ${scene.page_range.start}-${scene.page_range.end}, location: ${scene.location_id}, beat: ${scene.beat_type}, mode: ${scene.mode})`
    );
    lines.push(`key_visual: ${scene.key_visual_intent}`);
    lines.push(
      `protagonist: belief="${scene.protagonist_arc_state.belief}" / goal="${scene.protagonist_arc_state.goal}" / emotion=${scene.protagonist_arc_state.emotion}`
    );
    if (scene.protagonist_arc_state.delta_from_prev) {
      lines.push(`delta: ${scene.protagonist_arc_state.delta_from_prev}`);
    }
    if (scene.relationship_state_delta.length > 0) {
      lines.push("relationships:");
      for (const r of scene.relationship_state_delta) {
        lines.push(`  - ${r.pair[0]} ↔ ${r.pair[1]}: ${r.direction} (${r.intensity}) ${r.trigger}`);
      }
    }
    if (scene.dialogue_plan.key_lines.length > 0) {
      lines.push("dialogue:");
      for (const kl of scene.dialogue_plan.key_lines) {
        lines.push(`  - [${kl.speaker}] 「${kl.text}」 (${kl.intent})`);
      }
    }
    if (scene.foreshadow_setup.length > 0) {
      lines.push(`foreshadow_setup: ${scene.foreshadow_setup.map((f) => f.token).join(", ")}`);
    }
    if (scene.foreshadow_payoff.length > 0) {
      lines.push(`foreshadow_payoff: ${scene.foreshadow_payoff.join(", ")}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (const ch of s) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ============================================================================
// Anchor pool comparison
// ============================================================================

export type AnchorDiff = {
  top3_anchor_ids: string[];
  cosine_avg: number;
  llm_score: number;
};

/**
 * Anchor pool entry (data/generation/anchors/<subgenre>/anchors.json から読む)
 */
export type AnchorEntry = {
  anchorId: string;
  ncode: string;
  title: string;
  band: "hit" | "middle" | "low";
  globalPoint: number;
  episodes: number;
  narouGenreName?: string;
  source?: string;
  hasLayer3?: boolean;
  hasLayer5?: boolean;
  matchedKeywords?: string[];
  classifyScore?: number;
};

export type AnchorPool = {
  subGenreId: string;
  version: string;
  anchors: AnchorEntry[];
};

/**
 * sub-genre の anchor pool を読み込む。
 * パス: data/generation/anchors/<subGenreId>/anchors.json
 *
 * `band` でフィルタ可能 (hit / middle / low)。デフォルトは hit のみ (上位作品との比較用)。
 */
export async function loadAnchorPool(
  subGenreId: string,
  options?: { band?: "hit" | "middle" | "low" | "all"; root?: string }
): Promise<AnchorPool> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const root =
    options?.root ?? path.join(process.cwd(), "data/generation/anchors");
  const file = path.join(root, subGenreId, "anchors.json");
  const raw = await fs.readFile(file, "utf-8");
  const pool = JSON.parse(raw) as AnchorPool;
  const band = options?.band ?? "hit";
  if (band !== "all") {
    pool.anchors = pool.anchors.filter((a) => a.band === band);
  }
  return pool;
}

/**
 * anchor の Layer3 (あらすじ) 本文を読む。
 * パス: data/generation/anchors/<subGenreId>/layer3/<band>/<anchorId>.md
 */
export async function loadAnchorLayer3(
  subGenreId: string,
  anchor: AnchorEntry,
  options?: { root?: string }
): Promise<string | null> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const root =
    options?.root ?? path.join(process.cwd(), "data/generation/anchors");
  const file = path.join(root, subGenreId, "layer3", anchor.band, `${anchor.anchorId}.md`);
  try {
    return await fs.readFile(file, "utf-8");
  } catch {
    return null;
  }
}

/**
 * anchor の Layer5 (エピソード本文) を読む。
 * パス: data/generation/anchors/<subGenreId>/layer5/<band>/<anchorId>.md
 */
export async function loadAnchorLayer5(
  subGenreId: string,
  anchor: AnchorEntry,
  options?: { root?: string }
): Promise<string | null> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const root =
    options?.root ?? path.join(process.cwd(), "data/generation/anchors");
  const file = path.join(root, subGenreId, "layer5", anchor.band, `${anchor.anchorId}.md`);
  try {
    return await fs.readFile(file, "utf-8");
  } catch {
    return null;
  }
}

/**
 * scene 候補と anchor pool の同サブジャンル anchor を比較する。
 *
 * 流れ (live mode):
 *   1. context から sub-genre を解決 (bible.meta + brief から推定、後で wire)
 *   2. loadAnchorPool() で hit band の anchor 一覧を取得
 *   3. 各 anchor の Layer3 / Layer5 を読んで scene 候補テキストとの cosine 類似度を計算
 *      embedding 本体は OpenAI / 内製 vector store 経由 (B3 中盤で wire)
 *   4. cosine top-3 を返す
 *   5. audit-coherence agent に top-3 anchor と scene を渡して absolute 品質を 0..1 で採点
 *
 * dry-run: seed-based stub。実 anchor pool アクセスはしない。
 */
export async function compareToAnchorPool(
  candidate: Scene,
  context: GenerationContext,
  config: ScoringLoopConfig
): Promise<AnchorDiff> {
  if (config.dry_run) {
    const seed = hashSeed(candidate.scene_id);
    return {
      top3_anchor_ids: [
        `anchor_stub_${seed % 19}`,
        `anchor_stub_${(seed + 1) % 19}`,
        `anchor_stub_${(seed + 2) % 19}`,
      ],
      cosine_avg: round2(0.6 + (seed % 30) / 100),
      llm_score: round2(0.5 + ((seed >> 4) % 50) / 100),
    };
  }

  // live mode: sub-genre 解決 → anchor pool 読み込み → Codex に top-3 と llm_score を判定させる
  const subGenreId = resolveSubGenreId(context.slug);
  const pool = await loadAnchorPool(subGenreId, { band: "hit" });
  const anchorsWithText = await Promise.all(
    pool.anchors.slice(0, 12).map(async (a) => ({
      anchor: a,
      layer3: await loadAnchorLayer3(subGenreId, a),
    }))
  );
  const usable = anchorsWithText.filter((x) => x.layer3 != null);
  if (usable.length === 0) {
    throw new Error(
      `[scoring-loop] compareToAnchorPool: no anchor with Layer3 found for sub-genre ${subGenreId}.`
    );
  }
  const volumeContext = await loadVolumeContext(context.volumePlotPath, context.episode);
  const task = buildAnchorComparePrompt(candidate, subGenreId, usable, volumeContext);
  const r = await runCodexText<{
    top3_anchor_ids: string[];
    cosine_avg?: number;
    llm_score: number;
  }>({
    task,
    format: "json",
    cwd: process.env.AINARO_REPO_ROOT ?? process.cwd(),
    timeoutMs: 5 * 60 * 1000,
    maxRetries: 1,
  });
  if (!r.parsed) {
    throw new Error(
      `[scoring-loop] compareToAnchorPool: codex returned unparseable JSON for ${candidate.scene_id}. stdout head: ${r.stdout.slice(0, 300)}`
    );
  }
  return {
    top3_anchor_ids: r.parsed.top3_anchor_ids ?? [],
    cosine_avg: round2(r.parsed.cosine_avg ?? 0),
    llm_score: round2(Math.max(0, Math.min(1, r.parsed.llm_score ?? 0))),
  };
}

/**
 * anchor 比較用の Codex prompt を構築する。scene 候補と top-N anchor を渡し、
 * top-3 anchor と llm_score を JSON で返してもらう。
 */
export function buildAnchorComparePrompt(
  candidate: Scene,
  subGenreId: string,
  anchors: Array<{ anchor: AnchorEntry; layer3: string | null }>,
  volumeContext?: VolumeContext | null
): string {
  const volumeContextSection = formatVolumeContextSection(volumeContext ?? null);
  const anchorBlocks = anchors
    .map(
      (x, idx) =>
        `### anchor ${idx} (${x.anchor.anchorId}, GP=${x.anchor.globalPoint})\n${(x.layer3 ?? "").slice(0, 1500)}`
    )
    .join("\n\n");
  return [
    `あなたは AINARO 漫画 v2 anchor pool 比較エージェントです。`,
    `sub-genre: ${subGenreId}`,
    `候補 scene が同 sub-genre の hit anchor 群と比べて「商業漫画として通用する絶対品質」を 0..1 で採点します。`,
    "",
    volumeContextSection || null,
    volumeContextSection ? "" : null,
    `## 候補 scene (${candidate.scene_id}, ${candidate.beat_type}, ${candidate.mode}, ${candidate.location_id})`,
    `key_visual: ${candidate.key_visual_intent}`,
    `protagonist: belief="${candidate.protagonist_arc_state.belief}" / goal="${candidate.protagonist_arc_state.goal}" / emotion=${candidate.protagonist_arc_state.emotion}`,
    `dialogue:`,
    candidate.dialogue_plan.key_lines
      .map((kl) => `  - [${kl.speaker}] 「${kl.text}」 (${kl.intent})`)
      .join("\n") || "  (none)",
    "",
    `## 同 sub-genre hit anchors (Layer3 あらすじ抜粋)`,
    anchorBlocks,
    "",
    `## 評価ルール`,
    `1. anchor pool は「ヒット作」のサンプル。anchor との類似度ではなく「同等品質か」を採点する (通過率ではなく絶対品質、feedback_quality_over_pass_rate)`,
    `2. 「漫画として読める」B- ではなく「商業作家として通用する」A- を 0.7 以上の基準とする (feedback_commercial_vs_readable)`,
    `3. 独自性は 0.0 〜 0.2 の補正に留め、「ヒット型を質高く実行」を主軸とする (feedback_quality_over_novelty)`,
    volumeContextSection ? `4. (L2 連携) 上記「## 巻内位置」が提供されている場合、当 scene が「当 episode の` : null,
    volumeContextSection ? `   protagonist_arc と must_include_events、巻全体テーマに沿っているか」も品質判断に加味する。` : null,
    volumeContextSection ? `   anchor との比較は「同等品質か」を主軸とし、巻内位置整合は補助評価軸 (±0.1) として加える。` : null,
    "",
    `## 出力形式`,
    `\`\`\`json`,
    `{ "top3_anchor_ids": ["...", "...", "..."], "cosine_avg": 0.0, "llm_score": 0.0 }`,
    `\`\`\``,
    `※ cosine_avg は embedding 比較を実装していないため 0 でよい。llm_score を主指標とする。`,
  ].filter((line): line is string => line !== null).join("\n");
}

// ============================================================================
// Sub-genre resolution helper
// ============================================================================

/**
 * bible.meta + brief から anchor pool の subGenreId を解決する。
 * a07 は "battle_dungeon", d02 は "battle_dungeon", d03 は "isekai_tensei_cheat" 想定。
 * メモ: project_genre_3parallel.md に Phase A 検証 3 作品の対応表。
 *
 * 暫定: 引数で渡す方式。bible.meta.genre / subtype から自動解決は B3 中盤で実装。
 */
export function resolveSubGenreId(slug: string, hint?: string): string {
  if (hint) return hint;
  // 暫定: slug から推定
  if (slug.startsWith("a07")) return "battle_dungeon"; // 現代ダンジョン
  if (slug.startsWith("d02")) return "battle_dungeon"; // ダンジョン探索
  if (slug.startsWith("d03")) return "isekai_tensei_cheat"; // 転生貴族領地経営
  throw new Error(
    `[scoring-loop] resolveSubGenreId: unable to resolve subgenre for slug="${slug}". Provide hint explicitly.`
  );
}

// ============================================================================
// Tier 1 / Tier 2 / Tier 3 オーケストレーション
// ============================================================================

export type Tier1Outcome = {
  selected: Scene;
  selection: SceneSelection;
  /** 採用候補が anchor 下位閾値にいたら true → Tier 2 発火 */
  needs_regeneration: boolean;
};

export function needsTier2Regeneration(
  anchorLlmScore: number,
  config: Pick<ScoringLoopConfig, "tier2_threshold_pct">
): boolean {
  return anchorLlmScore < (1 - config.tier2_threshold_pct);
}

/**
 * 1 scene slot に対して Tier 1 を 1 周回す。
 *   1. candidates×N 生成
 *   2. pairwise tournament
 *   3. anchor pool 比較 (cosine + LLM 採点)
 *   4. 総合スコアで採用 1 個 (組成式: 0.55*pairwise + 0.45*anchor_llm_score)
 *
 * scene 単位の predict-hit は distribution mismatch のため Tier 1 に組み込まない。
 * episode 全体の predict-hit は採用 scene 列が確定したあと scoreEpisodePredictHit で
 * 1 度だけ実行する (caller が runEpisodeScoringLoop の戻り値に対して呼ぶ)。
 *
 * dry-run mode では scorePredictHit の擬似値を selection.predict_hit に書き込んで
 * 出力 schema の互換性を保つ。live mode では selection.predict_hit は scene 採用
 * 直後には未確定 (placeholder all-zero) で、episode-level スコア後に上書きする。
 */
export async function runTier1(
  slot: SceneSlot,
  context: GenerationContext,
  config: ScoringLoopConfig,
  iteration = 1,
  prevCandidateCount = 0,
  feedback?: Tier2Feedback
): Promise<Tier1Outcome> {
  const candidates = await generateSceneCandidates(slot, context, config, feedback);
  const pairwise = await runPairwiseTournament(candidates, context, config);
  const anchorDiffs = await Promise.all(
    candidates.map((c) => compareToAnchorPool(c, context, config))
  );

  // 採用判定: pairwise win_rate と anchor llm_score の加重平均
  let bestIdx = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < candidates.length; i++) {
    const score =
      0.55 * pairwise[i].win_rate + 0.45 * anchorDiffs[i].llm_score;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  // dry-run のみ scene 単位の擬似 hit-score を埋める (互換性維持)。
  // live mode は episode-level scoreEpisodePredictHit に委譲し、ここでは placeholder。
  const placeholderHit: PredictHitScore = config.dry_run
    ? await scorePredictHit(candidates[bestIdx], config)
    : { v12_ep1: 0, v12_longform: 0, ensemble: 0 };

  const selection: SceneSelection = {
    tier: 1,
    iterations: iteration,
    candidate_count: prevCandidateCount + candidates.length,
    pairwise_score: pairwise[bestIdx].win_rate,
    predict_hit: placeholderHit,
    anchor_diff: anchorDiffs[bestIdx],
    template_collision: { collision_rate: 0, nearest_template: null }, // B4 で埋める
    decision_log: { selected_at: new Date().toISOString() },
  };

  // anchor 下位閾値判定: llm_score が閾値未満なら再生成発火
  const needs_regeneration = needsTier2Regeneration(anchorDiffs[bestIdx].llm_score, config);

  return {
    selected: { ...candidates[bestIdx], selection },
    selection,
    needs_regeneration,
  };
}

/**
 * Tier 1 が anchor 下位なら再生成 (Tier 2)。最大 config.tier2_max_iterations 周。
 * 各周回で「前回 anchor との差分」を feedback prompt として candidate 生成に渡す。
 */
export async function runTier2(
  slot: SceneSlot,
  prev: Tier1Outcome,
  context: GenerationContext,
  config: ScoringLoopConfig
): Promise<{ outcome: Tier1Outcome; tier: 1 | 2 | 3 }> {
  let current = prev;
  for (let iter = 1; iter <= config.tier2_max_iterations; iter++) {
    if (!current.needs_regeneration) {
      return { outcome: current, tier: iter === 1 ? 1 : 2 };
    }
    const feedback: Tier2Feedback = {
      prev_selected: current.selected,
      prev_anchor_score: current.selection.anchor_diff.llm_score,
      prev_pairwise_score: current.selection.pairwise_score,
      iteration: iter + 1,
    };
    const newOutcome = await runTier1(
      slot,
      context,
      config,
      iter + 1,
      current.selection.candidate_count,
      feedback,
    );
    newOutcome.selection.tier = 2;
    current = newOutcome;
  }
  // Tier 2 でも閾値未達なら Tier 3 (人間 review)
  if (current.needs_regeneration && config.tier3_enabled) {
    current.selection.tier = 3;
    current.selection.decision_log.tier3_human_decision = "pending";
    return { outcome: current, tier: 3 };
  }
  return { outcome: current, tier: 2 };
}

// ============================================================================
// Episode-level loop entry
// ============================================================================

export type EpisodeScoringResult = {
  scene_graph: SceneGraphV1;
  tier_breakdown: { tier1: number; tier2: number; tier3: number };
  total_candidates_generated: number;
};

/**
 * episode 全体の scene slot 列に対して Tier 1/2/3 を順に回し、確定 scene_graph を返す。
 *
 * 入力 slot 列は L3.5 entry script が「shotlist + brief」から作る (B3 中盤)。
 * 本関数の責務はオーケストレーションのみ。
 */
export async function runEpisodeScoringLoop(
  slots: SceneSlot[],
  context: GenerationContext,
  config: ScoringLoopConfig,
  episodeId: string
): Promise<EpisodeScoringResult> {
  const finalizedScenes: Scene[] = [];
  const tierCount = { tier1: 0, tier2: 0, tier3: 0 };
  let totalCandidates = 0;

  for (const slot of slots) {
    const ctx: GenerationContext = { ...context, finalizedScenes };
    const t1 = await runTier1(slot, ctx, config);
    let result;
    if (t1.needs_regeneration) {
      const t2 = await runTier2(slot, t1, ctx, config);
      result = t2;
    } else {
      result = { outcome: t1, tier: 1 as const };
    }
    finalizedScenes.push(result.outcome.selected);
    totalCandidates += result.outcome.selection.candidate_count;
    if (result.tier === 1) tierCount.tier1++;
    else if (result.tier === 2) tierCount.tier2++;
    else tierCount.tier3++;
  }

  return {
    scene_graph: {
      schema_version: 1,
      episode_id: episodeId,
      scenes: finalizedScenes,
      generated_at: new Date().toISOString(),
      source: {
        brief_path: context.briefPath,
        shotlist_path: "",
        bible_snapshot_path: context.bibleSnapshotPath,
        volume_plot_path: context.volumePlotPath,
      },
      _note: config.dry_run ? "[dry-run] generated by scoring-loop stub" : undefined,
    },
    tier_breakdown: tierCount,
    total_candidates_generated: totalCandidates,
  };
}

// ============================================================================
// Token budget estimation (cost guard)
// ============================================================================

export type CostEstimate = {
  scenes: number;
  candidates_per_scene: number;
  est_tokens_per_episode: number;
  est_tokens_per_volume: number;
  fits_in_max5h: boolean;
  notes: string[];
};

/**
 * 実 LLM モードで動かす前のコスト見積もり。calibration の 109M (feedback_calibration_rate_limit) と
 * 桁を間違えないため、scene-level の予算をここで明示する。
 */
export function estimateCost(
  scenes: number,
  config: ScoringLoopConfig,
  episodesPerVolume = 10
): CostEstimate {
  const cand = config.candidatesPerScene;
  const candidateGen = scenes * cand * 2000; // 2k tokens / candidate
  const pairwise = scenes * ((cand * (cand - 1)) / 2) * 4000; // C(N,2) * 4k
  const predictHit = scenes * cand * 1000 * 2; // v12_ep1 + v12_longform
  const anchor = scenes * cand * 2000;
  const epMetrics = 4 * 5000;
  const perEpisode = candidateGen + pairwise + predictHit + anchor + epMetrics;
  const perVolume = perEpisode * episodesPerVolume;
  const max5h = 25_000_000; // feedback_calibration_rate_limit より実測上限 25-30M/5h
  const fits = perVolume <= max5h;
  const notes: string[] = [];
  if (!fits) {
    notes.push(`per-volume (${perVolume.toLocaleString()}) exceeds Max 5h limit ${max5h.toLocaleString()}`);
  }
  if (config.tier2_max_iterations > 0) {
    notes.push(`Tier 2 再生成は最大 ${config.tier2_max_iterations} 周、最悪 ${(perEpisode * (1 + config.tier2_max_iterations)).toLocaleString()} tokens/ep`);
  }
  return {
    scenes,
    candidates_per_scene: cand,
    est_tokens_per_episode: perEpisode,
    est_tokens_per_volume: perVolume,
    fits_in_max5h: fits,
    notes,
  };
}

// ============================================================================
// Re-export types for callers
// ============================================================================

export type { SceneGraphV1, Scene, SceneSelection, PayoffEpisodeHint };
