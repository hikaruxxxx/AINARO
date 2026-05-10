import type { BibleSnapshotV2 } from "../schemas-v2";
import type { Scene } from "../scene-graph/schema";

type CharacterEntry = BibleSnapshotV2["characters"][number];
type LocationEntry = BibleSnapshotV2["locations"][number];
type MotifEntry = BibleSnapshotV2["visual_motifs"][number];
type PropEntry = BibleSnapshotV2["props"][number];
type CostumeSpec = BibleSnapshotV2["costumes"][number]["spec"];
type SummaryTier = "deep" | "medium" | "minimal";

type MotifAnchor = {
  motif_id?: string;
  motif_name?: string;
  intensity?: number;
};

type SceneWithOptionalMotifs = Pick<Scene, "beat_type" | "location_id" | "mode"> & {
  visual_motif_anchors?: MotifAnchor[];
};

const TIER_LIMITS: Record<SummaryTier, { min: number; max: number }> = {
  deep: { min: 800, max: 1500 },
  medium: { min: 400, max: 800 },
  minimal: { min: 200, max: 400 },
};

/** episode_no で active な costume を解決。なければ outfit_default */
export function activeCostumeFor(
  bible: BibleSnapshotV2,
  episodeNo: number,
  characterId: string,
): {
  source: "costume" | "outfit_default" | "missing";
  costume_id?: string;
  spec?: CostumeSpec;
} {
  const active = bible.costumes
    .filter((costume) => costume.character_id === characterId)
    .filter((costume) => {
      const until = costume.valid_until_episode ?? Number.POSITIVE_INFINITY;
      return costume.valid_from_episode <= episodeNo && episodeNo <= until;
    })
    .sort((a, b) => b.valid_from_episode - a.valid_from_episode)[0];

  if (active) {
    return { source: "costume", costume_id: active.id, spec: active.spec };
  }

  const character = findCharacter(bible, characterId);
  if (character?.spec.outfit_default) {
    return { source: "outfit_default", spec: character.spec.outfit_default };
  }

  return { source: "missing" };
}

/** relations[] から pair の現状 state (Phase 2 では static) */
export function relationshipStateAt(
  bible: BibleSnapshotV2,
  _episodeNo: number,
  pair: [string, string],
): {
  found: boolean;
  description?: string;
  bidirectional_a_to_b?: string;
  bidirectional_b_to_a?: string;
  per_volume_delta?: string;
} {
  const [a, b] = pair;
  const relation = bible.relations.find(
    (item) =>
      (item.from_character_id === a && item.to_character_id === b) ||
      (item.from_character_id === b && item.to_character_id === a),
  );

  if (!relation) return { found: false };

  const reversed = relation.from_character_id === b && relation.to_character_id === a;
  return {
    found: true,
    description: relation.description,
    bidirectional_a_to_b: reversed ? relation.bidirectional_b_to_a : relation.bidirectional_a_to_b,
    bidirectional_b_to_a: reversed ? relation.bidirectional_a_to_b : relation.bidirectional_b_to_a,
    per_volume_delta: relation.per_volume_delta,
  };
}

/** scene の beat_type / location_id / mode から該当 motif を 1-3 個推薦 */
export function relevantMotifs(
  bible: BibleSnapshotV2,
  scene: Pick<Scene, "beat_type" | "location_id" | "mode" | "key_visual_intent">,
): MotifEntry[] {
  const location = findLocation(bible, scene.location_id);
  const query = tokens([
    scene.beat_type,
    scene.mode,
    scene.key_visual_intent,
    scene.location_id,
    location?.name,
    location?.spec.atmosphere,
  ]);

  const scored = bible.visual_motifs
    .map((motif, index) => ({ motif, index, score: motifScore(motif, query, scene.mode) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 3)
    .map((item) => item.motif);

  return scored.length > 0 ? scored : bible.visual_motifs.slice(0, 3);
}

/** scene 状況で active な world.rules を抽出 */
export function relevantWorldRules(
  bible: BibleSnapshotV2,
  scene: Pick<Scene, "location_id" | "beat_type" | "mode">,
): string[] {
  const location = findLocation(bible, scene.location_id);
  const query = tokens([scene.location_id, scene.beat_type, scene.mode, location?.name, location?.location_type]);
  const matched = bible.world.rules.filter((rule) => intersects(tokens([rule]), query));
  return (matched.length > 0 ? matched : bible.world.rules).slice(0, 4);
}

/** scene.cast の owner_character_id から active props を抽出 */
export function relevantProps(
  bible: BibleSnapshotV2,
  scene: Pick<Scene, "cast" | "location_id">,
): PropEntry[] {
  const castIds = new Set(scene.cast.map((entry) => entry.character_id));
  const locationTokens = tokens([scene.location_id, findLocation(bible, scene.location_id)?.name]);
  return bible.props.filter((prop) => {
    if (prop.owner_character_id && castIds.has(prop.owner_character_id)) return true;
    return intersects(tokens([prop.name, prop.spec.visual_description, prop.spec.provenance]), locationTokens);
  });
}

/** style_directives.scene_overrides[scene.mode] の本文 */
export function sceneOverrideTextFor(
  bible: BibleSnapshotV2,
  scene: Pick<Scene, "mode" | "beat_type">,
): string | null {
  return bible.style_directives.scene_overrides[scene.mode] ?? bible.style_directives.scene_overrides[scene.beat_type] ?? null;
}

/** attribute_classifier を text tag list 化 */
export function attributeTagsFor(bible: BibleSnapshotV2, characterId: string): string[] {
  const character = findCharacter(bible, characterId);
  if (!character) return [];
  return Object.entries(character.attribute_classifier)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0)
    .map(([key, value]) => `${key}:${value.trim()}`);
}

/** continuity_anchors[] を prompt 投入用 1〜2 行に整形 */
export function continuityAnchorTextFor(bible: BibleSnapshotV2, characterId: string): string {
  const character = findCharacter(bible, characterId);
  if (!character) return `continuity: ${characterId}`;
  const anchors = character.continuity_anchors.length > 0 ? character.continuity_anchors : ["identity must remain stable"];
  return `${character.name} continuity: ${anchors.slice(0, 5).join(" / ")}`;
}

/**
 * 主役の deep_profile から、当該 episode で reach すべき部分を抜粋。
 * 戻り値は tier に応じた prompt 投入用テキスト。
 */
export function summarizeCharacterForEpisode(
  bible: BibleSnapshotV2,
  episodeNo: number,
  characterId: string,
  options: { tier?: SummaryTier } = {},
): string {
  const tier = options.tier ?? "medium";
  const limits = TIER_LIMITS[tier];
  const character = findCharacter(bible, characterId);
  if (!character) {
    return fitSummary(`Character ${characterId}: bible entry missing. Keep identity conservative.`, limits);
  }

  const volume = volumeForEpisode(bible, episodeNo).volumeNo;
  const costume = activeCostumeFor(bible, episodeNo, characterId);
  const relations = relationsForCharacter(bible, character.id);
  const partnerIds = new Set(relations.map((relation) => (relation.from_character_id === character.id ? relation.to_character_id : relation.from_character_id)));
  const partnerNotes = (character.relationship_per_partner ?? [])
    .filter((item) => partnerIds.has(item.partner_id))
    .slice(0, tier === "minimal" ? 1 : 3)
    .map((item) => `関係 ${nameForCharacter(bible, item.partner_id)}: ${item.description}`);

  const growth = (character.growth_per_volume ?? [])
    .filter((item) => item.volume === volume || item.volume === volume - 1)
    .sort((a, b) => a.volume - b.volume)
    .map((item) => `vol.${item.volume}: ${item.description}`);

  const voiceCount = tier === "deep" ? 5 : tier === "medium" ? 4 : 3;
  const voice = selectVoiceSamples(character, volume, episodeNo, voiceCount).map((item) =>
    item.intent ? `${item.intent}: ${item.line}` : item.line,
  );

  const appearance = summarizeAppearance(character, tier);
  const psychology = firstChars(
    joinNonEmpty([character.psychology_deep, character.backstory, character.defense_mechanisms, character.worldview_filter], " "),
    tier === "deep" ? 320 : tier === "medium" ? 220 : 140,
  );
  const psychologyFallback = psychology || character.spec.personality_visual || character.appearance_notes || specIdentity(character);

  const blocks = [
    `${character.name} (${character.id}, ${character.role}) ep.${episodeNo} vol.${volume}.`,
    `外見記号: ${appearance}`,
    `衣装: ${costume.spec ? outfitText(costume.spec) : "既定衣装なし"} (${costume.source}).`,
    `心理/背景: ${psychologyFallback}`,
    growth.length > 0 ? `成長: ${growth.join(" / ")}` : null,
    voice.length > 0 ? `声: ${voice.join(" / ")}` : speechFallback(character),
    partnerNotes.length > 0 ? partnerNotes.join(" / ") : relationFallback(bible, character.id),
    `固定アンカー: ${character.continuity_anchors.slice(0, 4).join(" / ") || "顔・髪・衣装の同一性を維持"}`,
    `属性: ${attributeTagsFor(bible, character.id).slice(0, 8).join(", ") || "未分類"}`,
  ];

  return fitSummary(joinNonEmpty(blocks, "\n"), limits);
}

/** scene の location を 300-600 字に圧縮 */
export function summarizeLocationForScene(
  bible: BibleSnapshotV2,
  scene: Pick<Scene, "location_id" | "mode" | "beat_type">,
): string {
  const location = findLocation(bible, scene.location_id);
  if (!location) return `Location ${scene.location_id}: bible entry missing. Mode=${scene.mode}, beat=${scene.beat_type}.`;

  const iconic = (location.spec.iconic_objects ?? [])
    .slice(0, 4)
    .map((item) => `${item.name}: ${item.description}`)
    .join(" / ");
  const fallback = joinNonEmpty([location.spec.atmosphere, location.spec.lighting_default], " / ");
  return fitSummary(
    joinNonEmpty(
      [
        `${location.name} (${location.id}) scene mode=${scene.mode}, beat=${scene.beat_type}.`,
        location.spec.visual_description || fallback || "場所の視覚説明は未着手。既存 spec から雰囲気と照明を維持する。",
        location.spec.sensory_textures ? `感覚: ${location.spec.sensory_textures}` : null,
        iconic ? `象徴物: ${iconic}` : null,
        location.continuity_anchors.length > 0 ? `固定: ${location.continuity_anchors.slice(0, 4).join(" / ")}` : null,
      ],
      "\n",
    ),
    { min: 300, max: 600 },
  );
}

/** scene 状況で active な world.rules + power_system_logic / social_strata 等を 200-500 字に圧縮 */
export function summarizeWorldRulesForScene(
  bible: BibleSnapshotV2,
  scene: Pick<Scene, "location_id" | "beat_type" | "mode" | "time_axis">,
): string {
  const rules = relevantWorldRules(bible, scene);
  const location = findLocation(bible, scene.location_id);
  return fitSummary(
    joinNonEmpty(
      [
        `World context: ${bible.world.premise}`,
        `Active rules (${location?.name ?? scene.location_id}, ${scene.mode}/${scene.beat_type}): ${rules.join(" / ")}`,
        bible.world.power_system_logic ? `能力体系: ${bible.world.power_system_logic}` : null,
        bible.world.social_strata ? `社会圧: ${bible.world.social_strata}` : null,
        bible.world.daily_life_textures ? `生活感: ${bible.world.daily_life_textures}` : null,
        scene.time_axis.is_flashback || scene.time_axis.is_flashforward ? `時系列: ${scene.time_axis.label}` : null,
      ],
      "\n",
    ),
    { min: 200, max: 500 },
  );
}

/** panel 単位の motif draw_directive を 200-400 字に圧縮 */
export function summarizeMotifForPanel(
  bible: BibleSnapshotV2,
  panel: { panel_no: number },
  scene: SceneWithOptionalMotifs,
): string {
  const anchored = motifsFromAnchors(bible, scene.visual_motif_anchors);
  const motifs = anchored.length > 0 ? anchored : relevantMotifs(bible, { ...scene, key_visual_intent: "" });
  const text = motifs
    .slice(0, 3)
    .map((motif) => `${motif.name}: ${motif.meaning}. draw=${motif.draw_directive}`)
    .join("\n");
  return fitSummary(`Panel ${panel.panel_no} motif directives:\n${text || "No motif selected; keep scene symbolism restrained."}`, {
    min: 200,
    max: 400,
  });
}

function findCharacter(bible: BibleSnapshotV2, characterId: string): CharacterEntry | undefined {
  return bible.characters.find((character) => character.id === characterId);
}

function findLocation(bible: BibleSnapshotV2, locationId: string): LocationEntry | undefined {
  return bible.locations.find((location) => location.id === locationId);
}

function nameForCharacter(bible: BibleSnapshotV2, characterId: string): string {
  return findCharacter(bible, characterId)?.name ?? characterId;
}

function volumeForEpisode(bible: BibleSnapshotV2, episodeNo: number): { volumeNo: number; episodeInVolume: number } {
  const perVolume = Math.max(1, bible.meta.target_episodes_per_volume);
  const volumeNo = Math.max(1, Math.ceil(episodeNo / perVolume));
  const episodeInVolume = ((Math.max(1, episodeNo) - 1) % perVolume) + 1;
  return { volumeNo, episodeInVolume };
}

function relationsForCharacter(bible: BibleSnapshotV2, characterId: string): BibleSnapshotV2["relations"] {
  return bible.relations.filter((relation) => relation.from_character_id === characterId || relation.to_character_id === characterId);
}

function selectVoiceSamples(
  character: CharacterEntry,
  volume: number,
  episodeNo: number,
  count: number,
): NonNullable<CharacterEntry["voice_samples"]> {
  const samples = character.voice_samples ?? [];
  const exact = samples.filter((sample) => {
    const hint = sample.episode_or_scene_hint ?? "";
    return hint.includes(`episode ${episodeNo}`) || hint.includes(`ep${episodeNo}`) || hint.includes(`vol.${volume}`) || hint.includes(`volume ${volume}`);
  });
  return [...exact, ...samples.filter((sample) => !exact.includes(sample))].slice(0, count);
}

function summarizeAppearance(character: CharacterEntry, tier: SummaryTier): string {
  const max = tier === "deep" ? 220 : tier === "medium" ? 150 : 90;
  const fromNotes = firstChars(character.appearance_notes ?? "", max);
  return fromNotes || specIdentity(character);
}

function specIdentity(character: CharacterEntry): string {
  const hair = character.spec.hair
    ? `hair ${joinNonEmpty([character.spec.hair.color, character.spec.hair.style, character.spec.hair.specific], " ")}`
    : "";
  const eyes = character.spec.eyes
    ? `eyes ${joinNonEmpty([character.spec.eyes.color, character.spec.eyes.shape, character.spec.eyes.expression_default], " ")}`
    : "";
  const outfit = character.spec.outfit_default ? outfitText(character.spec.outfit_default) : "";
  return joinNonEmpty([character.spec.personality_visual, hair, eyes, outfit], " / ") || character.name;
}

function speechFallback(character: CharacterEntry): string {
  const style = character.speech_style;
  if (!style) return "声: 既存の性格・表情に合わせ、過度に説明しない。";
  return `声: ${joinNonEmpty([style.first_person, style.register, style.sentence_rhythm, style.monologue_signature], " / ")}`;
}

function relationFallback(bible: BibleSnapshotV2, characterId: string): string {
  const relations = relationsForCharacter(bible, characterId).slice(0, 2);
  if (relations.length === 0) return "関係: scene cast に応じて距離感を控えめに維持。";
  return `関係: ${relations.map((relation) => relation.description).join(" / ")}`;
}

function outfitText(spec: CostumeSpec): string {
  return joinNonEmpty(
    [
      spec.visual_description,
      spec.state_description,
      spec.top ? `top=${spec.top}` : null,
      spec.bottom ? `bottom=${spec.bottom}` : null,
      spec.outerwear ? `outer=${spec.outerwear}` : null,
      spec.shoes ? `shoes=${spec.shoes}` : null,
      spec.accessories && spec.accessories.length > 0 ? `accessories=${spec.accessories.join(",")}` : null,
      spec.notes,
    ],
    " / ",
  );
}

function motifsFromAnchors(bible: BibleSnapshotV2, anchors: MotifAnchor[] | undefined): MotifEntry[] {
  if (!anchors || anchors.length === 0) return [];
  return anchors
    .map((anchor) => {
      const key = anchor.motif_id ?? anchor.motif_name;
      return bible.visual_motifs.find((motif) => motif.name === key);
    })
    .filter((motif): motif is MotifEntry => motif !== undefined);
}

function motifScore(motif: MotifEntry, query: Set<string>, mode: Scene["mode"]): number {
  const motifTokens = tokens([motif.name, motif.meaning, motif.draw_directive, motif.symbolic_lineage, ...(motif.reference_scenes ?? [])]);
  let score = 0;
  for (const token of motifTokens) {
    if (query.has(token)) score += 2;
  }
  if (mode === "silence" && intersects(motifTokens, new Set(["silence", "silent", "sleep", "眠", "睡眠", "沈黙", "無音"]))) {
    score += 5;
  }
  return score;
}

function tokens(values: Array<string | undefined | null>): Set<string> {
  const out = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    const words = value
      .toLowerCase()
      .split(/[^a-z0-9一-龯ぁ-んァ-ヶー]+/u)
      .map((word) => word.trim())
      .filter((word) => word.length > 0);
    for (const word of words) out.add(word);
  }
  return out;
}

function intersects(a: Set<string>, b: Set<string>): boolean {
  for (const item of a) {
    if (b.has(item)) return true;
  }
  return false;
}

function joinNonEmpty(values: Array<string | null | undefined>, separator: string): string {
  return values
    .map((value) => value?.trim())
    .filter((value): value is string => value !== undefined && value.length > 0)
    .join(separator);
}

function firstChars(text: string, max: number): string {
  const normalized = text.replace(/\s+/gu, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 1))}…`;
}

function fitSummary(text: string, limits: { min: number; max: number }): string {
  const normalized = text.replace(/[ \t]+/gu, " ").replace(/\n{3,}/gu, "\n\n").trim();
  if (normalized.length > limits.max) {
    return `${normalized.slice(0, Math.max(0, limits.max - 1)).trimEnd()}…`;
  }
  if (normalized.length >= limits.min) return normalized;

  const padding = " 補足: 未着手の深掘り項目は既存 spec と continuity anchor を優先し、顔・髪・衣装・関係距離の同一性を崩さない。";
  let out = normalized;
  while (out.length < limits.min && out.length + padding.length <= limits.max) {
    out += padding;
  }
  return out;
}
