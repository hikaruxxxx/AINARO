/**
 * Bible Deep Extractor
 *
 * V2企画書 + 現 bible snapshot + lint findings + 画風参考フレーム情報 を Codex CLI text に流し、
 * 浅さを埋める patch JSON を取得 → snapshot v2.1 を出力。
 *
 * 取得項目:
 *   - 全 supporting キャラの spec 完備 (hair.specific / outfit_default / personality)
 *   - 各キャラの continuity_anchors 3-5 個 (心理/外見/癖)
 *   - appearance_notes 200字+
 *   - ダンジョン内部 locations 3-5 件追加
 *   - props 5+ 件追加 (ジャンル象徴)
 *   - visual_motifs 5+ 件 (意味付け込み)
 *   - costumes 巻またぎ 4-5 件
 *   - relations 双方向化 + 巻ごとの感情変化
 *   - volume_synopsis.summary 500-1000字
 */
import { runCodexText } from "../llm/codex-text";
import type { ComplianceFinding } from "../compliance/types";
import type {
  BibleSnapshotV2,
  CharacterEntryV2,
  CharacterRelationV2,
  CostumeEntryV2,
  CoreHookV2,
  LocationEntryV2,
  NavFullSpecV2,
  NarrationStyleGuideV2,
  PropEntryV2,
  TextQualityLexiconV2,
  VisualMotifV2,
} from "../schemas-v2";
import type { V2Concept } from "./v2-adapter";
import type { BibleLintReport } from "../qa-v2/bible-lint";
import { loadBlocklist, loadFalsePositives, scanBible } from "../compliance/scanner";
import { BIBLE_DEPTH_SPEC, measureChars, type DepthRule } from "./depth-spec";

const ENHANCEMENT_SCHEMA = `
type DeepExtractorOutput = {
  core_hook_patch?: {
    one_liner: string;              // 中核ギミック1文。30字以内
    type: "A" | "B" | "C";          // A:反復蓄積 / B:接続媒介 / C:視点ずらし
    hit_references: string[];       // 同類の既存ヒット作 1-3作
  } | null;
  characters_patch: Array<{
    id: string;                    // 既存 character.id を指定
    spec_overrides?: {
      hair?: { style: string; color: string; specific: string };
      eyes?: { shape: string; color: string; expression_default: string };
      face?: { jaw?: string; skin_tone?: string; marks?: string[] };
      outfit_default?: { outerwear?: string; top?: string; bottom?: string; shoes?: string; accessories?: string[] };
      personality_visual?: string; // 80-120字
      voice_tag?: string;
    };
    continuity_anchors_replace?: string[];   // 3-5個。心理癖+外見+小物 のミックス
    appearance_notes_replace?: string;       // 200字+
  }>;
  locations_add: Array<{
    id: string;                    // "loc_xxx_v1" 形式、新規
    name: string;
    location_type: "indoor" | "outdoor" | "dungeon" | "transport" | "other";
    spec: {
      era: string;
      atmosphere: string;
      layout: { type: string; size_m?: string; doors?: Array<{position: string; type: string}>; furniture?: Array<{type: string; position: string; color?: string}> };
      lighting_default: string;
      color_palette: string[];
    };
    continuity_anchors: string[];  // 3+個
    appears_in_episodes: number[];
  }>;
  props_add: Array<{
    id: string;                    // "prop_xxx_v1" 形式、新規
    name: string;
    owner_character_id?: string;   // null も可
    spec: { kind: string; color: string; material: string; distinguishing_features: string[] };
    continuity_anchors: string[];
  }>;
  visual_motifs_add: Array<{
    name: string;
    meaning: string;               // なぜ繰り返すか
    draw_directive: string;        // 英語の画像プロンプト用 1-2文
  }>;
  costumes_add: Array<{
    id: string;                    // "costume_xxx_v1"
    character_id: string;          // 既存 character.id
    valid_from_episode: number;
    valid_until_episode: number | null;
    spec: { outerwear?: string; top?: string; bottom?: string; shoes?: string; accessories?: string[]; state_description: string };
  }>;
  relations_replace: Array<{
    from_character_id: string;
    to_character_id: string;
    relation_type: string;
    description: string;            // 100字+。双方向の感情・葛藤・過去因縁・巻ごとの変化
  }>;
  style_directives_overrides?: {
    global?: string;                // 画風参考フレームに合わせて書き直し
    scene_overrides?: Record<string, string>;
  };
  volume_synopsis_replace?: {
    theme: string;                  // 巻全体のテーマ 80-150字
    summary: string;                // 500-1000字、章ビート骨格
    cliffhanger: string;            // 巻末の引き 100-200字
  };
  lexicon_patch?: {
    [key: string]: unknown;          // world.lexicon (TextQualityLexiconV2) の生成 patch。forbidden_terms_global (string[]) / p1_opening_directive (string) を含む。作品の用語禁則・ナレーション語彙ガード。bible の既存 lexicon が空のときのみ生成すること。
  } | null;
  narration_style_guide_patch?: {
    [key: string]: unknown;          // narration_style_guide (NarrationStyleGuideV2) 全体の生成 patch。p1_opening_directive_specific / ban_list_phrases / monologue_signature_patterns を含む。bible.narration_style_guide が未設定のときのみ生成すること。
  } | null;
  nav_full_spec_patch?: {
    [key: string]: unknown;          // nav_full_spec (NavFullSpecV2) 全体の生成 patch。voice_persona / canonical_disclosure_lines_vol_1 / anti_pattern_dialogue を含む。案内役が存在しないなら null。
  } | null;
};
`;

export type DeepExtractionPatch = {
  core_hook_patch?: CoreHookV2 | null;
  characters_patch?: Array<{
    id: string;
    spec_overrides?: Partial<BibleSnapshotV2["characters"][number]["spec"]>;
    continuity_anchors_replace?: string[];
    appearance_notes_replace?: string;
  }>;
  locations_add?: Array<BibleSnapshotV2["locations"][number]>;
  props_add?: Array<BibleSnapshotV2["props"][number]>;
  visual_motifs_add?: Array<BibleSnapshotV2["visual_motifs"][number]>;
  costumes_add?: Array<BibleSnapshotV2["costumes"][number]>;
  relations_replace?: Array<BibleSnapshotV2["relations"][number]>;
  style_directives_overrides?: Partial<BibleSnapshotV2["style_directives"]>;
  volume_synopsis_replace?: Partial<BibleSnapshotV2["volume_synopsis"]>;
  lexicon_patch?: TextQualityLexiconV2 | null;
  narration_style_guide_patch?: NarrationStyleGuideV2 | null;
  nav_full_spec_patch?: NavFullSpecV2 | null;
};

export type CharacterDeepPatch = {
  character_id: string;
  patch: Partial<CharacterEntryV2>;
};

export type LocationDeepPatch = {
  location_id: string;
  patch: Partial<LocationEntryV2>;
};

export type WorldAspect =
  | "history"
  | "power_system"
  | "cosmology"
  | "economy"
  | "social"
  | "daily_life"
  | "language"
  | "forbidden_lore"
  | "foundation";

export type WorldDeepPatch = {
  aspect: WorldAspect;
  patch: Partial<BibleSnapshotV2["world"]>;
};

export type MotifDeepPatch = {
  motif_id: string;
  patch: Partial<VisualMotifV2>;
};

export type PropDeepPatch = {
  prop_id: string;
  patch: Partial<PropEntryV2>;
};

export type CostumeDeepPatch = {
  costume_id: string;
  patch: Partial<CostumeEntryV2>;
};

export type RelationDeepPatch = {
  relation: { a_id: string; b_id: string };
  patch: Partial<CharacterRelationV2>;
};

export type VolumeDeepPatch = {
  volume_no: number;
  patch: Partial<BibleSnapshotV2["volume_synopsis"]>;
};

export type CrossRefPatch = {
  character_patches?: CharacterDeepPatch[];
  location_patches?: LocationDeepPatch[];
  world_patch?: Partial<BibleSnapshotV2["world"]>;
  motif_patches?: MotifDeepPatch[];
  prop_patches?: PropDeepPatch[];
  costume_patches?: CostumeDeepPatch[];
  relation_patches?: RelationDeepPatch[];
  volume_patch?: Partial<BibleSnapshotV2["volume_synopsis"]>;
  compliance_replacements?: ComplianceReplacement[];
  compliance_post_check?: CompliancePostCheck;
  notes?: string[];
};

type DryRunResult = { dryRunPrompt: string };
export type ComplianceReplacement = {
  field_path: string;
  from: string;
  to: string;
  reason?: string;
  mode?: "id_rename" | "text_only";
};
export type CompliancePostCheck = {
  fatal_count: number;
  warn_count: number;
  remaining_findings: CompliancePostCheckFinding[];
};
type CompliancePostCheckFinding = Pick<ComplianceFinding, "category" | "matched_term" | "field_path" | "text_excerpt">;
type StageCommonArgs = {
  bible: BibleSnapshotV2;
  styleReferenceNote: string;
  cwd?: string;
  timeoutMs?: number;
  dryRun?: boolean;
};

type JsonRecord = Record<string, unknown>;

const DEFAULT_CODEX_TIMEOUT_MS = 12 * 60 * 1000;

const COMPLIANCE_DIRECTIVE = [
  "## コンプライアンス (絶対遵守)",
  "- 実在企業・実在商標・実在人物名・実在著作物名は **一切使用禁止**",
  "  - NG 例: ローソン / セブンイレブン / マクドナルド / iPhone / Galaxy / LINE / Twitter / Instagram / YouTube / TikTok / Tesla / トヨタ / Apple / Google / Amazon / ポケモン / ガンダム / 鬼滅の刃 / ワンピース / 大谷翔平 / ハリーポッター 等",
  "  - 完全な NG リスト: data/manga/compliance/blocklist.json (scanner.ts で自動検査、違反は lint fatal でブロック)",
  "- 代替表現の指針:",
  "  - コンビニ → 架空チェーン名 + 視覚的特徴 (青と白の看板、24h営業、おでん什器、入口チャイム2音 等)",
  "  - 自動車メーカー → 架空ブランド名 + 「日本の自動車メーカー」等の記述",
  "  - スマートフォン → 架空メーカー名 + 「黒い縦長端末、上端カメラ切り欠き、抽象シンボルロゴ」等",
  "  - SNS / メッセージアプリ → 架空アプリ名 + 「緑のメッセージアプリ」「短文 SNS、鳥は使わない抽象シンボル」等",
  "  - ファストフード / カフェチェーン → 架空名 + ロゴ色とメニュー特徴で identity",
  "  - 大学・私学・特定施設 → 架空名 + 一般描写 (赤門/校章等の固有アイコンは避ける)",
  "  - 実在人物名 (政治家・芸能人・スポーツ選手・CEO 等) → 役割描写で代替",
  "- 不安なら『○○系の』『○○風の』+ 説明的記述で代替し、固有名は出さない",
  "- **重要**: 既存 bible に NG 語が含まれていたら、必ず patch で safe な架空名に置換すること",
  "- 代替名の発想: data/manga/compliance/blocklist.json の safe_substitutes セクションに各カテゴリの fictional_name_hint と description を用意してあるので、参考にしてよい",
].join("\n");

const STAGE9_COMPLIANCE_ERADICATION_DIRECTIVE = [
  "## 最優先タスク: 全フィールド compliance 駆逐",
  "",
  "bible 全体を再走し、以下の **すべてのフィールド・id・key** で実在企業名・実在商標",
  "の残存を検出して compliance_replacements に列挙してください。",
  "",
  "検査対象:",
  "- characters[].id, characters[].name (架空名のはずだが確認)",
  "- locations[].id, locations[].name, locations[].spec.* の各 string",
  "- props[].id, props[].name, props[].spec.* の各 string",
  "- costumes[].id, costumes[].character_id (id が NG 語を含む場合)",
  "- costumes[].spec.outerwear / .top / .bottom / .accessories[] (NG 語 prefix/suffix)",
  "- visual_motifs[].id, visual_motifs[].name, visual_motifs[].draw_directive 等",
  "- continuity_seeds[].group_id, .target_id, .invariant_description",
  "- relations[] の自由テキスト",
  "- world.* / volume_synopsis.* の各 string",
  "- characters[].voice_samples[].line / dialogue 例",
  "",
  "NG 語の例 (絶対残してはいけない):",
  "- ローソン / Lawson / lawson / lawson_blue / lawson_uniform",
  "- セブンイレブン / 7-Eleven / Apple / iPhone / LINE / Twitter / Instagram",
  "- トヨタ / ホンダ / Tesla / GU (ファッション店)",
  "- ポケモン / ガンダム / 鬼滅の刃 / ハリーポッター",
  "- (data/manga/compliance/blocklist.json の全カテゴリ参照)",
  "",
  "各検出に対して compliance_replacements に以下の形式で列挙:",
  "{",
  '  "field_path": "costumes[1].id",',
  '  "from": "costume_ren_lawson_uniform_v1",',
  '  "to": "costume_ren_blueway_uniform_v1",',
  '  "reason": "id 内の lawson を blueway (架空コンビニ) に置換"',
  "}",
  "",
  "固有 id は **依存箇所も同期更新**してください:",
  "- 例: locations[0].id = \"loc_lawson_*\" → \"loc_blueway_*\" に変えるなら、",
  "  scene-graph や continuity_seeds の target_id も同じ rename を提案",
  "- bible 内で参照される id は character_id / location_id / prop_id / costume_id / motif_id",
  "- 同一 NG 語の複数箇所は **すべて列挙** (1 つでも漏れると render に NG が出る)",
].join("\n");

const WORLD_ASPECT_TO_PATH: Record<WorldAspect, string[]> = {
  history: ["world.history.timeline"],
  power_system: ["world.power_system_logic"],
  cosmology: ["world.cosmology"],
  economy: ["world.economic_system"],
  social: ["world.social_strata", "world.factions[*].summary"],
  daily_life: ["world.daily_life_textures"],
  language: ["world.language_and_naming"],
  forbidden_lore: ["world.forbidden_lore"],
  foundation: ["world.premise", "world.rules[*]", "world.system"],
};

/**
 * @deprecated Phase 1-2c-improved 以降は 1 character = 3 sub-stage
 * (runStage1aCharacterBackground / runStage1bCharacterPsychology /
 * runStage1cCharacterDailyAndRelations) を推奨。
 */
export async function runStage1Character(args: StageCommonArgs & {
  v2Concept: V2Concept;
  characterId: string;
}): Promise<CharacterDeepPatch | DryRunResult> {
  const character = requireEntity(args.bible.characters.find((item) => item.id === args.characterId), "character", args.characterId);
  const relatedRelations = args.bible.relations.filter(
    (relation) => relation.from_character_id === args.characterId || relation.to_character_id === args.characterId,
  );
  const prompt = buildStagePrompt({
    stageTitle: "Stage 1 Character Deepen",
    bible: args.bible,
    v2Concept: args.v2Concept,
    styleReferenceNote: args.styleReferenceNote,
    targetLabel: `character_id=${args.characterId}`,
    rules: rulesForCharacter(character.role),
    context: {
      target_character: character,
      related_relations: relatedRelations,
      related_characters_minimal: minimalCharacters(args.bible, relatedRelations, args.characterId),
    },
    instruction: "1コール = 1 character に集中し、このキャラだけを商業漫画 bible 水準まで深く書く。既存の口調・役割を尊重し、backstory / psychology_deep / voice_samples / growth_per_volume などを stage patch として返す。",
    outputSchema: "type CharacterDeepPatch = { character_id: string; patch: Partial<CharacterEntryV2> }",
  });
  return runStageJson<CharacterDeepPatch>(prompt, args, "stage1 character JSON 抽出失敗");
}

export async function runStage1aCharacterBackground(args: StageCommonArgs & {
  v2Concept: V2Concept;
  characterId: string;
}): Promise<CharacterDeepPatch | DryRunResult> {
  const character = requireEntity(args.bible.characters.find((item) => item.id === args.characterId), "character", args.characterId);
  const relatedRelations = relatedRelationsForCharacter(args.bible, args.characterId);
  const prompt = buildStagePrompt({
    stageTitle: "Stage 1a Character Background",
    bible: args.bible,
    v2Concept: args.v2Concept,
    styleReferenceNote: args.styleReferenceNote,
    targetLabel: `character_id=${args.characterId}`,
    rules: characterSubStageRules(character.role, ["backstory", "childhood_episodes"]),
    focusedFields: ["backstory", "childhood_episodes"],
    enforcedTotalMinChars: 5000,
    context: characterFocusedContext(args.bible, character, relatedRelations),
    instruction: [
      "この sub-stage では下記のフィールドのみに集中してください。他のフィールドは埋めない。",
      "backstory は生年月日 / 家族構成 / 学歴 / 職歴 / 大きな転機 / 喪失体験を時系列で書く。",
      "childhood_episodes は具体的な 1 場面を 400 字以上で 5 件以上書く。抽象要約ではなく、場所・相手・会話・身体反応・後年への影響まで含める。",
    ].join("\n"),
    outputSchema: "type CharacterDeepPatch = { character_id: string; patch: Pick<Partial<CharacterEntryV2>, 'backstory' | 'childhood_episodes'> }",
  });
  return runStageJson<CharacterDeepPatch>(prompt, args, "stage1a character background JSON 抽出失敗");
}

export async function runStage1bCharacterPsychology(args: StageCommonArgs & {
  v2Concept: V2Concept;
  characterId: string;
}): Promise<CharacterDeepPatch | DryRunResult> {
  const character = requireEntity(args.bible.characters.find((item) => item.id === args.characterId), "character", args.characterId);
  const fields = [
    "psychology_deep",
    "defense_mechanisms",
    "worldview_filter",
    "appearance_notes",
    ...(character.role === "antagonist" ? ["origin_wound_deep", "ideology_argument", "dark_mirror_to_protagonist"] : []),
  ];
  const relatedRelations = relatedRelationsForCharacter(args.bible, args.characterId);
  const prompt = buildStagePrompt({
    stageTitle: "Stage 1b Character Psychology + Appearance",
    bible: args.bible,
    v2Concept: args.v2Concept,
    styleReferenceNote: args.styleReferenceNote,
    targetLabel: `character_id=${args.characterId}`,
    rules: characterSubStageRules(character.role, fields),
    focusedFields: fields,
    enforcedTotalMinChars: 5000,
    context: characterFocusedContext(args.bible, character, relatedRelations),
    instruction: [
      "この sub-stage では下記のフィールドのみに集中してください。他のフィールドは埋めない。",
      "内面の論理を文学作品レベルで掘り下げ、表層 → 防衛機制 → 深層動機 → 世界観フィルタの 4 層構造で書く。",
      "appearance_notes は作画者が同じ人物を再現できるよう、顔・髪・姿勢・服・癖・疲労や緊張が出る部位まで具体化する。",
      character.role === "antagonist"
        ? "antagonist は origin_wound_deep / ideology_argument / dark_mirror_to_protagonist も必ず含め、主人公への反論として成立する思想まで書く。"
        : "supporting の場合は supporting 用の min を使い、主役を食わない範囲で役割に必要な深さを確保する。",
    ].join("\n"),
    outputSchema: "type CharacterDeepPatch = { character_id: string; patch: Pick<Partial<CharacterEntryV2>, 'psychology_deep' | 'defense_mechanisms' | 'worldview_filter' | 'appearance_notes' | 'origin_wound_deep' | 'ideology_argument' | 'dark_mirror_to_protagonist'> }",
  });
  return runStageJson<CharacterDeepPatch>(prompt, args, "stage1b character psychology JSON 抽出失敗");
}

export async function runStage1cCharacterDailyAndRelations(args: StageCommonArgs & {
  v2Concept: V2Concept;
  characterId: string;
}): Promise<CharacterDeepPatch | DryRunResult> {
  const character = requireEntity(args.bible.characters.find((item) => item.id === args.characterId), "character", args.characterId);
  const fields = ["voice_samples", "typical_day_in_life", "relationship_per_partner", "growth_per_volume"];
  const relatedRelations = relatedRelationsForCharacter(args.bible, args.characterId);
  const prompt = buildStagePrompt({
    stageTitle: "Stage 1c Character Daily + Relations + Voice",
    bible: args.bible,
    v2Concept: args.v2Concept,
    styleReferenceNote: args.styleReferenceNote,
    targetLabel: `character_id=${args.characterId}`,
    rules: characterSubStageRules(character.role, fields),
    focusedFields: fields,
    enforcedTotalMinChars: 8000,
    context: {
      ...characterFocusedContext(args.bible, character, relatedRelations),
      volume_synopsis: args.bible.volume_synopsis,
    },
    instruction: [
      "この sub-stage では下記のフィールドのみに集中してください。他のフィールドは埋めない。",
      "voice_samples は 30 件以上。各 item は 1-3 行のセリフ + intent タグを含め、平常時・緊張時・嘘・照れ・怒り・独白・戦闘時を分散する。",
      "typical_day_in_life は 1日のタイムテーブル風に、朝・移動・作業/探索・休息・夜の反芻まで生活の癖が見えるように書く。",
      "relationship_per_partner は relations[] の各 pair について 800 字以上、感情・葛藤・触媒イベントを含めて書く。",
      "growth_per_volume は各巻 1,500 字以上を目安に、開始状態・失敗・獲得・次巻への傷を分けて書く。",
    ].join("\n"),
    outputSchema: "type CharacterDeepPatch = { character_id: string; patch: Pick<Partial<CharacterEntryV2>, 'voice_samples' | 'typical_day_in_life' | 'relationship_per_partner' | 'growth_per_volume'> }",
  });
  return runStageJson<CharacterDeepPatch>(prompt, args, "stage1c character daily relations JSON 抽出失敗");
}

export async function runStage2Location(args: StageCommonArgs & {
  locationId: string;
}): Promise<LocationDeepPatch | DryRunResult> {
  const location = requireEntity(args.bible.locations.find((item) => item.id === args.locationId), "location", args.locationId);
  const prompt = buildStagePrompt({
    stageTitle: "Stage 2 Location Deepen",
    bible: args.bible,
    styleReferenceNote: args.styleReferenceNote,
    targetLabel: `location_id=${args.locationId}`,
    rules: rulesByScope("location"),
    context: {
      target_location: location,
      characters_minimal: args.bible.characters.map(minimalCharacter),
      related_props: args.bible.props.filter((prop) => location.continuity_anchors.some((anchor) => JSON.stringify(prop).includes(anchor))).slice(0, 5),
    },
    instruction: "1コール = 1 location に集中し、場所の視覚・歴史・社会的文脈・五感・住人・象徴物を深く書く。新規 location ではなく既存 location の patch だけを返す。",
    outputSchema: "type LocationDeepPatch = { location_id: string; patch: Partial<LocationEntryV2> }",
  });
  return runStageJson<LocationDeepPatch>(prompt, args, "stage2 location JSON 抽出失敗");
}

export async function runStage3World(args: StageCommonArgs & {
  v2Concept: V2Concept;
  aspect: WorldAspect;
}): Promise<WorldDeepPatch | DryRunResult> {
  const prompt = buildStagePrompt({
    stageTitle: "Stage 3 World Deepen",
    bible: args.bible,
    v2Concept: args.v2Concept,
    styleReferenceNote: args.styleReferenceNote,
    targetLabel: `world_aspect=${args.aspect}`,
    rules: rulesByPaths(WORLD_ASPECT_TO_PATH[args.aspect]),
    context: {
      current_world: args.bible.world,
      core_hook: args.bible.meta.core_hook,
      characters_minimal: args.bible.characters.map(minimalCharacter),
    },
    instruction: worldAspectInstruction(args.aspect),
    outputSchema: "type WorldDeepPatch = { aspect: WorldAspect; patch: Partial<BibleSnapshotV2['world']> }",
  });
  return runStageJson<WorldDeepPatch>(prompt, args, "stage3 world JSON 抽出失敗");
}

function worldAspectInstruction(aspect: WorldAspect): string {
  const base = "1コール = 1 world aspect に集中し、他 aspect を薄く広げず指定 aspect だけを深掘りする。作中ルールと読者報酬が矛盾しない patch を返す。";
  if (aspect !== "foundation") return base;
  return [
    base,
    "foundation では premise は世界観の根本前提を 1,500-3,000 字、rules は実務で機能する作中ルールを 30 件以上かつ各 100 字以上、system はゲーム的ステータス/制度の詳細を 2,000-5,000 字で記述する。",
    "rules は既存 rules をすべて含めた 30 件以上の完全版配列として返し、短い箇条書きではなく運用条件・例外・読者に見える効果まで書く。",
  ].join("\n");
}

export async function runStage4Motif(args: StageCommonArgs & {
  motifId: string;
}): Promise<MotifDeepPatch | DryRunResult> {
  const motif = requireEntity(findMotif(args.bible, args.motifId), "motif", args.motifId);
  const prompt = buildStagePrompt({
    stageTitle: "Stage 4 Motif Deepen",
    bible: args.bible,
    styleReferenceNote: args.styleReferenceNote,
    targetLabel: `motif_id=${args.motifId}`,
    rules: rulesByScope("motif"),
    context: { target_motif: motif, volume_synopsis: args.bible.volume_synopsis },
    instruction: "1コール = 1 motif に集中し、意味・描画指示・象徴の系譜・参照場面・NG例を深く書く。既存 motif の patch だけを返す。",
    outputSchema: "type MotifDeepPatch = { motif_id: string; patch: Partial<VisualMotifV2> }",
  });
  return runStageJson<MotifDeepPatch>(prompt, args, "stage4 motif JSON 抽出失敗");
}

export async function runStage5Prop(args: StageCommonArgs & {
  propId: string;
}): Promise<PropDeepPatch | DryRunResult> {
  const prop = requireEntity(args.bible.props.find((item) => item.id === args.propId), "prop", args.propId);
  const owner = args.bible.characters.find((character) => character.id === prop.owner_character_id);
  const prompt = buildStagePrompt({
    stageTitle: "Stage 5 Prop Deepen",
    bible: args.bible,
    styleReferenceNote: args.styleReferenceNote,
    targetLabel: `prop_id=${args.propId}`,
    rules: rulesByScope("prop"),
    context: { target_prop: prop, owner_character: owner ? minimalCharacter(owner) : null },
    instruction: "1コール = 1 prop に集中し、識別特徴・由来・機能とロア・誰に見えるか・作画連続性を深く書く。既存 prop の patch だけを返す。",
    outputSchema: "type PropDeepPatch = { prop_id: string; patch: Partial<PropEntryV2> }",
  });
  return runStageJson<PropDeepPatch>(prompt, args, "stage5 prop JSON 抽出失敗");
}

export async function runStage6Costume(args: StageCommonArgs & {
  costumeId: string;
}): Promise<CostumeDeepPatch | DryRunResult> {
  const costume = requireEntity(args.bible.costumes.find((item) => item.id === args.costumeId), "costume", args.costumeId);
  const wearer = args.bible.characters.find((character) => character.id === costume.character_id);
  const prompt = buildStagePrompt({
    stageTitle: "Stage 6 Costume Deepen",
    bible: args.bible,
    styleReferenceNote: args.styleReferenceNote,
    targetLabel: `costume_id=${args.costumeId}`,
    rules: rulesByScope("costume"),
    context: { target_costume: costume, wearer_character: wearer ? minimalCharacter(wearer) : null },
    instruction: "1コール = 1 costume に集中し、視覚説明・変更理由・巻またぎの状態差分・作画禁則を深く書く。既存 costume の patch だけを返す。",
    outputSchema: "type CostumeDeepPatch = { costume_id: string; patch: Partial<CostumeEntryV2> }",
  });
  return runStageJson<CostumeDeepPatch>(prompt, args, "stage6 costume JSON 抽出失敗");
}

export async function runStage7Relation(args: StageCommonArgs & {
  relation: { a_id: string; b_id: string };
}): Promise<RelationDeepPatch | DryRunResult> {
  const relation = requireEntity(findRelation(args.bible, args.relation.a_id, args.relation.b_id), "relation", `${args.relation.a_id}->${args.relation.b_id}`);
  const prompt = buildStagePrompt({
    stageTitle: "Stage 7 Relation Deepen",
    bible: args.bible,
    styleReferenceNote: args.styleReferenceNote,
    targetLabel: `relation=${args.relation.a_id}->${args.relation.b_id}`,
    rules: rulesByScope("relation"),
    context: {
      target_relation: relation,
      character_a: args.bible.characters.find((character) => character.id === args.relation.a_id),
      character_b: args.bible.characters.find((character) => character.id === args.relation.b_id),
    },
    instruction: "1コール = 1 relation pair に集中し、双方向感情・葛藤・事件・巻ごとの変化を深く書く。既存 relation の patch だけを返す。",
    outputSchema: "type RelationDeepPatch = { relation: { a_id: string; b_id: string }; patch: Partial<CharacterRelationV2> }",
  });
  return runStageJson<RelationDeepPatch>(prompt, args, "stage7 relation JSON 抽出失敗");
}

export async function runStage8Volume(args: StageCommonArgs & {
  v2Concept: V2Concept;
  volumeNo: number;
}): Promise<VolumeDeepPatch | DryRunResult> {
  const prompt = buildStagePrompt({
    stageTitle: "Stage 8 Volume Deepen",
    bible: args.bible,
    v2Concept: args.v2Concept,
    styleReferenceNote: args.styleReferenceNote,
    targetLabel: `volume_no=${args.volumeNo}`,
    rules: [],
    context: {
      target_volume_no: args.volumeNo,
      current_volume_synopsis: args.bible.volume_synopsis,
      core_hook: args.bible.meta.core_hook,
      character_growth: args.bible.characters.map((character) => ({
        id: character.id,
        name: character.name,
        growth_per_volume: character.growth_per_volume,
      })),
    },
    instruction: "1コール = 1 volume に集中し、theme / summary / cliffhanger を商業単行本の設計密度まで深く書く。下流 schema にある volume_synopsis patch だけを返す。",
    outputSchema: "type VolumeDeepPatch = { volume_no: number; patch: Partial<BibleSnapshotV2['volume_synopsis']> }",
  });
  return runStageJson<VolumeDeepPatch>(prompt, args, "stage8 volume JSON 抽出失敗");
}

export async function runStage9CrossReference(args: StageCommonArgs): Promise<CrossRefPatch | DryRunResult> {
  const [blocklist, fp] = await Promise.all([loadBlocklist(), loadFalsePositives()]);
  const complianceFindings = scanBible(args.bible, blocklist, fp);
  const shallowDepthRules = BIBLE_DEPTH_SPEC.rules.filter((rule) => {
    const label = rule.label;
    return label.length > 0;
  });
  const prompt = buildStagePrompt({
    stageTitle: "Stage 9 Cross Reference Polish",
    bible: args.bible,
    styleReferenceNote: args.styleReferenceNote,
    targetLabel: "cross_reference=whole_bible",
    rules: shallowDepthRules,
    stagePreamble: STAGE9_COMPLIANCE_ERADICATION_DIRECTIVE,
    context: {
      full_bible_after_stage_1_to_8: args.bible,
      compliance_findings: complianceFindings,
    },
    instruction: "1コール = bible 全体の矛盾解消と最終 polish に集中する。protagonist.backstory と antagonist.dark_mirror_to_protagonist などの不整合、compliance 検出語の置換、depth-spec の per_match 未達項目への追記 patch を返す。",
    outputSchema: "type CrossRefPatch = { character_patches?: CharacterDeepPatch[]; location_patches?: LocationDeepPatch[]; world_patch?: Partial<WorldSpec>; motif_patches?: MotifDeepPatch[]; prop_patches?: PropDeepPatch[]; costume_patches?: CostumeDeepPatch[]; relation_patches?: RelationDeepPatch[]; volume_patch?: Partial<VolumeSynopsis>; compliance_replacements?: Array<{ field_path: string; from: string; to: string; reason?: string; mode?: \"id_rename\" | \"text_only\" }>; compliance_post_check?: { fatal_count: number; warn_count: number; remaining_findings: Array<{ category: string; matched_term: string; field_path: string; text_excerpt: string }> }; notes?: string[] }",
  });
  const patch = await runStageJson<CrossRefPatch>(prompt, args, "stage9 cross-reference JSON 抽出失敗");
  if ("dryRunPrompt" in patch) return patch;

  const updatedBible = applyCrossRefPatch(args.bible, patch);
  const postFindings = scanBible(updatedBible, blocklist, fp);
  const compliancePostCheck = buildCompliancePostCheck(postFindings);
  if (compliancePostCheck.fatal_count > 0) {
    console.warn(
      `[runStage9CrossReference] compliance fatal remains after Stage 9: ${JSON.stringify(compliancePostCheck.remaining_findings)}`,
    );
  }
  return { ...patch, compliance_post_check: compliancePostCheck };
}

export function applyCharacterPatch(bible: BibleSnapshotV2, patch: CharacterDeepPatch): BibleSnapshotV2 {
  return replaceById(bible, "characters", patch.character_id, patch.patch);
}

export function applyLocationPatch(bible: BibleSnapshotV2, patch: LocationDeepPatch): BibleSnapshotV2 {
  return replaceById(bible, "locations", patch.location_id, patch.patch);
}

export function applyWorldPatch(bible: BibleSnapshotV2, patch: WorldDeepPatch): BibleSnapshotV2 {
  const out = cloneBible(bible);
  out.world = mergePreservingDeep(out.world, patch.patch, "world") as BibleSnapshotV2["world"];
  return out;
}

export function applyMotifPatch(bible: BibleSnapshotV2, patch: MotifDeepPatch): BibleSnapshotV2 {
  const out = cloneBible(bible);
  out.visual_motifs = out.visual_motifs.map((motif) =>
    motifId(motif) === patch.motif_id ? mergePreservingDeep(motif, patch.patch, "visual_motifs") as VisualMotifV2 : motif,
  );
  return out;
}

export function applyPropPatch(bible: BibleSnapshotV2, patch: PropDeepPatch): BibleSnapshotV2 {
  return replaceById(bible, "props", patch.prop_id, patch.patch);
}

export function applyCostumePatch(bible: BibleSnapshotV2, patch: CostumeDeepPatch): BibleSnapshotV2 {
  return replaceById(bible, "costumes", patch.costume_id, patch.patch);
}

export function applyRelationPatch(bible: BibleSnapshotV2, patch: RelationDeepPatch): BibleSnapshotV2 {
  if (!patch.relation || !patch.relation.a_id || !patch.relation.b_id) {
    console.warn(`[applyRelationPatch] skip: patch.relation invalid (${JSON.stringify(patch.relation)})`);
    return bible;
  }
  const out = cloneBible(bible);
  out.relations = out.relations.map((relation) =>
    relation.from_character_id === patch.relation.a_id && relation.to_character_id === patch.relation.b_id
      ? mergePreservingDeep(relation, patch.patch, "relations") as CharacterRelationV2
      : relation,
  );
  return out;
}

export function applyVolumePatch(bible: BibleSnapshotV2, patch: VolumeDeepPatch): BibleSnapshotV2 {
  const out = cloneBible(bible);
  out.volume_synopsis = mergePreservingDeep(out.volume_synopsis, patch.patch, "volume_synopsis") as BibleSnapshotV2["volume_synopsis"];
  return out;
}

export function applyCrossRefPatch(bible: BibleSnapshotV2, patch: CrossRefPatch): BibleSnapshotV2 {
  let out = cloneBible(bible);
  for (const item of patch.character_patches ?? []) out = applyCharacterPatch(out, item);
  for (const item of patch.location_patches ?? []) out = applyLocationPatch(out, item);
  if (patch.world_patch) out = applyWorldPatch(out, { aspect: "history", patch: patch.world_patch });
  for (const item of patch.motif_patches ?? []) out = applyMotifPatch(out, item);
  for (const item of patch.prop_patches ?? []) out = applyPropPatch(out, item);
  for (const item of patch.costume_patches ?? []) out = applyCostumePatch(out, item);
  for (const item of patch.relation_patches ?? []) out = applyRelationPatch(out, item);
  if (patch.volume_patch) out = applyVolumePatch(out, { volume_no: 1, patch: patch.volume_patch });
  out = applyComplianceReplacements(out, patch.compliance_replacements ?? []);
  return out;
}

export function applyComplianceReplacements(
  bible: BibleSnapshotV2,
  replacements: ComplianceReplacement[],
): BibleSnapshotV2 {
  if (replacements.length === 0) return cloneBible(bible);

  let serialized = JSON.stringify(bible);
  for (const replacement of replacements) {
    if (replacement.from.length === 0 || replacement.from === replacement.to) continue;
    serialized = serialized.replace(new RegExp(escapeRegExp(replacement.from), "g"), replacement.to);
  }

  return JSON.parse(serialized) as BibleSnapshotV2;
}

function buildCompliancePostCheck(findings: ComplianceFinding[]): CompliancePostCheck {
  const fatalCount = findings.filter((finding) => finding.severity === "fatal").length;
  const warnCount = findings.filter((finding) => finding.severity === "warn").length;
  return {
    fatal_count: fatalCount,
    warn_count: warnCount,
    remaining_findings: findings.map((finding) => ({
      category: finding.category,
      matched_term: finding.matched_term,
      field_path: finding.field_path,
      text_excerpt: finding.text_excerpt,
    })),
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function runStageJson<T>(prompt: string, args: { dryRun?: boolean; cwd?: string; timeoutMs?: number }, errorMessage: string): Promise<T | DryRunResult> {
  if (args.dryRun) return { dryRunPrompt: prompt };
  const result = await runCodexText<T>({
    task: prompt,
    format: "json",
    cwd: args.cwd,
    timeoutMs: args.timeoutMs ?? DEFAULT_CODEX_TIMEOUT_MS,
    maxRetries: 1,
  });
  if (!result.parsed) throw new Error(errorMessage);
  return result.parsed;
}

function buildStagePrompt(args: {
  stageTitle: string;
  bible: BibleSnapshotV2;
  v2Concept?: V2Concept;
  styleReferenceNote: string;
  targetLabel: string;
  rules: DepthRule[];
  stagePreamble?: string;
  focusedFields?: string[];
  enforcedTotalMinChars?: number;
  context: unknown;
  instruction: string;
  outputSchema: string;
}): string {
  const depthTargets = renderDepthTargets(args.rules);
  const totalMin = Math.max(args.enforcedTotalMinChars ?? 0, args.rules.reduce((sum, rule) => sum + ruleMinChars(rule), 0));
  const totalIdeal = args.rules.reduce((sum, rule) => sum + ruleIdealChars(rule), 0);
  const minText = totalMin > 0 ? `${totalMin.toLocaleString("ja-JP")} 字` : "該当 stage の schema 最大限";
  const idealText = totalIdeal > 0 ? `${totalIdeal.toLocaleString("ja-JP")} 字` : "出力 token 上限まで";
  const focusBlock = args.focusedFields && args.focusedFields.length > 0
    ? [
      "",
      "## 集中フィールド",
      "この sub-stage では下記のフィールドのみに集中してください。他のフィールドは埋めない。",
      ...args.focusedFields.map((field) => `- ${field}`),
    ]
    : [];
  return [
    COMPLIANCE_DIRECTIVE,
    ...(args.stagePreamble ? ["", args.stagePreamble] : []),
    "",
    `# ${args.stageTitle}`,
    "",
    "あなたは商業漫画 bible の深掘り専門編集者です。",
    `対象: ${args.targetLabel}`,
    "",
    "## 量の原則",
    `- 1コール = 1対象に集中し、最低 ${minText}、ideal ${idealText} を目指す`,
    ...(args.enforcedTotalMinChars
      ? [`- **この sub-stage の合計出力は最低 ${args.enforcedTotalMinChars.toLocaleString("ja-JP")} 字を必ず超えること**`]
      : []),
    "- 出力 token を最大限活用し、薄い全体網羅ではなく対象 1 つを深く書く",
    "- 既存 bible と矛盾する場合は、patch 側で矛盾解消案を含める",
    ...focusBlock,
    "",
    "## depth-spec 由来の文字数・件数目安",
    depthTargets,
    "",
    "## stage 指示",
    args.instruction,
    "",
    "## 画風参考",
    args.styleReferenceNote,
    "",
    "## 対象 context (関連分のみ)",
    "```json",
    JSON.stringify(args.context, null, 2).slice(0, 50000),
    "```",
    ...(args.v2Concept ? [
      "",
      "## 元の V2 企画書 (対象の補助素材)",
      "```json",
      JSON.stringify(args.v2Concept, null, 2).slice(0, 30000),
      "```",
    ] : []),
    "",
    "## 出力 schema",
    "```typescript",
    args.outputSchema,
    "```",
    "",
    "## 出力形式",
    "schema に従う JSON のみ。説明文・前置き・後書きは禁止。",
    "出力は ```json ... ``` のコードブロックで囲む。",
  ].join("\n");
}

function renderDepthTargets(rules: DepthRule[]): string {
  if (rules.length === 0) return "- この stage 専用の明示 rule はないため、対象 patch の各 string を 1,000 字以上、主要 summary を 3,000 字以上で設計する。";
  return rules.map((rule) => `- ${rule.path}: ${metricText(rule)}`).join("\n");
}

function metricText(rule: DepthRule): string {
  if (rule.metric.kind === "min_chars") return `最低 ${rule.metric.min.toLocaleString("ja-JP")} 字、ideal ${rule.metric.ideal.toLocaleString("ja-JP")} 字`;
  if (rule.metric.kind === "min_count") {
    const each = rule.metric.min_chars_each ? `、各 ${rule.metric.min_chars_each.toLocaleString("ja-JP")} 字以上` : "";
    const ideal = rule.metric.ideal ? `、ideal ${rule.metric.ideal.toLocaleString("ja-JP")} 件` : "";
    return `最低 ${rule.metric.min.toLocaleString("ja-JP")} 件${each}${ideal}`;
  }
  return `最低 ${rule.metric.min.toLocaleString("ja-JP")} 件`;
}

function ruleMinChars(rule: DepthRule): number {
  if (rule.metric.kind === "min_chars") return rule.metric.min;
  if (rule.metric.kind === "min_count") return rule.metric.min * (rule.metric.min_chars_each ?? 120);
  return rule.metric.min * 80;
}

function ruleIdealChars(rule: DepthRule): number {
  if (rule.metric.kind === "min_chars") return rule.metric.ideal;
  if (rule.metric.kind === "min_count") return (rule.metric.ideal ?? rule.metric.min) * (rule.metric.min_chars_each ?? 120);
  return rule.metric.min * 120;
}

function rulesByScope(scope: DepthRule["scope"]): DepthRule[] {
  return BIBLE_DEPTH_SPEC.rules.filter((rule) => rule.scope === scope);
}

function rulesForCharacter(role: CharacterEntryV2["role"]): DepthRule[] {
  return BIBLE_DEPTH_SPEC.rules.filter((rule) => rule.scope === "character" && (!rule.applies_to_role || rule.applies_to_role === role));
}

function rulesByPaths(paths: string[]): DepthRule[] {
  return BIBLE_DEPTH_SPEC.rules.filter((rule) => paths.includes(rule.path));
}

function characterSubStageRules(role: CharacterEntryV2["role"], fields: string[]): DepthRule[] {
  return fields.map((field) => characterRuleForField(role, field)).filter((rule): rule is DepthRule => rule !== undefined);
}

function characterRuleForField(role: CharacterEntryV2["role"], field: string): DepthRule | undefined {
  const roleRule = BIBLE_DEPTH_SPEC.rules.find((rule) =>
    rule.scope === "character" && rule.applies_to_role === role && rule.path.endsWith(`.${field}`),
  );
  if (roleRule) return roleRule;

  const protagonistRule = BIBLE_DEPTH_SPEC.rules.find((rule) =>
    rule.scope === "character" && rule.applies_to_role === "protagonist" && rule.path.endsWith(`.${field}`),
  );
  if (!protagonistRule) return undefined;

  if (role === "supporting") return scaleCharacterRule(protagonistRule, role, 1 / 3);
  if (role === "antagonist") return scaleCharacterRule(protagonistRule, role, 1);
  if (role === "heroine") return scaleCharacterRule(protagonistRule, role, 1);
  return protagonistRule;
}

function scaleCharacterRule(rule: DepthRule, role: CharacterEntryV2["role"], scale: number): DepthRule {
  return {
    ...rule,
    path: rule.path.replace("characters[role=protagonist]", `characters[role=${role}]`),
    label: rule.label.replace("characters.protagonist", `characters.${role}`),
    applies_to_role: role === "protagonist" || role === "supporting" || role === "antagonist" ? role : undefined,
    metric: scaleMetric(rule.metric, scale),
  };
}

function scaleMetric(ruleMetric: DepthRule["metric"], scale: number): DepthRule["metric"] {
  if (ruleMetric.kind === "min_chars") {
    return {
      kind: "min_chars",
      min: Math.max(1, Math.round(ruleMetric.min * scale)),
      ideal: Math.max(1, Math.round(ruleMetric.ideal * scale)),
    };
  }
  if (ruleMetric.kind === "min_count") {
    return {
      kind: "min_count",
      min: Math.max(1, Math.round(ruleMetric.min * scale)),
      min_chars_each: ruleMetric.min_chars_each,
      ideal: ruleMetric.ideal ? Math.max(1, Math.round(ruleMetric.ideal * scale)) : undefined,
    };
  }
  return { kind: "min_count_only", min: Math.max(1, Math.round(ruleMetric.min * scale)) };
}

function relatedRelationsForCharacter(bible: BibleSnapshotV2, characterId: string): CharacterRelationV2[] {
  return bible.relations.filter((relation) => relation.from_character_id === characterId || relation.to_character_id === characterId);
}

function characterFocusedContext(bible: BibleSnapshotV2, character: CharacterEntryV2, relatedRelations: CharacterRelationV2[]): JsonRecord {
  return {
    target_character: character,
    related_relations: relatedRelations,
    related_characters_minimal: minimalCharacters(bible, relatedRelations, character.id),
  };
}

function minimalCharacter(character: CharacterEntryV2): JsonRecord {
  return {
    id: character.id,
    name: character.name,
    role: character.role,
    appearance_notes: character.appearance_notes,
    continuity_anchors: character.continuity_anchors,
  };
}

function minimalCharacters(bible: BibleSnapshotV2, relations: CharacterRelationV2[], excludedId: string): JsonRecord[] {
  const ids = new Set<string>();
  for (const relation of relations) {
    ids.add(relation.from_character_id);
    ids.add(relation.to_character_id);
  }
  ids.delete(excludedId);
  return bible.characters.filter((character) => ids.has(character.id)).map(minimalCharacter);
}

function findMotif(bible: BibleSnapshotV2, motifIdValue: string): VisualMotifV2 | undefined {
  return bible.visual_motifs.find((motif) => motifId(motif) === motifIdValue);
}

function motifId(motif: VisualMotifV2): string {
  return slugForId(motif.name);
}

function slugForId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9ぁ-んァ-ヶ一-龠]+/gu, "_");
}

function findRelation(bible: BibleSnapshotV2, aId: string, bId: string): CharacterRelationV2 | undefined {
  return bible.relations.find((relation) => relation.from_character_id === aId && relation.to_character_id === bId);
}

function requireEntity<T>(value: T | undefined, kind: string, id: string): T {
  if (value === undefined) throw new Error(`${kind} not found: ${id}`);
  return value;
}

function cloneBible(bible: BibleSnapshotV2): BibleSnapshotV2 {
  return JSON.parse(JSON.stringify(bible)) as BibleSnapshotV2;
}

function replaceById<K extends "characters" | "locations" | "props" | "costumes">(
  bible: BibleSnapshotV2,
  key: K,
  id: string,
  patch: Partial<BibleSnapshotV2[K][number]>,
): BibleSnapshotV2 {
  const out = cloneBible(bible);
  out[key] = out[key].map((entry) => {
    const entryRecord = entry as JsonRecord;
    return entryRecord.id === id
      ? mergePreservingDeep(entry, patch, key) as BibleSnapshotV2[K][number]
      : entry;
  }) as BibleSnapshotV2[K];
  return out;
}

function mergePreservingDeep<T>(existing: T, patch: Partial<T>, pathPrefix: string): T {
  if (!isRecord(existing) || !isRecord(patch)) return shouldKeepExistingValue(existing, patch, pathPrefix) ? existing : patch as T;
  const out: JsonRecord = { ...existing };
  for (const [key, patchValue] of Object.entries(patch)) {
    if (patchValue === undefined) continue;
    const currentPath = `${pathPrefix}.${key}`;
    const existingValue = out[key];
    if (shouldKeepExistingValue(existingValue, patchValue, currentPath)) continue;
    if (isRecord(existingValue) && isRecord(patchValue) && !Array.isArray(existingValue) && !Array.isArray(patchValue)) {
      out[key] = mergePreservingDeep(existingValue, patchValue, currentPath);
    } else {
      out[key] = patchValue;
    }
  }
  return out as T;
}

function shouldKeepExistingValue(existing: unknown, patch: unknown, pathValue: string): boolean {
  if (patch === undefined || patch === null) return true;
  if (existing === undefined || existing === null) return false;
  const existingChars = measureChars(existing);
  if (existingChars === 0) return false;
  const threshold = depthThresholdForPath(pathValue) ?? 5000;
  return existingChars >= threshold;
}

function depthThresholdForPath(pathValue: string): number | undefined {
  const normalized = pathValue
    .replace(/^characters\./u, "characters[*].")
    .replace(/^locations\./u, "locations[*].")
    .replace(/^props\./u, "props[*].")
    .replace(/^costumes\./u, "costumes[*].")
    .replace(/^relations\./u, "relations[*].")
    .replace(/^visual_motifs\./u, "visual_motifs[*].");
  const rule = BIBLE_DEPTH_SPEC.rules.find((item) => item.path.endsWith(normalized.split(".").slice(1).join(".")) || item.path === normalized);
  return rule?.metric.kind === "min_chars" ? rule.metric.min : undefined;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @deprecated Phase 1-2b 以降は runStage1Character〜runStage9CrossReference を使用してください。
 */
export async function runDeepExtractor(args: {
  v2Concept: V2Concept;
  currentBible: BibleSnapshotV2;
  lintReport: BibleLintReport;
  styleReferenceNote: string;       // 画風参考フレームの説明 (Codex が画像を直接見られないので言葉で渡す)
  cwd?: string;
  timeoutMs?: number;
}): Promise<DeepExtractionPatch> {
  const lintHints = args.lintReport.findings
    .filter((f) => f.severity !== "info")
    .slice(0, 50)
    .map((f) => `- [${f.severity}] ${f.scope}${f.target_id ? ` (${f.target_id})` : ""}: ${f.message}`)
    .join("\n");

  const prompt = [
    "あなたは商業漫画 (なろう系コミカライズ、現代ダンジョン × ガチャ × システム音声 ジャンル) の編集者として、",
    "bible (作品設計書 JSON) を ヒット作 (200万部級) と並ぶ深さに引き上げる patch を生成します。",
    "",
    "## 大原則",
    "- 既存 bible に上書き/追加する PATCH 形式で返す (全文書き直しは不要)",
    "- 画風は『なろう系コミカライズ ライト青年漫画』(下記参考フレーム) に合わせる: 線細め / 大きめ瞳 / 黒髪はベタ + 軽いトーン / 背景は establishing 以外ミニマル / 縦書き吹き出し",
    "- 浅さ (lint findings 参照) を全部埋める",
    "- ジャンル特性 (現代ダンジョン × システム音声) を活かした唯一性を入れる",
    "- 中核ギミックを30字以内の1文に圧縮し meta.core_hook.one_liner に格納する patch を返す",
    "- A/B/C類型 (A:反復蓄積 / B:接続媒介 / C:視点ずらし) のいずれかを判別し meta.core_hook.type に格納する",
    "- 同類のヒット作を1-3作挙げて meta.core_hook.hit_references に配列で格納し、差分が one_liner から読み取れることを確認する",
    "",
    "## コンプライアンス (絶対遵守)",
    "- 実在企業・実在商標・実在人物名・実在著作物名は **一切使用禁止**",
    "  - NG 例: ローソン / セブンイレブン / マクドナルド / iPhone / Galaxy / LINE / Twitter / Instagram / YouTube / TikTok / Tesla / トヨタ / Apple / Google / Amazon / ポケモン / ガンダム / 鬼滅の刃 / ワンピース / 大谷翔平 / ハリーポッター 等",
    "  - 完全な NG リスト: data/manga/compliance/blocklist.json (scanner.ts で自動検査、違反は lint fatal でブロック)",
    "- 代替表現の指針:",
    "  - コンビニ → 架空チェーン名 + 視覚的特徴 (青と白の看板、24h営業、おでん什器、入口チャイム2音 等)",
    "  - 自動車メーカー → 架空ブランド名 + 「日本の自動車メーカー」等の記述",
    "  - スマートフォン → 架空メーカー名 + 「黒い縦長端末、上端カメラ切り欠き、抽象シンボルロゴ」等",
    "  - SNS / メッセージアプリ → 架空アプリ名 + 「緑のメッセージアプリ」「短文 SNS、鳥は使わない抽象シンボル」等",
    "  - ファストフード / カフェチェーン → 架空名 + ロゴ色とメニュー特徴で identity",
    "  - 大学・私学・特定施設 → 架空名 + 一般描写 (赤門/校章等の固有アイコンは避ける)",
    "  - 実在人物名 (政治家・芸能人・スポーツ選手・CEO 等) → 役割描写で代替 (例: 『国民的人気の若手スケーター』『EV と宇宙開発を主導する起業家』『最高難易度ダンジョンを最速攻略した S ランク探索者』)",
    "- 不安なら『○○系の』『○○風の』+ 説明的記述で代替し、固有名は出さない",
    "- **重要**: 既存 currentBible に NG 語が含まれていたら、必ず patch で safe な架空名に置換すること (例: 『ローソン新宿西 店内レジ』 → 『青空ローン新宿西店 店内レジ』、loc_id も loc_lawson_* → loc_aozora_lawn_* 等に rename)",
    "- 代替名の発想: data/manga/compliance/blocklist.json の safe_substitutes セクションに各カテゴリの fictional_name_hint と description を用意してあるので、参考にしてもよい",
    "",
    "## 画風参考",
    args.styleReferenceNote,
    "",
    "## 現状の bible (圧縮)",
    "```json",
    JSON.stringify(args.currentBible, null, 2).slice(0, 60000),
    "```",
    "",
    "## 元のV2企画書 (詳細素材、特に supporting_chars[].summary と main_arc は要参照)",
    "```json",
    JSON.stringify(args.v2Concept, null, 2).slice(0, 40000),
    "```",
    "",
    "## lint findings (これらを全部解消する)",
    lintHints,
    "",
    "## 出力スキーマ",
    "```typescript",
    ENHANCEMENT_SCHEMA,
    "```",
    "",
    "## 期待する量 (最低限)",
    "- characters_patch: 全 supporting キャラ ( = 主人公以外全員) について spec_overrides + anchors_replace + notes_replace",
    "- locations_add: 5件以上 (第3ダンジョン入口/1階/2階/3階ボス間/ダンジョン公社窓口 等)",
    "- props_add: 6件以上 (鑑定石/スキルクリスタル/ナビUI画面/灯里の朱制服アクセ/ID証/装備鞄 等)",
    "- visual_motifs_add: 4件以上 (下降階段/数値オーバーレイ/沈黙音/ナビ青光 等、意味付け込み)",
    "- costumes_add: 3件以上 (巻ごとの装備更新)",
    "- relations_replace: 既存 relations を双方向化 + 巻ごとの変化 4件以上",
    "- volume_synopsis_replace: theme 100字 / summary 700字+ / cliffhanger 150字",
    "",
    "# テキスト品質パック (text_quality_pack) の生成",
    "",
    "bible が「商業作家として通用する」テキスト品質を持つために、以下 3 セクションを生成して返してください。",
    "ただし、bible に既に該当フィールドが存在し中身がある場合 (currentBible.world.lexicon に key があり、 narration_style_guide / nav_full_spec が undefined でない) は、そのキーの patch は **null を返す** か、**そのキー自体を返さない** こと。",
    "",
    "## lexicon_patch (world.lexicon の patch)",
    "作品独自の禁則語と P1 冒頭 directive を生成。形式:",
    "- forbidden_terms_global: string[] — その作品で使ってはいけない語彙 (10-30 件)。「平凡な日常」「最強の」などの既視感ある言い回し、別作品の固有語、安易な現代俗語など。",
    "- p1_opening_directive: string — 1ページ目の独白に対する強制指示 1-3 文。重い陰鬱導入を避け、状況・行動・結果のいずれかを 1 ライン目で読者に提示させる、等。",
    "",
    "## narration_style_guide_patch (narration_style_guide 全体の patch)",
    "- p1_opening_directive_specific: { max_lines: number, max_chars_per_line: number, must_avoid: string[], must_contain_at_most_one_of: string[], preferred_pattern_examples: string[], rejected_pattern_examples: string[] } — P1 1コマ目の独白具体指示",
    "- ban_list_phrases: string[] — 全話通底で禁止する陳腐フレーズ (10-20 件)。例: \"～かもしれない\", \"そうこうしているうちに\", \"それは突然のことだった\" 等",
    "- monologue_signature_patterns: string[] — 主人公モノローグの定型パターン (3-5 件)。短文 / 体言止め / 行動先出し etc.",
    "",
    "## nav_full_spec_patch (nav_full_spec 全体の patch)",
    "作品に「システム音声 / 異世界の声 / 内なる声 / 神視点ガイド」のような「主人公だけに聞こえる external/internal 案内役」が存在する場合に限り生成。存在しない作品は null を返すこと。形式:",
    "- voice_persona: { default_tone: string, speech_endings: string[], emotional_range_per_volume: { vol_1: string, vol_2: string, ... } }",
    "- canonical_disclosure_lines_vol_1: string[] — Vol.1 でナビが発する代表的開示ライン 5-10 件",
    "- anti_pattern_dialogue: { reason: string, examples: string[] } — ナビ発話として絶対禁止の口調・表現",
    "",
    "## 出力形式",
    "上記スキーマに従う JSON のみを返してください。説明文・前置き・後書きは不要。",
    "出力は ```json ... ``` のコードブロックで囲んでください。",
  ].join("\n");

  const result = await runCodexText({
    task: prompt,
    format: "json",
    cwd: args.cwd,
    timeoutMs: args.timeoutMs ?? 12 * 60 * 1000,
    maxRetries: 1,
  });

  if (!result.parsed) throw new Error("deep-extractor JSON 抽出失敗");
  return result.parsed as never;
}

/**
 * @deprecated Phase 1-2b 以降は stage 別 apply 関数を使用してください。
 */
export function applyDeepEnhancements(args: {
  bible: BibleSnapshotV2;
  patch: DeepExtractionPatch;
}): BibleSnapshotV2 {
  const out: BibleSnapshotV2 = JSON.parse(JSON.stringify(args.bible));

  // 既存の中核ギミックがある bible は作者指定を優先し、未設定時だけ deep patch を採用する。
  if (args.patch.core_hook_patch && !out.meta.core_hook) {
    out.meta.core_hook = args.patch.core_hook_patch;
  }

  if (args.patch.characters_patch) {
    for (const cp of args.patch.characters_patch) {
      const c = out.characters.find((x) => x.id === cp.id);
      if (!c) continue;
      if (cp.spec_overrides) {
        c.spec = { ...c.spec, ...cp.spec_overrides };
      }
      if (cp.continuity_anchors_replace) {
        c.continuity_anchors = cp.continuity_anchors_replace;
      }
      if (cp.appearance_notes_replace) {
        c.appearance_notes = cp.appearance_notes_replace;
      }
    }
  }
  if (args.patch.locations_add) {
    const existing = new Set(out.locations.map((l) => l.id));
    for (const l of args.patch.locations_add) {
      if (!existing.has(l.id)) out.locations.push(l);
    }
  }
  if (args.patch.props_add) {
    const existing = new Set(out.props.map((p) => p.id));
    for (const p of args.patch.props_add) {
      if (!existing.has(p.id)) out.props.push(p);
    }
  }
  if (args.patch.visual_motifs_add) {
    out.visual_motifs.push(...args.patch.visual_motifs_add);
  }
  if (args.patch.costumes_add) {
    const existing = new Set(out.costumes.map((c) => c.id));
    for (const c of args.patch.costumes_add) {
      if (!existing.has(c.id)) out.costumes.push(c);
    }
  }
  if (args.patch.relations_replace) {
    out.relations = args.patch.relations_replace;
  }
  if (args.patch.style_directives_overrides) {
    out.style_directives = { ...out.style_directives, ...args.patch.style_directives_overrides };
    if (args.patch.style_directives_overrides.scene_overrides) {
      out.style_directives.scene_overrides = {
        ...out.style_directives.scene_overrides,
        ...args.patch.style_directives_overrides.scene_overrides,
      };
    }
  }
  if (args.patch.volume_synopsis_replace) {
    out.volume_synopsis = { ...out.volume_synopsis, ...args.patch.volume_synopsis_replace };
  }
  if (
    args.patch.lexicon_patch &&
    (!out.world.lexicon || Object.keys(out.world.lexicon).length === 0)
  ) {
    out.world.lexicon = args.patch.lexicon_patch;
  }
  if (args.patch.narration_style_guide_patch && !out.narration_style_guide) {
    out.narration_style_guide = args.patch.narration_style_guide_patch;
  }
  if (args.patch.nav_full_spec_patch && !out.nav_full_spec) {
    out.nav_full_spec = args.patch.nav_full_spec_patch;
  }

  // continuity_seeds を新規 entity 用に追加
  const seedTargets = new Set(out.continuity_seeds.map((s) => s.target_id));
  for (const l of out.locations) {
    const gid = `${l.id}_layout_v1`;
    if (!seedTargets.has(l.id)) {
      out.continuity_seeds.push({
        group_id: gid,
        kind: "location_layout",
        target_id: l.id,
        invariant_description: l.continuity_anchors.join(", "),
      });
    }
  }
  for (const p of out.props) {
    const gid = `${p.id}_v1`;
    if (!seedTargets.has(p.id)) {
      out.continuity_seeds.push({
        group_id: gid,
        kind: "prop",
        target_id: p.id,
        invariant_description: p.continuity_anchors.join(", "),
      });
    }
  }

  return out;
}
