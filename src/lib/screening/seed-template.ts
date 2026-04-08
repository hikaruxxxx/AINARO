// 決定論的seed展開（_settings.md / _style.md）
// LLM呼び出しなしで logline + タグから seed ファイルを生成する。
// Step 2 のサブエージェントは本文生成だけに集中させる。

import type { ElementTags } from "./types";

export interface SeedInput {
  slug: string;
  logline: string;
  genre: string;
  tags: ElementTags;
}

export interface SeedFiles {
  settingsMd: string;
  styleMd: string;
}

/** Phase 1 用の最小 _settings.md / _style.md を生成 */
export function buildSeedFiles(input: SeedInput): SeedFiles {
  const { slug, logline, genre, tags } = input;

  const settingsMd = `# 設定: ${slug}

## logline
${logline}

## ジャンル
${genre}

## 主人公
- 立場: ${tags.境遇}に関わる人物
- 物語転機: ${tags.転機}
- 物語の方向: ${tags.方向}
- 中核フック: ${tags.フック}

## 世界観（最小）
- ${guessWorldHint(genre)}
`;

  const styleMd = `# 文体: ${slug}

- 視点: 三人称一元（主人公視点）
- 文体: なろう読者向け、地の文と会話のバランスを取る
- 一文: 短中文を基本、長文は感情の山場のみ
- 描写: 五感描写を最低1つ含める
- ep1構成: 冒頭引き → 境遇/葛藤 → 転機 → 引き
`;

  return { settingsMd, styleMd };
}

/** ジャンル名から世界観の最小ヒントを返す（決定論的） */
function guessWorldHint(genre: string): string {
  if (genre.includes("ファンタジー")) return "中世ヨーロッパ風の剣と魔法の世界";
  if (genre.includes("恋愛")) return "近代〜中世風の貴族社会";
  if (genre.includes("SF")) return "近未来の都市";
  if (genre.includes("現代")) return "現代日本";
  return "中世ヨーロッパ風の異世界";
}
