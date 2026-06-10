import type {
  BibleSnapshotV2,
  BibleSnapshotV3,
  FactNode,
  PanelV2,
  StoryboardPageV2,
} from "../schemas-v2";

export type MonologueLeakFinding = {
  page_no: number;
  panel_id: string;
  reading_order: number;
  speaker_id: string | null;
  text: string;
  matched_meta_phrase: string;
  source_character_id?: string;
  severity: "fatal" | "warn";
};

type MetaPhrase = {
  phrase: string;
  source_character_id?: string;
};

const META_TRUTH_V2_FIELDS = [
  "psychology_deep",
  "origin_wound_deep",
  "ideology_argument",
  "dark_mirror_to_protagonist",
] as const;

const GENERIC_PHRASES = new Set([
  "主人公",
  "探索者",
  "ダンジョン",
  "キャラクター",
  "プロtagonist",
  "antagonist",
  "author",
  "meta",
]);

export function checkMonologueLayerLeak(
  storyboard: { pages: StoryboardPageV2[] },
  bible: BibleSnapshotV2
): MonologueLeakFinding[] {
  const knownEntityNames = collectKnownEntityNames(bible);
  const phrases = collectMetaPhrases(bible, knownEntityNames);
  const findings: MonologueLeakFinding[] = [];

  for (const page of storyboard.pages) {
    for (const panel of page.panels) {
      for (const line of panelTextEntries(panel)) {
        for (const meta of phrases) {
          if (!line.text.includes(meta.phrase)) continue;
          if (line.speaker_id && line.speaker_id === meta.source_character_id) continue;
          findings.push({
            page_no: page.page_no,
            panel_id: panel.panel_id,
            reading_order: panel.reading_order,
            speaker_id: line.speaker_id,
            text: line.text,
            matched_meta_phrase: meta.phrase,
            source_character_id: meta.source_character_id,
            severity: line.speaker_id && panelCast(panel).has(line.speaker_id) ? "fatal" : "warn",
          });
          break;
        }
      }
    }
  }

  return findings;
}

function collectMetaPhrases(bible: BibleSnapshotV2, knownEntityNames: Set<string>): MetaPhrase[] {
  const dedup = new Map<string, MetaPhrase>();

  for (const fact of metaTruthFacts(bible)) {
    addPhrases(dedup, fact.body, knownEntityNames, fact.entity_id ?? undefined);
  }

  for (const character of bible.characters) {
    const text = META_TRUTH_V2_FIELDS
      .map((field) => character[field])
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join("。");
    addPhrases(dedup, text, knownEntityNames, character.id);
  }

  return [...dedup.values()].sort((a, b) => b.phrase.length - a.phrase.length || a.phrase.localeCompare(b.phrase));
}

function metaTruthFacts(bible: BibleSnapshotV2): FactNode[] {
  const maybeV3 = bible as BibleSnapshotV2 & Partial<Pick<BibleSnapshotV3, "facts">>;
  if (!Array.isArray(maybeV3.facts)) return [];
  return maybeV3.facts.filter((fact) => fact.layer === "meta_truth" && typeof fact.body === "string");
}

function addPhrases(
  out: Map<string, MetaPhrase>,
  text: string,
  knownEntityNames: Set<string>,
  source_character_id?: string
): void {
  for (const phrase of extractKeyPhrases(text)) {
    if (knownEntityNames.has(phrase) || GENERIC_PHRASES.has(phrase)) continue;
    if (!out.has(phrase)) out.set(phrase, { phrase, source_character_id });
  }
}

function extractKeyPhrases(text: string): string[] {
  const phrases = new Set<string>();
  for (const match of text.matchAll(/[「『“"]([^」』”"]{4,30})[」』”"]/gu)) {
    phrases.add(cleanPhrase(match[1]));
  }
  for (const match of text.matchAll(/[ァ-ヶー]{4,}/gu)) {
    phrases.add(cleanPhrase(match[0]));
  }
  for (const match of text.matchAll(/[一-龯々]{3,}/gu)) {
    phrases.add(cleanPhrase(match[0]));
  }
  for (const match of text.matchAll(/[一-龯々ァ-ヶー]{4,}/gu)) {
    phrases.add(cleanPhrase(match[0]));
  }
  return [...phrases].filter((phrase) => phrase.length >= 3);
}

function cleanPhrase(value: string): string {
  return value.replace(/[、。，．・:：;；!?！？()[\]（）【】]/g, "").trim();
}

function panelTextEntries(panel: PanelV2): Array<{ speaker_id: string | null; text: string }> {
  return [
    ...panel.monologue.map((line) => ({ speaker_id: line.character_id, text: line.text })),
    ...panel.narration.map((text) => ({ speaker_id: null, text })),
  ].filter((line) => line.text.trim().length > 0);
}

function panelCast(panel: PanelV2): Set<string> {
  return new Set(panel.entities.characters.map((entry) => entry.character_id));
}

function collectKnownEntityNames(bible: BibleSnapshotV2): Set<string> {
  const names = new Set<string>();
  for (const character of bible.characters) addName(names, character.name);
  for (const location of bible.locations) addName(names, location.name);
  for (const prop of bible.props) addName(names, prop.name);
  for (const motif of bible.visual_motifs) addName(names, motif.name);
  for (const faction of bible.world.factions ?? []) addName(names, faction.name);

  const maybeV3 = bible as BibleSnapshotV2 & Partial<Pick<BibleSnapshotV3, "entities">>;
  if (Array.isArray(maybeV3.entities)) {
    for (const entity of maybeV3.entities) addName(names, entity.name);
  }
  return names;
}

function addName(names: Set<string>, name: unknown): void {
  if (typeof name !== "string") return;
  const trimmed = name.trim();
  if (trimmed.length > 0) names.add(trimmed);
}
