/**
 * 品質改善 view 用 endpoint (Phase Y WY-7 最小実装)
 *
 * 設計根拠:
 *   - Plan: /Users/hikarumori/.claude/plans/groovy-wishing-castle.md WY-7 商品ページOS
 *   - ユーザー要望: 「こういう修正を Console でできるようにならない?」
 *
 * 提供:
 *   GET /api/works/{slug}/episodes/ep{NN}/improvements
 *     → episode の audit findings + _opening_alts + _cliffhanger_alts + 編集判断カードDB シードを返す
 *
 * 動線:
 *   1. Console「品質改善」view からこの endpoint を読み出して状態表示
 *   2. ユーザーが「opening hook 提案を生成」ボタン → /api/jobs に L04_1 投入 (既存 jobs handler 経由)
 *   3. ユーザーが「cliffhanger 提案を生成」ボタン → /api/jobs に L04_9 投入
 *   4. ジョブ完了後、再度この endpoint を読み出して proposals 表示
 *
 * 採用判定:
 *   現状は L04_1 / L04_9 の --apply-recommendation フラグで自動採用のみ。
 *   個別 panel の採用 UI は Phase Y 後半 or Phase Z で本格実装。
 */

import type http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  episodeDir,
  nameAuditPath,
  volumeDir,
} from "../../../../../../scripts/manga/layers/_paths";
import { isValidSlug, isValidEpisode } from "../lib/path-guards";

/**
 * リポジトリルート (cwd 非依存) を解決。
 * このファイルは src/lib/manga/ops-console/server/handlers/ にあるので
 * 6段上が repo root。
 */
const REPO_ROOT = path.resolve(__dirname, "../../../../../..");
const EDITORIAL_CARDS_DIR = path.join(REPO_ROOT, "data/manga/editorial-cards");

function send(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readJsonOrNull<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf-8")) as T;
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw e;
  }
}

async function listFilesInDir(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    throw e;
  }
}

type AuditReport = {
  schema_version?: number;
  pages_total?: number;
  findings?: Array<{
    page_no: number;
    panel_id?: string;
    panel_no?: number;
    rule: string;
    severity: string;
    message: string;
  }>;
  counts_by_rule?: Record<string, number>;
  counts_by_severity?: Record<string, number>;
};

export type ImprovementsResponse = {
  slug: string;
  episode: number;
  /** L11 audit (機械検査) があれば概要 */
  audit_summary: {
    pages_total: number;
    findings_total: number;
    counts_by_rule: Record<string, number>;
    counts_by_severity: Record<string, number>;
    findings_top10: Array<{
      page_no: number;
      panel_no?: number;
      rule: string;
      severity: string;
      message: string;
    }>;
  } | null;
  /** Phase X audit-rules (audit-rules.ts) の最新 findings (name_audit.json から) */
  name_audit_summary: {
    pages_total: number;
    findings_total: number;
    counts_by_rule: Record<string, number>;
    counts_by_severity: Record<string, number>;
    new_rules_findings: Array<{
      page_no: number;
      panel_no?: number;
      rule: string;
      severity: string;
      message: string;
    }>;
  } | null;
  /** L4.1 Opening Hook proposals */
  opening_hook_proposals: {
    available: boolean;
    latest_file?: string;
    proposals_count?: number;
    candidate_patterns?: string[];
    recommendation?: { pattern_id: string; rationale: string };
  };
  /** L4.9 Cliffhanger proposals */
  cliffhanger_proposals: {
    available: boolean;
    latest_file?: string;
    proposals_count?: number;
    candidate_patterns?: string[];
    recommendation?: { pattern_id: string; rationale: string };
    pull_link?: {
      current_episode_cliff: string;
      next_opening_hook_hint: string;
      is_volume_end: boolean;
    };
  };
  /** Phase Y WY-4: L5.5 Engagement LLM Audit (engagement_audit.json) */
  engagement_audit: {
    available: boolean;
    overall_drop_off_risk?: number;
    boring_pages?: number[];
    worst_page?: { page_no: number; drop_off_risk: number; reason: string } | null;
    human_review_required?: boolean;
    rationale_summary?: string;
    generated_at?: string;
  };
  /** 編集判断カードDB の関連カード一覧 */
  related_cards: Array<{
    card_id: string;
    title: string;
    scope: string;
    trigger: { layer?: string; flag?: string };
    diagnosis: string;
  }>;
  /** 提案生成のための起動コマンド (UI から jobs に投入する form ヒント) */
  next_actions: Array<{
    label: string;
    job_layer: string;
    job_flags: Record<string, string | true>;
    description: string;
  }>;
};

const NEW_AUDIT_RULES = [
  "narration_dominant",
  "face_only_emotion_run",
  "mascot_temperature_pair_missing",
  "recovery_beat_missing",
  "expectation_reality_gap_absent",
];

/**
 * volume plot (volumes/v01/plot.json) から当該 episode の volume_position を推定。
 * Codex レビュー mid 指摘対応: 固定 10話前提を撤回し、実 plot.episodes 配列から算出。
 * plot 不在時は安全なデフォルト ("mid") を返す。
 */
async function estimateVolumePosition(
  slug: string,
  episode: number,
): Promise<"early" | "mid" | "late" | "volume_end"> {
  // 当面 vol_01 のみ対応 (Phase Y では1巻10話想定)。複数巻対応は将来の課題
  const plotPath = path.join(volumeDir(slug, 1), "plot.json");
  const plot = await readJsonOrNull<{
    episodes?: Array<{ episode_no: number }>;
  }>(plotPath);
  if (!plot || !plot.episodes || plot.episodes.length === 0) {
    // plot 不在時はフォールバック: 1-3=early, 4-7=mid, 8-9=late, 10+=volume_end
    if (episode <= 3) return "early";
    if (episode <= 7) return "mid";
    if (episode <= 9) return "late";
    return "volume_end";
  }
  const totalEps = plot.episodes.length;
  const lastEpNo = plot.episodes[plot.episodes.length - 1].episode_no;
  if (episode === lastEpNo) return "volume_end";
  // 比率で推定 (任意の話数構成に対応)
  const ratio = (episode - 1) / Math.max(1, totalEps - 1);
  if (ratio < 0.33) return "early";
  if (ratio < 0.66) return "mid";
  return "late";
}

export async function handleImprovementsGet(
  res: http.ServerResponse,
  slug: string,
  episode: number,
): Promise<void> {
  if (!isValidSlug(slug)) return send(res, 400, { error: "invalid slug" });
  if (!isValidEpisode(episode)) return send(res, 400, { error: "invalid episode" });

  try {
    const epDir = episodeDir(slug, episode);

    // L11 audit (audit.json)
    const auditPath = path.join(epDir, "audit.json");
    const audit = await readJsonOrNull<AuditReport>(auditPath);
    const auditSummary = audit
      ? {
          pages_total: audit.pages_total ?? 0,
          findings_total: audit.findings?.length ?? 0,
          counts_by_rule: audit.counts_by_rule ?? {},
          counts_by_severity: audit.counts_by_severity ?? {},
          findings_top10: (audit.findings ?? []).slice(0, 10).map((f) => ({
            page_no: f.page_no,
            panel_no: f.panel_no,
            rule: f.rule,
            severity: f.severity,
            message: f.message,
          })),
        }
      : null;

    // Phase X audit-rules (name_audit.json) — L8.5 で書き出されている (実体は name/name_audit.json)
    const nameAudit = await readJsonOrNull<AuditReport>(nameAuditPath(slug, episode));
    const nameAuditSummary = nameAudit
      ? {
          pages_total: nameAudit.pages_total ?? 0,
          findings_total: nameAudit.findings?.length ?? 0,
          counts_by_rule: nameAudit.counts_by_rule ?? {},
          counts_by_severity: nameAudit.counts_by_severity ?? {},
          new_rules_findings: (nameAudit.findings ?? [])
            .filter((f) => NEW_AUDIT_RULES.includes(f.rule))
            .map((f) => ({
              page_no: f.page_no,
              panel_no: f.panel_no,
              rule: f.rule,
              severity: f.severity,
              message: f.message,
            })),
        }
      : null;

    // L4.1 Opening Hook proposals (_opening_alts/*.json)
    const openingAltsDir = path.join(epDir, "_opening_alts");
    const openingFiles = (await listFilesInDir(openingAltsDir))
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse();
    let openingProposals: ImprovementsResponse["opening_hook_proposals"] = { available: false };
    if (openingFiles.length > 0) {
      const latest = await readJsonOrNull<{
        proposals?: Array<{ pattern_id: string }>;
        candidate_patterns?: string[];
        recommendation?: { pattern_id: string; rationale: string };
      }>(path.join(openingAltsDir, openingFiles[0]));
      if (latest) {
        openingProposals = {
          available: true,
          latest_file: openingFiles[0],
          proposals_count: latest.proposals?.length ?? 0,
          candidate_patterns: latest.candidate_patterns,
          recommendation: latest.recommendation,
        };
      }
    }

    // L4.9 Cliffhanger proposals (_cliffhanger_alts/*.json)
    const cliffAltsDir = path.join(epDir, "_cliffhanger_alts");
    const cliffFiles = (await listFilesInDir(cliffAltsDir))
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse();
    let cliffProposals: ImprovementsResponse["cliffhanger_proposals"] = { available: false };
    if (cliffFiles.length > 0) {
      const latest = await readJsonOrNull<{
        proposals?: Array<{
          pattern_id: string;
          pull_link?: {
            current_episode_cliff: string;
            next_opening_hook_hint: string;
            is_volume_end: boolean;
          };
        }>;
        candidate_patterns?: string[];
        recommendation?: { pattern_id: string; rationale: string };
      }>(path.join(cliffAltsDir, cliffFiles[0]));
      if (latest) {
        const recommended = latest.proposals?.find(
          (p) => p.pattern_id === latest.recommendation?.pattern_id,
        );
        cliffProposals = {
          available: true,
          latest_file: cliffFiles[0],
          proposals_count: latest.proposals?.length ?? 0,
          candidate_patterns: latest.candidate_patterns,
          recommendation: latest.recommendation,
          pull_link: recommended?.pull_link,
        };
      }
    }

    // Phase Y WY-4: engagement_audit.json
    const engagementPath = path.join(epDir, "engagement_audit.json");
    const engagement = await readJsonOrNull<{
      overall_drop_off_risk: number;
      boring_pages: number[];
      worst_page: { page_no: number; drop_off_risk: number; reason: string } | null;
      human_review_required: boolean;
      rationale_summary: string;
      generated_at: string;
    }>(engagementPath);
    const engagementSummary: ImprovementsResponse["engagement_audit"] = engagement
      ? {
          available: true,
          overall_drop_off_risk: engagement.overall_drop_off_risk,
          boring_pages: engagement.boring_pages,
          worst_page: engagement.worst_page,
          human_review_required: engagement.human_review_required,
          rationale_summary: engagement.rationale_summary,
          generated_at: engagement.generated_at,
        }
      : { available: false };

    // 編集判断カードDB シード一覧 (REPO_ROOT 基準で cwd 非依存)
    const cardFiles = (await listFilesInDir(EDITORIAL_CARDS_DIR)).filter(
      (f) => f.startsWith("EC-") && f.endsWith(".json"),
    );
    const relatedCards: ImprovementsResponse["related_cards"] = [];
    for (const cf of cardFiles.slice(0, 20)) {
      const card = await readJsonOrNull<{
        card_id: string;
        title: string;
        scope: string;
        trigger?: { layer?: string; flag?: string };
        diagnosis: string;
      }>(path.join(EDITORIAL_CARDS_DIR, cf));
      if (!card) continue;
      relatedCards.push({
        card_id: card.card_id,
        title: card.title,
        scope: card.scope,
        trigger: { layer: card.trigger?.layer, flag: card.trigger?.flag },
        diagnosis: card.diagnosis,
      });
    }

    // volume_position 推定: volumes/v01/plot.json (volume plot) から episodes 数を取得
    // 巻末判定: 当該 episode が plot.episodes の最後 (= 巻最終話)
    const volumePosition = await estimateVolumePosition(slug, episode);

    // next_actions: UI から起動可能なジョブ一覧 (form ヒント)
    const nextActions: ImprovementsResponse["next_actions"] = [
      {
        label: "Opening Hook 提案を生成 (3案)",
        job_layer: "L04_1",
        job_flags: { "--max-proposals": "3" },
        description: "pages[0..2] を掴みパターン辞書に従って再生成 (data/generation/opening-hook-patterns.json 参照)",
      },
      {
        label: "Cliffhanger 提案を生成 (3案)",
        job_layer: "L04_9",
        job_flags: {
          "--max-proposals": "3",
          "--volume-position": volumePosition,
        },
        description: `last_page を引きパターン辞書に従って再設計 + pull_link 注入 (volume_position=${volumePosition})`,
      },
      {
        label: "Opening Hook 推奨案を直接適用",
        job_layer: "L04_1",
        job_flags: { "--max-proposals": "1", "--apply-recommendation": true },
        description: "推奨案で storyboard.json を直接更新 (バックアップ自動)",
      },
      {
        label: "Cliffhanger 推奨案を直接適用",
        job_layer: "L04_9",
        job_flags: {
          "--max-proposals": "1",
          "--apply-recommendation": true,
          "--volume-position": volumePosition,
        },
        description: `推奨案で last_page を直接更新 + pull_link 書き込み (volume_position=${volumePosition})`,
      },
      {
        label: "Engagement Audit を実行 (LLM)",
        job_layer: "L05_5",
        job_flags: {},
        description: "storyboard 全 page を claude opus で「読者離脱リスク」採点 + 退屈page検出 + キャラ好感度推移 (12-20分)",
      },
    ];

    const response: ImprovementsResponse = {
      slug,
      episode,
      audit_summary: auditSummary,
      name_audit_summary: nameAuditSummary,
      opening_hook_proposals: openingProposals,
      cliffhanger_proposals: cliffProposals,
      engagement_audit: engagementSummary,
      related_cards: relatedCards,
      next_actions: nextActions,
    };

    return send(res, 200, response);
  } catch (e: unknown) {
    return send(res, 500, { error: (e as Error).message });
  }
}
