/**
 * キャラ参照画像の生成 + 永続化
 *
 * 各キャラに対して: front / side / expr_joy / expr_anger / expr_sad の 5 枚を
 * master_seed 固定で生成し、character_bibles.reference_images に紐付ける。
 *
 * panel-generator は生成時にこれらを reference として注入し、
 * 「同一人物として識別可能」「画風一貫」を担保する（Phase 1 出口条件）。
 *
 * 主モデル原則: gpt-image-1.5（Codex CLI 経由）
 */

import path from "path";
import { tmpdir } from "os";
import { generateMangaImage, MANGA_SIZE_PRESETS } from "../generate/codex-image";
import {
  ensureMangaBucket,
  pngFileToWebp,
  uploadToBucket,
} from "../assets/storage";
import { computeSha256, buildCharacterRefStorageKey } from "../assets/versioning";
import {
  createAsset,
  updateCharacterBibleReferences,
  updateCharacterRefsStatus,
} from "../db/dao";
import type { ArtStyle, CharacterBibleRow } from "../types";
import type { CharacterReferenceImages, CharacterSpec } from "../schemas";

export type CharacterRefVariant =
  | "front"
  | "side"
  | "expr_joy"
  | "expr_anger"
  | "expr_sad";

const ALL_VARIANTS: CharacterRefVariant[] = [
  "front",
  "side",
  "expr_joy",
  "expr_anger",
  "expr_sad",
];

/**
 * 参照画像プロンプト構築の最小入力。
 * DB 行 (CharacterBibleRow) でも snapshot エントリ (BibleCharacterEntry) でも
 * この形に揃えれば共通プロンプトが組める。
 */
export type CharacterRefPromptInput = {
  character_name: string;
  spec: CharacterSpec;
};

export function buildCharacterRefPrompt(args: {
  c: CharacterRefPromptInput;
  variant: CharacterRefVariant;
  artStyle: ArtStyle;
  styleSheetCdnUrl: string | null;
}): string {
  const spec = args.c.spec ?? {};
  const hair = spec.hair
    ? `${spec.hair.color ?? ""} ${spec.hair.style ?? ""}${spec.hair.specific ? ` (${spec.hair.specific})` : ""}`.trim()
    : "unspecified hair";
  const eyes = spec.eyes
    ? `${spec.eyes.color ?? ""} ${spec.eyes.shape ?? ""} eyes`.trim()
    : "neutral eyes";
  const build = spec.build ? `${spec.build} build` : "average build";
  const age = spec.age_visual ? `appears ${spec.age_visual}` : "young adult";
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

  const styleLine =
    args.artStyle === "webtoon"
      ? "Korean manhwa / vertical-scroll webtoon clean line art with limited cel-shaded coloring. NO airbrushed soft gradients, NO 3D render look, NO photorealistic skin shading. Confident variable line weight, restrained palette, slightly aged ink feel."
      : "Vertical-scroll webtoon style.";

  const poseLine = (() => {
    switch (args.variant) {
      case "front":
        return "Pose: facing the camera (front view), full body from head to toe, arms relaxed, neutral expression, standing on a flat off-white plate. NO background, NO props.";
      case "side":
        return "Pose: 90-degree side profile, full body from head to toe, neutral expression. NO background.";
      case "expr_joy":
        return "Framing: tight head-and-shoulders shot. Expression: bright joy / a clear smile, eyes engaged. NO background.";
      case "expr_anger":
        return "Framing: tight head-and-shoulders shot. Expression: anger / sharp brows, tense mouth. NO background.";
      case "expr_sad":
        return "Framing: tight head-and-shoulders shot. Expression: sadness / downcast eyes, slight grimace. NO background.";
    }
  })();

  return [
    `Reference sheet illustration of "${args.c.character_name}" — a recurring character of an ongoing manhwa series.`,
    styleLine,
    "",
    `Character description: ${age}, ${spec.gender ?? "unspecified"}, ${build}, ${hair}, ${eyes}, wearing ${outfit}.${personality ? ` ${personality}.` : ""}`,
    "",
    poseLine,
    "",
    "STRICT RULES:",
    "- Render exactly ONE character. No additional people, NPC, or background characters.",
    "- Do NOT render any text, logo, label, watermark, signature, speech bubble, panel border, or page number.",
    "- Hands and fingers must look natural; render no more than five fingers per hand.",
    "- Maintain consistent character design — hair color/style, eye color/shape, outfit must EXACTLY match the description.",
    args.styleSheetCdnUrl
      ? "- Match the line weight, color palette, and shading style of the provided style sheet reference image."
      : "- Use the same line weight and palette as a typical published manhwa volume.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * 1 キャラに対して 5 種の参照画像を生成し、character_bibles に保存する。
 */
export async function generateCharacterReferences(args: {
  workId: string;
  character: CharacterBibleRow;
  artStyle: ArtStyle;
  styleSheetLocalPath?: string;
  styleSheetCdnUrl?: string | null;
  scratchDir?: string;
  imageTimeoutMs?: number;
  variants?: CharacterRefVariant[];
}): Promise<{ refs: CharacterReferenceImages; assetIds: string[] }> {
  const variants = args.variants ?? ALL_VARIANTS;
  const scratchDir =
    args.scratchDir ??
    path.join(tmpdir(), "ainaro-manga", args.workId, "char_refs", args.character.id);

  await updateCharacterRefsStatus(args.character.id, "generating");
  await ensureMangaBucket();

  const refs: CharacterReferenceImages = {
    expressions: {},
  };
  const assetIds: string[] = [];

  for (const variant of variants) {
    const localPng = path.join(scratchDir, `${variant}.png`);
    const prompt = buildCharacterRefPrompt({
      c: args.character,
      variant,
      artStyle: args.artStyle,
      styleSheetCdnUrl: args.styleSheetCdnUrl ?? null,
    });

    const refImagePaths: string[] = [];
    if (args.styleSheetLocalPath) refImagePaths.push(args.styleSheetLocalPath);

    const sizePreset =
      variant === "expr_joy" || variant === "expr_anger" || variant === "expr_sad"
        ? MANGA_SIZE_PRESETS.square
        : MANGA_SIZE_PRESETS.character_ref;

    let generated;
    try {
      generated = await generateMangaImage({
        prompt,
        outputPath: localPng,
        size: sizePreset,
        referenceImagePaths: refImagePaths,
        timeoutMs: args.imageTimeoutMs ?? 5 * 60 * 1000,
        maxRetries: 1,
      });
    } catch (e) {
      console.warn(
        `[character-images] ${args.character.character_name}/${variant} 失敗: ${(e as Error).message}`
      );
      continue;
    }

    const { webpBuffer, width, height } = await pngFileToWebp(generated.outputPath);
    const hash = computeSha256(webpBuffer);
    const storageKey = buildCharacterRefStorageKey({
      workId: args.workId,
      characterId: args.character.id,
      variant,
      ext: "webp",
    });
    const { publicUrl } = await uploadToBucket({
      storageKey,
      buffer: webpBuffer,
      mime: "image/webp",
    });

    const asset = await createAsset({
      asset_kind: "character_ref",
      parent_id: args.character.id,
      version: 1,
      storage_key: storageKey,
      cdn_url: publicUrl,
      hash_sha256: hash,
      width_px: width,
      height_px: height,
      file_size_bytes: webpBuffer.length,
      mime_type: "image/webp",
      prompt,
      seed: args.character.master_seed ?? undefined,
      model_used: "gpt-image-1.5",
      generation_metadata: {
        provider: "openai",
        reference_image_ids: refImagePaths,
      },
      visibility: "internal",
      moderation_status: "pending",
    });
    assetIds.push(asset.id);

    if (variant === "front") refs.front = publicUrl;
    else if (variant === "side") refs.side = publicUrl;
    else {
      const key = variant.replace(/^expr_/, "");
      refs.expressions = { ...(refs.expressions ?? {}), [key]: publicUrl };
    }
  }

  // DB へ参照画像を反映
  const merged: CharacterReferenceImages = {
    ...args.character.reference_images,
    front: refs.front ?? args.character.reference_images?.front,
    side: refs.side ?? args.character.reference_images?.side,
    expressions: {
      ...(args.character.reference_images?.expressions ?? {}),
      ...(refs.expressions ?? {}),
    },
  };
  await updateCharacterBibleReferences(args.character.id, merged);
  await updateCharacterRefsStatus(
    args.character.id,
    assetIds.length === variants.length ? "ready" : "failed"
  );

  return { refs: merged, assetIds };
}

// ============================================================
// Snapshot 起点 (DB なし) ローカル画像生成
// ============================================================

export type LocalCharacterRefResult = {
  variant: CharacterRefVariant;
  localPath: string;
  prompt: string;
};

/**
 * BibleSnapshot 由来のキャラ情報からローカル PNG を 5 枚生成する。
 * DB 書き込みなし。出力先ディレクトリに variant 別 PNG を並べる。
 *
 * 用途: 手書き snapshot.json の試走、Pilot 検証、
 * DB にレコードを作る前のドライラン
 */
export async function generateCharacterReferencesLocal(args: {
  characterName: string;
  spec: CharacterSpec;
  artStyle: ArtStyle;
  outputDir: string;
  styleSheetLocalPath?: string;
  styleSheetCdnUrl?: string | null;
  variants?: CharacterRefVariant[];
  imageTimeoutMs?: number;
  maxRetries?: number;
}): Promise<LocalCharacterRefResult[]> {
  const variants = args.variants ?? ALL_VARIANTS;
  const results: LocalCharacterRefResult[] = [];

  for (const variant of variants) {
    const localPng = path.join(args.outputDir, `${variant}.png`);
    const prompt = buildCharacterRefPrompt({
      c: { character_name: args.characterName, spec: args.spec },
      variant,
      artStyle: args.artStyle,
      styleSheetCdnUrl: args.styleSheetCdnUrl ?? null,
    });

    const refImagePaths: string[] = [];
    if (args.styleSheetLocalPath) refImagePaths.push(args.styleSheetLocalPath);

    const sizePreset =
      variant === "expr_joy" || variant === "expr_anger" || variant === "expr_sad"
        ? MANGA_SIZE_PRESETS.square
        : MANGA_SIZE_PRESETS.character_ref;

    try {
      const generated = await generateMangaImage({
        prompt,
        outputPath: localPng,
        size: sizePreset,
        referenceImagePaths: refImagePaths,
        timeoutMs: args.imageTimeoutMs ?? 5 * 60 * 1000,
        maxRetries: args.maxRetries ?? 1,
      });
      results.push({
        variant,
        localPath: generated.outputPath,
        prompt,
      });
    } catch (e) {
      console.warn(
        `[character-images-local] ${args.characterName}/${variant} 失敗: ${(e as Error).message}`
      );
    }
  }

  return results;
}
