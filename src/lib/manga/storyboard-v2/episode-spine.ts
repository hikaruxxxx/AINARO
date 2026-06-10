/**
 * EpisodeSpine: 話情緒契約。
 *
 * WEBTOON ヒット作 (累計 1 億 views クラス) の典型構造
 * 「侮辱 → 秘宝 → 覚醒 → 反撃 → タイトル ROAR」を episode-level の
 * 契約フィールドとして強制する。
 *
 * 動画分析 (『俺だけ最強超越者』Kindle 横読み版、2026-05-20) で
 * a07 ep1 との構造差が明確化。Codex + Claude 議論で Domain B として確定。
 * 詳細: /Users/hikarumori/.claude/plans/10-90-codex-wild-goblet.md Section 4
 */

export type HumiliationEvent = {
  /** page_target の 15-30% 位置 */
  page: number;
  /** bible.characters[].id (role="antagonist" 必須) */
  humiliator_character_id: string;
  /** 誰の前で侮辱されるか 40字 */
  audience: string;
  /** 侮辱内容 60字 */
  insult: string;
  /** 制度的不公平の核 60字 */
  unfairness: string;
  /** なぜ反論できないか 40字 */
  protagonist_cannot_answer_yet: string;
  reader_emotion_target: "anger" | "shame" | "revenge_desire";
  payback_hint_episode: number;
  severity: 1 | 2 | 3 | 4 | 5;
};

export type SecretOrTreasureEvent = {
  /** page_target の 30-50% 位置 */
  page: number;
  secret_type: "system_reveal" | "hidden_rule" | "ally_secret" | "treasure" | "knowledge";
  /** 60字 */
  visual_signature: string;
};

export type AwakeningEvent = {
  /** page_target の 50-70% 位置 */
  page: number;
  awakening_type: "skill" | "resolve" | "alliance" | "knowledge_application";
  /** 0-1、ep1 climax は 0.85+ */
  intensity_target: number;
};

export type PaybackEvent = {
  /** page_target の 70-90% 位置 */
  page: number;
  payback_type:
    | "direct_combat"
    | "social_reveal"
    | "system_break"
    | "unexpected_alliance";
  /** 80字、絵で見せる勝利 */
  visual_catharsis_signature: string;
  /** 0-1、ep1 は 0.90+ */
  intensity_target: number;
};

export type TitleAnchor = {
  /** 反撃成立直後 (a07 ep1 なら p18-p22) */
  page: number;
  /** ROAR を発火させる出来事 40字 */
  trigger_event: string;
  /** 主人公のポーズ 40字 */
  visual_pose: string;
  emotional_function: "awakening" | "revenge_start" | "identity_claim";
  /** SVG ロゴ asset_id (合成用、AI 生成禁止) */
  overlay_logo_asset: string;
};

export type EpisodeSpine = {
  /** ep1 + 巻冒頭話で必須、ep2 以降は任意 */
  humiliation_event?: HumiliationEvent;
  /** 全話必須 */
  secret_or_treasure_event: SecretOrTreasureEvent;
  /** 全話必須 */
  awakening_event: AwakeningEvent;
  /** 全話必須 */
  payback_event: PaybackEvent;
  /** ep1 で必須、それ以外は任意 */
  title_anchor?: TitleAnchor;
};

export type EpisodeSpineWarning = string;

/**
 * EpisodeSpine の整合性検証。
 * isFirstEpisode = true の場合、humiliation_event / title_anchor は null 禁止。
 * 全話で secret/awakening/payback は null 禁止。
 * page 順序: humiliation < secret_or_treasure < awakening < payback < title_anchor (title_anchor は payback 直後を想定)
 */
export function validateEpisodeSpine(
  spine: EpisodeSpine | undefined,
  isFirstEpisode: boolean,
  pageTarget: number,
): EpisodeSpineWarning[] {
  const warnings: EpisodeSpineWarning[] = [];
  if (!spine) {
    warnings.push("episode_spine が未設定 (Domain B 違反)");
    return warnings;
  }

  // ep1 必須フィールド
  if (isFirstEpisode) {
    if (!spine.humiliation_event) {
      warnings.push("ep1: humiliation_event が必須 (Domain B 違反)");
    }
    if (!spine.title_anchor) {
      warnings.push("ep1: title_anchor が必須 (Domain B 違反)");
    }
  }

  // 全話必須
  if (!spine.secret_or_treasure_event) {
    warnings.push("episode_spine.secret_or_treasure_event が必須");
  }
  if (!spine.awakening_event) {
    warnings.push("episode_spine.awakening_event が必須");
  }
  if (!spine.payback_event) {
    warnings.push("episode_spine.payback_event が必須");
  }

  // page 範囲チェック
  const pages: Array<{ name: string; page: number | undefined; minPct: number; maxPct: number }> = [
    { name: "humiliation_event", page: spine.humiliation_event?.page, minPct: 0.10, maxPct: 0.35 },
    { name: "secret_or_treasure_event", page: spine.secret_or_treasure_event?.page, minPct: 0.25, maxPct: 0.55 },
    { name: "awakening_event", page: spine.awakening_event?.page, minPct: 0.45, maxPct: 0.75 },
    { name: "payback_event", page: spine.payback_event?.page, minPct: 0.65, maxPct: 0.95 },
    { name: "title_anchor", page: spine.title_anchor?.page, minPct: 0.70, maxPct: 1.0 },
  ];
  for (const p of pages) {
    if (p.page === undefined) continue;
    const minP = Math.max(1, Math.floor(pageTarget * p.minPct));
    const maxP = Math.ceil(pageTarget * p.maxPct);
    if (p.page < minP || p.page > maxP) {
      warnings.push(
        `${p.name}.page=${p.page} が推奨範囲外 (p${minP}-p${maxP}, page_target=${pageTarget})`,
      );
    }
  }

  // page 順序: humiliation < secret < awakening < payback ≤ title
  const ordered: Array<[string, number | undefined]> = [
    ["humiliation_event", spine.humiliation_event?.page],
    ["secret_or_treasure_event", spine.secret_or_treasure_event?.page],
    ["awakening_event", spine.awakening_event?.page],
    ["payback_event", spine.payback_event?.page],
    ["title_anchor", spine.title_anchor?.page],
  ];
  let prevPage: number | undefined = undefined;
  let prevName: string | undefined = undefined;
  for (const [name, page] of ordered) {
    if (page === undefined) continue;
    if (prevPage !== undefined && page < prevPage) {
      warnings.push(`${name}.page=${page} が前イベント ${prevName}.page=${prevPage} より前 (順序違反)`);
    }
    prevPage = page;
    prevName = name;
  }

  // intensity_target 範囲
  if (spine.awakening_event && (spine.awakening_event.intensity_target < 0 || spine.awakening_event.intensity_target > 1)) {
    warnings.push(`awakening_event.intensity_target=${spine.awakening_event.intensity_target} が範囲外 (0-1)`);
  }
  if (spine.payback_event && (spine.payback_event.intensity_target < 0 || spine.payback_event.intensity_target > 1)) {
    warnings.push(`payback_event.intensity_target=${spine.payback_event.intensity_target} が範囲外 (0-1)`);
  }

  // ep1 特別: awakening climax >= 0.85, payback >= 0.90
  if (isFirstEpisode) {
    if (spine.awakening_event && spine.awakening_event.intensity_target < 0.85) {
      warnings.push(`ep1: awakening_event.intensity_target=${spine.awakening_event.intensity_target} が低い (推奨 0.85+)`);
    }
    if (spine.payback_event && spine.payback_event.intensity_target < 0.90) {
      warnings.push(`ep1: payback_event.intensity_target=${spine.payback_event.intensity_target} が低い (推奨 0.90+)`);
    }
  }

  return warnings;
}
