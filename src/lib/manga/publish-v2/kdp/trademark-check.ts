/**
 * 商標 / 既存IP 類似チェック (Phase X MVP)
 *
 * 設計根拠:
 *   - Plan: /Users/hikarumori/.claude/plans/groovy-wishing-castle.md WX-5
 *   - Codex 強制修正 #1「KDP運用ガードレール前倒し」を Phase X で実施
 *   - docs/strategy/kdp_account_safety.md §3 商標 / IP 類似チェック
 *
 * MVP 段階 (Phase X):
 *   - 人間判定支援: チェック対象キーワードに対して各サイトの検索URLを生成
 *   - スクリーニング結果は status: "pending" を返し、人間が各URLを開いて確認
 *   - 自動 fetch / parse は実施しない (J-PlatPat / USPTO TESS は HTML スクレイピング必要、
 *     rate limit / TOS 配慮のため Phase Z で改善)
 *
 * Phase Z 改善予定:
 *   - J-PlatPat 公開API (もしあれば) 経由で自動チェック
 *   - USPTO TESS の制約付き fetch
 *   - Amazon search の合法的範囲での類似度判定
 */

import type {
  KdpMetadata,
  KdpReleaseRightsCheck,
  TrademarkCheckStatus,
} from "../../schemas-v2";

export type TrademarkSearchTarget = {
  /** チェック対象の文字列 */
  keyword: string;
  /** 種別 (title, character_name, label_name, etc.) */
  kind: "title" | "subtitle" | "character_name" | "label_name" | "series_title";
  /** Phase A 3作品など、出所の slug (任意) */
  origin?: string;
};

export type TrademarkSearchSource = {
  /** 検索元 (J-PlatPat / USPTO TESS / Amazon JP / Amazon US) */
  source: "j_platpat" | "uspto_tess" | "amazon_jp" | "amazon_us";
  /** 人間が開いて確認するためのURL */
  url: string;
  /** 検索の意図 (商標一致 / 既存作品名一致 / キャラ名一致 etc.) */
  intent: string;
};

export type TrademarkCheckResult = {
  /** 全体ステータス。MVP では人間判定前なので常に "pending" */
  status: TrademarkCheckStatus;
  /** 検査対象の全キーワード */
  targets: TrademarkSearchTarget[];
  /** 各キーワードに対する検索URL群 (人間が開いて確認) */
  searches: Array<{
    target: TrademarkSearchTarget;
    sources: TrademarkSearchSource[];
  }>;
  /** チェック実施タイムスタンプ */
  checked_at: string;
  /** 人間判定後のメモ (preflight 通過後に書き込まれる想定) */
  human_review_notes?: string;
  /** Phase Z 自動チェックで自動 flag された項目 (MVP では空配列) */
  auto_flagged?: Array<{
    target: TrademarkSearchTarget;
    source: TrademarkSearchSource["source"];
    reason: string;
  }>;
};

/**
 * KDP メタデータ + キャラ名リスト + レーベル名から、
 * 商標チェック対象を抽出して各サイトの検索URLを生成する。
 *
 * @param metadata KDP 入稿メタデータ (タイトル/サブタイトル等)
 * @param characterNames 主要キャラクター名 (主人公・ヒロイン)
 * @param labelName レーベル名 (例: "Novelis")
 * @param seriesTitle シリーズタイトル (任意)
 */
export function buildTrademarkSearches(
  metadata: KdpMetadata,
  characterNames: string[] = [],
  labelName?: string,
  seriesTitle?: string,
): TrademarkCheckResult {
  const targets: TrademarkSearchTarget[] = [];

  if (metadata.title) {
    targets.push({ keyword: metadata.title, kind: "title" });
  }
  if (metadata.subtitle) {
    targets.push({ keyword: metadata.subtitle, kind: "subtitle" });
  }
  if (seriesTitle && seriesTitle !== metadata.title) {
    targets.push({ keyword: seriesTitle, kind: "series_title" });
  }
  if (labelName) {
    targets.push({ keyword: labelName, kind: "label_name" });
  }
  for (const name of characterNames) {
    if (name && name.trim().length > 0) {
      targets.push({ keyword: name.trim(), kind: "character_name" });
    }
  }

  const searches = targets.map((target) => ({
    target,
    sources: buildSearchSources(target.keyword),
  }));

  return {
    status: "pending",
    targets,
    searches,
    checked_at: new Date().toISOString(),
    auto_flagged: [],
  };
}

/**
 * 1キーワードに対する各サイトの検索URLを生成。
 * 人間が新規タブで開いて確認するための補助。
 */
export function buildSearchSources(keyword: string): TrademarkSearchSource[] {
  const encoded = encodeURIComponent(keyword);
  return [
    {
      source: "j_platpat",
      // 商標検索 (簡易): 検索画面に遷移、入力は人間が貼る (公式API/直接URL検索が安定しないため)
      url: `https://www.j-platpat.inpit.go.jp/t0100`,
      intent: `日本商標 (J-PlatPat) で「${keyword}」を検索。商標公報・指定商品/役務の25類(被服)・16類(印刷物)・41類(教育・娯楽)を確認`,
    },
    {
      source: "uspto_tess",
      url: `https://tmsearch.uspto.gov/search/search-information?searchText=${encoded}`,
      intent: `米国商標 (USPTO) で「${keyword}」を検索。International Class 016 (printed matter) / 041 (entertainment) を確認`,
    },
    {
      source: "amazon_jp",
      url: `https://www.amazon.co.jp/s?k=${encoded}&i=stripbooks`,
      intent: `Amazon.co.jp で「${keyword}」の既存書籍を検索。同名タイトル・類似タイトルの存在確認`,
    },
    {
      source: "amazon_us",
      url: `https://www.amazon.com/s?k=${encoded}&i=stripbooks`,
      intent: `Amazon.com で「${keyword}」の既存書籍を検索 (海外KDP前提でなくても、Amazon は世界共通プラットフォームのため)`,
    },
  ];
}

/**
 * 人間判定後の結果を反映して KdpReleaseRightsCheck 形式に変換。
 * preflight への入力として使う。
 *
 * @param checkResult buildTrademarkSearches の出力
 * @param humanDecision 人間判定 (各targetに対して passed/flagged)
 * @param notes 人間判定メモ
 */
export function applyHumanReview(
  checkResult: TrademarkCheckResult,
  humanDecision: {
    trademarkPassed: boolean;
    ipSimilarityPassed: boolean;
    flaggedTargets?: TrademarkSearchTarget[];
  },
  notes?: string,
): KdpReleaseRightsCheck {
  return {
    trademark_passed: humanDecision.trademarkPassed,
    ip_similarity_passed: humanDecision.ipSimilarityPassed,
    checked_at: checkResult.checked_at,
    notes:
      notes ??
      (humanDecision.flaggedTargets && humanDecision.flaggedTargets.length > 0
        ? `flagged: ${humanDecision.flaggedTargets.map((t) => `${t.kind}="${t.keyword}"`).join(", ")}`
        : undefined),
  };
}

/**
 * 「passed」状態の KdpReleaseRightsCheck を生成 (テスト/初期化用)。
 * 本番では必ず人間レビューを通すこと。
 */
export function createPassedRightsCheck(notes?: string): KdpReleaseRightsCheck {
  return {
    trademark_passed: true,
    ip_similarity_passed: true,
    checked_at: new Date().toISOString(),
    notes,
  };
}

/**
 * preflight からの呼び出し用: rights_check が unset または failed なら error を返す。
 *
 * @param rightsCheck KdpRelease.rights_check
 * @returns reject 理由文字列、問題なければ null
 */
export function validateRightsCheckForPreflight(
  rightsCheck: KdpReleaseRightsCheck | undefined | null,
): string | null {
  if (!rightsCheck) {
    return "rights_check が未設定です。trademark-check.ts の buildTrademarkSearches() で検査対象を抽出し、各URLを人間が確認した後 applyHumanReview() で結果を記録してください。";
  }
  if (!rightsCheck.trademark_passed) {
    return `商標チェック未通過: ${rightsCheck.notes ?? "理由未記載"}`;
  }
  if (!rightsCheck.ip_similarity_passed) {
    return `既存IP類似チェック未通過: ${rightsCheck.notes ?? "理由未記載"}`;
  }
  return null;
}
