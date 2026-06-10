/**
 * Trademark / IP 類似チェックの人間判定 endpoint。
 *
 * 設計根拠:
 *   - Plan: /Users/hikarumori/.claude/plans/groovy-wishing-castle.md WX-5 + Console 必須拡張
 *   - docs/strategy/kdp_account_safety.md §3 商標 / IP 類似チェック
 *
 * 提供する API:
 *   GET  /api/works/{slug}/volumes/{vol}/trademark-check
 *     → buildTrademarkSearches() で生成した検索URL一覧 + 既存 rights_check 状態
 *
 *   POST /api/works/{slug}/volumes/{vol}/trademark-check
 *     body: { trademarkPassed, ipSimilarityPassed, flaggedKeywords?, notes? }
 *     → applyHumanReview() で kdp-release.json の rights_check を更新
 *
 * Phase X (本実装): 人間判定支援 (URL一覧表示 + 判定ボタン + 永続化)
 * Phase Z 改善予定: 自動 fetch (J-PlatPat / USPTO TESS)
 */

import type http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  bibleDir,
  kdpDir,
  workMetaPath,
} from "../../../../../../scripts/manga/layers/_paths";
import {
  loadRelease,
  saveRelease,
  applyUpdates,
} from "../../../publish-v2/kdp/release-ledger";
import {
  applyHumanReview,
  buildTrademarkSearches,
  type TrademarkCheckMetaInput,
  type TrademarkSearchTarget,
} from "../../../publish-v2/kdp/trademark-check";
import type { KdpMetadata } from "../../../schemas-v2";
import { isValidSlug } from "../lib/path-guards";

// ===== ファイル読込 helper =====

async function readJsonOrNull<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf-8")) as T;
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw e;
  }
}

type WorkMeta = {
  slug: string;
  title?: string;
  kdp_metadata?: Partial<KdpMetadata> & { title_candidates?: string[] };
  [k: string]: unknown;
};

type BibleSnapshotMinimal = {
  meta?: { title?: string; title_short?: string };
  characters?: Array<{ id: string; name: string; role?: string }>;
};

/**
 * KDP メタとバイブルから商標チェック対象を抽出する。
 * - title: meta.title or kdp_metadata.title
 * - subtitle: kdp_metadata.subtitle (任意)
 * - characters: bible.characters のうち role が "protagonist" / "heroine" / "main" 系
 * - label: data/manga/kdp/phase-a-pen-names.json の label.name (将来的にここから取得、今は固定値 fallback)
 */
async function buildKdpMetaForCheck(slug: string, volume: number): Promise<{
  metadata: TrademarkCheckMetaInput;
  characterNames: string[];
  labelName: string;
  seriesTitle?: string;
}> {
  const workMeta = (await readJsonOrNull<WorkMeta>(workMetaPath(slug))) ?? { slug };
  const releasePath = path.join(kdpDir(slug, volume), "kdp-release.json");
  const release = await loadRelease(releasePath);

  const bibleSnapshotPath = path.join(bibleDir(slug), "snapshot.json");
  const bible = await readJsonOrNull<BibleSnapshotMinimal>(bibleSnapshotPath);

  // 空文字も fallback 対象にする (Codex レビュー指摘 mid: trim 後に空ならスキップ)
  const pickNonEmpty = (...candidates: Array<string | undefined>): string | undefined => {
    for (const c of candidates) {
      if (typeof c === "string" && c.trim().length > 0) return c.trim();
    }
    return undefined;
  };
  const title =
    pickNonEmpty(
      release?.kdp_inputs?.title,
      workMeta.kdp_metadata?.title_candidates?.[0],
      workMeta.title,
      bible?.meta?.title,
    ) ?? slug;

  const subtitle = pickNonEmpty(release?.kdp_inputs?.subtitle) ?? "";

  const metadata: TrademarkCheckMetaInput = { title, subtitle };

  // 主要キャラ (主人公・ヒロイン格) を抽出
  const characterNames = (bible?.characters ?? [])
    .filter((c) => {
      const role = (c.role ?? "").toLowerCase();
      return (
        role.includes("protagonist") ||
        role.includes("hero") ||
        role.includes("main") ||
        role.includes("主人公") ||
        role.includes("ヒロイン")
      );
    })
    .map((c) => c.name)
    .filter((n) => n && n.trim().length > 0);

  // label name は Phase A 確定値「Novelis」(将来は data/manga/kdp/phase-a-pen-names.json から)
  const labelName = "Novelis";

  // シリーズタイトルは workMeta 側に格納されているケースがある (現状は title と同一が多い)
  const seriesTitle =
    (workMeta.kdp_metadata as { series_name_canonical?: string } | undefined)
      ?.series_name_canonical ?? undefined;

  return {
    metadata,
    characterNames,
    labelName,
    seriesTitle,
  };
}

function send(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

// ===== GET handler =====

export async function handleTrademarkCheckGet(
  res: http.ServerResponse,
  slug: string,
  volume: number,
): Promise<void> {
  if (!isValidSlug(slug)) return send(res, 400, { error: "invalid slug" });
  if (!Number.isInteger(volume) || volume < 0)
    return send(res, 400, { error: "invalid volume" });

  try {
    const { metadata, characterNames, labelName, seriesTitle } =
      await buildKdpMetaForCheck(slug, volume);
    const searches = buildTrademarkSearches(
      metadata,
      characterNames,
      labelName,
      seriesTitle,
    );

    const releasePath = path.join(kdpDir(slug, volume), "kdp-release.json");
    const release = await loadRelease(releasePath);
    const existingRightsCheck = release?.rights_check ?? null;

    return send(res, 200, {
      slug,
      volume,
      checkResult: searches,
      currentRightsCheck: existingRightsCheck,
      releaseExists: release !== null,
    });
  } catch (e: unknown) {
    return send(res, 500, { error: (e as Error).message });
  }
}

// ===== POST handler =====

type SaveRequest = {
  trademarkPassed: boolean;
  ipSimilarityPassed: boolean;
  flaggedKeywords?: TrademarkSearchTarget[];
  notes?: string;
};

export async function handleTrademarkCheckPost(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  body: SaveRequest,
  slug: string,
  volume: number,
): Promise<void> {
  if (!isValidSlug(slug)) return send(res, 400, { error: "invalid slug" });
  if (!Number.isInteger(volume) || volume < 0)
    return send(res, 400, { error: "invalid volume" });
  if (typeof body?.trademarkPassed !== "boolean")
    return send(res, 400, { error: "trademarkPassed (boolean) required" });
  if (typeof body?.ipSimilarityPassed !== "boolean")
    return send(res, 400, { error: "ipSimilarityPassed (boolean) required" });

  try {
    const releasePath = path.join(kdpDir(slug, volume), "kdp-release.json");
    const release = await loadRelease(releasePath);
    if (!release) {
      return send(res, 404, {
        error: `kdp-release.json が見つかりません。L13 を一度実行してから再試行してください: ${releasePath}`,
      });
    }

    const { metadata, characterNames, labelName, seriesTitle } =
      await buildKdpMetaForCheck(slug, volume);
    const searches = buildTrademarkSearches(
      metadata,
      characterNames,
      labelName,
      seriesTitle,
    );

    const newRightsCheck = applyHumanReview(
      searches,
      {
        trademarkPassed: body.trademarkPassed,
        ipSimilarityPassed: body.ipSimilarityPassed,
        flaggedTargets: body.flaggedKeywords,
      },
      body.notes,
    );

    const updated = applyUpdates(
      release,
      { rights_check: newRightsCheck },
      `Console: trademark 人間判定 (${body.trademarkPassed && body.ipSimilarityPassed ? "passed" : "flagged"})`,
    );
    await saveRelease(releasePath, updated);

    return send(res, 200, {
      ok: true,
      rights_check: updated.rights_check,
      message: `rights_check を更新しました (${body.trademarkPassed && body.ipSimilarityPassed ? "passed" : "flagged"})`,
    });
  } catch (e: unknown) {
    return send(res, 500, { error: (e as Error).message });
  }
}
