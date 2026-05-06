/**
 * GET/POST /api/adopted-versions ハンドラ (旧 serve-revision.ts:handleAdoptedGet/Post)
 *
 * scope 確定は呼び出し側の責務。
 * Phase D 採用版選択。render layer 限定。
 * panel-level は page_${N} のみ許可 (Phase E の page composer 後に解禁予定)。
 */
import type http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  storyboardPath,
  renderManifestPath,
  adoptedVersionsPath,
} from "../../../../../../scripts/manga/layers/_paths";
import { readJsonl } from "../../../revision-ui/manifest";
import {
  emptyAdoptedVersions,
  type AdoptedPanelChoice,
  type AdoptedVersions,
  type RenderManifestEntry,
} from "../../../revision-ui/types";
import type { EpisodeStoryboardV2 } from "../../../schemas-v2";
import { withFileLock } from "../lib/lock";
import { isPageLevelPanelId, isSafeImagePath } from "../lib/path-guards";

async function loadJsonOpt<T>(p: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(p, "utf-8")) as T;
  } catch {
    return null;
  }
}

async function loadAdopted(
  slug: string,
  episode: number,
  episodeId: string
): Promise<AdoptedVersions> {
  const x = await loadJsonOpt<AdoptedVersions>(adoptedVersionsPath(slug, episode));
  return x ?? emptyAdoptedVersions(slug, episode, episodeId);
}

export async function handleAdoptedGet(
  slug: string,
  episode: number,
  res: http.ServerResponse
): Promise<void> {
  const sb = await loadJsonOpt<EpisodeStoryboardV2>(storyboardPath(slug, episode));
  const adopted = await loadAdopted(
    slug,
    episode,
    sb?.episode_id ?? `${slug}-ep${String(episode).padStart(2, "0")}`
  );
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(adopted));
}

export async function handleAdoptedPost(
  slug: string,
  episode: number,
  body: any,
  res: http.ServerResponse
): Promise<void> {
  const panel_id = String(body?.panel_id ?? "");
  const chosen_version = String(body?.chosen_version ?? "");
  const image_path = String(body?.image_path ?? "");
  const note = body?.note ? String(body.note).slice(0, 500) : undefined;
  if (!panel_id || !chosen_version || !image_path) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "missing fields" }));
    return;
  }
  // panel-level adopted は L13 が読まない (page_${N} のみ)。
  if (!isPageLevelPanelId(panel_id)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: `panel_id "${panel_id}" is not page-level. Only page_${"${N}"} keys are supported until Phase E (page composer).`,
      })
    );
    return;
  }
  if (!isSafeImagePath(image_path)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `invalid image_path: ${image_path}` }));
    return;
  }
  if (!/^v\d+$/.test(chosen_version)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `invalid chosen_version: ${chosen_version}` }));
    return;
  }
  // L13 は本文に render layer のページ画像を使う。他 layer の画像は弾く。
  if (!/^episodes\/ep\d+\/renders\/p\d+(_v\d+)?\.png$/.test(image_path)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: `image_path must be under episodes/epN/renders/ (got: ${image_path}). 他 layer の画像は KDP に採用できません`,
      })
    );
    return;
  }
  const manifest = await readJsonl<RenderManifestEntry>(renderManifestPath(slug, episode));
  const matched = manifest.find(
    (m) =>
      m.image_path === image_path &&
      m.panel_id === panel_id &&
      m.version === chosen_version &&
      m.layer === "render"
  );
  if (!matched) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: `no render-layer manifest entry matches (panel_id="${panel_id}", version="${chosen_version}", image_path="${image_path}")`,
      })
    );
    return;
  }
  const filePath = adoptedVersionsPath(slug, episode);
  const result = await withFileLock(`adopted#${slug}#${episode}`, async () => {
    const sb = await loadJsonOpt<EpisodeStoryboardV2>(storyboardPath(slug, episode));
    const adopted = await loadAdopted(
      slug,
      episode,
      sb?.episode_id ?? `${slug}-ep${String(episode).padStart(2, "0")}`
    );
    const choice: AdoptedPanelChoice = {
      chosen: chosen_version,
      image_path,
      chosen_at: new Date().toISOString(),
      note,
    };
    adopted.panels[panel_id] = choice;
    adopted.updated_at = new Date().toISOString();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(adopted, null, 2), "utf-8");
    return choice;
  });
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ ok: true, panel_id, choice: result }));
}
