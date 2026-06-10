/**
 * KDP Description HTML 生成
 *
 * 設計根拠 (Plan: kdp-modular-plum.md §5):
 *   - KDP漫画は A+ Content 利用不可。Description HTML のみで訴求する必要がある
 *   - KDP 入力欄の許可タグ: <b><i><br><p><ul><li><h4-6>
 *   - テンプレ構造: 1行フック → 1行ターン → 3行あらすじ → 推薦ポイント箇条書き3つ → 試し読み誘導
 *   - meta.json から自動生成可能。手動編集も歓迎 (release.kdp_inputs.description_html を直接編集)
 *
 * 呼び出し:
 *   const html = buildKdpDescriptionHtml({...});
 *   release.kdp_inputs.description_html = html;
 */

export type KdpDescriptionInput = {
  /** 巻タイトル (短縮版が望ましい) */
  title: string;
  /** サブタイトル (任意) */
  subtitle?: string;
  /** シリーズ名 */
  seriesName?: string;
  /** 巻番号 (1-indexed) */
  volumeNo: number;
  /** 著者ペンネーム */
  authorPenName?: string;
  /** ジャンルラベル (例: "現代ダンジョン") — 表示はしない、内部参照用 */
  genre?: string;
  /** 1行フック (例: "Fランクの俺、なぜかダンジョンの隠しルールが全部聞こえる") */
  hookLine: string;
  /** 1行ターン (例: "ある日、頭の中に響いたのは──ナビゲーター【ナビ】の声だった") */
  turnLine: string;
  /** 3行あらすじ (各行が <p> で囲まれる) */
  synopsisLines: string[];
  /** 推薦ポイント (KU向き / シリーズ完結予定 / 画風 等) — 3つ推奨 */
  recommendPoints: string[];
  /** 試し読み誘導文 (任意。省略時はデフォ文言) */
  ctaLine?: string;
  /** 関連キーワード (検索流入時の関連語表示用、任意) */
  relatedKeywords?: string[];
};

/** 入力値が最低限揃っているか検証 */
export function validateKdpDescriptionInput(input: KdpDescriptionInput): { ok: true } | { ok: false; reason: string } {
  if (!input.title || input.title.trim().length === 0) return { ok: false, reason: "title が空" };
  if (!input.hookLine || input.hookLine.trim().length === 0) return { ok: false, reason: "hookLine が空" };
  if (!input.turnLine || input.turnLine.trim().length === 0) return { ok: false, reason: "turnLine が空" };
  if (!input.synopsisLines || input.synopsisLines.length === 0) return { ok: false, reason: "synopsisLines が空" };
  if (input.synopsisLines.length > 5) return { ok: false, reason: "synopsisLines が多すぎ (最大5)" };
  if (!input.recommendPoints || input.recommendPoints.length === 0) return { ok: false, reason: "recommendPoints が空" };
  if (input.recommendPoints.length > 5) return { ok: false, reason: "recommendPoints が多すぎ (最大5)" };
  return { ok: true };
}

/** HTMLエスケープ (XSSではなくKDPフォームの誤動作防止用) */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Description HTML 生成本体
 *
 * 注意: 戻り値は KDP 入力欄に直接ペーストできる HTML 文字列。
 * 改行はタグ <br> のみ。CSS は使えない (KDP がストリップする)。
 */
export function buildKdpDescriptionHtml(input: KdpDescriptionInput): string {
  const v = validateKdpDescriptionInput(input);
  if (!v.ok) {
    throw new Error(`[buildKdpDescriptionHtml] 入力不備: ${v.reason}`);
  }

  const parts: string[] = [];

  // 1. 1行フック (太字)
  parts.push(`<p><b>${esc(input.hookLine)}</b></p>`);

  // 2. 1行ターン
  parts.push(`<p>${esc(input.turnLine)}</p>`);

  // 3. 3行あらすじ
  for (const line of input.synopsisLines) {
    parts.push(`<p>${esc(line)}</p>`);
  }

  // 4. 推薦ポイント
  parts.push(`<h4>本作の推し</h4>`);
  parts.push(`<ul>`);
  for (const pt of input.recommendPoints) {
    parts.push(`<li>${esc(pt)}</li>`);
  }
  parts.push(`</ul>`);

  // 5. シリーズ・巻情報 (任意)
  if (input.seriesName) {
    parts.push(`<p><i>${esc(input.seriesName)} 第${input.volumeNo}巻 / ${input.authorPenName ? esc(input.authorPenName) : "AINARO"}</i></p>`);
  }

  // 6. 試し読み誘導 — 作品固有CTA は description_seed.cta_line で必ず指定。デフォは汎用文言
  const cta = input.ctaLine ?? "続きはぜひ本編でお楽しみください。";
  parts.push(`<p><b>${esc(cta)}</b></p>`);

  // 7. 関連キーワード (任意 / 読者が「もっと探す」時の手掛かり)
  if (input.relatedKeywords && input.relatedKeywords.length > 0) {
    parts.push(`<p><i>関連: ${input.relatedKeywords.map(esc).join(" / ")}</i></p>`);
  }

  return parts.join("");
}

/**
 * meta.json の kdp.description_seed (新フィールド) から KdpDescriptionInput を組み立てる helper。
 * meta.json で全項目を管理すれば、巻ごとの Description を CLI から再生成できる。
 */
export type DescriptionSeed = {
  hook_line: string;
  turn_line: string;
  synopsis_lines: string[];
  recommend_points: string[];
  cta_line?: string;
  related_keywords?: string[];
};

export function descriptionSeedToInput(args: {
  seed: DescriptionSeed;
  title: string;
  subtitle?: string;
  seriesName?: string;
  volumeNo: number;
  authorPenName?: string;
  genre?: string;
}): KdpDescriptionInput {
  return {
    title: args.title,
    subtitle: args.subtitle,
    seriesName: args.seriesName,
    volumeNo: args.volumeNo,
    authorPenName: args.authorPenName,
    genre: args.genre,
    hookLine: args.seed.hook_line,
    turnLine: args.seed.turn_line,
    synopsisLines: args.seed.synopsis_lines,
    recommendPoints: args.seed.recommend_points,
    ctaLine: args.seed.cta_line,
    relatedKeywords: args.seed.related_keywords,
  };
}
