/**
 * ロケーション参照画像の生成 (ローカル / DB 経由 双方対応)
 *
 * 目的:
 *   1 つの場所を別アングル・別時間帯で描いても幾何学的整合が崩れないように、
 *   wide / front / from_door の 3 アングル + 時間帯 variants を参照画像として固定する。
 *
 * Codex 指摘: 「同じ部屋を任意角度で描けないと幾何学的整合が崩れる」。
 * MVP は参照画像 + spec で対応 (3D 下敷きは Phase 3 以降)。
 *
 * 主モデル原則: gpt-image-2 (Codex CLI 経由)
 */

import path from "path";
import {
  generateMangaImage,
  MANGA_SIZE_PRESETS,
} from "../generate/codex-image";
import type { ArtStyle } from "../types";
import type { LocationSpec, LocationReferenceImages } from "../schemas";

export type LocationRefVariant =
  | "wide"        // 全景 (空間の全体把握)
  | "front"       // 正面 (主要面の真正面)
  | "from_door"   // 入口から見た視点 (人物登場の標準アングル)
  | "from_window" // 窓側からの視点 (光源・風景込み、必要時のみ)
  | "time_morning"
  | "time_evening"
  | "time_night";

const DEFAULT_VARIANTS: LocationRefVariant[] = [
  "wide",
  "front",
  "from_door",
];

export type LocationRefPromptInput = {
  location_name: string;
  spec: LocationSpec;
};

/**
 * ロケ参照画像のプロンプトを構築。
 * spec.layout / atmosphere / lighting_default / color_palette を画像生成側に
 * 漏れなく言語化する。
 */
export function buildLocationRefPrompt(args: {
  loc: LocationRefPromptInput;
  variant: LocationRefVariant;
  artStyle: ArtStyle;
  styleSheetCdnUrl: string | null;
}): string {
  const spec = args.loc.spec ?? {};
  const layout = spec.layout ?? {};

  const styleLine = (() => {
    switch (args.artStyle) {
      case "manga_bw_seinen_dark":
        return "Young Ace / カドコミ系 narou-kei isekai dungeon comicalization background reference plate (蜘蛛ですが / 転スラ / ヘルモード lineage). Confident ink linework with clear silhouettes, fantasy iconography (torches, stone walls, magic circles, guild counters), legibility over photoreal density. NO photo render, NO Berserk/Vagabond gothic-grim.";
      case "manga_bw_shoujo_classic":
        return "Rose of Versailles style classical shoujo background reference plate. Fine delicate line work, ornamental detail, screentone gradations. NO photo render.";
      case "manga_bw_seinen_urban":
        return "Young Ace / Comic Walker / カドコミ系 narou-kei modern-dungeon comicalization background reference plate (Dジェネシス / 壊れスキル / 凡人探索者 lineage). Clear urban silhouettes, contemporary signage, dungeon-gate iconography. Crisp ink linework, controlled blacks, hand-drawn perspective. NOT Tokyo Ghoul / Solo Leveling seinen-realism.";
      case "manga_bw_shounen":
        return "Shounen weekly manga background reference plate. Bold ink lines, screentone shading, dynamic perspective. NO photo render.";
      case "manga_bw_seinen":
        return "Seinen manga background reference plate. Restrained ink linework, atmospheric tone. NO photo render.";
      default:
        return "Black-and-white manga background reference plate. NO photo render.";
    }
  })();

  const layoutLines: string[] = [];
  if (layout.type) layoutLines.push(`Layout type: ${layout.type}.`);
  if (layout.size_m) layoutLines.push(`Approximate size: ${layout.size_m}.`);
  if (layout.doors && layout.doors.length > 0) {
    layoutLines.push(
      `Doors: ${layout.doors
        .map((d) => `${d.position}${d.type ? ` (${d.type})` : ""}`)
        .join("; ")}.`
    );
  }
  if (layout.windows && layout.windows.length > 0) {
    layoutLines.push(
      `Windows: ${layout.windows
        .map((w) => `${w.position}${w.size ? ` (${w.size})` : ""}`)
        .join("; ")}.`
    );
  }
  if (layout.furniture && layout.furniture.length > 0) {
    layoutLines.push(
      `Furniture: ${layout.furniture
        .map(
          (f) =>
            `${f.type} at ${f.position}${f.color ? ` (${f.color})` : ""}`
        )
        .join("; ")}.`
    );
  }

  const angleLine = (() => {
    switch (args.variant) {
      case "wide":
        return "Camera: wide establishing shot, slightly elevated viewpoint, capture the entire space, no human figure, neutral lighting.";
      case "front":
        return "Camera: head-on view of the main wall/feature at human eye level, no human figure, neutral lighting.";
      case "from_door":
        return "Camera: as if the viewer just stepped through the main door, eye-level perspective looking into the room, no human figure.";
      case "from_window":
        return "Camera: from the window side looking inward, including the window frame in foreground if visible, no human figure.";
      case "time_morning":
        return "Camera: standard wide shot, lighting changed to early morning — soft cool light through windows. No human figure.";
      case "time_evening":
        return "Camera: standard wide shot, lighting changed to dusk — warm orange light, long shadows. No human figure.";
      case "time_night":
        return "Camera: standard wide shot, lighting changed to night — dim ambient light, deep shadows, any artificial light source emphasized. No human figure.";
    }
  })();

  return [
    `Background reference plate for the location "${args.loc.location_name}" — a recurring setting of an ongoing manga series.`,
    styleLine,
    "",
    spec.era ? `Era / setting: ${spec.era}.` : "",
    spec.atmosphere ? `Atmosphere: ${spec.atmosphere}.` : "",
    spec.lighting_default
      ? `Default lighting: ${spec.lighting_default}.`
      : "",
    spec.color_palette && spec.color_palette.length > 0
      ? `Reference palette / tonal cues: ${spec.color_palette.join(", ")}.`
      : "",
    "",
    ...layoutLines,
    "",
    angleLine,
    "",
    "STRICT RULES:",
    "- Render the SPACE only. NO people, NO speech bubbles, NO panel borders, NO page numbers.",
    "- Do NOT render any text, logo, label, watermark, or signature anywhere in the image.",
    "- Maintain hand-drawn ink line quality; do not produce photographic or 3D-rendered output.",
    "- Spatial layout (doors, windows, furniture positions) must EXACTLY match the description so that the same space can be redrawn from other angles consistently.",
    args.styleSheetCdnUrl
      ? "- Match the line weight, palette, and shading style of the provided style sheet reference image."
      : "- Use the same line weight and palette as a typical published manga volume of the same genre.",
  ]
    .filter(Boolean)
    .join("\n");
}

// ============================================================
// Snapshot 起点 (DB なし) ローカル画像生成
// ============================================================

export type LocalLocationRefResult = {
  variant: LocationRefVariant;
  localPath: string;
  prompt: string;
};

/**
 * BibleSnapshot 由来のロケ情報からローカル PNG をアングル別に生成する。
 * DB 書き込みなし。
 */
export async function generateLocationReferencesLocal(args: {
  locationName: string;
  spec: LocationSpec;
  artStyle: ArtStyle;
  outputDir: string;
  styleSheetLocalPath?: string;
  styleSheetCdnUrl?: string | null;
  variants?: LocationRefVariant[];
  imageTimeoutMs?: number;
  maxRetries?: number;
}): Promise<LocalLocationRefResult[]> {
  const variants = args.variants ?? DEFAULT_VARIANTS;
  const results: LocalLocationRefResult[] = [];

  for (const variant of variants) {
    const localPng = path.join(args.outputDir, `${variant}.png`);
    const prompt = buildLocationRefPrompt({
      loc: { location_name: args.locationName, spec: args.spec },
      variant,
      artStyle: args.artStyle,
      styleSheetCdnUrl: args.styleSheetCdnUrl ?? null,
    });

    const refImagePaths: string[] = [];
    if (args.styleSheetLocalPath) refImagePaths.push(args.styleSheetLocalPath);

    try {
      const generated = await generateMangaImage({
        prompt,
        outputPath: localPng,
        size: MANGA_SIZE_PRESETS.location_ref,
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
        `[location-images-local] ${args.locationName}/${variant} 失敗: ${(e as Error).message}`
      );
    }
  }

  return results;
}

/**
 * 戻り値の variants 配列を LocationReferenceImages 形式に集約。
 * (DB へ流す際の入力データになる予定)
 */
export function aggregateLocationRefs(
  results: LocalLocationRefResult[]
): LocationReferenceImages {
  const refs: LocationReferenceImages = {};
  const time_variants: Record<string, string> = {};
  for (const r of results) {
    switch (r.variant) {
      case "wide":
        refs.wide = r.localPath;
        break;
      case "front":
        refs.front = r.localPath;
        break;
      case "from_door":
        refs.from_door = r.localPath;
        break;
      case "from_window":
        refs.from_window = r.localPath;
        break;
      case "time_morning":
        time_variants.morning = r.localPath;
        break;
      case "time_evening":
        time_variants.evening = r.localPath;
        break;
      case "time_night":
        time_variants.night = r.localPath;
        break;
    }
  }
  if (Object.keys(time_variants).length > 0) refs.time_variants = time_variants;
  return refs;
}
