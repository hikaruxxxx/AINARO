import type { BibleSnapshotV2 } from "../schemas-v2";

export type UndefinedReference = {
  source_path: string;
  matched_text: string;
  context_excerpt: string;
};

const COMMON_TERMS = new Set([
  "アカウント",
  "アクション",
  "アクセス",
  "アスファルト",
  "アプリ",
  "アーカイブ",
  "暗号",
  "インフラ",
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
  "カウンター",
  "キャラクター",
  "キャンセル",
  "ケーブル",
  "ギルド",
  "クエスト",
  "クラス",
  "グループ",
  "グレーチング",
  "ゲーム",
  "ゲート",
  "コミュニケーション",
  "コンビニ",
  "コンクリート",
  "コントロール",
  "コード",
  "サーバー",
  "サービス",
  "システム",
  "シナリオ",
  "ステータス",
  "ストーリー",
  "スキル",
  "シルエット",
  "スコア",
  "スタイル",
  "ステージ",
  "スペック",
  "スタッフ",
  "スニーカー",
  "スマートフォン",
  "セキュリティ",
  "センサー",
  "スキル",
  "ステータス",
  "ターゲット",
  "タイプ",
  "タイミング",
  "ダメージ",
  "ダンジョン",
  "チーム",
  "チェーン",
  "チャイム",
  "テキスト",
  "テンション",
  "テンプレート",
  "データ",
  "トラブル",
  "トリガー",
  "ナレーション",
  "ナレーション",
  "ネットワーク",
  "バランス",
  "バリア",
  "ハイライト",
  "パターン",
  "パラメータ",
  "パーティ",
  "ヒロイン",
  "フィールド",
  "フィルタ",
  "フェーズ",
  "フォーム",
  "フロア",
  "フロー",
  "フォルダ",
  "プロセス",
  "プロフィール",
  "プログラム",
  "プロトコル",
  "ページ",
  "ポイント",
  "ポケット",
  "ホルダー",
  "マップ",
  "マーカー",
  "ミッション",
  "メッセージ",
  "メニュー",
  "モデル",
  "モチーフ",
  "モード",
  "モニター",
  "ユーザー",
  "ライセンス",
  "ライン",
  "ランク",
  "リアクション",
  "リスト",
  "リズム",
  "レシート",
  "ルール",
  "レベル",
  "ログ",
  "ワールド",
  "一時",
  "一人",
  "一同",
  "一瞬",
  "一瞬間",
  "一部",
  "上記",
  "下記",
  "不明",
  "両方",
  "両者",
  "主人公",
  "互い",
  "人物",
  "人間",
  "仕草",
  "以上",
  "以前",
  "以降",
  "以下",
  "作品",
  "作中",
  "主人公",
  "作中",
  "作者",
  "個人",
  "候補",
  "全体",
  "全員",
  "全域",
  "全範囲",
  "内容",
  "内側",
  "内部",
  "処理",
  "判定",
  "判断",
  "別人",
  "原因",
  "双方",
  "同一",
  "同上",
  "同時",
  "同期",
  "同様",
  "同種",
  "同類",
  "周囲",
  "周辺",
  "周辺部",
  "回数",
  "場所",
  "場面",
  "外側",
  "外部",
  "姿勢",
  "巻",
  "度数",
  "当人",
  "当地",
  "当所",
  "当時",
  "形状",
  "彼女",
  "彼等",
  "彼ら",
  "彼氏",
  "彼達",
  "彼女達",
  "彼女ら",
  "後半",
  "心理",
  "心情",
  "思考",
  "性格",
  "性質",
  "性能",
  "感動",
  "感情",
  "感想",
  "感覚",
  "情報",
  "状態",
  "状勢",
  "状況",
  "理由",
  "現在",
  "現地",
  "現時点",
  "理由",
  "現象",
  "画面",
  "発言",
  "発話",
  "相手",
  "直前",
  "直後",
  "瞬時",
  "瞬間",
  "知識",
  "社会",
  "私達",
  "第一",
  "第三",
  "第二",
  "節",
  "章",
  "端末",
  "結果",
  "経過",
  "編集者",
  "編",
  "者達",
  "自己",
  "自身",
  "自分",
  "著者",
  "表情",
  "表現",
  "表面",
  "裏面",
  "要件",
  "要因",
  "要素",
  "要素群",
  "視点",
  "視線",
  "解決",
  "解釈",
  "記録",
  "該当者",
  "話",
  "詳細",
  "説明",
  "読者",
  "証拠",
  "評価",
  "言動",
  "設定",
  "制度",
  "条件",
  "根拠",
  "行動",
  "行為",
  "表現",
  "描写",
  "挙動",
  "振舞",
  "探索",
  "探索者",
  "携帯",
  "通知",
  "数値",
  "単位",
  "個数",
  "件数",
  "段階",
  "階段",
  "段",
  "階",
  "項",
  "部",
  "物語",
  "印影",
  "印象",
  "印象論",
  "雰囲気",
  "特性",
  "特徴",
  "未来",
  "将来",
  "過去",
  "期間",
  "時刻",
  "時点",
  "時期",
  "時代",
  "一部",
  "関係",
  "関係者",
  "集団",
  "世界",
  "都市",
  "能力",
]);

const PARTICLE_SUFFIX = /[のはをがにへでと、。！？\s]/u;
const KANJI_CHAR = /[\p{Script=Han}]/u;

export function detectUndefinedReferences(bible: BibleSnapshotV2): UndefinedReference[] {
  const known = buildKnownEntityNames(bible);
  const seen = new Set<string>();
  const out: UndefinedReference[] = [];

  for (const field of collectTextFields(bible)) {
    for (const match of extractCandidateMatches(field.text)) {
      const normalized = normalizeName(match.text);
      if (!normalized || known.has(normalized) || COMMON_TERMS.has(normalized)) continue;
      if (isFalsePositiveCandidate(normalized)) continue;
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
    for (const name of expandCharacterNames(character.name)) add(name);
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

function expandCharacterNames(name: string): string[] {
  const out = new Set<string>([name]);
  const compact = name.replace(/\s+/gu, "");
  if (compact !== name) out.add(compact);
  const parts = name.split(/[\s　]+/u).filter((part) => Array.from(part).length >= 2);
  for (const part of parts) out.add(part);
  return Array.from(out);
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
    /(?:[\p{Script=Han}]{2,}[\p{Script=Katakana}ー]+|[\p{Script=Katakana}ー]+[\p{Script=Han}]{2,})[\p{Script=Han}\p{Script=Katakana}ー0-9一二三四五六七八九十]*/gu,
    /[\p{Script=Katakana}ー]{4,18}/gu,
    /[\p{Script=Han}]{3,12}/gu,
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

function isFalsePositiveCandidate(value: string): boolean {
  const chars = Array.from(value);
  if (chars.length <= 4 && chars.every((char) => KANJI_CHAR.test(char))) return true;
  return false;
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
  const start = Math.max(0, before - 50);
  const end = Math.min(chars.length, before + matchLength + 50);
  return chars.slice(start, end).join("");
}
