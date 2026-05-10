import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  BibleSnapshotV2,
  Blocklist,
  ComplianceFinding,
  ComplianceSuggestion,
  EpisodeStoryboardV2,
  FalsePositiveContextExclude,
  FalsePositives,
  ScanTextOptions,
  SceneGraphV1,
  Severity,
} from "./types";

const DEFAULT_BLOCKLIST_PATH = "data/manga/compliance/blocklist.json";
const DEFAULT_FALSE_POSITIVES_PATH = "data/manga/compliance/false-positives.json";
const EXCERPT_RADIUS = 30;
const COMMERCIAL_CONTEXT_TERMS = [
  "会社",
  "株式会社",
  "社",
  "店",
  "商品",
  "アプリ",
  "サービス",
  "メーカー",
  "製品",
  "OS",
  "プラットフォーム",
  "配信",
  "SNS",
];

type TermEntry = {
  term: string;
  normalizedTerm: string;
  category: string;
  severity: Severity;
  suggestion?: ComplianceSuggestion;
};

export async function loadBlocklist(filePath = DEFAULT_BLOCKLIST_PATH): Promise<Blocklist> {
  return readJson<Blocklist>(filePath);
}

export async function loadFalsePositives(
  filePath = DEFAULT_FALSE_POSITIVES_PATH,
): Promise<FalsePositives> {
  return readJson<FalsePositives>(filePath);
}

export function scanText(
  text: string,
  blocklist: Blocklist,
  fp: FalsePositives,
  options: ScanTextOptions = {},
): ComplianceFinding[] {
  const fieldPath = options.fieldPath ?? "$";
  const normalizedText = normalizeForMatch(text);
  const entries = [
    ...flattenBlocklist(blocklist),
    ...additionalEntries(options.additionalForbiddenTerms ?? []),
  ].sort((a, b) => b.normalizedTerm.length - a.normalizedTerm.length);
  const findings: ComplianceFinding[] = [];
  const acceptedRanges: Array<{ start: number; end: number }> = [];

  for (const entry of entries) {
    if (entry.normalizedTerm.length === 0) continue;

    let fromIndex = 0;
    while (fromIndex <= normalizedText.length) {
      const position = normalizedText.indexOf(entry.normalizedTerm, fromIndex);
      if (position === -1) break;

      const end = position + entry.normalizedTerm.length;
      if (
        !overlapsAcceptedRange(acceptedRanges, position, end) &&
        !shouldSkipByBoundary(normalizedText, entry.normalizedTerm, position, end) &&
        !shouldSkipByFalsePositive(normalizedText, entry.normalizedTerm, position, end, fp)
      ) {
        findings.push({
          severity: entry.severity,
          category: entry.category,
          matched_term: entry.term,
          field_path: fieldPath,
          line: lineNumberAt(text, position),
          text_excerpt: excerpt(text, position, end),
          position,
          ...(entry.suggestion ? { suggestion: entry.suggestion } : {}),
        });
        acceptedRanges.push({ start: position, end });
      }

      fromIndex = position + Math.max(1, entry.normalizedTerm.length);
    }
  }

  return findings.sort((a, b) => a.position - b.position || a.matched_term.localeCompare(b.matched_term));
}

function overlapsAcceptedRange(
  ranges: Array<{ start: number; end: number }>,
  start: number,
  end: number,
): boolean {
  return ranges.some((range) => start < range.end && end > range.start);
}

export function scanBible(
  bible: BibleSnapshotV2,
  blocklist: Blocklist,
  fp: FalsePositives,
): ComplianceFinding[] {
  return scanObjectStrings(bible, blocklist, fp);
}

export function scanSceneGraph(
  sceneGraph: SceneGraphV1,
  blocklist: Blocklist,
  fp: FalsePositives,
): ComplianceFinding[] {
  return scanObjectStrings(sceneGraph, blocklist, fp);
}

export function scanStoryboard(
  storyboard: EpisodeStoryboardV2,
  blocklist: Blocklist,
  fp: FalsePositives,
): ComplianceFinding[] {
  return scanObjectStrings(storyboard, blocklist, fp);
}

export function scanPrompt(
  prompt: string,
  blocklist: Blocklist,
  fp: FalsePositives,
  options: ScanTextOptions = {},
): ComplianceFinding[] {
  return scanText(prompt, blocklist, fp, { fieldPath: "prompt", ...options });
}

export function isKatakana(char: string): boolean {
  return /^[\u30A0-\u30FF\u31F0-\u31FF\uFF66-\uFF9D]$/u.test(char);
}

export function isLatinLetter(char: string): boolean {
  return /^[A-Za-zＡ-Ｚａ-ｚ]$/u.test(char);
}

export function isHankakuOrZenkakuDigit(char: string): boolean {
  return /^[0-9０-９]$/u.test(char);
}

function readJson<T>(filePath: string): Promise<T> {
  const resolved = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  return readFile(resolved, "utf8").then((raw) => JSON.parse(raw) as T);
}

function normalizeForMatch(value: string): string {
  return Array.from(value)
    .map((char) => {
      const code = char.charCodeAt(0);
      if (code === 0x3000) return " ";
      if (code >= 0xff01 && code <= 0xff5e) return String.fromCharCode(code - 0xfee0);
      return char;
    })
    .join("");
}

function flattenBlocklist(blocklist: Blocklist): TermEntry[] {
  const entries: TermEntry[] = [];
  const skipKeys = new Set(["schema_version", "_meta", "safe_substitutes", "category_severity"]);

  for (const [topKey, value] of Object.entries(blocklist)) {
    if (skipKeys.has(topKey)) continue;
    collectTerms(value, topKey, blocklist, entries);
  }

  return entries;
}

function collectTerms(value: unknown, category: string, blocklist: Blocklist, entries: TermEntry[]): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item !== "string") continue;
      entries.push({
        term: item,
        normalizedTerm: normalizeForMatch(item),
        category,
        severity: severityForCategory(category, blocklist),
        suggestion: blocklist.safe_substitutes?.[item],
      });
    }
    return;
  }

  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      collectTerms(child, `${category}.${key}`, blocklist, entries);
    }
  }
}

function additionalEntries(terms: string[]): TermEntry[] {
  return terms.map((term) => ({
    term,
    normalizedTerm: normalizeForMatch(term),
    category: "additional_forbidden_terms",
    severity: "fatal",
  }));
}

function severityForCategory(category: string, blocklist: Blocklist): Severity {
  if (blocklist.category_severity?.warn?.includes(category)) return "warn";
  if (blocklist.category_severity?.fatal?.includes(category)) return "fatal";
  return "fatal";
}

function shouldSkipByBoundary(
  normalizedText: string,
  normalizedTerm: string,
  start: number,
  end: number,
): boolean {
  const before = start > 0 ? normalizedText[start - 1] ?? "" : "";
  const after = end < normalizedText.length ? normalizedText[end] ?? "" : "";
  if (before.length === 0 || after.length === 0) return false;

  const termChars = Array.from(normalizedTerm);
  const termIsKatakana = termChars.every(isKatakana);
  if (termIsKatakana && isKatakana(before) && isKatakana(after)) return true;

  const termIsLatinOrDigit = termChars.every((char) => isLatinLetter(char) || isHankakuOrZenkakuDigit(char));
  if (termIsLatinOrDigit && isLatinOrDigit(before) && isLatinOrDigit(after)) return true;

  return false;
}

function shouldSkipByFalsePositive(
  normalizedText: string,
  normalizedTerm: string,
  start: number,
  end: number,
  fp: FalsePositives,
): boolean {
  const exactTerms = new Set((fp.exact_term_excludes ?? []).map(normalizeForMatch));
  if (exactTerms.has(normalizedTerm)) return true;

  const contextRule = findContextRule(fp.context_excludes ?? [], normalizedTerm);
  if (!contextRule) return false;
  if (!contextRule.context_check_required) return true;

  const windowStart = Math.max(0, start - EXCERPT_RADIUS);
  const windowEnd = Math.min(normalizedText.length, end + EXCERPT_RADIUS);
  const windowText = normalizedText.slice(windowStart, windowEnd);
  return !COMMERCIAL_CONTEXT_TERMS.some((term) => windowText.includes(normalizeForMatch(term)));
}

function findContextRule(
  rules: FalsePositiveContextExclude[],
  normalizedTerm: string,
): FalsePositiveContextExclude | undefined {
  return rules.find((rule) => normalizeForMatch(rule.term) === normalizedTerm);
}

function isLatinOrDigit(char: string): boolean {
  return isLatinLetter(char) || isHankakuOrZenkakuDigit(char);
}

function excerpt(text: string, start: number, end: number): string {
  const from = Math.max(0, start - EXCERPT_RADIUS);
  const to = Math.min(text.length, end + EXCERPT_RADIUS);
  return text.slice(from, to).replace(/\r?\n/g, " ");
}

function lineNumberAt(text: string, position: number): number {
  let line = 1;
  for (let index = 0; index < position; index += 1) {
    if (text[index] === "\n") line += 1;
  }
  return line;
}

function scanObjectStrings(
  value: unknown,
  blocklist: Blocklist,
  fp: FalsePositives,
): ComplianceFinding[] {
  const findings: ComplianceFinding[] = [];
  walkStrings(value, "", (fieldPath, text) => {
    findings.push(...scanText(text, blocklist, fp, { fieldPath }));
  });
  return findings;
}

function walkStrings(value: unknown, pathSoFar: string, visit: (fieldPath: string, text: string) => void): void {
  if (typeof value === "string") {
    visit(pathSoFar || "$", value);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      walkStrings(item, `${pathSoFar}[${index}]`, visit);
    });
    return;
  }

  if (!isRecord(value)) return;

  for (const [key, child] of Object.entries(value)) {
    const nextPath = pathSoFar ? `${pathSoFar}.${key}` : key;
    walkStrings(child, nextPath, visit);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
