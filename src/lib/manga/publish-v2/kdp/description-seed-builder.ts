/**
 * KDP description_seed 自動生成 (なろう系コミカライズ)
 *
 * 設計根拠 (Plan: wise-exploring-lantern.md B-3):
 *   - bible.snapshot + meta.json から description_seed (hook/turn/synopsis/recommend/cta) を組み立てる
 *   - description-template.ts の DescriptionSeed と同型を返す
 *   - 完璧な文章は LLM に頼らず、機械的にテンプレ穴埋めで「8割の品質」を出す
 *     → Phase A の3作品向けで、最終 polish は手動 edit を前提
 *
 * テンプレ構造 (なろう系コミカライズ description の定番):
 *   hook_line      : 主人公の状況 + 1行で「何が起きるか」を提示
 *   turn_line      : 転機の1行 (チート発覚 / システム音声 / 鑑定発動 / 等)
 *   synopsis_lines : 3行 (世界観 → 主人公 → 物語の駆動力)
 *   recommend_points: 3項目 (完結保証 / シリーズ規模 / 差別化要素)
 *   cta_line       : 「続きはぜひ本編でお楽しみください。」+ 巻番号示唆
 *   related_keywords: 検索流入時の関連語表示用 (5語程度)
 */
import type { DescriptionSeed } from "./description-template";
import type { GenreSignature } from "./keyword-pool";

/** ジャンル別の汎用テンプレ素材 (人物・物語の典型語彙) */
const TEMPLATE_BY_GENRE: Record<GenreSignature, {
  hook_template: string;
  turn_template: string;
  synopsis_world_template: string;
  synopsis_protagonist_template: string;
  synopsis_drive_template: string;
  recommend_completion: string;
  related_default: string[];
}> = {
  modern_dungeon: {
    hook_template: "{protagonist_archetype}の俺。ある日、{trigger}に気づいた。",
    turn_template: "──「{system_voice_line}」",
    synopsis_world_template:
      "現代日本に突如現れたダンジョン。協会から発行される探索者ランクは、生涯の評価を決める。",
    synopsis_protagonist_template:
      "{protagonist_archetype}認定をされた俺・{protagonist_name}のもとに、{ability_or_partner}が降ってくる。",
    synopsis_drive_template:
      "他の誰にも知られない、{secret_advantage}。世界最速のレベルアップが、今ここから始まる。",
    recommend_completion: "全{volumes}巻で完結予定。打ち切りなしの読了体験を保証。",
    related_default: ["現代ダンジョン", "システム音声", "Fランク", "なろう系", "主人公最強"],
  },
  isekai_dungeon_exploration: {
    hook_template: "{protagonist_archetype}に転生した俺。{trigger}を手にした。",
    turn_template: "──「{ability_announcement}」",
    synopsis_world_template:
      "魔物が跋扈し、迷宮が眠る異世界。冒険者ランクは生涯の格付けを決める。",
    synopsis_protagonist_template:
      "{protagonist_archetype}の烙印を押された俺・{protagonist_name}のもとに、{ability_or_partner}が宿る。",
    synopsis_drive_template:
      "他の誰にも見えない、{secret_advantage}。最弱からの最強への成り上がりが、今ここから始まる。",
    recommend_completion: "全{volumes}巻で完結予定。打ち切りなしの読了体験を保証。",
    related_default: ["異世界転生", "ダンジョン", "ハズレスキル", "なろう系", "主人公最強"],
  },
  isekai_noble_territory: {
    hook_template: "{protagonist_archetype}に転生した俺。前世の知識で、領地を変える。",
    turn_template: "──「{ability_announcement}」",
    synopsis_world_template:
      "貴族と平民の格差が運命を決める異世界。家格と領地経営が一族の存亡を決める。",
    synopsis_protagonist_template:
      "{protagonist_archetype}として軽んじられる俺・{protagonist_name}のもとに、{ability_or_partner}が宿る。",
    synopsis_drive_template:
      "他の誰にも理解されない、{secret_advantage}。零落貴族の成り上がりが、今ここから始まる。",
    recommend_completion: "全{volumes}巻で完結予定。打ち切りなしの読了体験を保証。",
    related_default: ["異世界転生", "領地経営", "成り上がり", "なろう系", "鑑定スキル"],
  },
};

/** テンプレ変数を埋める。未指定の {var} はそのまま残す (人間 edit 前提) */
function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, key) => {
    return vars[key] ?? m;
  });
}

export type BuildDescriptionSeedArgs = {
  genre: GenreSignature;
  protagonistName?: string;
  /** 主人公類型ラベル (例: "Fランク探索者", "ハズレスキル持ち", "辺境追放の三男") */
  protagonistArchetype?: string;
  /** 転機・きっかけ (例: "頭の中にだけ響く声", "鑑定スキルの覚醒") */
  trigger?: string;
  /** システム音声/能力の宣言 (turn_line) */
  systemVoiceLine?: string;
  /** 能力宣言 (異世界系の turn_line) */
  abilityAnnouncement?: string;
  /** 主人公が手にする能力 or パートナー */
  abilityOrPartner?: string;
  /** 主人公が独占する利点 */
  secretAdvantage?: string;
  /** 全巻数 (volume_plan.estimated_volumes 由来) */
  totalVolumes?: number;
  /** 1話pages × 1巻話数 */
  pagesPerEp?: number;
  epsPerVolume?: number;
  /** 差別化ポイント (1-2行で recommend_points #3 に使う) */
  differentiationLine?: string;
  /** related_keywords を上書き (省略時はジャンル既定) */
  relatedKeywords?: string[];
};

export function buildDescriptionSeed(args: BuildDescriptionSeedArgs): DescriptionSeed {
  const tpl = TEMPLATE_BY_GENRE[args.genre];
  const vars: Record<string, string> = {
    protagonist_archetype: args.protagonistArchetype ?? "{protagonist_archetype}",
    protagonist_name: args.protagonistName ?? "{protagonist_name}",
    trigger: args.trigger ?? "{trigger}",
    system_voice_line: args.systemVoiceLine ?? "{system_voice_line}",
    ability_announcement: args.abilityAnnouncement ?? "{ability_announcement}",
    ability_or_partner: args.abilityOrPartner ?? "{ability_or_partner}",
    secret_advantage: args.secretAdvantage ?? "{secret_advantage}",
    volumes: String(args.totalVolumes ?? "?"),
  };

  const hook_line = fillTemplate(tpl.hook_template, vars);
  const turn_line = fillTemplate(tpl.turn_template, vars);
  const synopsis_lines = [
    fillTemplate(tpl.synopsis_world_template, vars),
    fillTemplate(tpl.synopsis_protagonist_template, vars),
    fillTemplate(tpl.synopsis_drive_template, vars),
  ];

  const recommend_points: string[] = [
    fillTemplate(tpl.recommend_completion, vars),
  ];
  if (args.pagesPerEp && args.epsPerVolume) {
    recommend_points.push(
      `1話${args.pagesPerEp}ページ × ${args.epsPerVolume}話 / 巻、Kindle読み放題対応。`
    );
  }
  if (args.differentiationLine) {
    recommend_points.push(args.differentiationLine);
  }

  return {
    hook_line,
    turn_line,
    synopsis_lines,
    recommend_points,
    cta_line: "続きはぜひ本編でお楽しみください。",
    related_keywords: args.relatedKeywords ?? tpl.related_default,
  };
}
