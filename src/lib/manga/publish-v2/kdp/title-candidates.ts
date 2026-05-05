/**
 * KDP タイトル候補テンプレ生成 (なろう系コミカライズ)
 *
 * 設計根拠 (Plan: wise-exploring-lantern.md B-3):
 *   - なろう系タイトルは「主人公類型 + チート要素 + 状況/ジャンル + 結末示唆」のパターン
 *   - 5案を「ロング (200字級) / ミドル (60-80字) / ショート (35-50字、KDP検索表示推奨) / 副題スタイル / シリーズ展開重視」で出し分け
 *   - 最終決定は competitor-shelf 30件 + 人間 edit を前提
 *
 * KDP 表示仕様:
 *   - title フィールド: max 200字 (技術上限)
 *   - 検索結果カード上の表示は ~35字で打ち切り → ショート案 1つは必ず欲しい
 *   - subtitle (副題) 別フィールドあり
 */
import type { GenreSignature } from "./keyword-pool";

export type TitleCandidatesArgs = {
  genre: GenreSignature;
  /** 主人公キーワード (例: "Fランク探索者", "辺境追放の三男") */
  protagonistArchetype?: string;
  /** チート / トリガー要素 (例: "システム音声", "鑑定スキル", "ヘルモード") */
  cheatElement?: string;
  /** ジャンル定型句 (例: "現代ダンジョン", "領地経営", "迷宮無双") */
  genreContext?: string;
  /** 結末示唆 (例: "世界最速でレベルアップした件", "辺境を救う", "下剋上") */
  outcomeHint?: string;
  /** シリーズ短縮名 (Vol2以降の展開用、副題なしの主タイトル) */
  shortSeriesName?: string;
};

const PLACEHOLDER = (k: string) => `{${k}}`;

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, key) => {
    return vars[key] ?? m;
  });
}

const TEMPLATES_BY_GENRE: Record<GenreSignature, string[]> = {
  modern_dungeon: [
    "{protagonist}の俺にだけ聞こえるんだけど　～{cheat}が{context}の隠しルール全部教えてくれるから、{outcome}～",
    "{protagonist}の俺にだけ聞こえる　〜{context}の隠しスキルで{outcome}〜",
    "{protagonist}と俺だけが聞ける{cheat}　〜{context}を攻略したら最強になった〜",
    "{cheat}が俺だけに告げる隠しルール　〜{protagonist}、{context}世界最速攻略〜",
    "{shortName}　〜{cheat}と組んで{context}無双〜",
  ],
  isekai_dungeon_exploration: [
    "{protagonist}の俺、{cheat}を手にしたから、{context}で{outcome}",
    "{protagonist}転生　〜{cheat}で{context}を攻略する話〜",
    "{cheat}持ちの{protagonist}、{context}で最強になる",
    "{protagonist}の烙印を押された俺、{cheat}で{outcome}",
    "{shortName}　〜{cheat}で{context}{outcome}〜",
  ],
  isekai_noble_territory: [
    "{protagonist}の俺、前世の知識と{cheat}で{outcome}",
    "{protagonist}転生　〜{cheat}で{outcome}〜",
    "{cheat}持ちの{protagonist}、領地経営で{outcome}",
    "{protagonist}に転生したけど、{cheat}があるので{outcome}",
    "{shortName}　〜{cheat}で{outcome}〜",
  ],
};

export function generateTitleCandidates(args: TitleCandidatesArgs): string[] {
  const tpls = TEMPLATES_BY_GENRE[args.genre];
  const vars: Record<string, string> = {
    protagonist: args.protagonistArchetype ?? PLACEHOLDER("protagonist"),
    cheat: args.cheatElement ?? PLACEHOLDER("cheat"),
    context: args.genreContext ?? PLACEHOLDER("context"),
    outcome: args.outcomeHint ?? PLACEHOLDER("outcome"),
    shortName: args.shortSeriesName ?? args.protagonistArchetype ?? PLACEHOLDER("shortName"),
  };
  return tpls.map((t) => fill(t, vars));
}
