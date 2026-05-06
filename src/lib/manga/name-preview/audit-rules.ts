/**
 * L8.6 Name Audit (rule-based, warning のみ)
 *
 * SSoT: ~/.claude/plans/manga-pipeline-v2.md
 * Phase X WX-4 (2026-05-06): craft 準拠ルール5件追加 + auditVolume 新設
 *
 * v2 で導入。LLM は使わず決定論ルールでネームを検査する。
 * 結果は warning として `name_manifest.json` と `name_audit.json` に書き出される。
 * gate (= L9 強制 stop) には使わない。あくまで「ここを見直すと良いかも」のヒント。
 *
 * gate に昇格させたい時は L9 が `--audit-gate` を持つ形で別途実装する想定。
 *
 * ルール一覧 (panel/page スコープ):
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
 *
 * Phase X WX-4 で追加 (panel スコープ):
 * - narration_dominant:   panel の narration 文字数 > dialogue + monologue 合計 (ナレ過多)
 * - face_only_emotion_run: 緊迫panel で「顔以外の部位ショット」が0 (スケルトン実装)
 *
 * Phase X WX-4 で追加 (page スコープ):
 * - mascot_temperature_pair_missing: page内に温度差ペアが0 (スケルトン実装)
 *
 * Phase X WX-4 で追加 (volume スコープ、auditVolume() 経由):
 * - recovery_beat_missing: episode 全体で「小報酬/生活感」beat が0
 * - expectation_reality_gap_absent: 巻全体で「期待 vs 現実」のギャップが1回も発生しない
 */
import type {
  PagePlanPage,
  PanelV2,
  StoryboardPageV2,
  EpisodeStoryboardV2,
  ToneProfile,
} from "../schemas-v2";
import type {
  NarrationBudgetFile,
} from "../storyboard-v2/narration-budget";
import { checkNarrationBudget } from "../storyboard-v2/narration-budget";
import type { NameWarning } from "./types";

// 閾値
const DIALOGUE_OVERFLOW_CHARS = 60;
const PANEL_OVERCROWD = 7;
const PANEL_UNDERCROWD = 1;
const SHOT_REPETITION_RUN = 3;
const SILENT_RUN = 3;
const BLEED_OVERUSE = 3;
// Phase X WX-4 で追加
/** panel の narration 文字数がこの倍率 × (dialogue+monologue 文字数) を超えると warn */
const NARRATION_DOMINANT_RATIO = 1.0;
/** narration が単独で存在する場合 (dialogue/monologue 0) はこの絶対値を超えると warn */
const NARRATION_ONLY_THRESHOLD = 30;

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
  | "opening_hook_no_focus"
  // Phase X WX-4 で追加
  | "narration_dominant"
  | "face_only_emotion_run"
  | "mascot_temperature_pair_missing"
  | "recovery_beat_missing"
  | "expectation_reality_gap_absent"
  // Phase Y WY-2 で追加 (narration_kind + budget)
  | "narration_panel_chars_exceeded"
  | "narration_page_count_exceeded"
  | "narration_episode_omniscient_exceeded";

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
    if (last) {
      // Phase Y WY-3: cliffhanger ページの最終 panel は importance=5 必須 (manga_craft_guide v2)
      // last.importance=5 でなければ error 格上げ (旧 warning から変更)
      if (last.importance < 5) {
        findings.push({
          page_no: pageNo,
          panel_id: last.panel_id,
          panel_no: last.panel_no,
          rule: "cliffhanger_role_mismatch",
          severity: last.importance <= 2 ? "error" : "warn",
          message: `cliffhanger ページの最終 panel は importance=5 必須だが ${last.importance} (引きの山が作れていない)`,
        });
      }
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
  const dialogueChars = panel.dialogue.reduce((s, d) => s + d.text.length, 0);
  const monologueChars = panel.monologue.reduce((s, m) => s + m.text.length, 0);
  const narrationChars = panel.narration.reduce((s, n) => s + n.length, 0);
  const totalChars = dialogueChars + monologueChars + narrationChars;
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

  // Phase X WX-4: narration_dominant
  // ナレーション文字数が dialogue+monologue を上回る = 「会話で世界観説明」原則違反
  const speechChars = dialogueChars + monologueChars;
  const narrationDominant =
    (speechChars > 0 && narrationChars > speechChars * NARRATION_DOMINANT_RATIO) ||
    (speechChars === 0 && narrationChars > NARRATION_ONLY_THRESHOLD);
  if (narrationDominant && !panel.silence) {
    findings.push({
      page_no: pageNo,
      panel_id: panel.panel_id,
      panel_no: panel.panel_no,
      rule: "narration_dominant",
      severity: "warn",
      message: `panel#${panel.panel_no}: ナレーション ${narrationChars}字 が会話 ${speechChars}字 を上回る (manga_craft_guide v2 ナレーション禁則)`,
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
      // Phase X WX-4 で追加されたルールも name_audit.json には残るが
      // manifest.warnings には入れない (v1 互換維持)
      case "narration_dominant":
      case "face_only_emotion_run":
      case "mascot_temperature_pair_missing":
      case "recovery_beat_missing":
      case "expectation_reality_gap_absent":
      case "narration_panel_chars_exceeded":
      case "narration_page_count_exceeded":
      case "narration_episode_omniscient_exceeded":
        continue;
    }
    warnings.push({ page_no: f.page_no, kind, message: f.message });
  }
  return warnings;
}

// ============================================================
// Phase X WX-4: 巻スコープ Audit (auditVolume)
// ============================================================

export type VolumeAuditInput = {
  episodes: EpisodeStoryboardV2[];
  /** bible.meta.tone_profile (任意、無ければ light_recovery 想定で判定) */
  toneProfile?: ToneProfile;
  /** Phase Y WY-2 で追加: bible.meta.genre (narration budget の genre relax 用、任意) */
  genre?: string;
  /**
   * Phase Y WY-2 で追加: 事前にロードした narration-budgets.json
   * (audit-rules.ts は同期実装のため、呼び出し側で loadNarrationBudgets() してから渡す)
   */
  narrationBudgets?: NarrationBudgetFile;
};

/**
 * 巻全体スコープのルール検査。episode 内では検出不能なパターンを拾う。
 *
 * 現状は recovery_beat_missing / expectation_reality_gap_absent をスケルトン実装。
 * 完全実装は Phase Y (L5.5 engagement audit) で語彙ベース判定 or LLM 判定に置換予定。
 */
export function auditVolume(input: VolumeAuditInput): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const tone = input.toneProfile;

  // Phase Y WY-2: narration budget 検査 (tone 関係なく全 episode で適用)
  if (input.narrationBudgets) {
    for (const ep of input.episodes) {
      const violations = checkNarrationBudget(
        ep,
        input.narrationBudgets,
        tone,
        input.genre,
      );
      for (const v of violations) {
        findings.push({
          page_no: v.page_no,
          panel_no: v.panel_no,
          rule: v.rule,
          severity: v.scope === "panel" ? "warn" : v.scope === "page" ? "warn" : "info",
          message: `[${ep.episode_id}] ${v.message}`,
        });
      }
    }
  }

  // light_recovery 帯のみ対象 (hellmode では intentionally 重い beat なので skip)
  const isLightRecovery = !tone || tone.darkness < 0.5;
  if (!isLightRecovery) return findings;

  // recovery_beat_missing (各 episode で「小報酬/相棒との温度」の signal を探す)
  // MVP: panel.dialogue / monologue / narration の中に「ありがとう/嬉しい/楽しい/笑/休む/食べる/おいしい」等の語彙が
  //      1つも含まれない episode を warn 扱い
  // 完全実装は Phase Y で意味判定 (LLM 経由) に置換
  const POSITIVE_TOKENS = [
    "ありがとう",
    "嬉し",
    "楽し",
    "笑",
    "休",
    "食べ",
    "おいし",
    "美味し",
    "うまい",
    "気持ちいい",
    "ほっと",
    "和や",
  ];
  for (const ep of input.episodes) {
    const allText = collectEpisodeText(ep);
    const hasPositive = POSITIVE_TOKENS.some((tok) => allText.includes(tok));
    if (!hasPositive) {
      findings.push({
        page_no: 0, // 巻スコープ
        rule: "recovery_beat_missing",
        severity: "warn",
        message: `episode ${ep.episode_id}: 「小報酬/生活感/相棒との温度」beat が検出されない (light_recovery では1話1回以上必須)`,
      });
    }
  }

  // expectation_reality_gap_absent (巻全体で「期待 vs 現実」のギャップ panel が0件)
  // MVP: dialogue/monologue に「思ってたより/予想外/まさか/...だと思った」等の語彙が巻全体で0件
  // 完全実装は Phase Y で意味判定に置換
  const GAP_TOKENS = [
    "思ってた",
    "予想外",
    "まさか",
    "だと思った",
    "意外",
    "期待してた",
    "違った",
  ];
  const allVolumeText = input.episodes.map(collectEpisodeText).join(" ");
  const hasGap = GAP_TOKENS.some((tok) => allVolumeText.includes(tok));
  if (!hasGap) {
    findings.push({
      page_no: 0,
      rule: "expectation_reality_gap_absent",
      severity: "info",
      message: "巻全体で「期待 vs 現実」のギャップ panel が検出されない (manga_craft_guide v2 の typical pattern #4 推奨)",
    });
  }

  // mascot_temperature_pair_missing (page スコープだが、現時点では巻スコープでサンプル検出のみ)
  // 完全実装は「マスコット」「相棒」のキャラタグが entities に追加された後 Phase Y で
  // 隣接 panel の expression 対比判定として実装

  // face_only_emotion_run (panel スコープの shot_type タグが充実した後 Phase Y で実装)

  return findings;
}

/** episode 内の全テキスト (dialogue + monologue + narration + sfx) を平坦化 */
function collectEpisodeText(ep: EpisodeStoryboardV2): string {
  const buf: string[] = [];
  for (const page of ep.pages) {
    for (const panel of page.panels) {
      for (const d of panel.dialogue) buf.push(d.text);
      for (const m of panel.monologue) buf.push(m.text);
      for (const n of panel.narration) buf.push(n);
      for (const s of panel.sfx) buf.push(s);
    }
  }
  return buf.join(" ");
}
