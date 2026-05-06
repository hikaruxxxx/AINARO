/**
 * Zod runtime 検証スキーマ (B-1 計画 Track C-1)
 *
 * 設計方針:
 *   - schemas-v2.ts の TypeScript 型を source of truth とする
 *   - Zod 化は L13 / L7 のゲート層 (出版直前 fail-fast) のみ
 *   - 全面 Zod 化は採用しない (459行の型を全部 z.infer に置換するコストに見合わない)
 *   - .passthrough() で未定義列を許容し、後方互換を担保
 *
 * 検証対象 3 型:
 *   1. KdpMetadata        — L13 出力の出版時最終ゲート
 *   2. RefProvenanceEntry / RefsProvenance — L7 production 入力前段
 *   3. WorkMetaJson       — L13 入力 (data/manga/works/{slug}/meta.json)
 */
import { z } from "zod";

// ── Enum ──
export const RefSourceTypeSchema = z.enum([
  "bible_generated",
  "manual_upload",
  "kindle_archive",
  "external_purchased",
  "bible_image_repaired_v2",
  "amazon_public_metadata",
]);

export const RefRightsStatusSchema = z.enum([
  "ai_use_allowed",
  "internal_only",
  "blocked",
]);

export const TrademarkCheckStatusSchema = z.enum(["pending", "passed", "flagged"]);

export const RefEntityTypeSchema = z.enum(["character", "location", "prop", "style"]);

export const DungeonModernSubtypeSchema = z.enum([
  "external_social",
  "gacha_ui",
  "hybrid",
]);

// ── AI 開示 (KDP公式 5 区分) ──
export const AiDisclosureFlagsSchema = z.object({
  text: z.boolean(),
  images: z.boolean(),
  translation: z.boolean(),
  cover: z.boolean(),
  interior: z.boolean(),
});

export const ToneProfileSchema = z
  .object({
    darkness: z.number(),
    comedic_density: z.number(),
    recovery_cadence: z.number(),
    sidekick_presence: z.number(),
  })
  .passthrough();

// 未配線 zod schema (2026-05-06): bible のテキスト品質パック (world.lexicon /
// characters[*].speech_style / narration_style_guide / nav_full_spec) 用に
// 定義されたが、現状この repo に BibleSnapshotV2Schema 親が無いため呼び出し側ゼロ。
// 親 schema 整備時に組み込む。それまでは TS 型 (schemas-v2.ts) のみで運用。
export const TextQualityLexiconSchema = z
  .object({
    forbidden_terms_global: z.array(z.string()).optional(),
    p1_opening_directive: z.string().optional(),
  })
  .passthrough();

export const CharacterSpeechStyleSchema = z
  .object({
    first_person: z.string().optional(),
    register: z.string().optional(),
    sentence_rhythm: z.string().optional(),
    verbosity_dial: z.record(z.string(), z.string()).optional(),
    preferred_techniques: z.array(z.string()).optional(),
    characteristic_phrases: z.array(z.string()).optional(),
    to_navi_dialog_pattern: z.string().optional(),
    speech_drift_per_volume: z.record(z.string(), z.string()).optional(),
    monologue_signature: z.string().optional(),
    ban_phrases: z.array(z.string()).optional(),
  })
  .passthrough();

export const NarrationStyleGuideSchema = z
  .object({
    p1_opening_directive_specific: z
      .object({
        max_lines: z.number().int().positive().optional(),
        max_chars_per_line: z.number().int().positive().optional(),
        must_contain_at_most_one_of: z.array(z.string()).optional(),
        must_avoid: z.array(z.string()).optional(),
        preferred_pattern_examples: z.array(z.string()).optional(),
        rejected_pattern_examples: z.array(z.string()).optional(),
      })
      .passthrough()
      .optional(),
    ban_list_phrases: z.array(z.string()).optional(),
    monologue_signature_patterns: z.array(z.string()).optional(),
  })
  .passthrough();

export const NavFullSpecSchema = z
  .object({
    voice_persona: z
      .object({
        default_tone: z.string().optional(),
        speech_endings: z.array(z.string()).optional(),
        emotional_range_per_volume: z.record(z.string(), z.string()).optional(),
      })
      .passthrough()
      .optional(),
    canonical_disclosure_lines_vol_1: z.array(z.string()).optional(),
    anti_pattern_dialogue: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const BibleSnapshotV2MetaSchema = z
  .object({
    slug: z.string().min(1),
    title: z.string().min(1),
    title_short: z.string().optional(),
    title_en: z.string().optional(),
    art_style: z.string().min(1),
    genre: z.string().min(1),
    subtype: DungeonModernSubtypeSchema.optional(),
    target_pages_per_volume: z.number().int().positive(),
    target_episodes_per_volume: z.number().int().positive(),
    target_pages_per_episode: z.number().int().positive(),
    target_audience: z.string().optional(),
    estimated_volumes: z.number().int().positive().optional(),
    tone_profile: ToneProfileSchema.optional(),
    profile_id: z.string().optional(),
  })
  .passthrough();

// ── RefProvenanceEntry ──
export const RefEditHistoryEntrySchema = z.object({
  editor: z.string().min(1),
  timestamp: z.string().min(1),
  reason: z.string().min(1),
});

export const RefProvenanceEntrySchema = z
  .object({
    asset_id: z.string().min(1),
    path: z.string().min(1),
    source_type: RefSourceTypeSchema,
    rights_status: RefRightsStatusSchema,
    created_by: z.string().min(1),
    created_at: z.string().min(1),
    derived_from: z.array(z.string()),
    license_note: z.string(),
    qa_score: z.number().optional(),
    training_candidate: z.boolean(),
    target_entity_id: z.string().min(1),
    target_entity_type: RefEntityTypeSchema,
    variant: z.string().min(1),
    // ── Track C-1 で追加された dossier 項目 (任意) ──
    generation_prompt: z.string().optional(),
    model_name: z.string().optional(),
    model_version: z.string().optional(),
    generation_timestamp: z.string().optional(),
    edit_history: z.array(RefEditHistoryEntrySchema).optional(),
    purchase_record_id: z.string().optional(),
    commercial_use_clause: z.string().optional(),
    trademark_check_status: TrademarkCheckStatusSchema.optional(),
    learning_source_chain: z.array(z.string()).optional(),
  })
  .passthrough();

export const RefsProvenanceSchema = z
  .object({
    schema_version: z.literal(1),
    refs: z.array(RefProvenanceEntrySchema),
  })
  .passthrough();

// ── KdpMetadata ──
export const KdpMetadataSchema = z
  .object({
    schema_version: z.literal(2),
    slug: z.string().min(1),
    volume_no: z.number().int().positive(),
    title: z.string().min(1).max(200),
    subtitle: z.string().max(200).optional(),
    author_pen_name: z.string().min(1),
    isbn: z.string().optional(),
    asin: z.string().optional(),
    bisac_categories: z.array(z.string()).min(1).max(3),
    ai_disclosure_text: z.string().optional(),
    ai_disclosure: AiDisclosureFlagsSchema,
    ai_tools_used: z.array(z.string()),
    human_review_performed: z.boolean(),
    page_count: z.number().int().min(1),
    spine_width_mm: z.number().min(0),
    publication_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 形式"),
    manuscript_pdf_path: z.string().min(1),
    cover_pdf_path: z.string().min(1),
    // ── kdp-modular-plum.md (検索最適化拡張、全 optional / 後方互換) ──
    title_candidates: z.array(z.string()).optional(),
    series_name_canonical: z.string().optional(),
    keyword_picks_7: z.array(z.string()).max(7).optional(),
    categories_validated: z.array(z.string()).max(3).optional(),
  })
  .passthrough()
  .refine(
    (m) => {
      // ai_tools_used が空のときは ai_disclosure 全 false が期待値 (整合性)
      if (m.ai_tools_used.length === 0) {
        const flags = m.ai_disclosure;
        return !flags.text && !flags.images && !flags.cover && !flags.interior && !flags.translation;
      }
      return true;
    },
    {
      message: "ai_tools_used が空なのに ai_disclosure に true がある (矛盾)",
    },
  );

// ── WorkMetaJson (data/manga/works/{slug}/meta.json) ──
// L13 が読む meta.json の最低限の項目を Zod 化。a07-modern-dungeon の構造に合わせ
// 余分なフィールドは .passthrough() で許容。
export const WorkMetaJsonSchema = z
  .object({
    schema_version: z.number().int().positive(),
    slug: z.string().min(1),
    title: z.string().min(1),
    title_short: z.string().optional(),
    title_en_working: z.string().optional(),
    genre: z.string().optional(),
    subgenre: z.string().optional(),
    subtype: DungeonModernSubtypeSchema.optional(),
    art_style: z.string().optional(),
    target_audience: z.string().optional(),
    phase: z.string().optional(),
    volume_plan: z
      .object({
        estimated_volumes: z.number().int().positive().optional(),
        target_pages_per_volume: z.number().int().positive().optional(),
        target_episodes_per_volume: z.number().int().positive().optional(),
        target_pages_per_episode: z.number().int().positive().optional(),
      })
      .passthrough()
      .optional(),
    /** kdp-modular-plum.md (検索最適化拡張) */
    kdp_metadata: z
      .object({
        title_candidates: z.array(z.string()).optional(),
        series_name_canonical: z.string().optional(),
        keyword_picks_7: z.array(z.string()).max(7).optional(),
        categories_validated: z.array(z.string()).max(3).optional(),
        description_seed: z
          .object({
            hook_line: z.string().min(1),
            turn_line: z.string().min(1),
            synopsis_lines: z.array(z.string()).min(1).max(5),
            recommend_points: z.array(z.string()).min(1).max(5),
            cta_line: z.string().optional(),
            related_keywords: z.array(z.string()).optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

// ── Type re-exports (consumer の利便用) ──
export type KdpMetadataInput = z.input<typeof KdpMetadataSchema>;
export type KdpMetadataOutput = z.output<typeof KdpMetadataSchema>;
export type RefProvenanceEntryOutput = z.output<typeof RefProvenanceEntrySchema>;
export type RefsProvenanceOutput = z.output<typeof RefsProvenanceSchema>;
export type WorkMetaJsonOutput = z.output<typeof WorkMetaJsonSchema>;

/**
 * 形式エラーを 1 つの Error にまとめる helper。
 * tsx CLI で使う想定。
 */
export function parseOrThrow<T>(
  schema: z.ZodType<T>,
  data: unknown,
  contextLabel: string,
): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const lines = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`${contextLabel} schema validation failed:\n${lines}`);
  }
  return result.data;
}
