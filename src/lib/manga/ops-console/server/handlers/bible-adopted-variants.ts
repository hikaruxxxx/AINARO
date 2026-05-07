/**
 * GET/POST /api/works/{slug}/bible/adopted-variants
 *
 * Phase A: bible variant 採用記録。character / location / prop の複数 variant から
 * 「どれを ref として使うか」を 1 file に集約する。
 *
 * - GET: 採用記録を返す。file 不存在時は空 schema を返す
 * - POST: 単一 asset の採用版を更新 (atomic write)
 *
 * scope 確定は呼び出し側 (router) の責務。
 */
import type http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  bibleAdoptedVariantsPath,
  workDir,
} from "../../../../../../scripts/manga/layers/_paths";
import {
  BIBLE_ADOPTED_KINDS,
  emptyBibleAdoptedVariants,
  isBibleAdoptedKind,
  type BibleAdoptedAssetKind,
  type BibleAdoptedVariants,
} from "../../../revision-ui/types";
import { withFileLock } from "../lib/lock";
import { isValidSlug } from "../lib/path-guards";

function send(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function loadAdopted(slug: string): Promise<BibleAdoptedVariants> {
  try {
    const raw = await fs.readFile(bibleAdoptedVariantsPath(slug), "utf-8");
    const parsed = JSON.parse(raw) as Partial<BibleAdoptedVariants>;
    return {
      schema_version: 1,
      slug,
      updated_at: parsed.updated_at ?? new Date(0).toISOString(),
      characters: parsed.characters ?? {},
      locations: parsed.locations ?? {},
      props: parsed.props ?? {},
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return emptyBibleAdoptedVariants(slug);
    throw error;
  }
}

async function writeAdopted(slug: string, value: BibleAdoptedVariants): Promise<void> {
  const targetPath = bibleAdoptedVariantsPath(slug);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const tmpPath = `${targetPath}.tmp.${process.pid}`;
  await fs.writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  await fs.rename(tmpPath, targetPath);
}

/**
 * image_relpath が「bible/refs/{kind}/{asset_id}/{file}.{ext}」形式かを境界で検証。
 * `..` や絶対パスを禁止し、kind / asset_id とも一致させる。
 */
function isSafeBibleRefPath(
  relpath: string,
  kind: BibleAdoptedAssetKind,
  asset_id: string
): boolean {
  if (typeof relpath !== "string" || relpath.length === 0 || relpath.length > 500) return false;
  if (relpath.includes("..") || relpath.startsWith("/") || relpath.includes("\\")) return false;
  // bible/refs/{kind}/{asset_id}/{anything}.png|jpg|webp
  const pattern = new RegExp(
    `^bible/refs/${kind}/${asset_id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/[^/]+\\.(png|jpg|jpeg|webp)$`,
    "i"
  );
  return pattern.test(relpath);
}

function isSafeAssetId(id: unknown): id is string {
  return typeof id === "string" && id.length > 0 && id.length <= 200 && /^[A-Za-z0-9_\-぀-ヿ一-鿿]+$/.test(id);
}

function isSafeVariantName(name: unknown): name is string {
  return typeof name === "string" && name.length > 0 && name.length <= 200 && /^[A-Za-z0-9_\-.]+$/.test(name);
}

export async function handleBibleAdoptedVariantsGet(
  slug: string,
  res: http.ServerResponse
): Promise<void> {
  if (!isValidSlug(slug)) return send(res, 400, { error: "作品 ID が不正です" });
  const adopted = await loadAdopted(slug);
  send(res, 200, adopted);
}

export async function handleBibleAdoptedVariantsPost(
  slug: string,
  body: unknown,
  res: http.ServerResponse
): Promise<void> {
  if (!isValidSlug(slug)) return send(res, 400, { error: "作品 ID が不正です" });
  if (!body || typeof body !== "object") return send(res, 400, { error: "body は object である必要があります" });

  const b = body as Record<string, unknown>;
  const asset_kind = b.asset_kind;
  const asset_id = b.asset_id;
  const variant = b.chosen_variant ?? b.variant;
  const image_relpath = b.image_relpath;
  const noteRaw = b.note;

  if (!isBibleAdoptedKind(asset_kind)) {
    return send(res, 400, { error: `asset_kind は ${BIBLE_ADOPTED_KINDS.join("/")} のいずれかです` });
  }
  if (!isSafeAssetId(asset_id)) {
    return send(res, 400, { error: "asset_id が不正です" });
  }
  if (!isSafeVariantName(variant)) {
    return send(res, 400, { error: "chosen_variant が不正です" });
  }
  if (typeof image_relpath !== "string" || !isSafeBibleRefPath(image_relpath, asset_kind, asset_id)) {
    return send(res, 400, { error: "image_relpath が不正です (bible/refs/{kind}/{asset_id}/{file}.png 形式)" });
  }
  // 念のため実ファイル存在を確認 (リネーム / 削除済 variant の混入を境界で防ぐ)
  try {
    await fs.access(path.join(workDir(slug), image_relpath));
  } catch {
    return send(res, 404, { error: `image_relpath が存在しません: ${image_relpath}` });
  }
  const note = typeof noteRaw === "string" ? noteRaw.slice(0, 500) : undefined;

  const updated = await withFileLock(bibleAdoptedVariantsPath(slug), async () => {
    const current = await loadAdopted(slug);
    current.characters = { ...current.characters };
    current.locations = { ...current.locations };
    current.props = { ...current.props };
    current[asset_kind][asset_id] = {
      chosen_variant: variant,
      image_relpath,
      chosen_at: new Date().toISOString(),
      note,
    };
    current.updated_at = new Date().toISOString();
    await writeAdopted(slug, current);
    return current;
  });

  send(res, 200, { ok: true, slug, asset_kind, asset_id, choice: updated[asset_kind][asset_id] });
}
