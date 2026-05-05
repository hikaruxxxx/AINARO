/**
 * KDP 管理画面コピペ用 Markdown 生成
 *
 * 設計根拠: B-1 計画 Track A1-5
 *   - KDP 公式 API は無いため、入稿は管理画面手動。
 *   - kdp-input.md は管理画面のフォームに 1:1 で対応するチェックリスト。
 *   - kdp-release.json と整合した内容で出力する (release が source of truth)。
 *
 * 出力先: data/manga/works/{slug}/volumes/v{NN}/kdp/kdp-input.md
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import type { KdpRelease, KdpMetadata } from "../../schemas-v2";
import { disclosureFlagsToKdpType, type AiUsageLevel } from "../../disclosure";

export type KdpInputMdArgs = {
  release: KdpRelease;
  metadata: KdpMetadata;
  aiUsageLevel: AiUsageLevel;
  outputPath: string;
};

function checkbox(checked: boolean): string {
  return checked ? "[x]" : "[ ]";
}

function disclosureLabel(type: string): string {
  switch (type) {
    case "ai_generated": return "AI Generated";
    case "ai_assisted": return "AI Assisted";
    case "ai_translated": return "AI Translated";
    case "none": return "None (人手のみ)";
    default: return type;
  }
}

export async function buildKdpInputMd(args: KdpInputMdArgs): Promise<{ outputPath: string }> {
  const { release, metadata, aiUsageLevel } = args;
  const i = release.kdp_inputs;
  const ai = release.ai_disclosure;
  const kdpTypes = disclosureFlagsToKdpType(ai, aiUsageLevel);

  const lines: string[] = [];
  lines.push(`# KDP 入稿チェックリスト — ${metadata.title}${metadata.subtitle ? ` ${metadata.subtitle}` : ""}`);
  lines.push("");
  lines.push(`> **slug**: ${release.slug}  `);
  lines.push(`> **volume_no**: ${release.volume_no}  `);
  lines.push(`> **status**: ${release.status}  `);
  lines.push(`> **生成日時**: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // ── 書籍情報 ──
  lines.push("## 1. 書籍の詳細");
  lines.push("");
  lines.push(`- **タイトル**: ${i.title || "（未設定）"}`);
  if (i.subtitle) lines.push(`- **サブタイトル**: ${i.subtitle}`);
  lines.push(`- **シリーズ名**: (kdp-series.json を参照)`);
  lines.push(`- **巻番号**: ${release.volume_no}`);
  lines.push(`- **著者**: ${metadata.author_pen_name}`);
  lines.push(`- **言語**: 日本語`);
  lines.push(`- **出版日**: ${metadata.publication_date}`);
  if (i.isbn) lines.push(`- **ISBN**: ${i.isbn}`);
  if (i.asin) lines.push(`- **ASIN**: ${i.asin} (publish 後に追記)`);
  lines.push("");

  // ── 商品説明 ──
  lines.push("## 2. 商品説明 (Description)");
  lines.push("");
  lines.push("KDP 入力欄に下記 HTML をそのまま貼る (許可タグ: `<b><i><br><p><ul><li><h4-6>` のみ)。");
  lines.push("");
  lines.push("```html");
  lines.push(i.description_html || "<!-- description_html 未入力 -->");
  lines.push("```");
  lines.push("");

  // ── キーワード ──
  lines.push("## 3. キーワード (最大 7 個 / 各 50 字以内)");
  lines.push("");
  if (i.keywords.length === 0) {
    lines.push("- (未入力) — 7 個埋めること");
  } else {
    for (let k = 0; k < i.keywords.length; k++) {
      lines.push(`${k + 1}. ${i.keywords[k]} (${i.keywords[k].length}/50)`);
    }
    if (i.keywords.length < 7) {
      lines.push(`- 残り ${7 - i.keywords.length} 枠は空欄でも可だが、SEO上は埋めるべき`);
    }
  }
  lines.push("");

  // ── カテゴリ ──
  lines.push("## 4. カテゴリ (最大 2 個)");
  lines.push("");
  if (i.categories.length === 0) {
    lines.push("- (未入力)");
  } else {
    for (const c of i.categories) lines.push(`- ${c}`);
  }
  lines.push("");
  if (metadata.bisac_categories.length > 0) {
    lines.push("**BISAC 参考**:");
    for (const b of metadata.bisac_categories) lines.push(`- ${b}`);
    lines.push("");
  }

  // ── AI 開示 ──
  lines.push("## 5. AI 生成コンテンツ申告 (KDP 公式 5 区分)");
  lines.push("");
  lines.push(`- **ai_usage_level**: ${aiUsageLevel}`);
  lines.push(`- **使用ツール**: ${release.ai_tools_used.join(", ")}`);
  lines.push(`- **人手レビュー**: ${release.human_review_performed ? "あり" : "なし"}`);
  lines.push("");
  lines.push("| 区分 | 該当 | KDP 申告 |");
  lines.push("|---|---|---|");
  lines.push(`| 本文テキスト (text) | ${checkbox(ai.text)} | ${disclosureLabel(kdpTypes.text)} |`);
  lines.push(`| 内側の画像 (images) | ${checkbox(ai.images)} | ${disclosureLabel(kdpTypes.images)} |`);
  lines.push(`| 翻訳 (translation) | ${checkbox(ai.translation)} | ${disclosureLabel(kdpTypes.translation)} |`);
  lines.push(`| 表紙 (cover) | ${checkbox(ai.cover)} | ${disclosureLabel(kdpTypes.cover)} |`);
  lines.push(`| ページレイアウト (interior) | ${checkbox(ai.interior)} | ${disclosureLabel(kdpTypes.interior)} |`);
  lines.push("");
  lines.push("> KDP 管理画面の 'Did AI-based tools create any of the content?' に対し、**Yes** を選択。");
  lines.push("> 続く詳細欄でも上の表に従って 5 区分を入力する。");
  lines.push("");

  // ── 価格・KU ──
  lines.push("## 6. 価格設定");
  lines.push("");
  lines.push(`- **販売価格**: ¥${release.pricing.price_jpy.toLocaleString()}`);
  lines.push(`- **ロイヤリティプラン**: ${release.pricing.royalty_plan}%`);
  lines.push(`- **Kindle Unlimited (KDP Select) 登録**: ${release.pricing.ku_enrolled ? "Yes" : "No"}`);
  lines.push("");

  // ── 権利チェック ──
  lines.push("## 7. 権利確認");
  lines.push("");
  lines.push(`- **商標チェック**: ${checkbox(release.rights_check.trademark_passed)} (checked_at: ${release.rights_check.checked_at})`);
  lines.push(`- **既存IP類似性チェック**: ${checkbox(release.rights_check.ip_similarity_passed)}`);
  if (release.rights_check.notes) {
    lines.push(`- **備考**: ${release.rights_check.notes}`);
  }
  lines.push("");

  // ── ファイル ──
  lines.push("## 8. アップロードするファイル");
  lines.push("");
  lines.push(`- **本文 PDF**: \`${release.manuscript_pdf_path}\``);
  lines.push(`- **表紙 PDF**: \`${release.cover_pdf_path}\``);
  lines.push(`- **ページ数**: ${metadata.page_count}`);
  lines.push(`- **背幅**: ${metadata.spine_width_mm.toFixed(2)} mm`);
  lines.push("");

  // ── プレビュー指摘 ──
  lines.push("## 9. KDP プレビューワ指摘ログ");
  lines.push("");
  if (release.preview_log.length === 0) {
    lines.push("- (なし) — KDP プレビュー結果は kdp-release.json に手動で記録すること");
  } else {
    for (const p of release.preview_log) {
      lines.push(`- **${p.reviewed_at}** ${p.resolved ? "[解決済]" : "[未解決]"}`);
      for (const issue of p.issues) lines.push(`  - ${issue}`);
    }
  }
  lines.push("");

  lines.push("---");
  lines.push("");
  lines.push("※ 入稿後、ASIN を `kdp-series.json` と `kdp-release.json` の両方に反映すること。");
  lines.push("※ 修正のたびに `kdp-release.json` の `edit_history` に記録される。");

  const text = lines.join("\n") + "\n";
  await fs.mkdir(path.dirname(args.outputPath), { recursive: true });
  await fs.writeFile(args.outputPath, text);
  return { outputPath: args.outputPath };
}
