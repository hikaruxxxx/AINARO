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
import type {
  BibleSnapshotV2,
  NavFullSpecV2,
  NarrationStyleGuideV2,
  TextQualityLexiconV2,
} from "../schemas-v2";
import type { V2Concept } from "./v2-adapter";
import type { BibleLintReport } from "../qa-v2/bible-lint";

const ENHANCEMENT_SCHEMA = `
type DeepExtractorOutput = {
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

// ============================================================
// patch 適用 (snapshot v2 → v2.1)
// ============================================================

export function applyDeepEnhancements(args: {
  bible: BibleSnapshotV2;
  patch: DeepExtractionPatch;
}): BibleSnapshotV2 {
  const out: BibleSnapshotV2 = JSON.parse(JSON.stringify(args.bible));

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
