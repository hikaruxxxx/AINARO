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
import type { BibleSnapshotV2 } from "../schemas-v2";
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
};
`;

export async function runDeepExtractor(args: {
  v2Concept: V2Concept;
  currentBible: BibleSnapshotV2;
  lintReport: BibleLintReport;
  styleReferenceNote: string;       // 画風参考フレームの説明 (Codex が画像を直接見られないので言葉で渡す)
  cwd?: string;
  timeoutMs?: number;
}): Promise<{
  characters_patch: Array<unknown>;
  locations_add: Array<unknown>;
  props_add: Array<unknown>;
  visual_motifs_add: Array<unknown>;
  costumes_add: Array<unknown>;
  relations_replace: Array<unknown>;
  style_directives_overrides?: unknown;
  volume_synopsis_replace?: unknown;
}> {
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
  patch: {
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
  };
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
