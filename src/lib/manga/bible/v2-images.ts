/**
 * BibleSnapshotV2 用 ローカル参照画像生成
 *
 * v1 character-images.ts / location-images.ts の generateXxxLocal を参考に、
 * v2 schema (CharacterEntryV2 / LocationEntryV2 / PropEntryV2) を直接受けて
 * Codex CLI 経由で画像を生成し、_provenance.json に登録する。
 *
 * - DB 書き込みなし、全部ローカルファイル
 * - kindle_archive 由来 refs を生成しないので safety はメタデータレベルで担保
 */
import path from "node:path";
import { promises as fs } from "node:fs";
import { generateMangaImage, MANGA_SIZE_PRESETS } from "../generate/codex-image";
import type {
  BibleSnapshotV2,
  CharacterEntryV2,
  LocationEntryV2,
  PropEntryV2,
  StyleDirectivesV2,
} from "../schemas-v2";
import {
  appendProvenanceEntry,
  makeProvenanceEntry,
} from "./provenance";

// ============================================================
// Variant 定義 (v2)
// ============================================================

export type CharacterVariantV2 =
  // 顔3角度
  | "face_front"
  | "face_three_quarter" // 旧 face_diagonal を rename (業界標準名)
  | "face_side"
  // 全身3角度
  | "full_front"
  | "full_three_quarter"
  | "full_back"
  // 表情5
  | "expr_default"
  | "expr_smile"
  | "expr_focus"
  | "expr_surprise"
  | "expr_anger"
  | "expr_fatigue" // 旧互換、DEFAULT には含めない
  // 明るい/柔らかい系 拡張表情 (DEFAULT には含めず、必要に応じて --variants で追加生成)
  | "expr_grin"
  | "expr_laugh"
  | "expr_gentle"
  | "expr_relaxed"
  // LN コミカライズ特有のディテール参照
  | "eye_closeup"
  | "hair_detail";

export const DEFAULT_CHARACTER_VARIANTS: CharacterVariantV2[] = [
  // 顔3角度
  "face_front",
  "face_three_quarter",
  "face_side",
  // 全身3角度
  "full_front",
  "full_three_quarter",
  "full_back",
  // 表情5
  "expr_default",
  "expr_smile",
  "expr_focus",
  "expr_surprise",
  "expr_anger",
  // LN特有2
  "eye_closeup",
  "hair_detail",
];

export type LocationVariantV2 =
  | "wide_establishing"
  | "interior_eye_level"
  | "interior_high_angle"
  | "exterior_night";

export const DEFAULT_LOCATION_VARIANTS: LocationVariantV2[] = [
  "wide_establishing",
  "interior_eye_level",
  "interior_high_angle",
];

export type PropVariantV2 = "default" | "held";
export const DEFAULT_PROP_VARIANTS: PropVariantV2[] = ["default"];

// ============================================================
// プロンプト生成
// ============================================================

function styleDirectiveLine(style: StyleDirectivesV2): string {
  return `ART STYLE: ${style.global}`;
}

function buildCharacterRefPrompt(args: {
  character: CharacterEntryV2;
  variant: CharacterVariantV2;
  styleDirectives: StyleDirectivesV2;
}): string {
  const c = args.character;
  const spec = c.spec ?? {};
  const hair = spec.hair
    ? `${spec.hair.color ?? ""} ${spec.hair.style ?? ""}${spec.hair.specific ? ` (${spec.hair.specific})` : ""}`.trim()
    : "unspecified hair";
  const eyes = spec.eyes
    ? `${spec.eyes.color ?? ""} ${spec.eyes.shape ?? ""} eyes`.trim()
    : "neutral eyes";
  const build = spec.build ? `${spec.build} build` : "average build";
  const age = spec.age_visual ? `appears ${spec.age_visual}yo` : "young adult";
  const outfit = spec.outfit_default
    ? [
        spec.outfit_default.outerwear,
        spec.outfit_default.top,
        spec.outfit_default.bottom,
        spec.outfit_default.shoes,
      ]
        .filter(Boolean)
        .join(", ")
    : "default outfit";
  const personality = spec.personality_visual ?? "";
  const anchors = (c.continuity_anchors ?? []).join(", ");

  const poseLine = (() => {
    switch (args.variant) {
      // 顔3角度
      case "face_front":
        return "Pose: tight head-and-shoulders, FACING THE CAMERA directly. Neutral expression. NO background, plain off-white plate.";
      case "face_three_quarter":
        return "Pose: tight head-and-shoulders, EXACT 3/4 angle (45 degrees from front). Neutral expression. NO background.";
      case "face_side":
        return "Pose: tight head-and-shoulders, EXACT 90-degree side profile. Neutral expression. NO background.";
      // 全身3角度
      case "full_front":
        return "Pose: full body from head to toe, FACING THE CAMERA, arms relaxed, standing on plain off-white plate. NO background, NO props beyond what is part of the outfit.";
      case "full_three_quarter":
        return "Pose: full body from head to toe at 3/4 angle (45 degrees from front), arms relaxed, weight on one leg, standing on plain off-white plate. NO background, NO extra props.";
      case "full_back":
        return "Pose: full body from head to toe, BACK VIEW (camera behind the character), arms relaxed, standing on plain off-white plate. NO background.";
      // 表情 (head-and-shoulders, neutral pose, 表情のみ変える)
      case "expr_default":
        return "Framing: tight head-and-shoulders, front view. Expression: the character's DEFAULT neutral resting face, eyes relaxed and open, mouth slightly closed. NO background.";
      case "expr_smile":
        return "Framing: tight head-and-shoulders, front view. Expression: warm gentle SMILE, eyes slightly curved into crescents, soft cheek lift, mouth corners up. NO background.";
      case "expr_focus":
        return "Framing: tight head-and-shoulders, front view. Expression: sharp FOCUSED eyes, slightly tense brow, mouth firm and determined. NO background.";
      case "expr_surprise":
        return "Framing: tight head-and-shoulders, front view. Expression: clear SURPRISE, eyes wide open with visible whites, eyebrows raised, mouth slightly open. NO background.";
      case "expr_anger":
        return "Framing: tight head-and-shoulders, front view. Expression: ANGER, brows pulled down and together, narrowed eyes, jaw set, mouth firm or slightly open with tension. NO background.";
      case "expr_fatigue":
        return "Framing: tight head-and-shoulders, front view. Expression: tired/fatigue, half-closed heavy eyes, slight bags under eyes, mouth relaxed. NO background.";
      // 明るい/柔らかい系 拡張表情
      case "expr_grin":
        return "Framing: tight head-and-shoulders, front view. Expression: confident playful GRIN, one corner of the mouth raised slightly higher than the other, eyes narrowed with mischief but not hostile, brows relaxed, exuding self-assured warmth. NO background.";
      case "expr_laugh":
        return "Framing: tight head-and-shoulders, front view. Expression: open natural LAUGH, eyes nearly closed and curved into upward crescents (笑い目), mouth wide open showing the natural shape of teeth, cheeks lifted, head slightly tilted back. Carefree and bright. NO background.";
      case "expr_gentle":
        return "Framing: tight head-and-shoulders, front view. Expression: GENTLE softened gaze, eyes calm and slightly half-lidded with a kind warmth, mouth corners turned up only a hair (almost imperceptible smile), brows low and relaxed. The look someone gives a person they care about. NO background.";
      case "expr_relaxed":
        return "Framing: tight head-and-shoulders, front view. Expression: RELAXED off-guard expression, eyes open but unfocused / soft, mouth slightly parted in an unguarded way, no tension in brows or jaw, the natural face one wears when no one is watching. NO background.";
      // LN コミカライズ特有のディテール参照
      case "eye_closeup":
        return "Framing: EXTREME close-up of EYES ONLY (forehead to upper cheek, both eyes visible). Show iris, pupil, eyelashes drawn one by one, and 2-3 distinct circular/star-shaped catchlight highlights per eye in the light novel comicalization convention. Neutral expression. NO background, plain off-white plate.";
      case "hair_detail":
        return "Framing: close-up of hair section (top of head and bangs, no full face needed). Show individual hair strands flowing, screentone gradient for color value, fine highlight reflections along the flow. NO background, plain off-white plate.";
    }
  })();

  return [
    `Reference sheet illustration of "${c.name}" — recurring character of an ongoing Japanese light novel comicalization (なろう系 narou-kei, B6 KDP+KU, black and white). Style tradition: Young Ace / Comic Walker / カドコミ系 (expressive character-driven art, light novel cover lineage), NOT seinen-realism.`,
    "",
    styleDirectiveLine(args.styleDirectives),
    "",
    `Character description: ${age}, ${spec.gender ?? "unspecified"}, ${build}, ${hair}, ${eyes}, wearing ${outfit}.${personality ? ` ${personality}.` : ""}`,
    anchors ? `MUST PRESERVE invariants: ${anchors}.` : "",
    "",
    poseLine,
    "",
    "STRICT RULES:",
    "- Render exactly ONE character. NO additional people, NPC, background characters.",
    "- Do NOT render any text, logo, label, watermark, signature, speech bubble, panel border, or page number.",
    "- BLACK AND WHITE only with screentone and hatching, NO color, NO 3D-render shading, NO photorealistic shading.",
    "- Use screentone gradients sparingly for highlights, blush, and skin shading per light novel comicalization convention; avoid heavy airbrush.",
    "- Hands and fingers must look natural; render no more than five fingers per hand.",
    "- Confident decisive line work, expressive eyes, character-first composition. Light novel comicalization quality (Young Ace / Comic Walker tradition).",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildLocationRefPrompt(args: {
  location: LocationEntryV2;
  variant: LocationVariantV2;
  styleDirectives: StyleDirectivesV2;
}): string {
  const l = args.location;
  const spec = l.spec ?? {};
  const atmosphere = spec.atmosphere ?? "";
  // 注: lighting_default / color_palette はそのまま渡すと gpt-image-2 が
  // 写実的なライティング・配色を再現しにいくため、ref plate では意図的に省略する
  // (panel render 時の cue としては別経路で利用)。
  const layout = spec.layout
    ? [
        spec.layout.type ? `type=${spec.layout.type}` : "",
        spec.layout.size_m ? `size=${spec.layout.size_m}` : "",
        // 家具の色も同様に省略 (素材色は写実化を加速する)
        ...(spec.layout.furniture ?? []).map(
          (f) => `${f.type}@${f.position}`
        ),
      ]
        .filter(Boolean)
        .join("; ")
    : "";
  const anchors = (l.continuity_anchors ?? []).join(", ");

  const camera = (() => {
    switch (args.variant) {
      case "wide_establishing":
        return "Camera: wide establishing shot, low-angle from across the street. Show the location's overall silhouette and surrounding context.";
      case "interior_eye_level":
        return "Camera: interior eye-level wide-angle, showing the entire room. Standing person POV.";
      case "interior_high_angle":
        return "Camera: high-angle / overhead 3/4 view of the interior. Show floor layout and furniture placement clearly.";
      case "exterior_night":
        return "Camera: exterior establishing shot at night. Show the building exterior with night lighting.";
    }
  })();

  return [
    `STRICT STYLE: this is a black-and-white narou-kei comicalization manga page background plate (Young Ace / Comic Walker / カドコミ系 lineage, B6 KDP+KU). Hand-inked linework + sparse screentone only, white-paper feel with generous negative space. NOT photoreal, NOT a 3D render, NOT realistic photography, NOT seinen-realism. Treat as a published light-novel-comicalization manga asset, not as a real-world scene.`,
    "",
    `Reference sheet illustration of the location "${l.name}" — recurring setting of the same series.`,
    "",
    styleDirectiveLine(args.styleDirectives),
    "",
    atmosphere ? `Mood (compositional only, do NOT translate to photographic light): ${atmosphere}.` : "",
    layout ? `Spatial layout invariants: ${layout}.` : "",
    anchors ? `MUST PRESERVE structural invariants: ${anchors}.` : "",
    "",
    camera,
    "",
    "STRICT RULES:",
    "- NO people, NO characters, NO crowd. Empty location only.",
    "- BLACK AND WHITE only with sparse screentone + hatching. NO color. NO 3D-render shading. NO photorealistic shading. NO airbrush. NO ambient occlusion.",
    "- Treat surfaces as inked manga panels: large flat whites, decisive black silhouettes, screentone only where a published manga page would use it. Avoid filling every surface with detail.",
    "- Confident decisive line work with clear silhouettes. Use ICONOGRAPHIC background detail (fantasy: torches, stone walls, magic circles, guild counters; modern: urban signage shapes, electric poles, contemporary fixtures). Legibility and silhouette over photoreal density.",
    "- Do NOT render any text, logo, signage detail (only abstract sign shapes), watermark, or photographic specular highlight.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildPropRefPrompt(args: {
  prop: PropEntryV2;
  variant: PropVariantV2;
  styleDirectives: StyleDirectivesV2;
}): string {
  const p = args.prop;
  const spec = p.spec ?? {};
  const features = (spec.distinguishing_features ?? []).join(", ");
  const anchors = (p.continuity_anchors ?? []).join(", ");

  return [
    `Reference sheet illustration of the prop "${p.name}" for a Japanese light novel comicalization (なろう系 narou-kei, black and white). Style tradition: Young Ace / Comic Walker / カドコミ系.`,
    "",
    styleDirectiveLine(args.styleDirectives),
    "",
    spec.kind ? `Kind: ${spec.kind}.` : "",
    spec.color ? `Color tone (translate to grayscale): ${spec.color}.` : "",
    spec.material ? `Material: ${spec.material}.` : "",
    features ? `Distinguishing features: ${features}.` : "",
    anchors ? `MUST PRESERVE invariants: ${anchors}.` : "",
    "",
    args.variant === "default"
      ? "Camera: isolated object on plain off-white plate, 3/4 angle product-shot framing. NO hands, NO background."
      : "Camera: held in a hand, hand visible from wrist down. Plain background.",
    "",
    "STRICT RULES:",
    "- Single prop only, NO additional objects.",
    "- BLACK AND WHITE only.",
    "- Do NOT render any text or watermark.",
  ]
    .filter(Boolean)
    .join("\n");
}

// ============================================================
// 生成エントリポイント
// ============================================================

export type GenerateRefsOptions = {
  /** ベース snapshot (style_directives 取り出し用) */
  snapshot: BibleSnapshotV2;
  /** 出力 refs ルート (= bible/refs/) */
  refsDir: string;
  /** 並列度 (Codex CLI を同時に何個動かすか) — Pro 枠的に 2 推奨 */
  concurrency?: number;
  /** 1 image 単位の timeout */
  imageTimeoutMs?: number;
  /** 既に存在する PNG はスキップ */
  skipExisting?: boolean;
  /** style plate PNG 群の絶対パス配列。指定時は generateMangaImage の referenceImagePaths に注入し、画風を一致させる。
   *  ディレクトリ運用 (data/manga/style-plates/{art_style}/*.png) の全枚数を渡せる */
  stylePlatePaths?: string[];
};

async function existsAndNonEmpty(p: string, minBytes = 50_000): Promise<boolean> {
  try {
    const st = await fs.stat(p);
    return st.size >= minBytes;
  } catch {
    return false;
  }
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const tickets = Math.max(1, concurrency);
  const inflight: Promise<void>[] = [];
  for (let t = 0; t < tickets; t++) {
    inflight.push(
      (async () => {
        while (true) {
          const idx = cursor++;
          if (idx >= items.length) return;
          await worker(items[idx]);
        }
      })()
    );
  }
  await Promise.all(inflight);
}

export async function generateCharacterRefsForBible(opts: GenerateRefsOptions & {
  characters?: CharacterEntryV2[];
  variants?: CharacterVariantV2[];
}): Promise<{ generated: number; skipped: number; failed: number }> {
  const chars = opts.characters ?? opts.snapshot.characters;
  const variants = opts.variants ?? DEFAULT_CHARACTER_VARIANTS;
  const concurrency = opts.concurrency ?? 2;

  const tasks: Array<{ char: CharacterEntryV2; variant: CharacterVariantV2 }> = [];
  for (const c of chars) for (const v of variants) tasks.push({ char: c, variant: v });

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  await runWithConcurrency(tasks, concurrency, async ({ char, variant }) => {
    const dir = path.join(opts.refsDir, "characters", char.id);
    await fs.mkdir(dir, { recursive: true });
    const outPath = path.join(dir, `${variant}.png`);

    if ((opts.skipExisting ?? true) && (await existsAndNonEmpty(outPath))) {
      console.log(`[L02] SKIP (exists) ${char.id}/${variant}`);
      skipped++;
      return;
    }

    const prompt = buildCharacterRefPrompt({
      character: char,
      variant,
      styleDirectives: opts.snapshot.style_directives,
    });

    // サイズ:
    //   face_*/expr_*/eye_closeup/hair_detail → square (1024x1024)
    //   full_*  (full_front, full_three_quarter, full_back) → character_ref (1024x1536)
    const size =
      variant.startsWith("full_")
        ? MANGA_SIZE_PRESETS.character_ref
        : MANGA_SIZE_PRESETS.panel_square;

    try {
      console.log(`[L02] gen ${char.id}/${variant}...`);
      await generateMangaImage({
        prompt,
        outputPath: outPath,
        size,
        referenceImagePaths: opts.stylePlatePaths && opts.stylePlatePaths.length > 0 ? opts.stylePlatePaths : undefined,
        timeoutMs: opts.imageTimeoutMs ?? 5 * 60 * 1000,
        maxRetries: 1,
      });
      await appendProvenanceEntry(opts.refsDir, makeProvenanceEntry({
        asset_id: `${char.id}_${variant}`,
        path: path.relative(opts.refsDir, outPath),
        target_entity_id: char.id,
        target_entity_type: "character",
        variant,
      }));
      generated++;
      console.log(`[L02] DONE ${char.id}/${variant}`);
    } catch (e) {
      console.warn(`[L02] FAIL ${char.id}/${variant}: ${(e as Error).message}`);
      failed++;
    }
  });

  return { generated, skipped, failed };
}

export async function generateLocationRefsForBible(opts: GenerateRefsOptions & {
  locations?: LocationEntryV2[];
  variants?: LocationVariantV2[];
}): Promise<{ generated: number; skipped: number; failed: number }> {
  const locs = opts.locations ?? opts.snapshot.locations;
  const variants = opts.variants ?? DEFAULT_LOCATION_VARIANTS;
  const concurrency = opts.concurrency ?? 2;

  const tasks: Array<{ loc: LocationEntryV2; variant: LocationVariantV2 }> = [];
  for (const l of locs) for (const v of variants) tasks.push({ loc: l, variant: v });

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  await runWithConcurrency(tasks, concurrency, async ({ loc, variant }) => {
    const dir = path.join(opts.refsDir, "locations", loc.id);
    await fs.mkdir(dir, { recursive: true });
    const outPath = path.join(dir, `${variant}.png`);

    if ((opts.skipExisting ?? true) && (await existsAndNonEmpty(outPath))) {
      console.log(`[L02] SKIP (exists) ${loc.id}/${variant}`);
      skipped++;
      return;
    }

    const prompt = buildLocationRefPrompt({
      location: loc,
      variant,
      styleDirectives: opts.snapshot.style_directives,
    });

    const size = MANGA_SIZE_PRESETS.panel_landscape;

    try {
      console.log(`[L02] gen ${loc.id}/${variant}...`);
      await generateMangaImage({
        prompt,
        outputPath: outPath,
        size,
        referenceImagePaths: opts.stylePlatePaths && opts.stylePlatePaths.length > 0 ? opts.stylePlatePaths : undefined,
        timeoutMs: opts.imageTimeoutMs ?? 5 * 60 * 1000,
        maxRetries: 1,
      });
      await appendProvenanceEntry(opts.refsDir, makeProvenanceEntry({
        asset_id: `${loc.id}_${variant}`,
        path: path.relative(opts.refsDir, outPath),
        target_entity_id: loc.id,
        target_entity_type: "location",
        variant,
      }));
      generated++;
      console.log(`[L02] DONE ${loc.id}/${variant}`);
    } catch (e) {
      console.warn(`[L02] FAIL ${loc.id}/${variant}: ${(e as Error).message}`);
      failed++;
    }
  });

  return { generated, skipped, failed };
}

export async function generatePropRefsForBible(opts: GenerateRefsOptions & {
  props?: PropEntryV2[];
  variants?: PropVariantV2[];
}): Promise<{ generated: number; skipped: number; failed: number }> {
  const props = opts.props ?? opts.snapshot.props;
  const variants = opts.variants ?? DEFAULT_PROP_VARIANTS;
  const concurrency = opts.concurrency ?? 2;

  const tasks: Array<{ prop: PropEntryV2; variant: PropVariantV2 }> = [];
  for (const p of props) for (const v of variants) tasks.push({ prop: p, variant: v });

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  await runWithConcurrency(tasks, concurrency, async ({ prop, variant }) => {
    const dir = path.join(opts.refsDir, "props", prop.id);
    await fs.mkdir(dir, { recursive: true });
    const outPath = path.join(dir, `${variant}.png`);

    if ((opts.skipExisting ?? true) && (await existsAndNonEmpty(outPath))) {
      console.log(`[L02] SKIP (exists) ${prop.id}/${variant}`);
      skipped++;
      return;
    }

    const prompt = buildPropRefPrompt({
      prop,
      variant,
      styleDirectives: opts.snapshot.style_directives,
    });

    try {
      console.log(`[L02] gen ${prop.id}/${variant}...`);
      await generateMangaImage({
        prompt,
        outputPath: outPath,
        size: MANGA_SIZE_PRESETS.panel_square,
        referenceImagePaths: opts.stylePlatePaths && opts.stylePlatePaths.length > 0 ? opts.stylePlatePaths : undefined,
        timeoutMs: opts.imageTimeoutMs ?? 5 * 60 * 1000,
        maxRetries: 1,
      });
      await appendProvenanceEntry(opts.refsDir, makeProvenanceEntry({
        asset_id: `${prop.id}_${variant}`,
        path: path.relative(opts.refsDir, outPath),
        target_entity_id: prop.id,
        target_entity_type: "prop",
        variant,
      }));
      generated++;
      console.log(`[L02] DONE ${prop.id}/${variant}`);
    } catch (e) {
      console.warn(`[L02] FAIL ${prop.id}/${variant}: ${(e as Error).message}`);
      failed++;
    }
  });

  return { generated, skipped, failed };
}
