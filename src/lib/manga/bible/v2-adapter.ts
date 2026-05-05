/**
 * V2企画書 (data/manga/_archive/.../stage2/{slug}_v2.json) → BibleSnapshotV2 変換
 *
 * V2企画書のキー (protagonist/supporting_chars/world/main_arc/volume_outline) を
 * 構造化 bible/snapshot.json に展開する。LLM 抽出ではなく、deterministic な変換。
 *
 * locations / props / costumes / continuity_seeds は V2企画書だけでは情報不足のため、
 * 当面は補完用テンプレを生成 → ユーザが手動編集する想定。
 *
 * 出力後、scripts/manga/layers/L01-bible.ts が
 *   data/manga/works/{slug}/bible/snapshot.json
 * に書き出す。
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ArtStyle, CharacterRole, LocationType } from "../types";
import type {
  BibleSnapshotV2,
  CharacterEntryV2,
  LocationEntryV2,
  PropEntryV2,
  CostumeEntryV2,
  CharacterRelationV2,
  ContinuitySeedV2,
  StyleDirectivesV2,
  VisualMotifV2,
  WorldSpec,
} from "../schemas-v2";

// ============================================================
// V2企画書 (旧) のスキーマ — 緩く受ける
// ============================================================

export type V2Concept = {
  id: string;
  title: string;
  logline?: string;
  synopsis?:
    | string
    | {
        core_theme?: string;
        elevator?: string;
        full_series?: string;
        short_v1?: string;
      };
  tags?: Record<string, string>;
  protagonist: {
    name: string;
    age?: number;
    gender?: string;
    occupation?: string;
    appearance?: string;
    personality?: string;
    background?: string;
    motivation?: string;
    weakness?: string;
    skill_main?: { name: string; effect: string; limit?: string };
    skill_sub?: Array<{ name: string; effect?: string }>;
  };
  supporting_chars?: Array<{
    name: string;
    role: string;
    age?: number;
    summary?: string;
    fate?: string;
  }>;
  world: {
    premise: string;
    rules: string[];
    system: string;
    timeline: string;
    factions: Array<{ name: string; summary: string }>;
  };
  main_arc?: unknown;
  volume_outline?: unknown;
  volume1_detail?: unknown;
  execution_strength?: unknown;
};

// ============================================================
// 変換ロジック
// ============================================================

/** name from "桐生 レン（きりゅう・レン）" → ["桐生 レン", "Kiryuu Ren"] */
function splitName(raw: string): { name: string; reading?: string } {
  const m = raw.match(/^(.+?)（(.+?)）$/);
  if (!m) return { name: raw.trim() };
  return { name: m[1].trim(), reading: m[2].trim() };
}

/** "桐生 レン" → "char_kiryuu_ren_v1" 風の slug */
function characterIdFromName(name: string, idx: number): string {
  // 安全のため idx 番号も付与 (重複回避)
  const base = name
    .replace(/[\s　]+/g, "_")
    .toLowerCase()
    .replace(/[^a-z0-9_ぁ-んァ-ヴー一-龥]/g, "");
  if (/[a-z0-9_]+/.test(base) && base.length <= 30) {
    return `char_${base}_v1`;
  }
  return `char_${idx + 1}_v1`;
}

/** ロールを CharacterRole に変換 */
function roleStringToCharacterRole(s: string): CharacterRole {
  const lower = s.toLowerCase();
  if (lower.includes("メインヒロイン") || lower.includes("ヒロイン") || lower.includes("heroine")) {
    return "heroine";
  }
  if (lower.includes("ライバル") || lower.includes("敵") || lower.includes("antagonist")) {
    return "antagonist";
  }
  return "supporting";
}

function adaptProtagonist(p: V2Concept["protagonist"]): CharacterEntryV2 {
  const { name, reading } = splitName(p.name);
  // appearance テキストから簡易に hair/eyes を推定 (heuristic)
  const hairColor = /黒髪/.test(p.appearance ?? "") ? "black" : "unspecified";
  const hairStyle = /前髪が目にかかる|前髪.*目/.test(p.appearance ?? "")
    ? "messy_fringe_eye_cover"
    : "messy_short";
  return {
    id: characterIdFromName(name, 0),
    name,
    name_romaji: reading,
    role: "protagonist",
    age_visual: p.age ? String(p.age) : undefined,
    spec: {
      age_visual: p.age ? String(p.age) : undefined,
      gender:
        p.gender === "男" || p.gender === "male"
          ? "male"
          : p.gender === "女" || p.gender === "female"
          ? "female"
          : "unspecified",
      build: "lean",
      hair: { style: hairStyle, color: hairColor, specific: undefined },
      eyes: { shape: "narrow", color: "dark_brown", expression_default: "fatigued_blank" },
      outfit_default: { outerwear: "black_hooded_jacket", top: undefined, bottom: undefined },
      voice_tag: undefined,
      personality_visual: p.personality?.slice(0, 80),
    },
    attribute_classifier: {
      hair_color: hairColor,
      hair_style: hairStyle,
      gender_visual: p.gender === "男" ? "male" : p.gender === "女" ? "female" : "androgynous",
      age_band: p.age && p.age < 20 ? "teen" : p.age && p.age < 30 ? "20s" : "unknown",
      outfit_default: "black_hood",
    },
    continuity_anchors: [
      "always_black_hood",
      hairStyle === "messy_fringe_eye_cover" ? "fringe_covers_one_eye" : "messy_short_hair",
      "undereye_shadows",
    ],
    appears_in_volumes: Array.from({ length: 13 }, (_, i) => i + 1),
    appearance_notes: p.appearance,
  };
}

function adaptSupporting(
  s: NonNullable<V2Concept["supporting_chars"]>[number],
  idx: number
): CharacterEntryV2 {
  const { name, reading } = splitName(s.name);
  const role = roleStringToCharacterRole(s.role);
  const isFemale =
    /灯里|ヒロイン|彼女|ナナミ|響/.test(s.name + s.role + (s.summary ?? ""));
  return {
    id: characterIdFromName(name, idx + 1),
    name,
    name_romaji: reading,
    role,
    age_visual: s.age ? String(s.age) : undefined,
    spec: {
      age_visual: s.age ? String(s.age) : undefined,
      gender: isFemale ? "female" : "male",
      build: "athletic",
      hair: { style: "long_straight", color: "silver_gray", specific: undefined },
      eyes: { shape: "almond", color: "ice_blue", expression_default: "calm" },
      outfit_default: { outerwear: "vermillion_hunter_uniform" },
      personality_visual: s.summary?.slice(0, 80),
    },
    attribute_classifier: {
      hair_color: isFemale ? "silver_gray" : "black",
      hair_style: isFemale ? "long_straight" : "short",
      gender_visual: isFemale ? "female" : "male",
      age_band: s.age && s.age < 20 ? "teen" : "20s",
      outfit_default: "TODO",
    },
    continuity_anchors: ["TODO_post_bible_review"],
    appears_in_volumes: [1, 2, 3],
    appearance_notes: s.summary,
  };
}

function adaptWorld(w: V2Concept["world"]): WorldSpec {
  return {
    premise: w.premise,
    rules: w.rules,
    system: w.system,
    timeline: w.timeline,
    factions: w.factions,
  };
}

function defaultStyleDirectives(artStyle: ArtStyle): StyleDirectivesV2 {
  const isUrban = artStyle === "manga_bw_seinen_urban";
  return {
    global: isUrban
      ? "Young Ace / Comic Walker / カドコミ系 のなろう系コミカライズ画風 (現代ダンジョン)。表情豊かで親しみやすい線、目はやや大きめ、ライトノベル表紙絵の延長。現代街並みとダンジョンゲートの対比でメリハリ。screentone 多用で柔らかいグラデ、ベタは黒髪と夜景に集中。Solo Leveling 寄りの seinen-realism は避け、Dジェネシス/壊れスキル系の親しみやすさを優先。"
      : "Young Ace / Comic Walker / カドコミ系 のなろう系コミカライズ画風 (異世界ダンジョン探索)。蜘蛛ですが/転スラ/ヘルモード系の親しみやすい線。戦闘時のみ硬質化。screentone メリハリ型 (ボス戦は密、移動は疎)、ベタは黒髪と影。Berserk/Vagabond 系劇画は避ける。",
    scene_overrides: {
      daily: "線細め、トーンで陰影。会話は中ゴマ多用。",
      dungeon: "ベタ濃く、ハッチングで立体感。階層が深いほど暗くネガティブスペースを増やす。",
      battle: "速度線・効果線・大ゴマ多用。スキル発動時は瞳のクローズアップ+幾何学パターン背景。",
      flashback: "全体トーン落とし、輪郭線をやや薄く。",
      news_broadcast:
        "テレビ画面越しに見える人物。フレーム枠+ノイズ線+下部テロップ風の矩形空枠 (中身はSVGで後注入)。",
    },
    overlay_rules: [
      "ステータスHUD・スキル発動時の数値・能力名表示は矩形枠のみで描画 (中身はSVGで後注入)",
      "効果音は擬音文字を画像内に直書きせず、後でレタリング合成",
      "速度線・集中線は画像生成側で描画 (後合成しない)",
    ],
  };
}

function defaultVisualMotifs(): VisualMotifV2[] {
  return [
    {
      name: "黒のフードジャケット",
      meaning: "主人公の社会的位置 (底辺) と、それを誇りにも諦めにもする両義的な記号",
      draw_directive:
        "worn black hooded jacket, slightly oversized, fabric showing minor wear, kept on across most scenes",
    },
    {
      name: "ヒビ入りのスマートフォン",
      meaning: "経済的な余裕のなさと、それでも情報インフラに繋がっている現代性",
      draw_directive:
        "cracked smartphone screen, web of fine cracks across the upper-right corner, otherwise functional",
    },
  ];
}

function deriveLocationsPlaceholder(): LocationEntryV2[] {
  return [
    {
      id: "loc_lawson_interior_v1",
      name: "ローソン新宿西 店内レジ",
      location_type: "other",
      spec: {
        era: "modern_japan_2026",
        atmosphere: "深夜2時の蛍光灯の白光、無人の通路、レジ周りに少しの雑然さ",
        layout: {
          type: "rectangular",
          size_m: "幅8m × 奥行12m",
          doors: [{ position: "south_wall_center", type: "automatic_glass" }],
          windows: [{ position: "south_wall", size: "full_glass" }],
          furniture: [
            { type: "レジカウンター", position: "north_wall_left", color: "white_plastic" },
            { type: "弁当冷蔵棚", position: "east_wall", color: "stainless" },
            { type: "雑誌棚", position: "south_wall_right", color: "white" },
          ],
        },
        lighting_default: "蛍光灯主光源、青白い均一光",
        color_palette: ["#f5f5f5", "#0066cc", "#222222"],
      },
      continuity_anchors: ["counter_north_left", "auto_door_south", "fluorescent_blue_white"],
      appears_in_episodes: [1, 2, 3],
    },
    {
      id: "loc_lawson_exterior_night_v1",
      name: "ローソン新宿西 外観 (深夜)",
      location_type: "other",
      spec: {
        era: "modern_japan_2026",
        atmosphere: "深夜2時。看板の蛍光灯がチカチカ、駐車場ガラ空き、自販機の白光",
        layout: { type: "open" },
        lighting_default: "看板光と自販機光のみ、周囲は暗い",
        color_palette: ["#0a0a14", "#0066cc", "#ffffff"],
      },
      continuity_anchors: ["lawson_signage_blue", "vending_machine_white_light", "deserted_parking"],
      appears_in_episodes: [1],
    },
    {
      id: "loc_shinjuku_night_skyline_v1",
      name: "新宿西 夜景 (establishing)",
      location_type: "other",
      spec: {
        era: "modern_japan_2026",
        atmosphere: "深夜2時の新宿。ビル群の谷間に小さくコンビニ看板、奥に高層ビル、空は墨",
        layout: { type: "open" },
        lighting_default: "ビル照明散在、空はほぼ黒",
        color_palette: ["#000000", "#0a0a1a", "#444444"],
      },
      continuity_anchors: ["dungeon_management_tower_red_beacon_far", "skyscrapers_silhouette"],
      appears_in_episodes: [1],
    },
    {
      id: "loc_ren_apartment_v1",
      name: "桐生レンの自室",
      location_type: "other",
      spec: {
        era: "modern_japan_2026",
        atmosphere: "1Kワンルーム、6畳、布団直敷き、PC1台、ダンジョン公社アプリのログ印刷物が壁",
        layout: {
          type: "rectangular",
          size_m: "3m × 5m",
          doors: [{ position: "south_wall", type: "single_metal_door" }],
          windows: [{ position: "north_wall", size: "small_aluminum_sash" }],
          furniture: [
            { type: "布団", position: "center_floor", color: "navy" },
            { type: "デスク", position: "west_wall", color: "particle_board_brown" },
            { type: "PC", position: "on_desk", color: "black" },
          ],
        },
        lighting_default: "天井の裸電球1個、PC画面の青光",
        color_palette: ["#2a2a2a", "#0066cc", "#888888"],
      },
      continuity_anchors: ["futon_center_floor", "single_bare_bulb_ceiling", "pc_screen_blue_glow"],
      appears_in_episodes: [1, 2, 3, 4],
    },
  ];
}

function derivePropsPlaceholder(): PropEntryV2[] {
  return [
    {
      id: "prop_smartphone_cracked_v1",
      name: "ヒビ入りスマートフォン",
      owner_character_id: "char_kiryuu_ren_v1",
      spec: {
        kind: "phone",
        color: "black",
        material: "glass_plastic",
        distinguishing_features: ["upper_right_crack_web", "fingerprint_smudges"],
      },
      continuity_anchors: ["upper_right_crack_persistent"],
    },
    {
      id: "prop_iron_pipe_v1",
      name: "錆びた鉄パイプ (探索装備)",
      owner_character_id: "char_kiryuu_ren_v1",
      spec: {
        kind: "weapon_blunt",
        color: "rust_brown",
        material: "iron",
        distinguishing_features: ["50cm_length", "rust_patches", "tape_wrapped_grip"],
      },
      continuity_anchors: ["always_50cm_with_tape_grip"],
    },
  ];
}

function deriveCostumesPlaceholder(): CostumeEntryV2[] {
  return [
    {
      id: "costume_ren_lawson_uniform_v1",
      character_id: "char_kiryuu_ren_v1",
      valid_from_episode: 1,
      valid_until_episode: 6,
      spec: {
        outerwear: "black_hooded_jacket",
        top: "lawson_blue_uniform_shirt",
        bottom: "black_cargo_pants",
        shoes: "black_sneakers",
        accessories: ["lawson_nametag_left_chest"],
        state_description: "コンビニ夜勤シフト中",
      },
    },
    {
      id: "costume_ren_dungeon_explorer_v1",
      character_id: "char_kiryuu_ren_v1",
      valid_from_episode: 7,
      valid_until_episode: null,
      spec: {
        outerwear: "black_hooded_jacket",
        top: "plain_black_t_shirt",
        bottom: "tactical_cargo_pants",
        shoes: "worn_combat_boots",
        accessories: ["iron_pipe_at_waist", "cracked_smartphone_in_pocket"],
        state_description: "ダンジョン探索装備 (中古ショップ寄せ集め)",
      },
    },
  ];
}

function deriveContinuitySeeds(
  characters: CharacterEntryV2[],
  locations: LocationEntryV2[],
  props: PropEntryV2[]
): ContinuitySeedV2[] {
  const seeds: ContinuitySeedV2[] = [];
  for (const c of characters) {
    seeds.push({
      group_id: `${c.id}_face_v1`.replace("char_", "char_") + "",
      kind: "character_face",
      target_id: c.id,
      invariant_description: c.spec.hair?.specific ?? c.continuity_anchors.join(", "),
    });
    seeds.push({
      group_id: `${c.id}_outfit_v1`,
      kind: "character_outfit",
      target_id: c.id,
      invariant_description: JSON.stringify(c.spec.outfit_default ?? {}),
    });
    seeds.push({
      group_id: `${c.id}_back_v1`,
      kind: "character_back",
      target_id: c.id,
      invariant_description:
        "後ろ姿: フード被り頭部シルエット + ジャケット線 + 肩幅",
    });
  }
  for (const l of locations) {
    seeds.push({
      group_id: `${l.id}_layout_v1`,
      kind: "location_layout",
      target_id: l.id,
      invariant_description: l.continuity_anchors.join(", "),
    });
  }
  for (const p of props) {
    seeds.push({
      group_id: `${p.id}_v1`,
      kind: "prop",
      target_id: p.id,
      invariant_description: p.continuity_anchors.join(", "),
    });
  }
  return seeds;
}

// ============================================================
// メイン変換
// ============================================================

export function adaptV2ConceptToBibleSnapshot(
  concept: V2Concept,
  args: {
    slug: string;
    sourcePath: string;
    artStyle: ArtStyle;
    targetPagesPerVolume: number;
    targetEpisodesPerVolume: number;
    targetPagesPerEpisode: number;
    estimatedVolumes: number;
    titleShort?: string;
    targetAudience?: string;
  }
): BibleSnapshotV2 {
  const protagonist = adaptProtagonist(concept.protagonist);
  const supporting = (concept.supporting_chars ?? []).map((s, i) => adaptSupporting(s, i));
  const characters = [protagonist, ...supporting];
  const locations = deriveLocationsPlaceholder();
  const props = derivePropsPlaceholder();
  const costumes = deriveCostumesPlaceholder();

  const relations: CharacterRelationV2[] = supporting.map((s) => ({
    from_character_id: protagonist.id,
    to_character_id: s.id,
    relation_type: s.role,
    description: s.appearance_notes ?? "",
  }));

  const styleDirectives = defaultStyleDirectives(args.artStyle);
  const visualMotifs = defaultVisualMotifs();
  const continuitySeeds = deriveContinuitySeeds(characters, locations, props);

  return {
    schema_version: 2,
    generated_at: new Date().toISOString(),
    generated_from: {
      source_type: "v2_concept_json",
      source_path: args.sourcePath,
    },
    meta: {
      slug: args.slug,
      title: concept.title,
      title_short: args.titleShort,
      art_style: args.artStyle,
      genre: concept.tags?.["houkou"] ?? "modern_dungeon",
      target_pages_per_volume: args.targetPagesPerVolume,
      target_episodes_per_volume: args.targetEpisodesPerVolume,
      target_pages_per_episode: args.targetPagesPerEpisode,
      target_audience: args.targetAudience,
      estimated_volumes: args.estimatedVolumes,
    },
    world: adaptWorld(concept.world),
    characters,
    locations,
    props,
    costumes,
    relations,
    style_directives: styleDirectives,
    visual_motifs: visualMotifs,
    continuity_seeds: continuitySeeds,
    volume_synopsis: {
      theme:
        "情報強者がランク制度に勝つ。F級無職フリーターが、外部音声ナビと組んで世界最速の隠しルール踏破者になる第1巻。",
      summary:
        (typeof concept.synopsis === "string"
          ? concept.synopsis
          : concept.synopsis?.short_v1 ?? concept.synopsis?.elevator ?? concept.synopsis?.full_series ?? ""
        ).slice(0, 400) ||
        "F級鑑定の桐生レンが、ダンジョン公社管理外の外部音声型スキル『ナビ』を覚醒させる。第1話で深夜コンビニ勤務中にナビと出会い、第7話で第3ダンジョン1階を世界最速踏破、第10話で『朱』の白瀬灯里に匿名記録更新者として目を付けられる。",
      cliffhanger:
        "8話末ラストコマ: 灯里がレンのIDを照合し終わる、画面に『該当者なし』と表示されるが、彼女の指がスクロールを止める。「いや、絶対いる」",
    },
  };
}

// ============================================================
// ファイル I/O ラッパー
// ============================================================

export async function loadV2Concept(filePath: string): Promise<V2Concept> {
  const txt = await fs.readFile(filePath, "utf-8");
  return JSON.parse(txt) as V2Concept;
}

export async function writeBibleSnapshot(
  workDir: string,
  snapshot: BibleSnapshotV2
): Promise<string> {
  const bibleDir = path.join(workDir, "bible");
  await fs.mkdir(bibleDir, { recursive: true });
  const outFile = path.join(bibleDir, "snapshot.json");
  await fs.writeFile(outFile, JSON.stringify(snapshot, null, 2));
  return outFile;
}
