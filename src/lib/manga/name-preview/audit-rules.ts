/**
 * L8.6 Name Audit (rule-based, warning のみ)
 *
 * SSoT: ~/.claude/plans/manga-pipeline-v2.md
 *
 * v2 で導入。LLM は使わず決定論ルールでネームを検査する。
 * 結果は warning として `name_manifest.json` と `name_audit.json` に書き出される。
 * gate (= L9 強制 stop) には使わない。あくまで「ここを見直すと良いかも」のヒント。
 *
 * gate に昇格させたい時は L9 が `--audit-gate` を持つ形で別途実装する想定。
 *
 * ルール一覧:
 * - dialogue_overflow:    パネル内合計文字数 (台詞+モノローグ+ナレーション) が閾値超
 * - panel_overcrowd:      1ページのコマ数が閾値超
 * - panel_undercrowd:     1ページのコマ数が極端に少ない (見せ場以外で 1コマは不自然)
 * - shot_repetition:      同一 shot_type が N コマ連続
 * - focus_entity_missing: focus_entity_id が entities に居ない
 * - ref_thumbnail_missing: 主要登場キャラの face_front.png が無い
 * - importance_imbalance: ページ内の importance が全部低い (≤2) / 全部高い (≥4)
 * - silent_run:           silence panel が連続しすぎ (テンポ崩壊)
 * - dialogue_speaker_absent: dialogue speaker が entities.characters に居ない
 * - bleed_overuse:        ページ内 bleed が多すぎ (>= 3)
 * - reading_order_jump:   reading_order が 1 から始まらない / 飛び番がある
 * - establishing_late:    establishing shot が page 後半に登場 (普通は page 冒頭)
 * - cliffhanger_role_mismatch: page_role が cliffhanger なのに最終 panel の importance が低い
 * - opening_hook_no_focus: page_role が opening_hook なのに focus が曖昧 (importance ≤ 2)
 */
import type {
  PagePlanPage,
  PanelV2,
  StoryboardPageV2,
} from "../schemas-v2";
import type { NameWarning } from "./types";

// 閾値
const DIALOGUE_OVERFLOW_CHARS = 60;
const PANEL_OVERCROWD = 7;
const PANEL_UNDERCROWD = 1;
const SHOT_REPETITION_RUN = 3;
const SILENT_RUN = 3;
const BLEED_OVERUSE = 3;

export type AuditRuleKind =
  | "dialogue_overflow"
  | "panel_overcrowd"
  | "panel_undercrowd"
  | "shot_repetition"
  | "focus_entity_missing"
  | "ref_thumbnail_missing"
  | "importance_imbalance"
  | "silent_run"
  | "dialogue_speaker_absent"
  | "bleed_overuse"
  | "reading_order_jump"
  | "establishing_late"
  | "cliffhanger_role_mismatch"
  | "opening_hook_no_focus";

export type AuditSeverity = "info" | "warn" | "error";

export type AuditFinding = {
  page_no: number;
  panel_id?: string;
  panel_no?: number;
  rule: AuditRuleKind;
  severity: AuditSeverity;
  message: string;
  /** ref_thumbnail_missing / dialogue_speaker_absent など、character_id を主体とするルール用 */
  character_id?: string;
};

export type PageAuditInput = {
  page: StoryboardPageV2;
  /** v3 mapper 由来 page_plan。現行ルールでは未参照だが、将来の layout-aware ルール用に予約 */
  pagePlanPage?: PagePlanPage;
  refsExists: (relPath: string) => boolean;
};

export function auditPage(input: PageAuditInput): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const { page, refsExists } = input;
  const pageNo = page.page_no;

  // panel_overcrowd / panel_undercrowd
  if (page.panels.length > PANEL_OVERCROWD) {
    findings.push({
      page_no: pageNo,
      rule: "panel_overcrowd",
      severity: "warn",
      message: `コマ数 ${page.panels.length} (推奨上限 ${PANEL_OVERCROWD})`,
    });
  } else if (
    page.panels.length <= PANEL_UNDERCROWD &&
    page.page_role !== "reveal" &&
    page.page_role !== "cliffhanger"
  ) {
    findings.push({
      page_no: pageNo,
      rule: "panel_undercrowd",
      severity: "info",
      message: `コマ数 ${page.panels.length} (見せ場以外で 1 コマは不自然)`,
    });
  }

  // bleed_overuse
  const bleedCount = page.panels.filter((p) => p.bleed).length;
  if (bleedCount >= BLEED_OVERUSE) {
    findings.push({
      page_no: pageNo,
      rule: "bleed_overuse",
      severity: "warn",
      message: `bleed ${bleedCount} 枚 (連発するとインパクトが希釈する)`,
    });
  }

  // reading_order_jump
  const sortedPanels = [...page.panels].sort((a, b) => a.reading_order - b.reading_order);
  let expectedOrder = 1;
  for (const p of sortedPanels) {
    if (p.reading_order !== expectedOrder) {
      findings.push({
        page_no: pageNo,
        panel_id: p.panel_id,
        panel_no: p.panel_no,
        rule: "reading_order_jump",
        severity: "error",
        message: `reading_order が ${expectedOrder} ではなく ${p.reading_order} (panel#${p.panel_no})`,
      });
      break;
    }
    expectedOrder++;
  }

  // shot_repetition
  let runStart = 0;
  for (let i = 1; i <= sortedPanels.length; i++) {
    const prev = sortedPanels[i - 1];
    const curr = sortedPanels[i];
    if (curr && curr.shot_type === prev.shot_type) continue;
    const runLen = i - runStart;
    if (runLen >= SHOT_REPETITION_RUN) {
      findings.push({
        page_no: pageNo,
        panel_id: prev.panel_id,
        panel_no: prev.panel_no,
        rule: "shot_repetition",
        severity: "warn",
        message: `${prev.shot_type} が ${runLen} コマ連続 (panels ${sortedPanels[runStart].panel_no}..${prev.panel_no})`,
      });
    }
    runStart = i;
  }

  // silent_run
  let silentRunStart = -1;
  for (let i = 0; i <= sortedPanels.length; i++) {
    const p = sortedPanels[i];
    if (p && p.silence) {
      if (silentRunStart < 0) silentRunStart = i;
    } else {
      if (silentRunStart >= 0) {
        const runLen = i - silentRunStart;
        if (runLen >= SILENT_RUN) {
          const first = sortedPanels[silentRunStart];
          const last = sortedPanels[i - 1];
          findings.push({
            page_no: pageNo,
            rule: "silent_run",
            severity: "warn",
            message: `silence panel が ${runLen} 連続 (panels ${first.panel_no}..${last.panel_no})`,
          });
        }
        silentRunStart = -1;
      }
    }
  }

  // importance_imbalance
  const importanceValues = page.panels.map((p) => p.importance);
  const allLow = importanceValues.every((v) => v <= 2);
  const allHigh = importanceValues.every((v) => v >= 4);
  if (page.panels.length >= 3 && allLow) {
    findings.push({
      page_no: pageNo,
      rule: "importance_imbalance",
      severity: "info",
      message: `全コマ importance ≤ 2 (見せ場が無い)`,
    });
  } else if (page.panels.length >= 3 && allHigh) {
    findings.push({
      page_no: pageNo,
      rule: "importance_imbalance",
      severity: "info",
      message: `全コマ importance ≥ 4 (強調しすぎでメリハリが消える)`,
    });
  }

  // page_role 別ルール
  if (page.page_role === "cliffhanger") {
    const last = sortedPanels[sortedPanels.length - 1];
    if (last && last.importance <= 2) {
      findings.push({
        page_no: pageNo,
        panel_id: last.panel_id,
        panel_no: last.panel_no,
        rule: "cliffhanger_role_mismatch",
        severity: "warn",
        message: `cliffhanger なのに最終コマ importance=${last.importance} (引きが弱い)`,
      });
    }
  }
  if (page.page_role === "opening_hook") {
    const maxImp = Math.max(...importanceValues, 0);
    if (maxImp <= 2) {
      findings.push({
        page_no: pageNo,
        rule: "opening_hook_no_focus",
        severity: "warn",
        message: `opening_hook なのに max importance=${maxImp} (掴みが弱い)`,
      });
    }
  }

  // establishing_late
  const establishingIdx = sortedPanels.findIndex((p) => p.shot_type === "establishing");
  if (establishingIdx > Math.floor(sortedPanels.length / 2)) {
    const p = sortedPanels[establishingIdx];
    findings.push({
      page_no: pageNo,
      panel_id: p.panel_id,
      panel_no: p.panel_no,
      rule: "establishing_late",
      severity: "info",
      message: `establishing が page 後半 (panel ${establishingIdx + 1}/${sortedPanels.length}, 通常は冒頭)`,
    });
  }

  // panel-scoped checks (ref_thumbnail_missing は page 内で character_id 単位 dedupe)
  const refMissingCharsOnPage = new Set<string>();
  for (const panel of page.panels) {
    findings.push(...auditPanel(panel, pageNo, refsExists, refMissingCharsOnPage));
  }

  return findings;
}

function auditPanel(
  panel: PanelV2,
  pageNo: number,
  refsExists: (relPath: string) => boolean,
  refMissingCharsOnPage: Set<string>
): AuditFinding[] {
  const findings: AuditFinding[] = [];

  // dialogue_overflow
  const totalChars =
    panel.dialogue.reduce((s, d) => s + d.text.length, 0) +
    panel.monologue.reduce((s, m) => s + m.text.length, 0) +
    panel.narration.reduce((s, n) => s + n.length, 0);
  if (totalChars > DIALOGUE_OVERFLOW_CHARS) {
    findings.push({
      page_no: pageNo,
      panel_id: panel.panel_id,
      panel_no: panel.panel_no,
      rule: "dialogue_overflow",
      severity: "warn",
      message: `panel#${panel.panel_no}: 文字数 ${totalChars} (推奨 ${DIALOGUE_OVERFLOW_CHARS})`,
    });
  }

  // focus_entity_missing
  const focus = panel.entities.focus_entity_id;
  const focusInChars = panel.entities.characters.some((c) => c.character_id === focus);
  const focusIsLoc = focus === panel.entities.location_id;
  const focusIsProp = panel.entities.props.some((p) => p.prop_id === focus);
  if (!focusInChars && !focusIsLoc && !focusIsProp) {
    findings.push({
      page_no: pageNo,
      panel_id: panel.panel_id,
      panel_no: panel.panel_no,
      rule: "focus_entity_missing",
      severity: "error",
      message: `panel#${panel.panel_no}: focus_entity_id "${focus}" が entities に居ない`,
    });
  }

  // dialogue_speaker_absent
  const characterIds = new Set(panel.entities.characters.map((c) => c.character_id));
  for (const d of panel.dialogue) {
    if (!characterIds.has(d.character_id)) {
      findings.push({
        page_no: pageNo,
        panel_id: panel.panel_id,
        panel_no: panel.panel_no,
        rule: "dialogue_speaker_absent",
        severity: "error",
        message: `panel#${panel.panel_no}: dialogue speaker "${d.character_id}" が entities.characters に居ない`,
        character_id: d.character_id,
      });
      break;
    }
  }

  // ref_thumbnail_missing (主要登場キャラのみ、page 内 character_id 単位で 1 件)
  for (const c of panel.entities.characters) {
    if (c.role === "background" || c.role === "silhouette") continue;
    if (refMissingCharsOnPage.has(c.character_id)) continue;
    const exists = refsExists(`bible/refs/characters/${c.character_id}/face_front.png`);
    if (!exists) {
      refMissingCharsOnPage.add(c.character_id);
      findings.push({
        page_no: pageNo,
        rule: "ref_thumbnail_missing",
        severity: "info",
        message: `${c.character_id} の face_front.png 不在 (page ${pageNo} 内で複数 panel に登場)`,
        character_id: c.character_id,
      });
    }
  }

  return findings;
}

/**
 * AuditFinding を NameWarning に縮約 (manifest.warnings は kind ベースの軽量型)。
 */
export function findingsToWarnings(findings: AuditFinding[]): NameWarning[] {
  const warnings: NameWarning[] = [];
  for (const f of findings) {
    let kind: NameWarning["kind"];
    switch (f.rule) {
      case "dialogue_overflow": kind = "dialogue_overflow"; break;
      case "panel_overcrowd": kind = "panel_overcrowd"; break;
      case "shot_repetition": kind = "shot_repetition"; break;
      case "focus_entity_missing": kind = "focus_entity_missing"; break;
      case "ref_thumbnail_missing": kind = "ref_thumbnail_missing"; break;
      // 新規ルールは manifest.warnings の kind に入らないので、近いものへフォールバック
      // (manifest 側の kind は v1 互換維持のために最小限に保つ)
      case "panel_undercrowd":
      case "importance_imbalance":
      case "silent_run":
      case "bleed_overuse":
      case "reading_order_jump":
      case "establishing_late":
      case "cliffhanger_role_mismatch":
      case "opening_hook_no_focus":
      case "dialogue_speaker_absent":
        // これらは name_audit.json には残るが、manifest.warnings には入れない
        continue;
    }
    warnings.push({ page_no: f.page_no, kind, message: f.message });
  }
  return warnings;
}
