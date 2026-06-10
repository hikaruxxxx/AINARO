import type { BibleSnapshotV2, CharacterRelationV2, EpisodeStoryboardV2 } from "../schemas-v2";

type CharacterNameIndex = Map<string, { id: string; tokens: string[] }>;

const RELATION_KEYWORD_WEIGHTS: Array<{ pattern: RegExp; weight: number }> = [
  { pattern: /rival|ライバル|競争|対抗|宿敵/i, weight: 1.2 },
  { pattern: /mentor|disciple|師弟|先生|弟子|指導|師匠/i, weight: 1.2 },
  { pattern: /love|romance|恋|片想い|両想い|好意/i, weight: 1.2 },
  { pattern: /protect|guard|守る|保護|庇う|救う/i, weight: 1.0 },
  { pattern: /loyal|忠誠|主従|従者|支える/i, weight: 1.0 },
  { pattern: /family|家族|兄弟|姉妹|親子|擬似家族/i, weight: 1.0 },
  { pattern: /betray|裏切|修復|和解/i, weight: 0.9 },
  { pattern: /secret|秘密|共犯|禁断/i, weight: 0.9 },
  { pattern: /envy|admiration|憧|嫉妬/i, weight: 0.8 },
];

const DESCRIPTION_KEYWORDS = /救|守|憧|嫉妬|秘密|共犯|禁断|片想い|家族|兄弟|姉妹|忠誠|師弟|ライバル|軽口|衝突|和解|裏切|支え|依存|対等|緊張/i;

function relationKey(rel: CharacterRelationV2): string {
  return `${rel.from_character_id}->${rel.to_character_id}`;
}

function buildCharacterNameIndex(bible: BibleSnapshotV2): CharacterNameIndex {
  const index: CharacterNameIndex = new Map();
  for (const character of bible.characters) {
    index.set(character.id, {
      id: character.id,
      tokens: [character.id, character.name, character.name_romaji].filter((v): v is string => Boolean(v)),
    });
  }
  return index;
}

function collectText(value: unknown, depth = 0): string[] {
  if (depth > 5 || value === null || value === undefined) return [];
  if (typeof value === "string") return [value];
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (Array.isArray(value)) return value.flatMap((item) => collectText(item, depth + 1));
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap((item) => collectText(item, depth + 1));
  }
  return [];
}

function buildCorpus(bible: BibleSnapshotV2, storyboards: EpisodeStoryboardV2[] | undefined): string[] {
  const bibleText = collectText({
    meta: bible.meta,
    world: bible.world,
    characters: bible.characters.map((c) => ({
      id: c.id,
      name: c.name,
      appearance_notes: c.appearance_notes,
      speech_style: c.speech_style,
    })),
    relations: bible.relations,
    visual_motifs: bible.visual_motifs,
    volume_synopsis: bible.volume_synopsis,
    // Future optional fields may be present in JSON even before the TS schema grows them.
    episode_outlines: (bible as unknown as Record<string, unknown>).episode_outlines,
    arc_descriptions: (bible as unknown as Record<string, unknown>).arc_descriptions,
    character_arcs: (bible as unknown as Record<string, unknown>).character_arcs,
  });
  const storyboardText = collectText(storyboards?.map((storyboard) => storyboard.pages));
  return [...bibleText, ...storyboardText].map((text) => text.trim()).filter(Boolean);
}

function countCoOccurrences(args: {
  texts: string[];
  names: CharacterNameIndex;
  fromId: string;
  toId: string;
}): number {
  const from = args.names.get(args.fromId);
  const to = args.names.get(args.toId);
  if (!from || !to) return 0;
  let count = 0;
  for (const text of args.texts) {
    const hasFrom = from.tokens.some((token) => text.includes(token));
    const hasTo = to.tokens.some((token) => text.includes(token));
    if (hasFrom && hasTo) count += 1;
  }
  return count;
}

function relationKeywordWeight(rel: CharacterRelationV2): number {
  const target = `${rel.relation_type} ${rel.description} ${rel.appeal_axis ?? ""}`;
  return RELATION_KEYWORD_WEIGHTS.reduce(
    (sum, item) => sum + (item.pattern.test(target) ? item.weight : 0),
    0,
  );
}

function estimateRelationScore(args: {
  rel: CharacterRelationV2;
  texts: string[];
  names: CharacterNameIndex;
}): number {
  const coOccurrence = countCoOccurrences({
    texts: args.texts,
    names: args.names,
    fromId: args.rel.from_character_id,
    toId: args.rel.to_character_id,
  });
  const keywordWeight = relationKeywordWeight(args.rel);
  const descriptionWeight = DESCRIPTION_KEYWORDS.test(args.rel.description) ? 0.8 : 0;
  const evidenceWeight = args.rel.appeal_evidence && args.rel.appeal_evidence.length > 0 ? 0.5 : 0;
  const recommendedWeight = args.rel.is_recommended_pairing ? 0.7 : 0;
  const raw = Math.min(5, coOccurrence * 0.45 + keywordWeight + descriptionWeight + evidenceWeight + recommendedWeight);
  return Math.max(0, Math.round(raw));
}

/**
 * heuristic で character relation の appeal_score を推定（0-5）。
 *
 * bible の relation 記述、volume_synopsis、world、character notes、将来拡張の
 * episode_outlines / arc_descriptions / character_arcs、および任意 storyboard の
 * text から同時出現と関係性キーワードを軽量に集計する。
 */
export function estimateAppealScores(args: {
  bible: BibleSnapshotV2;
  storyboards?: EpisodeStoryboardV2[];
}): Map<string, number> {
  const names = buildCharacterNameIndex(args.bible);
  const texts = buildCorpus(args.bible, args.storyboards);
  const scores = new Map<string, number>();

  for (const rel of args.bible.relations) {
    scores.set(relationKey(rel), estimateRelationScore({ rel, texts, names }));
  }

  return scores;
}
