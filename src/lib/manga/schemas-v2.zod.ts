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

// ── AI 開示 (KDP公式 5 区分) ──
export const AiDisclosureFlagsSchema = z.object({
  text: z.boolean(),
  images: z.boolean(),
  translation: z.boolean(),
  cover: z.boolean(),
  interior: z.boolean(),
});

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
    bisac_categories: z.array(z.string()).min(1).max(2),
    ai_disclosure_text: z.string().optional(),
    ai_disclosure: AiDisclosureFlagsSchema,
    ai_tools_used: z.array(z.string()),
    human_review_performed: z.boolean(),
    page_count: z.number().int().min(1),
    spine_width_mm: z.number().min(0),
    publication_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 形式"),
    manuscript_pdf_path: z.string().min(1),
    cover_pdf_path: z.string().min(1),
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
