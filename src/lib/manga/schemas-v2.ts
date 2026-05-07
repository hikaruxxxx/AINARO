/**
 * 漫画パイプライン v2 スキーマ集約 (manga-pipeline-v2.md 準拠)
 *
 * v1 schemas.ts の primitive 型 (CharacterSpec/LocationSpec/PropSpec/CostumeSpec)
 * を流用しつつ、v2 で確定した layer 出力型 (BibleSnapshotV2/EpisodeStoryboardV2/
 * ResolvedRefs/RefsProvenance/PagePlanV2) を新規定義する。
 *
 * 既存 BibleSnapshot v1 とは別系統。schema_version で区別。
 */
import type {
  ArtStyle,
  CharacterRole,
  LocationType,
} from "./types";
import type {
  CharacterSpec,
  LocationSpec,
  PropSpec,
  CostumeSpec,
  AttributeClassifierLabels,
} from "./schemas";

// ============================================================
// L1 出力: BibleSnapshotV2
// ============================================================

export type WorldFaction = {
  name: string;
  summary: string;
};

export type WorldSpec = {
  premise: string;
  rules: string[];
  system: string;
  timeline: string;
  factions: WorldFaction[];
  lexicon?: TextQualityLexiconV2;
};

export type TextQualityLexiconV2 = {
  forbidden_terms_global?: string[];
  p1_opening_directive?: string;
  [key: string]: unknown;
};

export type CharacterSpeechStyleV2 = {
  first_person?: string;
  register?: string;
  sentence_rhythm?: string;
  verbosity_dial?: Record<string, string>;
  preferred_techniques?: string[];
  characteristic_phrases?: string[];
  to_navi_dialog_pattern?: string;
  speech_drift_per_volume?: Record<string, string>;
  monologue_signature?: string;
  ban_phrases?: string[];
  [key: string]: unknown;
};

export type NarrationStyleGuideV2 = {
  p1_opening_directive_specific?: {
    max_lines?: number;
    max_chars_per_line?: number;
    must_contain_at_most_one_of?: string[];
    must_avoid?: string[];
    preferred_pattern_examples?: string[];
    rejected_pattern_examples?: string[];
    [key: string]: unknown;
  };
  ban_list_phrases?: string[];
  monologue_signature_patterns?: string[];
  [key: string]: unknown;
};

export type NavFullSpecV2 = {
  voice_persona?: {
    default_tone?: string;
    speech_endings?: string[];
    emotional_range_per_volume?: Record<string, string>;
    [key: string]: unknown;
  };
  canonical_disclosure_lines_vol_1?: string[];
  anti_pattern_dialogue?: {
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type CharacterEntryV2 = {
  /** "char_ren_v1" 形式、bible 内ユニーク */
  id: string;
  name: string;
  name_romaji?: string;
  role: CharacterRole;
  age_visual?: string;
  spec: CharacterSpec;
  attribute_classifier: AttributeClassifierLabels;
  /** "always_black_hood" のような不変記述 ID 配列 */
  continuity_anchors: string[];
  appears_in_volumes: number[];
  /** 任意の脚本ノート (storyboard-builder への自由ヒント) */
  appearance_notes?: string;
  /** 任意の dialogue / monologue 文体ガード */
  speech_style?: CharacterSpeechStyleV2;
};

export type LocationEntryV2 = {
  /** "loc_lawson_interior_v1" 形式 */
  id: string;
  name: string;
  location_type: LocationType;
  spec: LocationSpec;
  continuity_anchors: string[];
  appears_in_episodes: number[];
};

export type PropEntryV2 = {
  /** "prop_smartphone_cracked_v1" 形式 */
  id: string;
  name: string;
  owner_character_id?: string;
  spec: PropSpec;
  continuity_anchors: string[];
};

export type CostumeEntryV2 = {
  id: string;
  character_id: string;
  /** どの話から有効か (1-indexed) */
  valid_from_episode: number;
  /** どの話まで有効か (null = 最終巻まで) */
  valid_until_episode: number | null;
  spec: CostumeSpec;
};

export type CharacterRelationV2 = {
  from_character_id: string;
  to_character_id: string;
  relation_type: string;
  description: string;
};

export type StyleDirectivesV2 = {
  /** 全話通底の画風 1-2文 */
  global: string;
  /** "daily" | "dungeon" | "battle" | "flashback" | "news_broadcast" 等 */
  scene_overrides: Record<string, string>;
  /** UI/オーバーレイ要素の禁則 */
  overlay_rules: string[];
};

export type VisualMotifV2 = {
  name: string;
  meaning: string;
  draw_directive: string;
};

export type ContinuitySeedKind =
  | "character_face"
  | "character_outfit"
  | "character_back"
  | "location_layout"
  | "prop"
  | "tv_variant";

export type ContinuitySeedV2 = {
  /** "char_ren_face_v1" 形式 */
  group_id: string;
  kind: ContinuitySeedKind;
  /** character.id / location.id / prop.id への参照 */
  target_id: string;
  invariant_description: string;
};

/**
 * トーン制御パラメータ (Phase X WX-2 で追加、Codex レビュー反映 2026-05-06)
 *
 * 「重い入口・重い関係・重い引き」三重奏の解体のため、暗さ強制プロンプトを撤去し、
 * 代わりに数値パラメータで制御する。各値は 0.0-1.0 の連続値:
 *
 *   - darkness:         0=軽快, 1=ヘルモード (light_recovery default 0.3, hellmode default 0.8)
 *   - comedic_density:  ページあたりギャグ呼吸の頻度 (0=皆無, 1=ほぼ毎page)
 *   - recovery_cadence: 小報酬/生活感 beat の頻度 (0=皆無, 1=高頻度)
 *   - sidekick_presence: 相棒/家族の登場頻度 (0=皆無, 1=ほぼ毎話)
 *
 * ジャンル別 darkness floor は data/generation/profiles/light_recovery_type/profile.yaml 参照。
 */
export type ToneProfile = {
  darkness: number;
  comedic_density: number;
  recovery_cadence: number;
  sidekick_presence: number;
};

export type DungeonModernSubtype = "external_social" | "gacha_ui" | "hybrid";

export type CoreHookV2 = {
  /** 中核ギミック1文。bible-lint で30字以内を必須検証する */
  one_liner: string;
  /** A:反復蓄積 / B:接続媒介 / C:視点ずらし */
  type: "A" | "B" | "C";
  /** 既存ヒット作との差分確認用。bible-lint で1-3作を検証する */
  hit_references: string[];
};

export type BibleSnapshotV2 = {
  schema_version: 2;
  generated_at: string;
  generated_from: {
    /** "v2_concept_json" | "design_doc_md" */
    source_type: string;
    source_path: string;
  };
  meta: {
    slug: string;
    title: string;
    title_short?: string;
    title_en?: string;
    art_style: ArtStyle;
    genre: string;
    target_pages_per_volume: number;
    target_episodes_per_volume: number;
    target_pages_per_episode: number;
    target_audience?: string;
    estimated_volumes?: number;
    /** Phase X WX-2 で追加。後方互換 optional。未設定の bible は L01b bible-lint で warning */
    tone_profile?: ToneProfile;
    /** どのプロファイルから生成されたか (例: "light_recovery_type" | "hellmode_type") */
    profile_id?: string;
    /** ジャンル内サブタイプ (現状 modern_dungeon でのみ使用) */
    subtype?: DungeonModernSubtype;
    /** 中核ギミック1点突破。後方互換のため optional、必須化は bible-lint で担保する */
    core_hook?: CoreHookV2;
  };
  world: WorldSpec;
  characters: CharacterEntryV2[];
  locations: LocationEntryV2[];
  props: PropEntryV2[];
  costumes: CostumeEntryV2[];
  relations: CharacterRelationV2[];
  style_directives: StyleDirectivesV2;
  visual_motifs: VisualMotifV2[];
  continuity_seeds: ContinuitySeedV2[];
  narration_style_guide?: NarrationStyleGuideV2;
  nav_full_spec?: NavFullSpecV2;
  volume_synopsis: {
    theme: string;
    summary: string;
    cliffhanger?: string;
  };
};

export function isBibleSnapshotV2(v: unknown): v is BibleSnapshotV2 {
  if (typeof v !== "object" || v === null) return false;
  const x = v as Partial<BibleSnapshotV2>;
  return (
    x.schema_version === 2 &&
    typeof x.meta === "object" &&
    Array.isArray(x.characters) &&
    Array.isArray(x.locations) &&
    typeof x.world === "object"
  );
}

// ============================================================
// L2 出力: RefsProvenance
// ============================================================

export type RefSourceType =
  | "bible_generated"
  | "manual_upload"
  | "kindle_archive"
  | "external_purchased"
  /** L12 repair で再生成した素材 (bible_generated を上書きする履歴あり) */
  | "bible_image_repaired_v2"
  /** Track B 30件競合棚リスト用、Amazon 公開メタデータ (本文画像は含まない) */
  | "amazon_public_metadata";

export type RefRightsStatus = "ai_use_allowed" | "internal_only" | "blocked";

/** B-1 計画 Track C-1: 商標・既存IP類似チェック結果 */
export type TrademarkCheckStatus = "pending" | "passed" | "flagged";

/** RefProvenanceEntry の編集履歴 1 entry */
export type RefEditHistoryEntry = {
  editor: string;
  timestamp: string;
  reason: string;
};

export type RefProvenanceEntry = {
  asset_id: string;
  path: string;
  source_type: RefSourceType;
  rights_status: RefRightsStatus;
  created_by: string;
  created_at: string;
  /** この資産が直接派生した親 asset_id 群 (1世代分) */
  derived_from: string[];
  license_note: string;
  qa_score?: number;
  training_candidate: boolean;
  /** 紐付け対象 (character.id / location.id / prop.id / "global_style") */
  target_entity_id: string;
  target_entity_type: "character" | "location" | "prop" | "style";
  /** "front" | "side" | "diagonal" | "expr_joy" | "outfit_battle" 等 */
  variant: string;

  // ── Track C-1 で追加 (Codex指摘: 制作・出版監査用 dossier) ──
  /** 画像生成プロンプト全文。後で再現性確保するため必須化 */
  generation_prompt?: string;
  /** 使用モデル (例: "gpt-image-2") */
  model_name?: string;
  /** モデルバージョン (例: "2026-04-21") */
  model_version?: string;
  /** 生成タイムスタンプ (created_at と区別: 後段の repair で created_at が更新されても変わらない) */
  generation_timestamp?: string;
  /** 編集履歴 (誰が・いつ・なぜ修正したか) */
  edit_history?: RefEditHistoryEntry[];
  /** 購入素材のライセンス番号 (external_purchased 用、領収書/契約番号) */
  purchase_record_id?: string;
  /** 商用利用条件文 (購入素材のライセンス条文抜粋) */
  commercial_use_clause?: string;
  /** 商標・既存IP類似チェック結果 */
  trademark_check_status?: TrademarkCheckStatus;
  /**
   * 学習元素材の transitive 追跡 (祖先 asset_id 群)。
   * derived_from は1世代だが、learning_source_chain は祖先全部を平坦化して持つ。
   * kindle_archive が混入していたら isAllowedForProduction で transitive reject。
   */
  learning_source_chain?: string[];
};

export type RefsProvenance = {
  schema_version: 1;
  refs: RefProvenanceEntry[];
};

/**
 * kindle_archive 由来は L7 で reject。schema 直近 helper。
 * 詳細な transitive reject + trademark 必須化は src/lib/manga/bible/provenance.ts 側に移行済。
 */
export function isAllowedForProduction(entry: RefProvenanceEntry): boolean {
  if (entry.source_type === "kindle_archive") return false;
  if (entry.rights_status !== "ai_use_allowed") return false;
  // transitive: learning_source_chain に kindle_archive 由来が混じっていたら reject
  // (chain には祖先 asset_id しか入らないので、source_type 直接チェックは provenance.ts 側で全 entry を引いて判定)
  return true;
}

// ============================================================
// L4 出力: EpisodeStoryboardV2 (entity_id binding 強制)
// ============================================================

export type ShotType = "close_up" | "medium" | "wide" | "establishing";
export type CameraType =
  | "eye_level"
  | "low_angle"
  | "high_angle"
  | "over_shoulder"
  | "birds_eye";

export type CharacterPanelRole =
  | "speaker"
  | "listener"
  | "background"
  | "silhouette";

export type OnScreenVia = "in_person" | "tv" | "photo" | "phone" | "voice_off";

export type PanelEntities = {
  characters: Array<{
    /** bible.characters[].id への hard ref */
    character_id: string;
    role: CharacterPanelRole;
    on_screen_via: OnScreenVia;
    expression: string;
  }>;
  /** bible.locations[].id への hard ref */
  location_id: string;
  props: Array<{
    prop_id: string;
    held_by_character_id?: string;
  }>;
  /** この panel の主役 (character.id / location.id / prop.id) */
  focus_entity_id: string;
};

export type PageRoleV2 =
  | "opening_hook"
  | "buildup"
  | "reveal"
  | "cliffhanger"
  | "aftermath"
  | "establishing"
  | "dialogue"
  | "action";

/**
 * ナレーション種別 (Phase Y WY-2 で追加、Codex レビュー指摘の「独立layer でなく schema 拡張」に従う)
 *
 *   - omniscient: 神視点ナレ (「夜だった」「街は静かだった」等)。地の文型
 *   - protagonist_monologue: 主人公の内的独白 (雲型吹き出しで描画されるべき内容)
 *   - thought_bubble: 主人公以外のキャラの心情 (補助的、登場頻度低)
 *   - caption_box: 状況注釈 (「※息子の初バイト帰り」「3年前」等の補足ボックス)
 */
export type NarrationKind =
  | "omniscient"
  | "protagonist_monologue"
  | "thought_bubble"
  | "caption_box";

export type PanelV2 = {
  panel_id: string;
  panel_no: number;
  reading_order: number;
  shot_type: ShotType;
  camera: CameraType;
  bleed: boolean;
  silence: boolean;
  importance: 1 | 2 | 3 | 4 | 5;
  entities: PanelEntities;
  action: string;
  key_visual: string;
  dialogue: Array<{
    character_id: string;
    text: string;
    /** 2026-05-07 追加: 吹き出し形状 */
    bubble_shape?: "oval" | "rounded_square" | "thought_cloud" | "narration_box";
    /** 2026-05-07 追加: tail 方向 (引き出し線の出る方向、speaker から panel 中心への方向) */
    tail_direction?: "left" | "right" | "up" | "down";
  }>;
  monologue: Array<{
    character_id: string;
    text: string;
    /** 2026-05-07 追加: 吹き出し形状 */
    bubble_shape?: "oval" | "rounded_square" | "thought_cloud" | "narration_box";
    /** 2026-05-07 追加: tail 方向 (引き出し線の出る方向、speaker から panel 中心への方向) */
    tail_direction?: "left" | "right" | "up" | "down";
  }>;
  narration: string[];
  /**
   * Phase Y WY-2 で追加 (後方互換 optional)。narration[i] と同じ index で対応する種別。
   * 未指定時は audit/render 側で "caption_box" にフォールバック。
   * storyboard-extractor / opening-hook-pass / cliffhanger-architect は kind を明示推奨。
   */
  narration_kinds?: NarrationKind[];
  sfx: string[];
  /** L6 Continuity Resolve で注入される */
  continuity_group_ids?: string[];
  /** 2026-05-07 追加: panel-level screentone 濃度。L9 prompt が反映 */
  screentone_intensity?: "light" | "medium" | "dark";
};

export type StoryboardPageV2 = {
  page_no: number;
  page_role: PageRoleV2;
  panels: PanelV2[];
};

export type EpisodeStoryboardV2 = {
  schema_version: 2;
  episode_id: string;
  total_pages: number;
  pages: StoryboardPageV2[];
  /** Phase Y WY-3 で追加。後方互換 optional。cliffhanger architect で割り当てる */
  pull_link?: PullLink;
};

/**
 * Phase Y WY-3: cliffhanger 引きパターン (manga_craft_guide v2 + a07 商業引き分析より7種)
 *
 * 各話/各巻の最終 panel に割り当てる「次を読みたくなる引き」の典型構造。
 * KU 読者の次話/次巻購読率を最大化するための定型パターン辞書。
 */
export type CliffhangerPatternId =
  /** 未知の脅威がシルエットで現れる (「Sランクの戦力が…」「監査室の異常検知」等) */
  | "unknown_threat_silhouette"
  /** 主人公の決意/能動的モノローグで終わる (「次は俺が」「まだ、行ける」等) */
  | "protagonist_resolve_monologue"
  /** 日常に異物が侵入する (普段の日常 → 異常な来訪者/通知/光) */
  | "daily_intrusion"
  /** 次巻表紙への伏線 (新キャラのシルエット/新組織のロゴ/予告コマ) */
  | "next_volume_foreshadow"
  /** 仲間/相棒との関係に変化 (告白未満の温度上昇/相棒の去り際) */
  | "relationship_shift"
  /** 主人公の能力/正体が明かされる片鱗 (新スキル/隠しステータス/制度の真実) */
  | "ability_or_identity_glimpse"
  /** ヒロイン格の消滅リスク/危機 (a07 のナビ消滅リスク型) */
  | "heroine_jeopardy";

/**
 * 1 episode の最終 panel と次 episode/巻の opening_hook を繋ぐリンク情報。
 * EpisodeStoryboardV2.pull_link / VolumePlot.episodes[].pull_link で使う。
 */
export type PullLink = {
  /** 当該 episode の cliffhanger パターン */
  current_episode_cliff: CliffhangerPatternId;
  /** 次 episode の opening_hook の予告メモ (1-2文、storyboard-extractor が次話 ep0+1 の opening 設計に使う) */
  next_opening_hook_hint: string;
  /**
   * 巻末か否か (vol.last_episode === true なら、cliffhanger の重みが「次巻 buy」になる、
   * そうでなければ「次話 read-through」)。最終巻 vol13 の last_ep は最終回判定。
   */
  is_volume_end?: boolean;
  /** 巻末の場合、次巻表紙への伏線テキスト (next_volume_foreshadow パターン用) */
  next_volume_teaser?: string;
};

// ============================================================
// L5 出力: PagePlanV2
// ============================================================

export type RenderStrategy = "panel_composite" | "page_one_shot" | "hybrid";

/**
 * パネル内側の背景表現種別 (2026-05-06 追加、reference pool 分離用)
 *
 * 「コマの中身が背景としてどう描かれるか」の分類。L02 bible-images の背景生成
 * reference (描き込み背景の学習) と L05 page-director の構図 reference (トーンバック
 * 含む全 panel) を取り違えないために必要。
 *
 *   - detailed_bg:       描き込まれた背景。L02 の背景 reference になる
 *   - atmospheric_fade:  境界がフェード/抜け、背景一部のみ描き込み
 *   - tone_back:         全面スクリーントーン (背景描写ゼロ、心情/間用途)
 *   - solid_white:       全面白 (背景描写ゼロ、衝撃/フラッシュ)
 *   - solid_black:       全面黒 (背景描写ゼロ、暗転/不在)
 *   - floating_ui:       UI/HUD/ステータス画面が panel そのもの
 *   - unspecified:       未指定 (bootstrap 未実施 or learner 待ち)
 */
export type BackgroundTreatment =
  | "detailed_bg"
  | "atmospheric_fade"
  | "tone_back"
  | "solid_white"
  | "solid_black"
  | "floating_ui"
  | "unspecified";

/**
 * background_treatment が L02 の「背景描き込み reference」として使えるか?
 * detailed_bg のみ true。atmospheric_fade はフェードで形が読み取れず除外。
 */
export function isBackgroundReferenceCandidate(t: BackgroundTreatment | undefined): boolean {
  return t === "detailed_bg";
}

export type PagePlanPanel = {
  panel_id: string;
  slot_id: string;
  rect: { x: number; y: number; w: number; h: number };
  reading_order: number;
  importance: 1 | 2 | 3 | 4 | 5;
  /** Phase 1 v3: 視覚的傾き（コマ枠の中心回転、単位:度、符号付き、外接rectは不変） */
  tilt_deg?: number;
  /** Phase B v3: 実際のコマ枠 polygon。頂点列 [[x,y],...] (時計回り)。未指定なら rect から派生。
   *  polygon 指定時は tilt_deg は無視される。凹多角形可（隣接切り欠きで発生）*/
  polygon?: [number, number][];
  /** Phase B3 v3: 枠線描画スキップ (atmospheric panel 用) */
  is_borderless?: boolean;
  /** Phase B3 v3: ページ縁まで延長する panel (枠線スキップ) */
  bleed_polygon?: boolean;
  /** 2026-05-06 追加。pattern-applier が slot.background_treatment から伝播 */
  background_treatment?: BackgroundTreatment;
  /** L6 で注入 */
  continuity_group_ids?: string[];
};

export type PagePlanPage = {
  page_no: number;
  layout_template_id: string;
  page_role: PageRoleV2;
  render_strategy: RenderStrategy;
  panels: PagePlanPanel[];
  /** F-2 page_one_shot 用 */
  page_continuity_group_ids?: string[];
};

export type PagePlanV2 = {
  schema_version: 2;
  episode_id: string;
  capability_profile_id: string;
  pages: PagePlanPage[];
};

// ============================================================
// L7 出力: ResolvedRefs
// ============================================================

export type RefRole =
  | "style"
  | "character_face"
  | "character_full"
  | "character_back"
  | "character_outfit"
  | "character_3view"
  | "location"
  | "prop"
  | "continuity_anchor"
  | "previous_panel"
  | "negative";

export type RefSource =
  | "deterministic"
  | "continuity_forced"
  | "llm_judged"
  | "repair_forced";

export type ResolvedRef = {
  asset_id: string;
  path: string;
  weight: number; // 0.0-1.0 (capability で weighting 不可なら 1.0 固定)
  role: RefRole;
  target_entity_id?: string;
  source: RefSource;
  rationale: string;
};

export type ResolvedRefPacket = {
  scope: "panel" | "page";
  refs: ResolvedRef[];
  budget: { max: number; optimal: number; used: number };
  truncated: boolean;
  unresolved_entities: string[];
  warnings: string[];
};

export type ResolvedRefs = {
  schema_version: 1;
  episode_id: string;
  capability_profile_id: string;
  render_strategy: RenderStrategy;
  /** key = panel_id (or page_id when scope=page) */
  packets: Record<string, ResolvedRefPacket>;
};

// ============================================================
// L11 出力: AuditReport
// ============================================================

export type AuditCheckResult = {
  panel_id: string;
  check_kind:
    | "face_consistency"
    | "dialogue_count"
    | "continuity_anchor"
    | "background_invariant"
    | "regulation_violation"
    /** 2026-05-06 追加。pattern dictionary 由来 background_treatment と
     *  実 ref/render の整合性検査 (RULE 11 が遵守されているか) */
    | "bg_treatment_compliance";
  passed: boolean;
  score?: number;
  threshold?: number;
  detail?: string;
};

export type AuditReport = {
  schema_version: 1;
  episode_id: string;
  audited_at: string;
  panels_total: number;
  panels_passed: number;
  panels_failed: number;
  checks: AuditCheckResult[];
  failed_panel_ids: string[];
};

// ============================================================
// L12 出力: RepairLog
// ============================================================

export type RepairAction =
  | "regenerate_with_stronger_refs"
  | "switch_render_strategy"
  | "swap_to_silhouette"
  | "rebuild_layout_slot"
  | "manual_review_required";

export type RepairAttempt = {
  panel_id: string;
  attempt_no: number;
  triggered_by_check: string;
  action: RepairAction;
  rationale: string;
  before_score?: number;
  after_score?: number;
  succeeded: boolean;
};

export type RepairLog = {
  schema_version: 1;
  episode_id: string;
  attempts: RepairAttempt[];
};

// ============================================================
// L13 出力: KdpMetadata / KdpRelease / KdpSeries
// ============================================================

/**
 * KDP公式 AI 申告 5 区分
 * https://kdp.amazon.com/help/topic/G200672390 (Content Guidelines: AI-Generated Content)
 *
 * - text: 本文テキスト (台詞・ナレーションを含む)
 * - images: 内側の画像 (コマ・イラスト)
 * - translation: 翻訳 (元言語が別の場合)
 * - cover: 表紙画像
 * - interior: 本文ページレイアウト全体 (KDP用語のinterior)
 *
 * 全項目をbool化して KDP管理画面のチェックリストに 1:1 対応させる。
 * 自由文ではなく構造化することでアカウント停止リスクを下げる。
 */
export type AiDisclosureFlags = {
  text: boolean;
  images: boolean;
  translation: boolean;
  cover: boolean;
  interior: boolean;
};

export type KdpMetadata = {
  schema_version: 2; // ← 1 → 2 (AI開示構造化対応)
  slug: string;
  volume_no: number;
  title: string;
  subtitle?: string;
  author_pen_name: string;
  isbn?: string;
  asin?: string;
  bisac_categories: string[];
  /** 旧形式の自由文。後方互換のため残すが、新規入稿では ai_disclosure を使う */
  ai_disclosure_text?: string;
  /** KDP公式5区分にbool対応 (Codex指摘で必須化) */
  ai_disclosure: AiDisclosureFlags;
  /** AI生成に使ったモデル名一覧 (例: ["gpt-image-2", "claude-opus-4-7"]) */
  ai_tools_used: string[];
  /** 著者による人手編集が行われたか */
  human_review_performed: boolean;
  page_count: number;
  spine_width_mm: number;
  publication_date: string;
  manuscript_pdf_path: string;
  cover_pdf_path: string;

  // ── kdp-modular-plum.md (検索最適化拡張、全 optional / 後方互換) ──
  /** タイトル/サブタイトル候補 (最終1案決定前のドラフト履歴) */
  title_candidates?: string[];
  /** シリーズ名の完全文字列 (大文字小文字・句読点厳密一致が必要) */
  series_name_canonical?: string;
  /** 7キーワード手動キュレーション結果 (kdp_inputs.keywords へ反映する source of truth) */
  keyword_picks_7?: string[];
  /** ghost判定済みカテゴリ候補 (実際にbrowseable確認済の3カテゴリ) */
  categories_validated?: string[];
};

/**
 * KDP入稿台帳 (kdp-release.json)
 *
 * 各巻の入稿に関する全情報を1ファイルに集約。
 * - 防衛資産: アカウント停止時の弁明・EXIT監査・税務記録
 * - LLM進化と無関係に資産化される
 */
export type KdpReleaseStatus =
  | "draft"           // 未preflight
  | "preflight_ok"    // ローカル検証パス
  | "submitted"       // KDP管理画面に投入済
  | "published"       // 販売開始
  | "unpublished";    // 非公開化

export type KdpReleaseInputs = {
  title: string;
  subtitle?: string;
  description_html: string;
  /** 7キーワード (KDP上限7、各≤50字) */
  keywords: string[];
  /** 3カテゴリ (KDP上限3、2023年中盤からダッシュボード選択のみ。サポート経由追加申請は廃止) */
  categories: string[];
  isbn?: string;
  asin?: string;
};

export type KdpReleasePricing = {
  price_jpy: number;
  ku_enrolled: boolean;
  /** 35% or 70% royalty plan */
  royalty_plan: "35" | "70";
};

export type KdpReleaseSchedule = {
  published_at?: string;
  ad_start_at?: string;
};

export type KdpReleaseRightsCheck = {
  trademark_passed: boolean;
  ip_similarity_passed: boolean;
  checked_at: string;
  notes?: string;
};

export type KdpReleasePreviewLog = {
  reviewed_at: string;
  issues: string[];
  resolved: boolean;
};

export type KdpReleaseEditHistoryEntry = {
  timestamp: string;
  field: string;
  old: unknown;
  new: unknown;
  reason?: string;
};

export type KdpRelease = {
  schema_version: 1;
  slug: string;
  volume_no: number;
  status: KdpReleaseStatus;
  manuscript_pdf_path: string;
  cover_pdf_path: string;
  ai_disclosure: AiDisclosureFlags;
  ai_tools_used: string[];
  human_review_performed: boolean;
  rights_check: KdpReleaseRightsCheck;
  kdp_inputs: KdpReleaseInputs;
  pricing: KdpReleasePricing;
  schedule: KdpReleaseSchedule;
  preview_log: KdpReleasePreviewLog[];
  edit_history: KdpReleaseEditHistoryEntry[];
  /** 任意メモ (KDP管理画面のスクショ位置等) */
  notes?: string;
};

/**
 * シリーズ設定 (kdp-series.json) — 同一slugの複数巻を束ねる。
 * 永続先: data/manga/works/{slug}/kdp-series.json
 */
export type KdpSeries = {
  schema_version: 1;
  slug: string;
  series_title: string;
  series_title_en?: string;
  estimated_total_volumes: number;
  /** vol_no -> ASIN (Amazonがpublish時に発番) */
  asin_by_volume: Record<number, string>;
  /** vol_no -> ISBN (任意) */
  isbn_by_volume?: Record<number, string>;
  publication_schedule: { volume_no: number; planned_date: string }[];
};
