/**
 * KDP 入稿プレフライト検証
 *
 * 設計根拠: B-1 計画 Track A1-2 (Codex 最優先指摘の対応)
 *
 * 検査項目:
 *   1. ページ数 24 以上 (KDP 最小)
 *   2. 79 ページ未満で背表紙テキスト指定は **強制禁止** (KDP 規約)
 *      → Codex レビューで判明した致命的指摘 (背表紙テキストは却下対象)
 *   3. 背幅 ≥ 5mm
 *   4. 表紙画像の DPI ≥ 300 (sharp で metadata 取得)
 *   5. 塗り足し 3mm 確保 (cover dimension 計算と整合)
 *   6. タイトル ≤ 200, サブタイトル ≤ 200
 *   7. 7 キーワードのうち各 ≤ 50 字、合計 ≤ 7 個
 *   8. description_html が KDP 許可タグのみ
 *      (<b>, <i>, <em>, <strong>, <br>, <p>, <ul>, <ol>, <li>, <h4>, <h5>, <h6>)
 *   9. AI 開示 5 区分が設定済 (validateAiDisclosure 経由)
 *  10. ファイル存在 (manuscript.pdf, cover.pdf)
 *  11. rights_check (商標/IP類似) が passed (Phase X WX-5 追加、allowMissingRightsCheck で warn 降格可)
 */
import { promises as fs } from "node:fs";
import sharp from "sharp";
import { spineWidthMm } from "./spine-calc";
import { validateAiDisclosure } from "../../disclosure";
import { validateRightsCheckForPreflight } from "./trademark-check";
import type {
  KdpMetadata,
  KdpRelease,
  AiDisclosureFlags,
} from "../../schemas-v2";
import type { AiUsageLevel } from "../../disclosure";

/** KDP の Description (HTML) で許可されているタグ */
const KDP_ALLOWED_HTML_TAGS = [
  "b", "i", "em", "strong", "u", "br", "p",
  "ul", "ol", "li",
  "h4", "h5", "h6",
];
/** KDP 規約: ページ数がこれ未満なら背表紙テキストは禁止 */
export const KDP_MIN_PAGES_FOR_SPINE_TEXT = 79;
/** KDP 最低ページ数 */
export const KDP_MIN_PAGES = 24;

export type PreflightSeverity = "error" | "warning";

export type PreflightIssue = {
  severity: PreflightSeverity;
  code: string;
  message: string;
};

export type PreflightInput = {
  manuscriptPdfPath: string;
  coverPdfPath: string;
  /** 表紙合成元の PNG (DPI チェック用、任意) */
  coverFrontPng?: string;
  pageCount: number;
  spineWidthMm: number;
  metadata: Partial<KdpMetadata>;
  release: Partial<KdpRelease>;
  /** AI 開示の usage level (Supabase manga_works.ai_usage_level 同義) */
  aiUsageLevel?: AiUsageLevel;
  /** 背表紙テキストを実際にPDFに描画したか (cover-composer の結果) */
  spineTextRendered?: boolean;
  /** 短い vol0 等を許容 (Day1-5 リハーサル用、本入稿では false 推奨) */
  allowShortVolume?: boolean;
  /** 79p未満でも背表紙テキストを意図的に描画する場合 true (KDP規約違反となるため warn 降格、運用判断責任) */
  allowShortVolumeSpineText?: boolean;
  /** rights_check (商標/IP類似) 未通過でも warn 降格 (リハーサル出版/vol_0 用) */
  allowMissingRightsCheck?: boolean;
};

export type PreflightResult = {
  ok: boolean;
  issues: PreflightIssue[];
};

function err(code: string, message: string): PreflightIssue {
  return { severity: "error", code, message };
}
function warn(code: string, message: string): PreflightIssue {
  return { severity: "warning", code, message };
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function findDisallowedHtmlTags(html: string): string[] {
  const found = new Set<string>();
  const re = /<\s*([a-zA-Z][a-zA-Z0-9]*)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const tag = m[1].toLowerCase();
    if (!KDP_ALLOWED_HTML_TAGS.includes(tag)) found.add(tag);
  }
  return [...found];
}

/** 表紙 PNG が 300dpi 以上かどうか (sharp metadata 経由) */
async function checkCoverDpi(pngPath: string, expectedDpiMin = 300): Promise<{ ok: boolean; density?: number }> {
  try {
    const meta = await sharp(pngPath).metadata();
    const density = meta.density ?? 0;
    return { ok: density >= expectedDpiMin, density };
  } catch {
    return { ok: false };
  }
}

export async function runPreflight(input: PreflightInput): Promise<PreflightResult> {
  const issues: PreflightIssue[] = [];

  // 1. ページ数 24以上
  if (input.pageCount < KDP_MIN_PAGES) {
    if (input.allowShortVolume) {
      issues.push(warn("PAGES_BELOW_KDP_MIN",
        `ページ数 ${input.pageCount} は KDP 最小 ${KDP_MIN_PAGES} 未満。--allow-short-volume が指定されたため警告に降格。`));
    } else {
      issues.push(err("PAGES_BELOW_KDP_MIN",
        `ページ数 ${input.pageCount} は KDP 最小 ${KDP_MIN_PAGES} 未満。本入稿不可。`));
    }
  }

  // 2. 79p 未満で背表紙テキスト禁止 (Codex 指摘) — allowShortVolumeSpineText で warn 降格可
  if (input.pageCount < KDP_MIN_PAGES_FOR_SPINE_TEXT && input.spineTextRendered) {
    if (input.allowShortVolumeSpineText) {
      issues.push(warn("SPINE_TEXT_FORBIDDEN_UNDER_79P",
        `ページ数 ${input.pageCount} (79p未満) で背表紙テキストが描画されている。KDP規約違反のリスクあり。--allow-short-volume-spine-text 指定により警告に降格 (運用判断責任)。`));
    } else {
      issues.push(err("SPINE_TEXT_FORBIDDEN_UNDER_79P",
        `ページ数 ${input.pageCount} (79p未満) で背表紙テキストが描画されている。KDP規約違反のため却下対象。背表紙はベタ塗りのみ可。意図的に許容する場合は allowShortVolumeSpineText=true を指定。`));
    }
  }

  // 3. 背幅 5mm 以上 (spineWidthMm が最小5mmを保証するが、再確認)
  const expectedSpine = spineWidthMm(input.pageCount);
  if (input.spineWidthMm < 5) {
    issues.push(err("SPINE_TOO_NARROW",
      `背幅 ${input.spineWidthMm}mm は 5mm 未満。spineWidthMm 計算と矛盾。`));
  }
  if (Math.abs(input.spineWidthMm - expectedSpine) > 0.5) {
    issues.push(warn("SPINE_WIDTH_MISMATCH",
      `背幅 ${input.spineWidthMm}mm と理論値 ${expectedSpine.toFixed(2)}mm の乖離が 0.5mm 超。`));
  }

  // 4. 表紙 DPI チェック
  if (input.coverFrontPng) {
    const exists = await fileExists(input.coverFrontPng);
    if (!exists) {
      issues.push(err("COVER_FRONT_NOT_FOUND",
        `表紙画像が存在しない: ${input.coverFrontPng}`));
    } else {
      const dpi = await checkCoverDpi(input.coverFrontPng, 300);
      if (!dpi.ok) {
        issues.push(warn("COVER_DPI_LOW",
          `表紙画像の DPI が低い (${dpi.density ?? "unknown"})。300dpi 以上推奨。`));
      }
    }
  } else {
    issues.push(err("COVER_FRONT_PNG_MISSING",
      "表紙画像 (cover-front.png) が指定されていない。inputs/cover-front.png を配置すること。"));
  }

  // 5. 塗り足し 3mm — buildCoverPdf 側で常に 3mm bleed を付与しているので入力検証のみ
  // (実 PDF の bleed 検査はサイズ計算が複雑なため preflight 範囲外、cover-composer の責務)

  // 6. タイトル / サブタイトル文字数
  const title = input.release.kdp_inputs?.title ?? input.metadata.title ?? "";
  const subtitle = input.release.kdp_inputs?.subtitle ?? input.metadata.subtitle ?? "";
  if (!title) {
    issues.push(err("TITLE_EMPTY", "タイトルが空。"));
  } else if (title.length > 200) {
    issues.push(err("TITLE_TOO_LONG", `タイトル ${title.length} 文字 > 200 (KDP 上限)`));
  }
  if (subtitle.length > 200) {
    issues.push(err("SUBTITLE_TOO_LONG", `サブタイトル ${subtitle.length} 文字 > 200`));
  }

  // 7. 7 キーワード
  const keywords = input.release.kdp_inputs?.keywords ?? [];
  if (keywords.length > 7) {
    issues.push(err("KEYWORDS_TOO_MANY", `キーワード ${keywords.length} 個 > 7 (KDP 上限)`));
  }
  for (let i = 0; i < keywords.length; i++) {
    if (keywords[i].length > 50) {
      issues.push(err("KEYWORD_TOO_LONG", `keyword[${i}] が 50 字超 (${keywords[i].length})`));
    }
  }

  // 7b. 3 カテゴリ上限 (kdp-modular-plum.md / Codex指摘)
  // 2023年中盤以降、KDPダッシュボードのカテゴリ枠は 3 つまで。
  // 手編集された kdp-release.json で 4 件以上にされていないか防御的に検査。
  const categories = input.release.kdp_inputs?.categories ?? [];
  if (categories.length > 3) {
    issues.push(err("CATEGORIES_TOO_MANY", `カテゴリ ${categories.length} 件 > 3 (KDP 上限、2023年改定後)`));
  }

  // 8. description_html 許可タグ
  const desc = input.release.kdp_inputs?.description_html ?? "";
  if (desc) {
    const disallowed = findDisallowedHtmlTags(desc);
    if (disallowed.length > 0) {
      issues.push(err("DESCRIPTION_DISALLOWED_TAGS",
        `description_html に KDP 不許可タグ: ${disallowed.join(", ")}`));
    }
  }

  // 9. AI 開示 5 区分
  const aiCheck = validateAiDisclosure(
    input.metadata.ai_disclosure as AiDisclosureFlags | undefined,
    input.aiUsageLevel,
    input.metadata.ai_tools_used,
  );
  if (!aiCheck.ok) {
    issues.push(err("AI_DISCLOSURE_INVALID", aiCheck.reason));
  }

  // 10. ファイル存在
  if (!(await fileExists(input.manuscriptPdfPath))) {
    issues.push(err("MANUSCRIPT_NOT_FOUND", `manuscript.pdf が存在しない: ${input.manuscriptPdfPath}`));
  }
  if (!(await fileExists(input.coverPdfPath))) {
    issues.push(err("COVER_PDF_NOT_FOUND", `cover.pdf が存在しない: ${input.coverPdfPath}`));
  }

  // 11. rights_check (商標/IP類似) — Phase X WX-5 で追加
  const rightsCheckReason = validateRightsCheckForPreflight(input.release.rights_check);
  if (rightsCheckReason) {
    if (input.allowMissingRightsCheck) {
      issues.push(warn("RIGHTS_CHECK_MISSING_OR_FAILED", rightsCheckReason));
    } else {
      issues.push(err("RIGHTS_CHECK_MISSING_OR_FAILED", rightsCheckReason));
    }
  }

  const ok = !issues.some((i) => i.severity === "error");
  return { ok, issues };
}

export function formatPreflightReport(result: PreflightResult): string {
  if (result.issues.length === 0) {
    return "[preflight] OK (検出された問題はありません)";
  }
  const lines: string[] = [];
  lines.push(`[preflight] ${result.ok ? "OK (warning のみ)" : "FAILED"} - ${result.issues.length} 件`);
  for (const issue of result.issues) {
    const tag = issue.severity === "error" ? "ERROR" : "WARN";
    lines.push(`  [${tag}] ${issue.code}: ${issue.message}`);
  }
  return lines.join("\n");
}
