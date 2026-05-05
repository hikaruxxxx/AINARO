/**
 * KDP 入稿台帳 (kdp-release.json) 管理
 *
 * 設計根拠: B-1 計画 Track A1-1 / Track D1
 *   - Codex レビューで指摘された最重要追加項目
 *   - LLM 進化と無関係に資産化される入稿オペレーション台帳
 *   - アカウント停止時の弁明 / EXIT 監査 / 税務記録 の三役を兼ねる
 *
 * 永続先: data/manga/works/{slug}/volumes/v{NN}/kdp/kdp-release.json
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  KdpRelease,
  KdpReleaseStatus,
  KdpReleasePreviewLog,
  KdpReleaseEditHistoryEntry,
  KdpReleaseInputs,
  AiDisclosureFlags,
} from "../../schemas-v2";
import {
  DEFAULT_AI_DISCLOSURE_FLAGS,
  DEFAULT_AI_TOOLS_USED,
} from "../../disclosure";

export function kdpReleasePath(slug: string, volume: number, kdpDir: string): string {
  return path.join(kdpDir, "kdp-release.json");
}

export type ReleaseInitArgs = {
  slug: string;
  volumeNo: number;
  manuscriptPdfPath: string;
  coverPdfPath: string;
  /** タイトル等が決まっていれば渡す。後から update でも良い */
  inputs?: Partial<KdpReleaseInputs>;
  aiDisclosure?: AiDisclosureFlags;
  aiToolsUsed?: string[];
  humanReviewPerformed?: boolean;
};

export function makeInitialRelease(args: ReleaseInitArgs): KdpRelease {
  const now = new Date().toISOString();
  return {
    schema_version: 1,
    slug: args.slug,
    volume_no: args.volumeNo,
    status: "draft",
    manuscript_pdf_path: args.manuscriptPdfPath,
    cover_pdf_path: args.coverPdfPath,
    ai_disclosure: args.aiDisclosure ?? { ...DEFAULT_AI_DISCLOSURE_FLAGS },
    ai_tools_used: args.aiToolsUsed ?? [...DEFAULT_AI_TOOLS_USED],
    human_review_performed: args.humanReviewPerformed ?? true,
    rights_check: {
      trademark_passed: false,
      ip_similarity_passed: false,
      checked_at: now,
      notes: "未チェック (preflight 前)",
    },
    kdp_inputs: {
      title: args.inputs?.title ?? "",
      subtitle: args.inputs?.subtitle,
      description_html: args.inputs?.description_html ?? "",
      keywords: args.inputs?.keywords ?? [],
      categories: args.inputs?.categories ?? [],
      isbn: args.inputs?.isbn,
      asin: args.inputs?.asin,
    },
    pricing: {
      price_jpy: 0,
      ku_enrolled: true,
      royalty_plan: "70",
    },
    schedule: {},
    preview_log: [],
    edit_history: [
      {
        timestamp: now,
        field: "_init",
        old: null,
        new: "draft",
        reason: "release ledger 初期化",
      },
    ],
  };
}

/** 既存の kdp-release.json を読む。無ければ null。 */
export async function loadRelease(filePath: string): Promise<KdpRelease | null> {
  try {
    const buf = await fs.readFile(filePath, "utf-8");
    return JSON.parse(buf) as KdpRelease;
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw e;
  }
}

export async function saveRelease(filePath: string, release: KdpRelease): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(release, null, 2));
}

/**
 * 既存ファイルがあれば読み、無ければ初期化して保存する。
 * 既存があっても manuscript/cover パスだけは最新で上書きする (regenerate に追従)。
 */
export async function ensureRelease(
  filePath: string,
  args: ReleaseInitArgs,
): Promise<KdpRelease> {
  const existing = await loadRelease(filePath);
  if (existing) {
    const updates: Partial<KdpRelease> = {};
    if (existing.manuscript_pdf_path !== args.manuscriptPdfPath) {
      updates.manuscript_pdf_path = args.manuscriptPdfPath;
    }
    if (existing.cover_pdf_path !== args.coverPdfPath) {
      updates.cover_pdf_path = args.coverPdfPath;
    }
    if (Object.keys(updates).length > 0) {
      const updated = applyUpdates(existing, updates, "L13 regenerate (PDFパス更新)");
      await saveRelease(filePath, updated);
      return updated;
    }
    return existing;
  }
  const fresh = makeInitialRelease(args);
  await saveRelease(filePath, fresh);
  return fresh;
}

/**
 * 任意のフィールドを更新し edit_history に追記する。
 * 直接 release オブジェクトを書き換えず、新しいオブジェクトを返す。
 */
export function applyUpdates(
  release: KdpRelease,
  updates: Partial<KdpRelease>,
  reason?: string,
): KdpRelease {
  const now = new Date().toISOString();
  const history: KdpReleaseEditHistoryEntry[] = [...release.edit_history];
  const next: KdpRelease = { ...release };

  for (const [key, newVal] of Object.entries(updates)) {
    const oldVal = (release as unknown as Record<string, unknown>)[key];
    if (JSON.stringify(oldVal) === JSON.stringify(newVal)) continue;
    history.push({
      timestamp: now,
      field: key,
      old: oldVal,
      new: newVal,
      reason,
    });
    (next as unknown as Record<string, unknown>)[key] = newVal as unknown;
  }
  next.edit_history = history;
  return next;
}

export function setStatus(
  release: KdpRelease,
  status: KdpReleaseStatus,
  reason?: string,
): KdpRelease {
  if (release.status === status) return release;
  return applyUpdates(release, { status }, reason ?? `status -> ${status}`);
}

export function appendPreviewLog(
  release: KdpRelease,
  entry: KdpReleasePreviewLog,
): KdpRelease {
  return applyUpdates(
    release,
    { preview_log: [...release.preview_log, entry] },
    "KDPプレビューワ指摘を追記",
  );
}
