/**
 * パネル生成オーケストレータ (Phase 1 redesign 2026-04-30)
 *
 * 流れ:
 *   0. style sheet + 各キャラの reference 画像をローカルに事前ダウンロード
 *   1. shotlist.panels から各 ShotlistPanelEntry を順に処理
 *   2. manga_panels に行を作成（narrative_function / panel_purpose も保存）
 *   3. panel_characters / bubbles を投入
 *   4. prompt-composer でプロンプト組み立て（style sheet + キャラ refs を注入）
 *   5. codex-image (gpt-image-1.5) で画像生成 → ローカル保存
 *   6. storage.ts で WebP 化 → Supabase Storage アップロード → assets INSERT
 *   7. manga_panels.current_asset_id を更新
 *
 * 並列度: MVP は 5。失敗パネルはスキップして続行。
 * Codex CLI 経由のため ANTHROPIC_API_KEY / OPENAI_API_KEY 直叩きはしない。
 */

import path from "path";
import { tmpdir } from "os";
import { writeFile, mkdir } from "fs/promises";
import { generateMangaImage } from "./codex-image";
import { composePanelPrompt } from "./prompt-composer";
import { persistPanelAsset, ensureLocalScratchDir } from "../assets/storage";
import { placeBubbles } from "../bubble/placer";
import {
  createMangaPanel,
  setPanelCurrentAsset,
  addPanelCharacter,
  createBubble,
  listEpisodePanels,
  listCostumeStates,
  updateMangaEpisodeStatus,
} from "../db/dao";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  CharacterBibleRow,
  LocationBibleRow,
  CostumeStateRow,
  MangaPanelRow,
  ArtStyle,
} from "../types";
import type { ShotlistData, ShotlistPanelEntry } from "../schemas";

export type PanelGenerationResult = {
  panelIdx: number;
  panel: MangaPanelRow;
  status: "generated" | "reused" | "skipped" | "failed";
  assetId: string | null;
  cdnUrl: string | null;
  durationMs: number;
  error?: string;
};

async function downloadToLocal(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, buf);
}

async function preloadStyleSheet(args: {
  workId: string;
  scratchDir: string;
}): Promise<string | null> {
  const sb = createAdminClient();
  const { data: work } = await sb
    .from("manga_works")
    .select("style_sheet_asset_id")
    .eq("id", args.workId)
    .maybeSingle();
  const styleAssetId = (work as { style_sheet_asset_id: string | null } | null)
    ?.style_sheet_asset_id;
  if (!styleAssetId) return null;
  const { data: asset } = await sb
    .from("assets")
    .select("cdn_url")
    .eq("id", styleAssetId)
    .maybeSingle();
  const cdnUrl = (asset as { cdn_url: string | null } | null)?.cdn_url;
  if (!cdnUrl) return null;
  const localPath = path.join(args.scratchDir, "_refs", "style_sheet.png");
  try {
    await downloadToLocal(cdnUrl, localPath);
    return localPath;
  } catch (e) {
    console.warn(
      `[orchestrator] style sheet download failed: ${(e as Error).message}`
    );
    return null;
  }
}

async function preloadCharacterRefs(args: {
  characters: CharacterBibleRow[];
  scratchDir: string;
}): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  for (const c of args.characters) {
    const refs = c.reference_images ?? {};
    const candidates: Array<{ key: string; url: string }> = [];
    if (refs.front) candidates.push({ key: "front", url: refs.front });
    if (refs.side) candidates.push({ key: "side", url: refs.side });
    if (refs.expressions) {
      const e = refs.expressions;
      // 表情はパネル毎に切替できるが、Phase 1 MVP は joy 1枚だけ参照に追加（コスト削減）
      const pickKey = e.joy ? "joy" : Object.keys(e)[0];
      if (pickKey && e[pickKey]) {
        candidates.push({ key: `expr_${pickKey}`, url: e[pickKey] as string });
      }
    }
    const localPaths: string[] = [];
    for (const { key, url } of candidates) {
      const dest = path.join(
        args.scratchDir,
        "_refs",
        c.id,
        `${key}.png`
      );
      try {
        await downloadToLocal(url, dest);
        localPaths.push(dest);
      } catch (e) {
        console.warn(
          `[orchestrator] character ref download failed (${c.character_name}/${key}): ${(e as Error).message}`
        );
      }
    }
    if (localPaths.length > 0) map.set(c.id, localPaths);
  }
  return map;
}

/**
 * 1 エピソード分のパネル生成を実行する
 */
export async function generateEpisodePanels(args: {
  workId: string;
  episodeId: string;
  shotlist: ShotlistData;
  characters: CharacterBibleRow[];
  locations: LocationBibleRow[];
  artStyle: ArtStyle;
  concurrency?: number;
  imageTimeoutMs?: number;
  scratchDir?: string;
  skipExisting?: boolean;
}): Promise<PanelGenerationResult[]> {
  const concurrency = args.concurrency ?? 5;
  const imageTimeoutMs = args.imageTimeoutMs ?? 6 * 60 * 1000;
  const scratchDir =
    args.scratchDir ??
    path.join(tmpdir(), "ainaro-manga", args.workId, args.episodeId);
  await ensureLocalScratchDir(scratchDir);

  const costumesByCharacterId = new Map<string, CostumeStateRow[]>();
  for (const c of args.characters) {
    costumesByCharacterId.set(c.id, await listCostumeStates(c.id));
  }
  const charById = new Map(args.characters.map((c) => [c.id, c]));
  const locById = new Map(args.locations.map((l) => [l.id, l]));

  // 参照画像の事前ダウンロード（1 エピソードに 1 回のみ）
  console.log(`[orchestrator] reference images preload...`);
  const styleSheetPath = await preloadStyleSheet({
    workId: args.workId,
    scratchDir,
  });
  const characterRefPaths = await preloadCharacterRefs({
    characters: args.characters,
    scratchDir,
  });
  console.log(
    `[orchestrator] refs ready: style_sheet=${styleSheetPath ? "OK" : "missing"} characters=${characterRefPaths.size}/${args.characters.length}`
  );

  const existingPanels = await listEpisodePanels(args.episodeId);
  const existingByIdx = new Map(existingPanels.map((p) => [p.panel_idx, p]));

  await updateMangaEpisodeStatus(args.episodeId, "generating");

  const tasks = args.shotlist.panels.map((entry) => async () => {
    return runOnePanel({
      workId: args.workId,
      episodeId: args.episodeId,
      entry,
      charById,
      locById,
      costumesByCharacterId,
      artStyle: args.artStyle,
      scratchDir,
      imageTimeoutMs,
      existingPanel: existingByIdx.get(entry.idx) ?? null,
      skipExisting: args.skipExisting ?? false,
      styleSheetPath: styleSheetPath ?? undefined,
      characterRefPaths,
    });
  });

  const results: PanelGenerationResult[] = [];
  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency);
    const settled = await Promise.allSettled(batch.map((t) => t()));
    for (const r of settled) {
      if (r.status === "fulfilled") results.push(r.value);
      else {
        results.push({
          panelIdx: -1,
          panel: {} as MangaPanelRow,
          status: "failed",
          assetId: null,
          cdnUrl: null,
          durationMs: 0,
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        });
      }
    }
    console.log(
      `[orchestrator] batch ${Math.floor(i / concurrency) + 1}/${Math.ceil(tasks.length / concurrency)} 完了 (累計 ${results.length}/${tasks.length})`
    );
  }

  return results;
}

async function runOnePanel(args: {
  workId: string;
  episodeId: string;
  entry: ShotlistPanelEntry;
  charById: Map<string, CharacterBibleRow>;
  locById: Map<string, LocationBibleRow>;
  costumesByCharacterId: Map<string, CostumeStateRow[]>;
  artStyle: ArtStyle;
  scratchDir: string;
  imageTimeoutMs: number;
  existingPanel: MangaPanelRow | null;
  skipExisting: boolean;
  styleSheetPath?: string;
  characterRefPaths: Map<string, string[]>;
}): Promise<PanelGenerationResult> {
  const startedAt = Date.now();

  try {
    let panelRow: MangaPanelRow;
    if (args.existingPanel) {
      panelRow = args.existingPanel;
      if (args.skipExisting && panelRow.current_asset_id !== null) {
        return {
          panelIdx: args.entry.idx,
          panel: panelRow,
          status: "skipped",
          assetId: panelRow.current_asset_id,
          cdnUrl: null,
          durationMs: Date.now() - startedAt,
        };
      }
    } else {
      const size = selectSizeFromAspect(args.entry.aspect);
      panelRow = await createMangaPanel({
        episode_id: args.episodeId,
        panel_idx: args.entry.idx,
        role: args.entry.role,
        aspect: args.entry.aspect,
        width_px: size.width,
        height_px: size.height,
        scene_id: args.entry.scene_id,
        location_id: args.entry.location ?? undefined,
        camera: args.entry.camera ?? undefined,
        emotion_tag: args.entry.emotion ?? undefined,
        narrative_function: args.entry.narrative_function ?? undefined,
        panel_purpose: args.entry.purpose ?? undefined,
      });

      for (const charId of args.entry.characters) {
        try {
          await addPanelCharacter({
            panel_id: panelRow.id,
            character_id: charId,
            spatial_position: args.entry.character_positions?.[charId],
            emotion: args.entry.emotion,
          });
        } catch (e) {
          console.warn(
            `[orchestrator] panel ${args.entry.idx} addPanelCharacter failed: ${(e as Error).message}`
          );
        }
      }

      const dialogueList = args.entry.dialogue ?? [];
      type PlacerIn = {
        speaker_id: string | null;
        text: string;
        bubble_type: import("../types").BubbleType;
        reading_order: number;
        speaker_position?: import("../types").PanelSpatialPosition;
      };
      const placerInputs: PlacerIn[] = dialogueList.map((d, i) => ({
        speaker_id: d.speaker_id,
        text: d.text,
        bubble_type: d.bubble_type ?? "normal",
        reading_order: i + 1,
        speaker_position: args.entry.character_positions?.[d.speaker_id],
      }));
      if (args.entry.narration) {
        placerInputs.push({
          speaker_id: null,
          text: args.entry.narration,
          bubble_type: "narration",
          reading_order: placerInputs.length + 1,
          speaker_position: undefined,
        });
      }

      const placed = placeBubbles({
        panelWidth: panelRow.width_px,
        panelHeight: panelRow.height_px,
        dialogues: placerInputs,
      });

      for (let i = 0; i < placed.length; i++) {
        const p = placed[i];
        const isNarration = p.bubble_type === "narration";
        const speakerId =
          !isNarration && i < dialogueList.length
            ? dialogueList[i].speaker_id
            : undefined;
        try {
          await createBubble({
            panel_id: panelRow.id,
            bubble_idx: i + 1,
            speaker_id: speakerId,
            text: p.text,
            bubble_type: p.bubble_type,
            position: p.position,
            reading_order: p.reading_order,
          });
        } catch (e) {
          console.warn(
            `[orchestrator] panel ${args.entry.idx} createBubble failed: ${(e as Error).message}`
          );
        }
      }
    }

    const charactersInPanel = args.entry.characters
      .map((id) => args.charById.get(id))
      .filter((c): c is CharacterBibleRow => !!c);
    const location = args.entry.location
      ? (args.locById.get(args.entry.location) ?? null)
      : null;

    const composed = composePanelPrompt({
      panel: args.entry,
      characters: charactersInPanel,
      costumesByCharacterId: args.costumesByCharacterId,
      location,
      artStyle: args.artStyle,
      styleSheetPath: args.styleSheetPath,
      characterRefPaths: args.characterRefPaths,
    });

    const localPath = path.join(
      args.scratchDir,
      `panel_${String(args.entry.idx).padStart(3, "0")}.png`
    );

    const generated = await generateMangaImage({
      prompt: composed.prompt,
      outputPath: localPath,
      size: composed.size,
      referenceImagePaths: composed.referenceImagePaths,
      timeoutMs: args.imageTimeoutMs,
      maxRetries: 1,
    });

    const persisted = await persistPanelAsset({
      workId: args.workId,
      episodeId: args.episodeId,
      panelId: panelRow.id,
      panelIdx: args.entry.idx,
      localPngPath: generated.outputPath,
      prompt: composed.prompt,
      seed: null,
      modelUsed: "gpt-image-1.5",
      generationMetadata: {
        provider: "openai",
        latency_ms: generated.totalDurationMs,
        reference_image_ids: composed.referenceImagePaths,
      },
      visibility: "internal",
    });

    await setPanelCurrentAsset(panelRow.id, persisted.asset.id);

    return {
      panelIdx: args.entry.idx,
      panel: panelRow,
      status: persisted.reused ? "reused" : "generated",
      assetId: persisted.asset.id,
      cdnUrl: persisted.asset.cdn_url,
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[orchestrator] panel ${args.entry.idx} 失敗: ${msg}`);
    return {
      panelIdx: args.entry.idx,
      panel: args.existingPanel ?? ({} as MangaPanelRow),
      status: "failed",
      assetId: null,
      cdnUrl: null,
      durationMs: Date.now() - startedAt,
      error: msg,
    };
  }
}

function selectSizeFromAspect(aspect: ShotlistPanelEntry["aspect"]): {
  width: number;
  height: number;
} {
  switch (aspect) {
    case "vertical":
      return { width: 1024, height: 1536 };
    case "big":
      return { width: 1024, height: 1536 };
    case "splash":
      return { width: 1024, height: 1536 };
    case "square":
      return { width: 1024, height: 1024 };
    default:
      return { width: 1024, height: 1536 };
  }
}

