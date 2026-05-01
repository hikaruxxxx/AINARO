/**
 * 作品単位のスタイルシート（画風基準アセット）生成
 *
 * 1 枚の image を生成し、これを全パネル生成時に reference として注入することで
 * 線・塗り・色・トーンを揃え、AI 量産物っぽさを抑える。
 *
 * 主モデル原則: gpt-image-1.5（OPENAI_API_KEY 直叩き禁止、Codex CLI 経由）
 */

import path from "path";
import { tmpdir } from "os";
import { generateMangaImage } from "../generate/codex-image";
import {
  ensureMangaBucket,
  pngFileToWebp,
  uploadToBucket,
} from "../assets/storage";
import { computeSha256 } from "../assets/versioning";
import { createAsset, updateMangaWorkStyleSheet } from "../db/dao";
import type { ArtStyle, AssetRow, CharacterBibleRow } from "../types";

export type StyleSheetResult = {
  asset: AssetRow;
  cdnUrl: string | null;
  prompt: string;
};

function styleAnchorBlock(artStyle: ArtStyle): string {
  switch (artStyle) {
    case "webtoon":
      return [
        "Korean manhwa / vertical-scroll webtoon style sheet for a single ongoing IP.",
        "Reference sheet shows: 1) clean line art with confident strokes (variable line weight), 2) limited cel-shaded color blocking, 3) toned greys for shadow / ambient occlusion (NO airbrushed gradients), 4) restrained palette (3-4 dominant hues + 1 accent), 5) flat backgrounds with simple gradient skies (avoid photorealistic environments).",
        "Avoid: glossy 3D render, soft cinematic bokeh, perfectly symmetrical glamour-shot framing, airbrushed pastel skin, generic anime template proportions, plastic-doll faces.",
        "Aim for: print-publication manhwa look — slightly aged ink feel, decisive blacks, deliberate negative space.",
      ].join(" ");
    case "shounen":
      return "Japanese shounen manga style sheet — bold black ink lines, screentone shading dots, dynamic action poses, hand-drawn imperfections.";
    case "shoujo":
      return "Japanese shoujo manga style sheet — fine delicate line art, decorative motifs, pastel highlights with screentone gradations.";
    case "realistic":
      return "Cinematic semi-realistic illustrated manga style sheet — restrained palette, anatomically grounded.";
    case "chibi":
      return "Chibi / super-deformed style sheet — exaggerated heads, simplified torsos.";
    default:
      return "Vertical-scroll webtoon style sheet.";
  }
}

/**
 * スタイルシート 1 枚を生成する。
 * 主要キャラ 1-2 名を style anchor として全身描画 + 表情ミニアイコン 4-6 個 + 線/塗り/色見本ストリップを 1 枚に同居させる。
 */
export async function generateStyleSheet(args: {
  workId: string;
  workTitle: string;
  artStyle: ArtStyle;
  /** style anchor として描画する主要キャラ 1-2 名（preferably protagonist + heroine/antagonist） */
  anchorCharacters: CharacterBibleRow[];
  scratchDir?: string;
  imageTimeoutMs?: number;
}): Promise<StyleSheetResult> {
  const scratchDir =
    args.scratchDir ?? path.join(tmpdir(), "ainaro-manga", args.workId);
  const localPng = path.join(scratchDir, "style_sheet.png");

  const anchorBlocks = args.anchorCharacters.slice(0, 2).map((c) => {
    const spec = c.spec ?? {};
    const hair = spec.hair
      ? `${spec.hair.color ?? ""} ${spec.hair.style ?? ""}`.trim()
      : "unspecified hair";
    const outfit = spec.outfit_default
      ? [
          spec.outfit_default.outerwear,
          spec.outfit_default.top,
          spec.outfit_default.bottom,
        ]
          .filter(Boolean)
          .join(", ")
      : "default outfit";
    return `${c.character_name} (${c.character_role ?? "supporting"}) — ${spec.gender ?? "?"}, ${spec.build ?? "?"} build, ${hair}, wearing ${outfit}.`;
  });

  const prompt = [
    `Style sheet for the manhwa series "${args.workTitle}".`,
    "",
    styleAnchorBlock(args.artStyle),
    "",
    "Composition: a single illustration plate (portrait orientation 1024x1536) divided into 3 horizontal bands.",
    "Top band (largest, ~55%): full-body standing pose of the style-anchor character(s) listed below, neutral expression, no background, just the figure(s) on a flat off-white paper texture.",
    "Middle band (~25%): a row of 5 small expression head-shots of the same character(s) — neutral, joy, anger, sadness, surprise — clearly labeled visually only by expression (no text).",
    "Bottom band (~20%): a horizontal palette strip showing the 4 dominant hues + 1 accent of this series, plus 3 line-weight samples and 2 toned-grey shading swatches.",
    "",
    "Style-anchor character(s):",
    ...anchorBlocks.map((b, i) => `${i + 1}. ${b}`),
    "",
    "STRICT RULES:",
    "- Do NOT render any text, logo, label, watermark, or signature anywhere in the image.",
    "- Do NOT include speech bubbles, panel borders, or page numbers.",
    "- Do NOT use airbrushed soft gradients or photorealistic skin shading.",
    "- Hands and fingers must look natural; render no more than five fingers per hand.",
    "- Maintain a consistent line weight across all elements within the plate.",
  ].join("\n");

  const generated = await generateMangaImage({
    prompt,
    outputPath: localPng,
    size: { width: 1024, height: 1536 },
    timeoutMs: args.imageTimeoutMs ?? 6 * 60 * 1000,
    maxRetries: 1,
  });

  await ensureMangaBucket();
  const { webpBuffer, width, height } = await pngFileToWebp(generated.outputPath);
  const hash = computeSha256(webpBuffer);
  const storageKey = `work/${args.workId}/style_sheet/v1.webp`;
  const { publicUrl } = await uploadToBucket({
    storageKey,
    buffer: webpBuffer,
    mime: "image/webp",
  });

  const asset = await createAsset({
    asset_kind: "cover", // 'style_sheet' enum 値は未追加のため近い 'cover' で代用 / 後で migrate 可
    parent_id: args.workId,
    version: 1,
    storage_key: storageKey,
    cdn_url: publicUrl,
    hash_sha256: hash,
    width_px: width,
    height_px: height,
    file_size_bytes: webpBuffer.length,
    mime_type: "image/webp",
    prompt,
    seed: null as unknown as number, // 任意
    model_used: "gpt-image-1.5",
    generation_metadata: { provider: "openai" },
    visibility: "internal",
    moderation_status: "pending",
  });

  await updateMangaWorkStyleSheet(args.workId, asset.id);

  return { asset, cdnUrl: publicUrl, prompt };
}
