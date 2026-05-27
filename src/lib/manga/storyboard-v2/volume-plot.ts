/**
 * Volume Plot Generator
 *
 * bible.snapshot + V2企画書.main_arc/volume_outline → volumes/v{NN}/plot.json
 * 10話分の章構成 + 伏線蒔き/回収マップ + cliffhanger 設計
 *
 * 各 ep の brief は L3 入力として使う想定。
 *
 * Phase X WX-3 (2026-05-06) でジャンル非依存化:
 *   - 旧版は「現代ダンジョン × システム音声」「コンビニ夜勤 or 装備値切り」をハードコード
 *   - 新版は bible.meta.art_style から MangaGenrePreset を逆引きして prompt に注入
 *   - tone_profile.recovery_cadence ≤ 0.3 の bible には「小報酬 beat 必須」を強制注入
 */
import { runCodexText } from "../llm/codex-text";
import type { BibleSnapshotV2, PullLink, SeriesPlan, ArcPlan } from "../schemas-v2";
import type { V2Concept } from "../bible/v2-adapter";
import { findGenreByArtStyle } from "../storyboard/genre-presets";
import {
  loadArchetypeDict,
  findArchetype,
  buildArchetypeDictPrompt,
  buildArchetypeConstraints,
} from "./episode-archetype";
// 2026-05-20 S1 4 ドメイン契約 (Domain A/B)
import { type VolumeSpine, validateVolumeSpine } from "./volume-spine";
import {
  type ReaderQuestionSchedule,
  validateReaderQuestionSchedule,
} from "./reader-questions";
import { type EpisodeSpine, validateEpisodeSpine } from "./episode-spine";
// 2026-05-20 S1 Domain C: cliffhanger N=5 候補選別
import {
  generateCliffhangerCandidates,
  selectCliffhanger,
} from "./cliffhanger-scoring";

/**
 * Archetype 選択スタイル。
 * - classic: 既存 M1_series_opener (情報密度抑え型) を使用 (a07 v01 まで既定)
 * - webtoon: M1_series_opener_webtoon_high_density (5 段階強制、WEBTOON ヒット型)
 */
export type ArchetypeStyle = "classic" | "webtoon";

export type EpisodeBeat = {
  beat_idx: number;
  label: "hook" | "buildup" | "turn" | "climax" | "resolution" | "cliffhanger";
  summary: string;
  emotional_intensity: number;          // 0-1
  key_visual: string;
};

/**
 * SceneSkeleton: 1 エピソード内の場面の最小設計 (L2b で 5-7 個生成)。
 *
 * 商業漫画の作家プロセス「プロット段階で scene を決めてからネーム」を再現する層。
 * L3.5 scene-graph はこの skeleton を肉付けする責務に絞られる (scene_id 継承)。
 */
/**
 * SceneEmotion: scene 内の感情曲線の方向と強度。
 * 2026-05-20 S1 Domain C で追加。emotional_beat (string、説明的) と並列。
 * intensity-propagation.ts が panel.emotional_intensity に伝播する基本値となる。
 */
export type SceneEmotion = {
  /** "緊張の峰" "余韻" "怒りの爆発" 等の説明 60字 */
  label: string;
  /** 0-1、この scene を代表する感情強度 */
  intensity: number;
  /** scene 内での感情曲線の向き */
  direction: "rise" | "fall" | "hold" | "shock" | "release";
};

export type SceneSkeleton = {
  scene_id: string;                     // "ep01_s01" 形式
  scene_no: number;                     // 1-based
  page_range: [number, number];          // [1, 4] = p1-p4 (連続必須、計 page_target と一致)
  location_id: string;                  // bible.locations[].id 参照
  time_of_day: string;                  // "夜明け前/朝/正午/夕方/深夜" 等
  cast_ids: string[];                   // bible.characters[].id 参照
  purpose: string;                      // 物語への貢献 80字
  emotional_beat: string;               // 60字
  key_action: string;                   // 何が起きるか 80字
  connection_to_next: string;            // 次scene への接続 40字 (最終 scene は cliffhanger hint)
  directing_intent?: DirectingIntent;   // 演出スロット (optional)
  primary_channels?: string[];          // VisualChannel 1-3 個 (情報伝達チャネル)
  reader_state_after?: {
    knows: string[];                    // この scene 終了時に読者が知っている事実 (累積)
    feels: string;                      // 読者の感情状態
    questions: string[];                // 読者が持っている未解決の問い
    attachments: string[];              // 読者が感情移入している対象
  };
  /**
   * 2026-05-20 S1 Domain C で追加。後方互換 optional。
   * intensity-propagation.ts が panel.emotional_intensity の基本値として使う。
   */
  scene_emotion?: SceneEmotion;
};

/**
 * DirectingIntent: scene 単位の演出指定。
 *
 * ep1.scenes[0] は通常 opening_hook、最終 scene は通常 final_pull。
 * 中間 scene は normal、midpoint scene は midpoint_turn、終盤 scene は cliffhanger_setup。
 * 各 episode で kind が網羅される必要はない (normal が多数派)。
 */
export type DirectingIntent =
  | {
      kind: "opening_hook";
      hook_pattern:
        | "world_glimpse"
        | "mystery_opening"
        | "in_media_res"
        | "system_reveal"
        | "monologue_anchor"
        | "action_cold_open"
        | "emotional_close";
      key_visual: string;                // 60字
      narration_lines?: string[];        // ナレ/テロップ案 0-3 個 (ep1 は 1 個以上必須)
    }
  | {
      kind: "world_anchor";
      delivery: "narration" | "dialogue" | "visual_repetition" | "system_text";
      target_facts: string[];            // 読者に伝える世界観事実 2-4 個 (ep1 は 3 個以上必須)
    }
  | {
      kind: "midpoint_turn";
      reveal: string;                    // 何が明らかになるか 80字
      emotional_shift: string;           // 主人公の内面変化 60字
    }
  | {
      kind: "cliffhanger_setup";
      build_up: string;                  // 引きへ向けた段階的高揚 80字
    }
  | {
      kind: "final_pull";
      pull_visual: string;               // 引きの絵 60字
      next_episode_hook: string;         // 次話読みたくなる謎/予兆 60字
    }
  | { kind: "normal" };

/**
 * 1 episode が複数 arc にまたがるケースは稀だが、巻またぎ章境界で発生する。
 * EpisodePlan.arc_position は単一 arc のみ参照 (主従の主の方)。
 */
export type EpisodeArcPosition = {
  arc_id: string;                       // SeriesPlan.arcs[].arc_id 参照
  role_in_arc: "setup" | "rising" | "midpoint" | "falling" | "payoff";
};

/** 巻内での episode の位置 (周辺 episode との関係を示す) */
export type EpisodeVolumePosition =
  | "opening"
  | "rising"
  | "midpoint"
  | "falling"
  | "climax"
  | "cliffhanger";

export type VolumeEpisodePlan = {
  episode_no: number;
  title_working: string;
  theme: string;
  protagonist_arc: { start: string; turn: string; end: string };
  /** Phase 11-1: その話で core_hook の何を拡大するか。後方互換 optional */
  core_hook_usage?: string;
  /** Phase 11-2: その話で推し関係性をどう進展させるか。後方互換 optional */
  pairing_progression?: string;
  beats: EpisodeBeat[];
  must_include_events: string[];
  cliffhanger_hook: string;
  page_target: number;
  brief_for_L3: string;                 // L3 _brief.md にそのまま流せる本文
  /** Phase Y WY-3 で追加。後方互換 optional。cliffhanger architect が pattern_id と次話 hook を設計 */
  pull_link?: PullLink;
  /**
   * schema_version 2 (L2b 物語OS再設計) で追加。
   * SeriesPlan が無い旧データとの後方互換のため optional だが、新規生成では必須。
   */
  arc_position?: EpisodeArcPosition;
  volume_position?: EpisodeVolumePosition;
  scenes?: SceneSkeleton[];             // 5-7 個推奨。page_range は連続し合計 page_target と一致
  archetype_id?: string;               // Episode Archetype Pattern ID (M1_series_opener 等)
  /**
   * 2026-05-20 S1 Domain B (話情緒契約) で追加。
   * WEBTOON ヒット型 5 段階 (侮辱→秘宝→覚醒→反撃→ROAR) を構造化。
   * 後方互換 optional だが、--archetype-style=webtoon で ep1 は必須。
   */
  episode_spine?: EpisodeSpine;
  /**
   * 2026-05-20 S1 Domain C (品質ガード) で追加。
   * cliffhanger 候補×N pairwise tournament の選別証跡 (巻末 episode のみ)。
   * 後方互換 optional。--cliffhanger-candidates=N で生成された場合のみ存在。
   */
  cliffhanger_selection?: {
    source: "S1_cliffhanger_pairwise";
    winner_id: string;
    win_count: number;
    total_matches: number;
    rationale: string;
  };
};

/**
 * VolumePlot
 *
 * schema_version 1: 旧構造 (arc/scene 無し)
 * schema_version 2: L2b 物語OS再設計 (belongs_to_arcs, episodes[].scenes 追加)
 */
export type VolumePlot = {
  schema_version: 1 | 2;
  slug: string;
  volume_no: number;
  title_working: string;
  volume_theme: string;
  estimated_pages: number;
  foreshadow_map: Array<{
    seed_in_episode: number;
    payoff_in_episode: number;
    description: string;
  }>;
  episodes: VolumeEpisodePlan[];
  /**
   * schema_version 2 で追加。SeriesPlan.arcs を参照し、この巻がどの章にまたがるかを示す。
   * 巻またぎ標準のため複数要素もありうる。
   */
  belongs_to_arcs?: Array<{
    arc_id: string;                     // SeriesPlan.arcs[].arc_id 参照
    coverage: "full" | "partial_start" | "partial_mid" | "partial_end";
    arc_progression: string;             // この巻でこの arc がどう進むか 100字
  }>;
  /**
   * 2026-05-20 S1 Domain A (巻論理契約) で追加。
   * 「読者が次巻を買う理由」を独立フィールドで明示する top-level contract。
   * 後方互換 optional だが、--archetype-style=webtoon 経路では必須。
   */
  volume_spine?: VolumeSpine;
  /**
   * 2026-05-20 S1 Domain A (巻論理契約) で追加。
   * 読者の問い open/close スケジュール。main_buy_question を 1 個含み、
   * 巻末未解決 ≤ 4 で次巻持ち越し。後方互換 optional。
   */
  reader_question_schedule?: ReaderQuestionSchedule;
};

/**
 * VolumePlot 全体の整合性検証 (4 ドメイン契約)。
 * - Domain A: volume_spine + reader_question_schedule
 * - Domain B: 各 episode の episode_spine (ep1 は humiliation + title_anchor 必須)
 *
 * archetype_style="webtoon" の場合のみ厳格 check。"classic" では warning 表示のみ。
 */
export function validateVolumePlotContracts(args: {
  plot: VolumePlot;
  archetypeStyle: ArchetypeStyle;
}): string[] {
  const warnings: string[] = [];
  const strict = args.archetypeStyle === "webtoon";

  // Domain A: VolumeSpine
  const spineWarnings = validateVolumeSpine(args.plot.volume_spine);
  for (const w of spineWarnings) {
    warnings.push(strict ? `[Domain A] ${w}` : `[Domain A][lax] ${w}`);
  }

  // Domain A: ReaderQuestionSchedule
  const scheduleWarnings = validateReaderQuestionSchedule(
    args.plot.reader_question_schedule,
    args.plot.episodes.length,
  );
  for (const w of scheduleWarnings) {
    warnings.push(strict ? `[Domain A] ${w}` : `[Domain A][lax] ${w}`);
  }

  // Domain B: EpisodeSpine (各 episode)
  for (const ep of args.plot.episodes) {
    const isFirstEpisode = ep.episode_no === 1;
    const spineW = validateEpisodeSpine(ep.episode_spine, isFirstEpisode, ep.page_target);
    for (const w of spineW) {
      warnings.push(
        strict
          ? `[Domain B][ep${ep.episode_no}] ${w}`
          : `[Domain B][ep${ep.episode_no}][lax] ${w}`,
      );
    }
  }

  return warnings;
}

// Re-export for downstream consumers (scene-graph 等)
export type { SeriesPlan, ArcPlan } from "../schemas-v2";

/**
 * Volume Outline schema (multi-shot pass 1):
 * 巻全体の骨格 + 各 episode の theme/arc/beats/cliffhanger を生成する。
 * scenes と brief_for_L3 はサイズが重いので別 pass (EPISODE_DETAIL_SCHEMA) で生成。
 */
const VOLUME_OUTLINE_SCHEMA = `
type VolumeOutlineOutput = {
  schema_version: 2;
  title_working: string;
  volume_theme: string;                    // 巻全体のテーマ 100字+
  estimated_pages: number;
  belongs_to_arcs: Array<{                 // この巻が属する arc (巻またぎ標準)
    arc_id: string;                        // SeriesPlan.arcs[].arc_id を参照
    coverage: "full" | "partial_start" | "partial_mid" | "partial_end";
    arc_progression: string;                // この巻でこの arc がどう進むか 100字
  }>;
  // === Domain A: 巻論理契約 (2026-05-20 S1 で追加、必須) ===
  volume_spine: {
    central_reader_question: string;       // この巻で読者が追う中心の問い 80-150字
    protagonist_irreversible_choice: string; // 主人公がこの巻で踏む不可逆な選択 80-120字
    price_paid: string;                    // その選択で主人公が払う代償 60-100字
    new_status_quo: string;                // 巻末時点での新しい現状 80-120字
    volume_end_buy_question: string;       // 次巻を買う理由としての問い 60-100字
  };
  reader_question_schedule: Array<{        // 読者の問い open/close スケジュール 5-9 個
    question_id: string;                   // "Q01" 形式、巻内ユニーク
    question: string;                      // 問いの本文 60-120字
    opened_in_episode: number;
    escalated_in_episodes: number[];       // この問いが強化される episode 列 (空配列可)
    answered_in_episode?: number;          // 巻内で解消されるなら episode_no、持ち越しなら省略
    carried_to_next_volume: boolean;
    payoff_type: "answer" | "reversal" | "bigger_question" | "emotional_payoff";
    heat_role: "main_buy_question" | "episode_pull" | "mystery_layer" | "relationship_tension";
                                            // main_buy_question は exactly 1 個
  }>;
  foreshadow_map: Array<{
    seed_in_episode: number;
    payoff_in_episode: number;             // 1-N か N+1 (次巻持ち越し)
    description: string;                   // 80字+
  }>;
  episodes: Array<{
    episode_no: number;
    title_working: string;
    theme: string;                         // 50字
    arc_position: {
      arc_id: string;                      // belongs_to_arcs のいずれか
      role_in_arc: "setup" | "rising" | "midpoint" | "falling" | "payoff";
    };
    volume_position: "opening" | "rising" | "midpoint" | "falling" | "climax" | "cliffhanger";
    protagonist_arc: { start: string; turn: string; end: string };
    core_hook_usage: string;                // 40-120字
    pairing_progression?: string;           // 40-120字
    beats: Array<{
      beat_idx: number;
      label: "hook" | "buildup" | "turn" | "climax" | "resolution" | "cliffhanger";
      summary: string;                     // 100字+
      emotional_intensity: number;         // 0-1
      key_visual: string;                  // 50字
    }>;
    must_include_events: string[];         // 3-5項目
    cliffhanger_hook: string;              // 80字+
    page_target: number;
    archetype_id?: string;                 // Episode Archetype Pattern ID (M1_series_opener 等)
    // scenes / brief_for_L3 / episode_spine はこの pass では出力しない (別 pass で生成)
  }>;
};
`;

/**
 * Episode Detail schema (multi-shot pass 2):
 * 1 episode 分の scenes (5-7 個) + brief_for_L3 (1000-2000 字) を生成する。
 * VolumeOutline の該当 episode に紐づいて呼ぶ。
 */
const EPISODE_DETAIL_SCHEMA = `
type EpisodeDetailOutput = {
  scenes: Array<{                          // 5-7 個推奨。page_range 連続必須、合計 page_target と一致
    scene_id: string;                      // "ep{NN}_s{NN}" 形式
    scene_no: number;                      // 1-based
    page_range: [number, number];           // [1, 4] = p1-p4 (4P)
    location_id: string;                   // bible.locations[].id を参照 (実在 ID 必須)
    time_of_day: string;                   // "夜明け前/朝/正午/夕方/深夜" 等
    cast_ids: string[];                    // bible.characters[].id を参照
    purpose: string;                       // 物語への貢献 80字
    emotional_beat: string;                // 60字
    scene_emotion?: {                      // 2026-05-20 S1 Domain C で追加、必須推奨
      label: string;                       // "緊張の峰" "余韻" "怒りの爆発" 等 60字
      intensity: number;                   // 0-1、この scene を代表する感情強度
      direction: "rise" | "fall" | "hold" | "shock" | "release";
    };
    key_action: string;                    // 何が起きるか 80字
    connection_to_next: string;             // 次scene への接続 40字 (最終 scene は cliffhanger hint)
    directing_intent?:
      | { kind: "opening_hook";
          hook_pattern: "world_glimpse" | "mystery_opening" | "in_media_res"
                       | "system_reveal" | "monologue_anchor" | "action_cold_open" | "emotional_close";
          key_visual: string;
          narration_lines?: string[];      // ep1 では 1 個以上必須
        }
      | { kind: "world_anchor";
          delivery: "narration" | "dialogue" | "visual_repetition" | "system_text";
          target_facts: string[];          // ep1 では 3 個以上必須
        }
      | { kind: "midpoint_turn"; reveal: string; emotional_shift: string }
      | { kind: "cliffhanger_setup"; build_up: string }
      | { kind: "final_pull"; pull_visual: string; next_episode_hook: string }
      | { kind: "normal" };
    primary_channels?: string[];            // 情報伝達チャネル 1-3 個 (establishing_shot/dialogue/ui_screen 等)
    reader_state_after?: {
      knows: string[];                      // この scene 終了時に読者が知っている事実 (累積)
      feels: string;                        // 読者の感情状態
      questions: string[];                  // 読者が持っている未解決の問い
      attachments: string[];                // 読者が感情移入している対象 (キャラ/関係性)
    };
  }>;
  // === Domain B: 話情緒契約 (2026-05-20 S1 で追加) ===
  // archetype_style=webtoon かつ ep1 では humiliation_event / title_anchor を必須
  // それ以外の episode でも secret_or_treasure / awakening / payback の 3 つは必須
  episode_spine: {
    humiliation_event?: {                  // ep1 + 巻冒頭話で必須
      page: number;                        // page_target の 15-30% 位置
      humiliator_character_id: string;     // bible.characters[].id (role="antagonist" 必須)
      audience: string;                    // 誰の前で侮辱されるか 40字
      insult: string;                      // 侮辱内容 60字
      unfairness: string;                  // 制度的不公平の核 60字
      protagonist_cannot_answer_yet: string; // なぜ反論できないか 40字
      reader_emotion_target: "anger" | "shame" | "revenge_desire";
      payback_hint_episode: number;
      severity: 1 | 2 | 3 | 4 | 5;
    };
    secret_or_treasure_event: {            // 全話必須
      page: number;                        // page_target の 30-50% 位置
      secret_type: "system_reveal" | "hidden_rule" | "ally_secret" | "treasure" | "knowledge";
      visual_signature: string;            // 60字
    };
    awakening_event: {                     // 全話必須
      page: number;                        // page_target の 50-70% 位置
      awakening_type: "skill" | "resolve" | "alliance" | "knowledge_application";
      intensity_target: number;            // 0-1、ep1 climax は 0.85+
    };
    payback_event: {                       // 全話必須
      page: number;                        // page_target の 70-90% 位置
      payback_type: "direct_combat" | "social_reveal" | "system_break" | "unexpected_alliance";
      visual_catharsis_signature: string;  // 80字、絵で見せる勝利
      intensity_target: number;            // 0-1、ep1 は 0.90+
    };
    title_anchor?: {                       // ep1 で必須、それ以外は任意
      page: number;                        // 反撃成立直後 (page_target の 75-95% 位置)
      trigger_event: string;               // ROAR を発火させる出来事 40字
      visual_pose: string;                 // 主人公のポーズ 40字
      emotional_function: "awakening" | "revenge_start" | "identity_claim";
      overlay_logo_asset: string;          // SVG ロゴ asset_id (合成用、未準備なら "tbd_S2" で可)
    };
  };
  brief_for_L3: string;                    // 1000-2000字、L3 _brief.md にそのまま使える
};
`;

function buildCoreHookContract(bible: BibleSnapshotV2): string {
  const coreHook = bible.meta.core_hook;
  if (!coreHook) {
    return [
      "## Core Hook Contract (必須参照)",
      "- 未設定。既存 bible との後方互換のため生成は継続するが、各話は meta.genre / volume_synopsis から一文ギミックを補って設計すること。",
    ].join("\n");
  }
  return [
    "## Core Hook Contract (必須参照)",
    `- 一文: ${coreHook.one_liner}`,
    `- 類型: ${coreHook.type} / メカニクス: ${coreHook.mechanic ?? "(未設定)"}`,
    `- 読者の問い: ${coreHook.reader_question ?? "(未設定)"}`,
    `- 報酬モード: ${coreHook.reward_mode ?? "(未設定)"}`,
    coreHook.reward_mode === "custom"
      ? `- カスタム報酬: ${coreHook.custom_reward_mode ?? "(未設定)"}`
      : "",
    `- 参考作: ${coreHook.hit_references.join(", ")}`,
  ].filter(Boolean).join("\n");
}

function buildRecommendedPairings(bible: BibleSnapshotV2): string {
  const recommendedPairings = bible.relations.filter((r) => r.is_recommended_pairing === true);
  if (recommendedPairings.length === 0) return "";
  return [
    "## Recommended Pairings (推し導線、必須参照)",
    ...recommendedPairings.map((rel) => {
      const score = rel.appeal_score_manual ?? rel.appeal_score_auto;
      const scoreText = typeof score === "number" ? ` / score=${score}` : "";
      return `- ${rel.from_character_id} ⇔ ${rel.to_character_id}: ${rel.appeal_axis ?? "(axis 未指定)"}${scoreText} — ${rel.description}`;
    }),
    "- 各 episode に「どの推し関係性をどれだけ進展させるか」を outline 内で具体化する",
    "- 推し関係性が主要訴求の場合は pairing_progression に関係性の進展を 40-120字で明示する",
  ].join("\n");
}

/**
 * 漫画作法ルール (L2b inline 引用)
 *
 * docs/strategy/manga_craft/00_principles.md と 10_chapter_structure.md の L0/L1 MUST
 * を圧縮して inline 化。新スキーマ (scenes + directing_intent) を活用するルールを
 * 中心に列挙する。
 */
function buildMangaCraftRules(args: {
  episodesPerVolume: number;
  pagesPerEpisode: number;
  volumeNo: number;
  archetypeStyle?: ArchetypeStyle;
}): string {
  const isFirstVolume = args.volumeNo === 1;
  const isWebtoon = args.archetypeStyle === "webtoon";
  const lines = [
    "## 漫画作法 (必須遵守、商業漫画の標準)",
    "",
    "### A. 章 (arc) 単位の作法",
    "- 各 episode の arc_position.role_in_arc は **setup/rising/midpoint/falling/payoff** のどれかで、その arc 内での精神的位置を示す",
    "- arc_position は belongs_to_arcs のいずれかの arc_id を必ず参照する (実在 arc 必須)",
    "- 各 episode の volume_position は **巻内位置** を示す (1話目=opening、最終話=cliffhanger 等)",
    "",
    "### B. scene 単位の作法 (新規、最重要)",
    "- 1 episode = 5-7 scene (page_target に応じて)",
    "- scene.page_range は **連続必須**。例: s01=[1,4], s02=[5,8], s03=[9,13], ... 合計が page_target と一致",
    "- 各 scene の location_id は bible.locations[].id の **実在 ID** を参照 (架空 ID 禁止)",
    "- 各 scene の cast_ids は bible.characters[].id の **実在 ID** を参照",
    "- scene.purpose は「この scene が物語に何を貢献するか」を 80字で明示 (台詞ではない)",
    "",
    "### C. directing_intent の配置ルール",
    "- **scenes[0] (opening scene)** は **opening_hook** を必須付与",
    `${
      isFirstVolume
        ? '  - ep1 では narration_lines を **1 個以上必須** (世界観テロップ義務、読者が初見のため)\n  - ep1 では世界観を伝える scene (通常 s02) に world_anchor を必須、target_facts ≥ 3 個'
        : '  - ep2 以降は前話 cliffhanger の回収 + 今話 hook を hook_pattern で選ぶ'
    }`,
    "- **中盤 scene (page_target の 45-60% 位置)** に **midpoint_turn** を付与 (turn beat と整合)",
    "- **終盤 scene (page_target の 80-95% 位置)** に **cliffhanger_setup** を付与 (引き build-up)",
    "- **最終 scene** に **final_pull** を必須付与 (引きの絵 + 次話 hook)",
    "- その他の scene は directing_intent: { kind: 'normal' }",
    "",
    "### D. 1 ページの密度リズム (10_chapter_structure.md L1 MUST)",
    "- 各 episode で silence_panel (50%以上ホワイト) と focal_panel (高密度フォーカス) を最低 1 つずつ含むよう scene 設計時に意識する",
    "- panel 数の相場は scene の場面種別に応じて: 章扉 1 / establishing 3-5 / 会話 5-7 / 戦闘 4-6 / cliffhanger 3-5",
    "",
    "### E. 山場配置 (10_chapter_structure.md L1 MUST)",
    `- 山場は page_target の 70-85% 位置に置く (例: 22P なら p16-p18)`,
    "- これより前だと息切れ、後だと cliffhanger に転化する余白がなくなる",
    "",
    "### F. 巻論理契約 (Domain A、2026-05-20 S1 で追加、必須)",
    "- **volume_spine** を必ず top-level に出力する。説明文ではなく「読者が次巻を買う理由」の独立フィールドとして:",
    "  - central_reader_question: この巻で読者が追う中心の問い 80-150字",
    "  - protagonist_irreversible_choice: 主人公がこの巻で踏む不可逆な選択 80-120字",
    "  - price_paid: その選択で主人公が払う代償 60-100字",
    "  - new_status_quo: 巻末時点での新しい現状 80-120字",
    "  - volume_end_buy_question: 次巻を買う理由としての問い 60-100字",
    "- **reader_question_schedule** を必ず top-level に出力 (5-9 個):",
    "  - main_buy_question heat_role は exactly 1 個 (巻全体を駆動する最大の問い)",
    "  - 各 episode で最低 1 個解消 (answered_in_episode を該当 episode に設定)",
    "  - 巻末未解決は 2-4 個 (carried_to_next_volume=true、次巻持ち越し)",
    "  - foreshadow_map とは独立 (foreshadow は物語事実、reader_question は読者の能動的問い)",
  ];

  if (isWebtoon) {
    lines.push(
      "",
      "### G. WEBTOON ヒット型 5 段階 (Domain B、archetype_style=webtoon、必須)",
      "本巻は WEBTOON ヒット作 (累計 1 億 views クラス) の 1 話構造に従う。",
      "**各 episode で `episode_spine` を必ず出力 (5 イベント)**:",
      "  - secret_or_treasure_event (全話必須、page_target の 30-50% 位置)",
      "  - awakening_event (全話必須、page_target の 50-70% 位置、intensity 0.75+)",
      "  - payback_event (全話必須、page_target の 70-90% 位置、intensity 0.85+)",
      "",
      "**ep1 (巻冒頭話) では追加で必須**:",
      "  - humiliation_event (page_target の 15-30% 位置)",
      "    - humiliator_character_id は bible.antagonists[] の character_id を参照 (role=\"antagonist\")",
      "    - audience (誰が侮辱を目撃するか) を必ず明示、読者の怒りを発火させる装置として設計",
      "    - reader_emotion_target を anger / shame / revenge_desire のいずれかに確定",
      "    - severity 3 以上を推奨 (1=軽口、5=人生を破壊する公開煽動)",
      "  - title_anchor (反撃成立直後、page_target の 75-95% 位置)",
      "    - 主人公の決定的ポーズ + タイトル ROAR の絵的台座を設計",
      "    - overlay_logo_asset は \"tbd_S2\" でも可 (S2 で SVG 合成)",
      "  - awakening_event.intensity_target ≥ 0.85",
      "  - payback_event.intensity_target ≥ 0.90",
      "",
      `**ep1 配分 (page_target=${args.pagesPerEpisode}P の場合)**:`,
      `  - p1-${Math.max(2, Math.round(args.pagesPerEpisode * 0.125))} 侮辱 (humiliation_event)`,
      `  - p${Math.max(3, Math.round(args.pagesPerEpisode * 0.125) + 1)}-${Math.round(args.pagesPerEpisode * 0.3)} 秘宝 (secret_or_treasure_event)`,
      `  - p${Math.round(args.pagesPerEpisode * 0.3) + 1}-${Math.round(args.pagesPerEpisode * 0.55)} 覚醒 (awakening_event、絵的爆発)`,
      `  - p${Math.round(args.pagesPerEpisode * 0.55) + 1}-${Math.round(args.pagesPerEpisode * 0.8)} 反撃 (payback_event、visual_catharsis)`,
      `  - p${Math.round(args.pagesPerEpisode * 0.8) + 1}-${Math.round(args.pagesPerEpisode * 0.92)} タイトル ROAR (title_anchor)`,
      `  - p${Math.round(args.pagesPerEpisode * 0.92) + 1}-${args.pagesPerEpisode} 次話 cliffhanger`,
      "",
      "**ep2 以降**: humiliation_event / title_anchor は任意 (敵対者の escalation_plan と整合する場合に置く)",
      "",
      "### H. 敵対者の機能 (antagonist_profile 連動)",
      "- bible.antagonists[] が定義されている場合、humiliation_event.humiliator_character_id は必ずそれを参照",
      "- antagonist_type による侮辱スタイルの差別化:",
      "  - public_humiliator: 観衆の前での煽動的侮辱 (audience に複数人指定)",
      "  - institutional_gatekeeper: 制度・規則を盾にした拒絶 (unfairness で制度名を明示)",
      "  - rival_chosen_one: 同期の天才による比較侮辱 (insult で対比表現)",
      "  - betrayer: 信頼関係を逆手に取る (unfairness で過去の信頼を明示)",
      "  - predator: 物理的脅威 (severity 4-5 推奨)",
    );
  }

  return lines.join("\n");
}

function buildVolumeArcContext(args: {
  seriesPlan?: SeriesPlan;
  volumeNo: number;
}): string {
  if (!args.seriesPlan) {
    return [
      "## Volume Arc Context",
      "- ⚠️ SeriesPlan 未生成。arc_position / volume_position は推測で埋める (品質低下リスク)",
      "- 可能であれば事前に L2b --phase=series で series_plan.json を生成すること",
    ].join("\n");
  }
  const relevantArcs = args.seriesPlan.arcs.filter(
    (arc) =>
      arc.volume_range[0] <= args.volumeNo && args.volumeNo <= arc.volume_range[1],
  );
  if (relevantArcs.length === 0) {
    return [
      "## Volume Arc Context",
      `- ⚠️ Vol ${args.volumeNo} が SeriesPlan のいずれの arc にも属さない。SeriesPlan の volume_range を見直すこと`,
    ].join("\n");
  }
  const prevArcEndingIdx = Math.max(
    0,
    args.seriesPlan.arcs.findIndex((a) => a.arc_id === relevantArcs[0].arc_id) - 1,
  );
  const protagonistStartState =
    args.volumeNo === 1
      ? args.seriesPlan.protagonist_long_arc.starting_state
      : args.seriesPlan.protagonist_long_arc.arc_endings[prevArcEndingIdx] ??
        args.seriesPlan.protagonist_long_arc.starting_state;
  return [
    "## Volume Arc Context (SeriesPlan より、必須参照)",
    "",
    `### この巻 (Vol ${args.volumeNo}) が属する arc`,
    ...relevantArcs.map((arc, i) => {
      const [s, e] = arc.volume_range;
      const coverage =
        s === e
          ? "full"
          : args.volumeNo === s
            ? "partial_start"
            : args.volumeNo === e
              ? "partial_end"
              : "partial_mid";
      return [
        `${i + 1}. **arc_id**: \`${arc.arc_id}\` (${arc.arc_name}, phase=${arc.arc_phase})`,
        `   - volume_range: [${s}, ${e}] / この巻の coverage: **${coverage}**`,
        `   - arc_theme: ${arc.arc_theme}`,
        `   - protagonist_growth: ${arc.protagonist_growth}`,
        `   - arc_opening: ${arc.arc_opening}`,
        `   - arc_climax: ${arc.arc_climax}`,
        `   - arc_resolution: ${arc.arc_resolution}`,
        `   - turning_points: ${arc.turning_points
          .filter((tp) => tp.volume === args.volumeNo)
          .map((tp) => `ep${tp.episode}: ${tp.event}`)
          .join(" / ") || "(この巻には turning_point なし)"}`,
      ].join("\n");
    }),
    "",
    "### 主人公の現在地",
    `- 巻冒頭時点の主人公状態: ${protagonistStartState}`,
    "",
    "### Core Hook Evolution",
    `${args.seriesPlan.core_hook_evolution}`,
    "",
    "→ belongs_to_arcs では上記 arc を全て列挙し、各 episode の arc_position.arc_id は上記 arc_id のいずれかを使うこと",
  ].join("\n");
}

export async function generateVolumePlot(args: {
  bible: BibleSnapshotV2;
  v2Concept: V2Concept;
  volumeNo: number;
  episodesPerVolume: number;
  pagesPerEpisode: number;
  /** L2b 物語OS再設計で追加。SeriesPlan を渡すと arc_position が正しく埋まる */
  seriesPlan?: SeriesPlan;
  cwd?: string;
  timeoutMs?: number;
  /**
   * 2026-05-20 S1 で追加。"webtoon" を指定すると Domain B (episode_spine)
   * を ep1 で 5 段階強制、buildMangaCraftRules に WEBTOON ヒット型ルール注入、
   * archetype_id を M1_series_opener_webtoon_high_density に固定する。
   * 既定 "classic" (後方互換)。
   */
  archetypeStyle?: ArchetypeStyle;
  /**
   * 2026-05-20 S1 Domain C で追加。巻末 episode の cliffhanger を N 個生成 → pairwise → 採用。
   * 0 (既定) では cliffhanger 候補生成 layer を skip し、Pass 2 の cliffhanger_hook をそのまま使う。
   * 推奨: 5。コスト: Pro 枠 +2 callees (候補生成 + pairwise 判定)。
   */
  cliffhangerCandidates?: number;
}): Promise<VolumePlot> {
  const archetypeStyle: ArchetypeStyle = args.archetypeStyle ?? "classic";
  const cliffhangerN = args.cliffhangerCandidates ?? 0;
  // Phase X WX-3: art_style から genre preset を逆引き
  const genrePreset = findGenreByArtStyle(args.bible.meta.art_style);
  const genreLabel = genrePreset
    ? `${genrePreset.display_name} (${genrePreset.art_style})`
    : `汎用 (${args.bible.meta.art_style ?? "art_style未設定"})`;

  // Phase X WX-3: tone_profile.recovery_cadence が低い bible には小報酬 beat 必須を強制
  const tone = args.bible.meta.tone_profile;
  const recoveryRequired =
    tone && tone.recovery_cadence <= 0.3
      ? "- ⚠️ tone_profile.recovery_cadence ≤ 0.3 のため、各話に必ず『小報酬/生活感/相棒との温度』の beat を1個以上入れること (Phase X WX-3 強制)"
      : tone && tone.recovery_cadence >= 0.7
        ? "- tone_profile.recovery_cadence ≥ 0.7 のため、各話に『小報酬/生活感/相棒との温度』beat を 2-3 回入れることを推奨 (light_recovery 標準)"
        : "";

  // Phase X WX-3: ジャンル別の必須3要素 (旧版「機転 / ナビ / コンビニ」のハードコード置換)
  const genreThreeElements = genrePreset
    ? [
        `must_have_volume_1_scenes より:`,
        ...genrePreset.must_have_volume_1_scenes.slice(0, 5).map((s) => `  - ${s}`),
      ].join("\n")
    : "- ジャンル preset がないため、3 要素はストーリーのジャンル定石に従って自由に決定";

  // bible.locations の実在 ID 一覧 (scene.location_id バリデーション用に提示)
  const locationIdsList = args.bible.locations.map((l) => `${l.id} (${l.name})`).join(", ");
  // bible.characters の実在 ID 一覧 (scene.cast_ids バリデーション用に提示)
  const characterIdsList = args.bible.characters
    .map((c) => `${c.id} (${c.name}, ${c.role})`)
    .join(", ");

  const result = await runCodexText({
    task: [
      `あなたは商業漫画 (${genreLabel}) の編集者として、`,
      `第 ${args.volumeNo} 巻 (${args.episodesPerVolume}話 × ${args.pagesPerEpisode}ページ) の構成プロットを書いてください。`,
      "",
      "## ヒット作と並ぶ深さの条件",
      "- 各話に明確な beat 構造 (hook → buildup → turn → climax → resolution → cliffhanger)",
      "- 巻全体に伏線蒔きと回収のマップ (foreshadow_map で対応関係を明示)",
      `- 主人公の感情曲線が 1 巻通して右肩上がりではなく揺れがある (例: ${Math.ceil(args.episodesPerVolume * 0.5)}-${Math.ceil(args.episodesPerVolume * 0.7)}話で踏み外し、後半で立て直し)`,
      "- 各話の cliffhanger が次話を読みたくなる強さ (turn_strength 4+)",
      `- 1巻必須シーン (このジャンルの定石): ${genreThreeElements}`,
      recoveryRequired,
      "- 各 episode に core_hook_usage を必ず入れ、その話で Core Hook Contract の一文/メカニクス/読者の問い/報酬モードの何を拡大するかを短く明示する",
      "- 各話の brief_for_L3 は L3 Shotlist にそのまま流せる本文を 1000-2000字で書く (各シーンの場所/登場人物/出来事/モノローグ核ライン)",
      "",
      buildMangaCraftRules({
        episodesPerVolume: args.episodesPerVolume,
        pagesPerEpisode: args.pagesPerEpisode,
        volumeNo: args.volumeNo,
        archetypeStyle,
      }),
      "",
      buildVolumeArcContext({ seriesPlan: args.seriesPlan, volumeNo: args.volumeNo }),
      "",
      buildCoreHookContract(args.bible),
      buildRecommendedPairings(args.bible),
      "",
      // Episode Archetype Patterns 注入 (Part 1)
      (() => {
        const subtype = (args.bible.meta as { subtype?: string }).subtype ?? "dungeon_modern";
        const dict = loadArchetypeDict(subtype);
        return dict ? buildArchetypeDictPrompt(dict) : "";
      })(),
      "",
      "## bible (登場人物 / 世界観 / 視覚モチーフ)",
      "",
      `### 実在 location_id 一覧 (scene.location_id は必ずこの中から選ぶ)`,
      locationIdsList,
      "",
      `### 実在 character_id 一覧 (scene.cast_ids は必ずこの中から選ぶ)`,
      characterIdsList,
      "",
      "```json",
      JSON.stringify({
        meta: {
          slug: args.bible.meta.slug,
          genre: (args.bible.meta as { genre?: string }).genre,
          art_style: args.bible.meta.art_style,
          tone_profile: args.bible.meta.tone_profile,
          core_hook: args.bible.meta.core_hook,
        },
        world_summary: typeof args.bible.world === "object"
          ? Object.fromEntries(
              Object.entries(args.bible.world as Record<string, unknown>).map(([k, v]) => [
                k,
                typeof v === "string" ? v.slice(0, 1500) : v,
              ]),
            )
          : args.bible.world,
        characters: args.bible.characters.map((c) => ({ id: c.id, name: c.name, role: c.role })),
        relations: args.bible.relations
          .filter((r) => r.is_recommended_pairing === true)
          .map((r) => ({
            from: r.from_character_id,
            to: r.to_character_id,
            type: r.relation_type,
            description: r.description,
            appeal_axis: r.appeal_axis,
          })),
        locations: args.bible.locations.map((l) => ({ id: l.id, name: l.name })),
        visual_motifs: args.bible.visual_motifs?.slice(0, 8),
        // NOTE: bible.volume_synopsis は故意に渡さない (最終巻情報の混入リスク)
      }, null, 2).slice(0, 15000),
      "```",
      "",
      "## V2企画書 main_arc / volume_outline (詳細素材)",
      "```json",
      JSON.stringify({
        main_arc: typeof args.v2Concept.main_arc === "string"
          ? (args.v2Concept.main_arc as string).slice(0, 8000)
          : args.v2Concept.main_arc,
        volume_outline: typeof args.v2Concept.volume_outline === "string"
          ? (args.v2Concept.volume_outline as string).slice(0, 8000)
          : args.v2Concept.volume_outline,
        volume1_detail: args.volumeNo === 1 ? args.v2Concept.volume1_detail : undefined,
      }, null, 2).slice(0, 15000),
      "```",
      "",
      "## 出力スキーマ (Pass 1: Volume Outline)",
      "```typescript",
      VOLUME_OUTLINE_SCHEMA,
      "```",
      "",
      `## 期待する量
- foreshadow_map: 6件以上
- episodes: ${args.episodesPerVolume}話 (1-${args.episodesPerVolume})、必ず全話を出力すること
- 各 episode の beats: 5-7 個

## 注意 (Multi-shot 採用、サイズ抑制)
- この pass では scenes と brief_for_L3 を出力しない (次の Episode Detail pass で生成)
- 各 episode の theme/protagonist_arc/beats/cliffhanger_hook/page_target など骨格のみ出力する
- 全 ${args.episodesPerVolume} 話分を必ず出力する (途中で省略禁止)`,
      "",
      "## 出力形式",
      "上記スキーマに従う JSON のみを返してください。説明文・前置き・後書きは不要。",
      "出力は ```json ... ``` のコードブロックで囲んでください。",
    ].join("\n"),
    format: "json",
    cwd: args.cwd,
    timeoutMs: args.timeoutMs ?? 15 * 60 * 1000,
    maxRetries: 1,
  });

  if (!result.parsed) throw new Error("volume-plot outline JSON 抽出失敗");
  const parsed = result.parsed as Omit<VolumePlot, "slug" | "volume_no"> & {
    schema_version?: number;
  };

  // outline バリデーション
  if (!parsed.episodes || parsed.episodes.length !== args.episodesPerVolume) {
    const parsedKeys = Object.keys(parsed as Record<string, unknown>);
    const head = JSON.stringify(parsed).slice(0, 800);
    throw new Error(
      `volume-outline 検証失敗: episodes.length=${parsed.episodes?.length} ≠ episodesPerVolume=${args.episodesPerVolume}\n  parsed top-level keys: [${parsedKeys.join(", ")}]\n  parsed head: ${head}`,
    );
  }

  // Multi-shot pass 2: 各 episode の scenes + brief_for_L3 を per-episode Codex 呼び出しで生成
  // eslint-disable-next-line no-console
  console.log(`[volume-plot] outline OK (${parsed.episodes.length} eps), generating scenes + brief per-episode...`);
  const episodesWithDetail: VolumeEpisodePlan[] = [];
  for (let i = 0; i < parsed.episodes.length; i++) {
    const ep = parsed.episodes[i] as VolumeEpisodePlan;
    // eslint-disable-next-line no-console
    console.log(`[volume-plot] ep${ep.episode_no}/${parsed.episodes.length}: generating scenes + brief...`);
    const detail = await generateEpisodeDetail({
      bible: args.bible,
      v2Concept: args.v2Concept,
      seriesPlan: args.seriesPlan,
      volumeNo: args.volumeNo,
      volumeTheme: parsed.volume_theme,
      episode: ep,
      prevEpisode: i > 0 ? (parsed.episodes[i - 1] as VolumeEpisodePlan) : undefined,
      nextEpisode:
        i < parsed.episodes.length - 1
          ? (parsed.episodes[i + 1] as VolumeEpisodePlan)
          : undefined,
      cwd: args.cwd,
      timeoutMs: args.timeoutMs,
      archetypeStyle,
    });
    episodesWithDetail.push({ ...ep, ...detail });
  }

  // 最終バリデーション
  const missingScenes = episodesWithDetail.filter((ep) => !ep.scenes || ep.scenes.length < 3);
  if (missingScenes.length > 0) {
    throw new Error(
      `volume-plot 検証失敗: scenes が 3 個未満の episode が ${missingScenes.length} 件 (ep_no=${missingScenes.map((e) => e.episode_no).join(",")})`,
    );
  }

  // 2026-05-20 S1 Domain C: 巻末 episode の cliffhanger 候補×N → pairwise 選別
  if (cliffhangerN >= 2 && episodesWithDetail.length > 0) {
    const lastEp = episodesWithDetail[episodesWithDetail.length - 1];
    const prevEp = episodesWithDetail.length >= 2
      ? episodesWithDetail[episodesWithDetail.length - 2]
      : undefined;
    // eslint-disable-next-line no-console
    console.log(
      `[volume-plot] cliffhanger candidates (N=${cliffhangerN}) for vol${args.volumeNo} ep${lastEp.episode_no}...`,
    );
    try {
      const candidates = await generateCliffhangerCandidates({
        bible: args.bible,
        volumeNo: args.volumeNo,
        episode: lastEp,
        prevEpisode: prevEp,
        isVolumeEnd: true,
        n: cliffhangerN,
        cwd: args.cwd,
        timeoutMs: args.timeoutMs,
      });
      const selection = await selectCliffhanger({
        candidates,
        context: {
          volumeNo: args.volumeNo,
          episode: lastEp,
          isVolumeEnd: true,
        },
        cwd: args.cwd,
        timeoutMs: args.timeoutMs,
      });
      // eslint-disable-next-line no-console
      console.log(
        `[volume-plot] cliffhanger 採用: ${selection.winner.candidate_id} (${selection.ranking[0].win_count}/${selection.matches.length} 勝)\n  rationale: ${selection.selection_rationale}`,
      );
      // 巻末 episode の cliffhanger_hook を勝者で上書き
      lastEp.cliffhanger_hook = selection.winner.cliffhanger_hook;
      // pull_link.next_opening_hook_hint に次話 hook を保持
      if (lastEp.pull_link) {
        lastEp.pull_link.next_opening_hook_hint = selection.winner.next_episode_hook;
      }
      // 選別証跡を VolumeEpisodePlan.cliffhanger_selection に保持
      lastEp.cliffhanger_selection = {
        source: "S1_cliffhanger_pairwise",
        winner_id: selection.winner.candidate_id,
        win_count: selection.ranking[0].win_count,
        total_matches: selection.matches.length,
        rationale: selection.selection_rationale,
      };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[volume-plot] cliffhanger 候補選別失敗 (skipping、Pass 2 出力を維持): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const finalPlot: VolumePlot = {
    slug: args.bible.meta.slug,
    volume_no: args.volumeNo,
    ...parsed,
    episodes: episodesWithDetail,
    schema_version: 2,
  };

  // 4 ドメイン契約 (Domain A / B) の整合性検証 (2026-05-20 S1)
  const contractWarnings = validateVolumePlotContracts({
    plot: finalPlot,
    archetypeStyle,
  });
  if (contractWarnings.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[volume-plot] 4 ドメイン契約 warnings (${contractWarnings.length} 件、archetype_style=${archetypeStyle}):\n  ${contractWarnings.join("\n  ")}`,
    );
  } else {
    // eslint-disable-next-line no-console
    console.log(`[volume-plot] 4 ドメイン契約 OK (archetype_style=${archetypeStyle})`);
  }

  return finalPlot;
}

/**
 * Multi-shot pass 2: 1 episode 分の scenes + brief_for_L3 を Codex 経由で生成。
 * generateVolumePlot から episode 毎に呼ばれる。
 */
export async function generateEpisodeDetail(args: {
  bible: BibleSnapshotV2;
  v2Concept: V2Concept;
  seriesPlan?: SeriesPlan;
  volumeNo: number;
  volumeTheme: string;
  episode: VolumeEpisodePlan;
  prevEpisode?: VolumeEpisodePlan;
  nextEpisode?: VolumeEpisodePlan;
  cwd?: string;
  timeoutMs?: number;
  /** 2026-05-20 S1 で追加。Domain B (episode_spine) 強制レベル切替 */
  archetypeStyle?: ArchetypeStyle;
}): Promise<{ scenes: SceneSkeleton[]; brief_for_L3: string; episode_spine?: EpisodeSpine }> {
  const ep = args.episode;
  const isFirstVolume = args.volumeNo === 1;
  const isFirstEpisode = ep.episode_no === 1;
  const isWebtoon = (args.archetypeStyle ?? "classic") === "webtoon";

  // 2026-05-20 S1: bible.antagonists リスト (humiliation_event.humiliator_character_id 制約用)
  const antagonistsList =
    (args.bible.antagonists ?? [])
      .map(
        (a) =>
          `${a.character_id} (type=${a.antagonist_type}, first_humiliation=v${a.first_humiliation_volume}ep${a.first_humiliation_episode})`,
      )
      .join(", ") || "(antagonist 未登録、humiliation_event は省略可)";
  const locationIdsList = args.bible.locations
    .map((l) => `${l.id} (${l.name})`)
    .join(", ");
  const characterIdsList = args.bible.characters
    .map((c) => `${c.id} (${c.name}, ${c.role})`)
    .join(", ");

  const result = await runCodexText({
    task: [
      `あなたは商業漫画の編集者として、以下の episode を構成する 5-7 個の scene skeleton + brief_for_L3 (1000-2000字) を設計してください。`,
      "",
      "## 対象 episode",
      `- volume_no: ${args.volumeNo}`,
      `- episode_no: ${ep.episode_no}`,
      `- title: ${ep.title_working}`,
      `- theme: ${ep.theme}`,
      `- arc_position: ${ep.arc_position?.arc_id ?? "?"} (${ep.arc_position?.role_in_arc ?? "?"})`,
      `- volume_position: ${ep.volume_position ?? "?"}`,
      `- page_target: ${ep.page_target}`,
      `- protagonist_arc: start=${ep.protagonist_arc.start} / turn=${ep.protagonist_arc.turn} / end=${ep.protagonist_arc.end}`,
      ep.core_hook_usage ? `- core_hook_usage: ${ep.core_hook_usage}` : "",
      ep.pairing_progression ? `- pairing_progression: ${ep.pairing_progression}` : "",
      `- must_include_events:`,
      ...ep.must_include_events.map((e) => `  - ${e}`),
      `- cliffhanger_hook: ${ep.cliffhanger_hook}`,
      `- beats:`,
      ...ep.beats.map((b) => `  - [${b.label}] ${b.summary} (intensity=${b.emotional_intensity})`),
      "",
      args.prevEpisode
        ? `## 前話 ep${args.prevEpisode.episode_no}\n- theme: ${args.prevEpisode.theme}\n- cliffhanger_hook: ${args.prevEpisode.cliffhanger_hook}`
        : "## 前話\n- (この episode が巻冒頭)",
      args.nextEpisode
        ? `## 次話 ep${args.nextEpisode.episode_no}\n- theme: ${args.nextEpisode.theme}\n- cliffhanger を受ける hint として使う`
        : "## 次話\n- (この episode が巻末、cliffhanger は次巻買いを誘う)",
      "",
      "## 漫画作法 (必須遵守)",
      "- scenes は 5-7 個。page_range は連続必須、合計が page_target と一致",
      "- scene.location_id は実在 bible.locations[].id のみ",
      "- scene.cast_ids は実在 bible.characters[].id のみ",
      "- scenes[0] は必ず directing_intent.kind=opening_hook を設定",
      "- 最終 scene は必ず directing_intent.kind=final_pull を設定",
      "- 中盤 scene (page_target の 45-60% 位置) に midpoint_turn",
      "- 終盤 scene (page_target の 80-95% 位置) に cliffhanger_setup",
      isFirstEpisode && isFirstVolume
        ? "- ⚠️ ep1 (vol1) の特別制約: opening_hook.narration_lines を 1 個以上、世界観 scene には directing_intent.kind=world_anchor を 1 つ追加し target_facts を 3 個以上明示"
        : "- ep2 以降: opening_hook では前話 cliffhanger を回収しつつ今話 hook を設計",
      "",
      // Archetype 制約注入 (Pass 2)
      (() => {
        if (!ep.archetype_id) return "";
        const subtype = (args.bible.meta as { subtype?: string }).subtype ?? "dungeon_modern";
        const dict = loadArchetypeDict(subtype);
        if (!dict) return "";
        const arch = findArchetype(dict, ep.archetype_id);
        if (!arch) return "";
        return buildArchetypeConstraints(arch);
      })(),
      "",
      "## Reader State Tracking (必須)",
      "各 scene の reader_state_after を必ず記入すること。",
      "- knows: この scene 終了時点で読者が確実に知っている事実のリスト (累積、前 scene の knows を含む)",
      "- feels: 読者の感情状態 (好奇心/緊張/安堵/興奮/困惑 等)",
      "- questions: 読者が抱えている未解決の問い (新たに生じた問い + 未解消の既存の問い)",
      "- attachments: 読者が感情移入している対象 (キャラ名/関係性)",
      "- scene が進むにつれて knows は単調増加する。questions は解消されたら消え、新たに生じたら追加される",
      "",
      "## Visual Channel (必須)",
      "各 scene の primary_channels に情報伝達チャネルを 1-3 個指定すること。",
      "選択肢: establishing_shot / character_intro / ui_screen / action_sequence / dialogue / monologue / narration / prop_closeup / reaction_shot / visual_contrast / silence_panel / sound_effect",
      "",
      // 2026-05-20 S1 Domain B (episode_spine) 指示注入
      isWebtoon
        ? [
            "## Episode Spine (Domain B、archetype_style=webtoon、必須出力)",
            "上記 scenes に加え、episode 全体を駆動する 5 イベントを構造化して出力すること。",
            "5 イベントは scenes と独立に **page 単位** で位置を指定する (page_range とは別軸)。",
            "",
            "**全話必須**:",
            "- secret_or_treasure_event: page=" + Math.round(ep.page_target * 0.3) + "-" + Math.round(ep.page_target * 0.5) + " 位置、secret_type を選択、視覚 signature 60字",
            "- awakening_event: page=" + Math.round(ep.page_target * 0.5) + "-" + Math.round(ep.page_target * 0.7) + " 位置、awakening_type 選択、intensity 0.75+ (ep1 は 0.85+)",
            "- payback_event: page=" + Math.round(ep.page_target * 0.7) + "-" + Math.round(ep.page_target * 0.9) + " 位置、payback_type 選択、visual_catharsis_signature 80字、intensity 0.85+ (ep1 は 0.90+)",
            "",
            isFirstEpisode
              ? [
                  "**ep1 で追加必須**:",
                  "- humiliation_event: page=" + Math.max(1, Math.round(ep.page_target * 0.15)) + "-" + Math.round(ep.page_target * 0.3) + " 位置",
                  "  - humiliator_character_id は bible.antagonists の中から選ぶ:",
                  "    " + antagonistsList,
                  "  - audience (侮辱の目撃者) 40字、insult 60字、unfairness (制度的不公平) 60字",
                  "  - protagonist_cannot_answer_yet 40字、severity 3-5 推奨",
                  "  - reader_emotion_target は anger / shame / revenge_desire のいずれか",
                  "- title_anchor: page=" + Math.round(ep.page_target * 0.75) + "-" + Math.round(ep.page_target * 0.95) + " 位置 (反撃成立直後)",
                  "  - trigger_event 40字、visual_pose 40字",
                  "  - emotional_function: awakening / revenge_start / identity_claim のいずれか",
                  "  - overlay_logo_asset: 未準備なら \"tbd_S2\" を入れる (S2 で SVG 合成)",
                ].join("\n")
              : "**ep2 以降**: humiliation_event / title_anchor は任意 (敵対者の escalation_plan と整合する場合のみ置く)",
            "",
            "**page 順序制約 (絶対遵守)**:",
            "humiliation_event.page < secret_or_treasure_event.page < awakening_event.page < payback_event.page ≤ title_anchor.page",
          ].join("\n")
        : [
            "## Episode Spine (Domain B、archetype_style=classic でも推奨出力)",
            "可能であれば episode_spine.secret_or_treasure_event / awakening_event / payback_event を出力すること (各 page 位置 + type)。",
            "archetype_style=classic では必須ではない (省略してもエラーにならない)。",
          ].join("\n"),
      "",
      "## brief_for_L3 (1000-2000字)",
      "- 上記 scenes の流れに沿って、L3 Shotlist にそのまま流せる本文を書く",
      "- 各 scene の場所/登場人物/出来事/モノローグ核ラインを散文で繋ぐ",
      "",
      "## bible 実在 ID 一覧",
      `### locations: ${locationIdsList}`,
      `### characters: ${characterIdsList}`,
      "",
      "## bible 抜粋 (世界観・関係性)",
      "```json",
      JSON.stringify(
        {
          world: args.bible.world,
          relations: args.bible.relations
            .filter((r) => r.is_recommended_pairing === true)
            .map((r) => ({
              from: r.from_character_id,
              to: r.to_character_id,
              type: r.relation_type,
              description: r.description,
            })),
          visual_motifs: args.bible.visual_motifs?.slice(0, 6),
        },
        null,
        2,
      ).slice(0, 12000),
      "```",
      "",
      "## 出力スキーマ",
      "```typescript",
      EPISODE_DETAIL_SCHEMA,
      "```",
      "",
      "## 出力形式",
      "上記スキーマに従う JSON のみを返してください。説明文・前置き・後書きは不要。",
      "scene_id は ep" + String(ep.episode_no).padStart(2, "0") + "_s01, ep" +
        String(ep.episode_no).padStart(2, "0") + "_s02 ... の形式で揃えてください。",
      "出力は ```json ... ``` のコードブロックで囲んでください。",
    ]
      .filter(Boolean)
      .join("\n"),
    format: "json",
    cwd: args.cwd,
    // 2026-05-21: ep8 climax 話 (scenes 7+、複雑 archetype) で 8 分タイムアウト頻発、15 分に拡張
    timeoutMs: args.timeoutMs ?? 15 * 60 * 1000,
    maxRetries: 1,
  });

  if (!result.parsed) {
    throw new Error(`episode-detail JSON 抽出失敗 (ep${ep.episode_no})`);
  }
  const parsed = result.parsed as {
    scenes?: SceneSkeleton[];
    brief_for_L3?: string;
    episode_spine?: EpisodeSpine;
  };
  if (!parsed.scenes || parsed.scenes.length < 3) {
    throw new Error(
      `episode-detail 検証失敗 (ep${ep.episode_no}): scenes.length=${parsed.scenes?.length} (< 3)`,
    );
  }
  if (!parsed.brief_for_L3 || parsed.brief_for_L3.length < 500) {
    throw new Error(
      `episode-detail 検証失敗 (ep${ep.episode_no}): brief_for_L3.length=${parsed.brief_for_L3?.length ?? 0} (< 500字)`,
    );
  }
  const scenes = parsed.scenes;
  const warnings = validateReaderStateFlow(scenes);
  if (warnings.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(`[volume-plot] ep${ep.episode_no} reader-state warnings:\n  ${warnings.join("\n  ")}`);
  }
  // 2026-05-20 S1 Domain B: episode_spine 整合性検証
  if (isWebtoon) {
    const spineWarnings = validateEpisodeSpine(parsed.episode_spine, isFirstEpisode, ep.page_target);
    if (spineWarnings.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[volume-plot] ep${ep.episode_no} episode_spine warnings (${spineWarnings.length} 件):\n  ${spineWarnings.join("\n  ")}`,
      );
    }
    // ep1 で humiliation_event / title_anchor が欠落すると fatal
    if (isFirstEpisode) {
      if (!parsed.episode_spine?.humiliation_event) {
        throw new Error(
          `ep1 (webtoon): episode_spine.humiliation_event が欠落 (Domain B 違反、必須)`,
        );
      }
      if (!parsed.episode_spine?.title_anchor) {
        throw new Error(
          `ep1 (webtoon): episode_spine.title_anchor が欠落 (Domain B 違反、必須)`,
        );
      }
    }
  } else if (parsed.episode_spine) {
    // classic でも episode_spine が出ていれば validate (warning のみ)
    const spineWarnings = validateEpisodeSpine(parsed.episode_spine, isFirstEpisode, ep.page_target);
    if (spineWarnings.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[volume-plot] ep${ep.episode_no} episode_spine warnings [classic, lax]:\n  ${spineWarnings.join("\n  ")}`,
      );
    }
  }
  return {
    scenes,
    brief_for_L3: parsed.brief_for_L3,
    episode_spine: parsed.episode_spine,
  };
}

export type ReaderStateWarning = string;

/**
 * scene 間の reader_state_after の整合性を検証。
 * - knows が単調増加しているか (前 scene の knows が次 scene で欠落していないか)
 * - questions が最終 scene までに少なくとも 1 つ解消されているか
 */
export function validateReaderStateFlow(scenes: SceneSkeleton[]): ReaderStateWarning[] {
  const warnings: ReaderStateWarning[] = [];
  let prevKnows = new Set<string>();
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    if (!s.reader_state_after) continue;
    const curKnows = new Set(s.reader_state_after.knows);
    for (const fact of prevKnows) {
      if (!curKnows.has(fact)) {
        warnings.push(`scene ${s.scene_id}: 前 scene の knows "${fact}" が欠落 (累積ルール違反)`);
      }
    }
    prevKnows = curKnows;
  }
  const firstQuestions = scenes[0]?.reader_state_after?.questions ?? [];
  const lastQuestions = scenes[scenes.length - 1]?.reader_state_after?.questions ?? [];
  if (firstQuestions.length > 0 && lastQuestions.length >= firstQuestions.length) {
    warnings.push("episode 全体で questions が解消されていない (全て持ち越し)");
  }
  return warnings;
}
