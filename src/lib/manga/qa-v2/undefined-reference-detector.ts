import type { BibleSnapshotV2 } from "../schemas-v2";

export type UndefinedReference = {
  source_path: string;
  matched_text: string;
  context_excerpt: string;
};

const COMMON_TERMS = new Set([
  "アカウント",
  "アクション",
  "アプリ",
  "アーカイブ",
  "イベント",
  "インターフェース",
  "エネルギー",
  "エピソード",
  "エリア",
  "オペレーター",
  "カード",
  "ガチャ",
  "カテゴリー",
  "カメラ",
  "キャラクター",
  "キャンセル",
  "ギルド",
  "クエスト",
  "クラス",
  "グループ",
  "ゲーム",
  "ゲート",
  "コミュニケーション",
  "コントロール",
  "コード",
  "サーバー",
  "サービス",
  "システム",
  "シナリオ",
  "ステータス",
  "ストーリー",
  "スキル",
  "スコア",
  "スタイル",
  "ステージ",
  "スペック",
  "スマートフォン",
  "セキュリティ",
  "センサー",
  "ターゲット",
  "タイプ",
  "タイミング",
  "ダメージ",
  "ダンジョン",
  "チーム",
  "テキスト",
  "テンション",
  "テンプレート",
  "データ",
  "トラブル",
  "トリガー",
  "ナレーション",
  "ネットワーク",
  "バランス",
  "バリア",
  "パターン",
  "パラメータ",
  "パーティ",
  "ヒロイン",
  "フィールド",
  "フェーズ",
  "フォーム",
  "フロア",
  "フロー",
  "プロセス",
  "プロフィール",
  "プログラム",
  "ページ",
  "ポイント",
  "マップ",
  "ミッション",
  "メッセージ",
  "メニュー",
  "モデル",
  "モチーフ",
  "モード",
  "ユーザー",
  "ライセンス",
  "ライン",
  "ランク",
  "リアクション",
  "リスト",
  "リズム",
  "ルール",
  "レベル",
  "ログ",
  "ワールド",
  "主人公",
  "作中",
  "作者",
  "候補",
  "関係",
  "世界",
  "都市",
  "能力",
]);

const PARTICLE_SUFFIX = /[のはをがにへでと、。！？\s]/u;

export function detectUndefinedReferences(bible: BibleSnapshotV2): UndefinedReference[] {
  const known = buildKnownEntityNames(bible);
  const seen = new Set<string>();
  const out: UndefinedReference[] = [];

  for (const field of collectTextFields(bible)) {
    for (const match of extractCandidateMatches(field.text)) {
      const normalized = normalizeName(match.text);
      if (!normalized || known.has(normalized) || COMMON_TERMS.has(normalized)) continue;
      if (isLikelyCommonTerm(normalized)) continue;

      const key = `${field.path}:${normalized}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        source_path: field.path,
        matched_text: match.text,
        context_excerpt: excerptAround(field.text, match.index, match.text.length),
      });
    }
  }

  return out;
}

function buildKnownEntityNames(bible: BibleSnapshotV2): Set<string> {
  const known = new Set<string>();
  const add = (value: unknown): void => {
    if (typeof value !== "string") return;
    const normalized = normalizeName(value);
    if (normalized) known.add(normalized);
  };

  for (const character of bible.characters) {
    add(character.name);
    add(character.id);
  }
  for (const location of bible.locations) {
    add(location.name);
    add(location.id);
  }
  for (const prop of bible.props) {
    add(prop.name);
    add(prop.id);
  }
  for (const costume of bible.costumes) {
    add(costume.id);
  }
  for (const faction of bible.world.factions) {
    add(faction.name);
  }
  for (const motif of bible.visual_motifs) {
    add(motif.name);
  }

  return known;
}

function collectTextFields(bible: BibleSnapshotV2): Array<{ path: string; text: string }> {
  const fields: Array<{ path: string; text: string }> = [];
  const add = (path: string, value: unknown): void => {
    if (typeof value === "string" && value.trim()) fields.push({ path, text: value });
  };
  const recurse = (path: string, value: unknown): void => {
    if (typeof value === "string") {
      add(path, value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => recurse(`${path}[${index}]`, item));
      return;
    }
    if (typeof value === "object" && value !== null) {
      for (const [key, child] of Object.entries(value)) recurse(`${path}.${key}`, child);
    }
  };

  add("world.premise", bible.world.premise);
  bible.world.rules.forEach((rule, index) => add(`world.rules[${index}]`, rule));
  add("world.system", bible.world.system);
  add("world.timeline", bible.world.timeline);
  recurse("world.history", bible.world.history);
  add("world.power_system_logic", bible.world.power_system_logic);
  add("world.cosmology", bible.world.cosmology);
  add("world.economic_system", bible.world.economic_system);
  add("world.social_strata", bible.world.social_strata);
  add("world.daily_life_textures", bible.world.daily_life_textures);
  add("world.language_and_naming", bible.world.language_and_naming);
  recurse("world.forbidden_lore", bible.world.forbidden_lore);

  bible.characters.forEach((character, index) => {
    const base = `characters[${index}]`;
    add(`${base}.backstory`, character.backstory);
    add(`${base}.psychology_deep`, character.psychology_deep);
    add(`${base}.defense_mechanisms`, character.defense_mechanisms);
    add(`${base}.worldview_filter`, character.worldview_filter);
    add(`${base}.appearance_notes`, character.appearance_notes);
    add(`${base}.typical_day_in_life`, character.typical_day_in_life);
    add(`${base}.origin_wound_deep`, character.origin_wound_deep);
    add(`${base}.ideology_argument`, character.ideology_argument);
    add(`${base}.dark_mirror_to_protagonist`, character.dark_mirror_to_protagonist);
    character.childhood_episodes?.forEach((episode, childIndex) => add(`${base}.childhood_episodes[${childIndex}]`, episode));
    character.voice_samples?.forEach((sample, sampleIndex) => add(`${base}.voice_samples[${sampleIndex}].line`, sample.line));
    character.relationship_per_partner?.forEach((rel, relIndex) => add(`${base}.relationship_per_partner[${relIndex}].description`, rel.description));
    character.growth_per_volume?.forEach((growth, growthIndex) => add(`${base}.growth_per_volume[${growthIndex}].description`, growth.description));
  });

  bible.locations.forEach((location, index) => recurse(`locations[${index}].spec`, location.spec));

  return fields;
}

function extractCandidateMatches(text: string): Array<{ text: string; index: number }> {
  const matches: Array<{ text: string; index: number }> = [];
  const patterns = [
    /[\p{Script=Han}]{2,4}の[\p{Script=Han}\p{Script=Katakana}ー]{2,12}/gu,
    /[\p{Script=Katakana}ー]{2,8}(?:の)?[\p{Script=Han}0-9一二三四五六七八九十]{2,12}/gu,
    /[\p{Script=Katakana}ー]{4,18}/gu,
    /[\p{Script=Han}]{2,3}(?=[のはをがにへでと、。！？\s])/gu,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) continue;
      const value = trimCandidate(match[0]);
      if (!value) continue;
      const index = match.index + match[0].indexOf(value);
      matches.push({ text: value, index });
    }
  }

  return matches.sort((a, b) => a.index - b.index || b.text.length - a.text.length);
}

function trimCandidate(value: string): string {
  return value.replace(/[、。！？\s]+$/u, "").replace(/^[「『（(【\s]+|[」』）)】\s]+$/gu, "");
}

function normalizeName(value: string): string {
  return trimCandidate(value).replace(/\s+/gu, "").replace(/・/gu, "");
}

function isLikelyCommonTerm(value: string): boolean {
  if (/^[\p{Script=Katakana}ー]+$/u.test(value) && value.length < 4) return true;
  if (/^[\p{Script=Han}]{2,3}$/u.test(value) && COMMON_TERMS.has(value)) return true;
  if (/^[一二三四五六七八九十0-9]+(?:段階|階層|巻|話)$/u.test(value)) return true;
  if (PARTICLE_SUFFIX.test(value[value.length - 1] ?? "")) return true;
  return false;
}

function excerptAround(text: string, index: number, length: number): string {
  const chars = Array.from(text);
  const before = Array.from(text.slice(0, index)).length;
  const matchLength = Array.from(text.slice(index, index + length)).length;
  const start = Math.max(0, before - 30);
  const end = Math.min(chars.length, before + matchLength + 30);
  return chars.slice(start, end).join("");
}
