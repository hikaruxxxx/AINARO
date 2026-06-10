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
import {
  assessCompletionRisk,
  type CompletionRiskAssessment,
} from "../../../predict/completion-risk-v0";

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

/**
 * audit.json は 2 schema が混在している:
 *   (旧) findings[] + counts_by_rule/severity (Phase X 期)
 *   (新, L11 v2 が出力) panels_total/passed/failed + checks[{panel_id, check_kind, passed, detail}]
 * どちらでも読めるように両 field を optional にし、normalize でまとめる。
 */
type AuditReport = {
  schema_version?: number;
  // 旧 schema
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
  // 新 schema (L11 v2)
  panels_total?: number;
  panels_passed?: number;
  panels_failed?: number;
  checks?: Array<{
    panel_id: string;
    check_kind: string;
    passed: boolean;
    detail?: string;
  }>;
};

/** 旧 schema / 新 schema どちらでも統一形式に正規化する。 */
function normalizeAudit(raw: AuditReport | null): {
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
} | null {
  if (!raw) return null;
  // 新 schema (checks[]) → 旧 schema 形式に変換
  if (Array.isArray(raw.checks) && raw.checks.length > 0) {
    // severity 推定: "image missing" 系は L09 render 未実行が原因なのでパイプライン上の正常状態。
    //   → severity = "info" 扱い (error として焦らせない)
    // それ以外の regulation_violation や schema 違反は "error"
    const classify = (c: { check_kind: string; detail?: string }): "info" | "warn" | "error" => {
      const detail = c.detail ?? "";
      if (
        c.check_kind === "regulation_violation" &&
        /rendered page image missing|ENOENT.*renders\//i.test(detail)
      ) {
        return "info";
      }
      return "error";
    };

    const failed = raw.checks.filter((c) => !c.passed);
    const counts_by_rule: Record<string, number> = {};
    const counts_by_severity: Record<string, number> = { error: 0, warn: 0, info: 0 };
    for (const c of failed) {
      counts_by_rule[c.check_kind] = (counts_by_rule[c.check_kind] ?? 0) + 1;
      const sev = classify(c);
      counts_by_severity[sev] = (counts_by_severity[sev] ?? 0) + 1;
    }
    const findings_top10 = failed.slice(0, 10).map((c) => {
      // panel_id が "page_N" 形式なので page_no を抽出。それ以外は 0。
      const m = /^page[_-]?(\d+)$/i.exec(c.panel_id);
      const page_no = m ? Number(m[1]) : 0;
      return {
        page_no,
        rule: c.check_kind,
        severity: classify(c),
        message: c.detail ?? "(no detail)",
      };
    });
    return {
      pages_total: raw.panels_total ?? 0,
      findings_total: failed.length,
      counts_by_rule,
      counts_by_severity,
      findings_top10,
    };
  }
  // 旧 schema (findings[])
  return {
    pages_total: raw.pages_total ?? 0,
    findings_total: raw.findings?.length ?? 0,
    counts_by_rule: raw.counts_by_rule ?? {},
    counts_by_severity: raw.counts_by_severity ?? {},
    findings_top10: (raw.findings ?? []).slice(0, 10).map((f) => ({
      page_no: f.page_no,
      panel_no: f.panel_no,
      rule: f.rule,
      severity: f.severity,
      message: f.message,
    })),
  };
}

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
  /** Phase Y WY-5: KU 完読率リスク分類器 v0 (audit + engagement_audit から自動算出) */
  completion_risk: CompletionRiskAssessment | null;
  /** 編集判断カードDB の関連カード一覧 */
  related_cards: Array<{
    card_id: string;
    title: string;
    scope: string;
    trigger: { layer?: string; flag?: string };
    diagnosis: string;
    instruction: string;
  }>;
  /**
   * Phase Y WY-11: Engagement Audit の rationale から抽出した EC suggestion。
   * LLM が「EC-XXXX 型で再構成」と書いた場合の補助。
   *
   * Phase Y WY-14: 各 EC の trigger.flag から「専用 layer」を判定する。
   * opening_hook_no_focus → L04_1、cliffhanger_role_mismatch → L04_9 など。
   * UI は recommended_layer があれば「L04_1 で適用」を primary に、AI 編集 (L99) を fallback にする。
   * これにより EC-0006 のような「Opening Hook 編集」を L99 (Codex 自由編集) に流して 16分沈黙する事故を防ぐ。
   */
  engagement_ec_suggestions: Array<{
    card_id: string;
    title: string;
    instruction: string;
    scope: string;
    /** rationale または per_page_scores の comment 内、EC が言及された原文 (短く抜粋) */
    source_text: string;
    /** EC 言及が page-specific なら対応 page_no を入れる */
    applies_to_pages: number[];
    /** 専用 layer がある場合の推奨実行先。null なら L99 (AI 編集) fallback。 */
    recommended_layer?: {
      layer: string;
      flags: Record<string, string | true>;
      label: string;
      note: string;
    };
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

    // L11 audit (audit.json) — 旧/新 schema 両対応で normalize
    const auditPath = path.join(epDir, "audit.json");
    const audit = await readJsonOrNull<AuditReport>(auditPath);
    const auditSummary = normalizeAudit(audit);

    // Phase X audit-rules (name_audit.json) — L8.5 で書き出されている (実体は name/name_audit.json)
    const nameAudit = await readJsonOrNull<AuditReport>(nameAuditPath(slug, episode));
    const nameAuditNormalized = normalizeAudit(nameAudit);
    const nameAuditSummary = nameAuditNormalized
      ? {
          pages_total: nameAuditNormalized.pages_total,
          findings_total: nameAuditNormalized.findings_total,
          counts_by_rule: nameAuditNormalized.counts_by_rule,
          counts_by_severity: nameAuditNormalized.counts_by_severity,
          new_rules_findings: nameAuditNormalized.findings_top10.filter((f) =>
            NEW_AUDIT_RULES.includes(f.rule),
          ),
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
    const cardIndex = new Map<string, {
      card_id: string;
      title: string;
      scope: string;
      trigger?: { layer?: string; flag?: string };
      diagnosis: string;
      instruction?: string;
    }>();
    const relatedCards: ImprovementsResponse["related_cards"] = [];
    for (const cf of cardFiles.slice(0, 20)) {
      const card = await readJsonOrNull<{
        card_id: string;
        title: string;
        scope: string;
        trigger?: { layer?: string; flag?: string };
        diagnosis: string;
        instruction?: string;
      }>(path.join(EDITORIAL_CARDS_DIR, cf));
      if (!card) continue;
      cardIndex.set(card.card_id, card);
      relatedCards.push({
        card_id: card.card_id,
        title: card.title,
        scope: card.scope,
        trigger: { layer: card.trigger?.layer, flag: card.trigger?.flag },
        diagnosis: card.diagnosis,
        instruction: card.instruction ?? "",
      });
    }

    // volume_position 推定 (deriveRecommendedLayer 内の L04_9 マッピングで参照するため、ここで先に計算)
    const volumePosition = await estimateVolumePosition(slug, episode);

    // Phase Y WY-14: EC の trigger.flag から専用 layer を判定する mapping。
    // 「EC-0006 を AI 編集に流す」のような誤誘導を避け、適切な layer (L04_1/L04_9 等) に dispatch する。
    function deriveRecommendedLayer(card: {
      card_id: string;
      trigger?: { flag?: string };
      scope: string;
    }): {
      layer: string;
      flags: Record<string, string | true>;
      label: string;
      note: string;
    } | undefined {
      const flag = card.trigger?.flag;
      if (flag === "opening_hook_no_focus") {
        return {
          layer: "L04_1",
          flags: { "--max-proposals": "1", "--apply-recommendation": true },
          label: "L04_1 で Opening Hook を適用 (推奨)",
          note: "L04_1 は selection_guide で tone/genre から推奨パターンを自動選択。EC が指す具体パターン (P1_daily_anomaly 等) と完全一致しない場合あり",
        };
      }
      if (flag === "cliffhanger_role_mismatch") {
        return {
          layer: "L04_9",
          flags: {
            "--max-proposals": "1",
            "--apply-recommendation": true,
            "--volume-position": volumePosition,
          },
          label: "L04_9 で Cliffhanger を適用 (推奨)",
          note: `L04_9 は volume_position=${volumePosition} に応じてパターンを自動選択`,
        };
      }
      // 上記以外 (panel-level EC, narration_dominant, volume scope EC 等) は L99 fallback
      return undefined;
    }

    // Phase Y WY-11: engagement_audit から EC-NNNN を抽出して suggestion を組み立てる。
    // - rationale_summary を全体スコープで scan (applies_to_pages 不明 = 空)
    // - per_page_scores[].comment に EC が言及されていれば applies_to_pages にその page を追加
    const ecRegex = /EC-(\d{4})/g;
    const ecSuggestions = new Map<string, ImprovementsResponse["engagement_ec_suggestions"][number]>();
    function harvestEc(text: string | undefined, pageNo?: number): void {
      if (!text) return;
      const matches = text.matchAll(ecRegex);
      for (const m of matches) {
        const cardId = `EC-${m[1]}`;
        const card = cardIndex.get(cardId);
        if (!card) continue;
        const existing = ecSuggestions.get(cardId);
        if (existing) {
          if (pageNo !== undefined && !existing.applies_to_pages.includes(pageNo)) {
            existing.applies_to_pages.push(pageNo);
          }
        } else {
          ecSuggestions.set(cardId, {
            card_id: card.card_id,
            title: card.title,
            instruction: card.instruction ?? "",
            scope: card.scope,
            source_text: text.length > 200 ? `${text.slice(0, 200)}…` : text,
            applies_to_pages: pageNo !== undefined ? [pageNo] : [],
            recommended_layer: deriveRecommendedLayer(card),
          });
        }
      }
    }
    if (engagement) {
      harvestEc(engagement.rationale_summary);
      const pps = (engagement as unknown as { per_page_scores?: Array<{ page_no: number; comment?: string }> })
        .per_page_scores;
      if (Array.isArray(pps)) {
        for (const ps of pps) harvestEc(ps.comment, ps.page_no);
      }
    }
    const engagementEcSuggestions: ImprovementsResponse["engagement_ec_suggestions"] = Array.from(
      ecSuggestions.values(),
    );

    // volumePosition は EC mapping ブロックで既に計算済 (deriveRecommendedLayer が参照するため前倒し)

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

    // Phase Y WY-5: KU 完読率リスク分類器 (各 audit + engagement_audit + cards から自動算出)
    const completionRisk = assessCompletionRisk({
      audit_findings_total: auditSummary?.findings_total,
      audit_findings_error: auditSummary?.counts_by_severity?.error,
      name_audit_new_rule_findings: nameAuditSummary?.new_rules_findings.length,
      engagement_overall_drop_off_risk: engagementSummary.overall_drop_off_risk,
      engagement_boring_pages: engagementSummary.boring_pages?.length,
      engagement_human_review_required: engagementSummary.human_review_required,
      engagement_character_drops: undefined, // engagementSummary に詳細展開してないので一旦 undefined
      engagement_reward_gap_warning: undefined,
      editorial_cards_applied_count: relatedCards.length, // applied_to[] を読まないと正確でないが、available カード数で proxy
    });

    const response: ImprovementsResponse = {
      slug,
      episode,
      audit_summary: auditSummary,
      name_audit_summary: nameAuditSummary,
      opening_hook_proposals: openingProposals,
      cliffhanger_proposals: cliffProposals,
      engagement_audit: engagementSummary,
      completion_risk: completionRisk,
      related_cards: relatedCards,
      engagement_ec_suggestions: engagementEcSuggestions,
      next_actions: nextActions,
    };

    return send(res, 200, response);
  } catch (e: unknown) {
    return send(res, 500, { error: (e as Error).message });
  }
}
