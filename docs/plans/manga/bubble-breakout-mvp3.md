# Bubble Breakout MVP-3 計画

## 背景

kindle-test-1 catalog 観察で、**89% のページに bubble breakout** (吹き出しが panel 枠を越える) が発生していると判明。商業漫画らしさの主要要素のひとつ。

現状の AINARO bubble system:

- `src/lib/manga/bubble/placer.ts`: panel **ローカル**座標系で bubble 配置の MVP ヒューリスティック実装済 (~80行)
- `src/lib/manga/bubble/svg-overlay.ts`: bubble SVG レンダラ (~190行)
- `bubbles/p01_v2.png` 1 枚だけ pilot 期の手動置きあり
- **L09-render.ts に bubble の grep ヒット 0** = pipeline に未統合

つまり「bubble breakout」を実装する前に、まず **bubble system 全体を L9 に統合** する必要がある。

## 全体ゴール

storyboard.dialogue の bubble を最終 page PNG に焼き込む。一部 bubble は panel 枠を越境して隣接 panel に侵入する (= breakout)。

## Phase 分割

### Phase A: bubble system の L9 統合 (基盤)

**目的**: 各 panel の dialogue が SVG bubble として最終 PNG に重なる。breakout なし、全 bubble は panel 内に収まる。

**スコープ**:
- 新規: `src/lib/manga/bubble/page-bubble-composer.ts` (page 全体の bubble overlay SVG を構築)
- L09-render.ts (or 新規 L09.5-bubbles.ts) に bubble overlay step 追加
- 既存 `placer.ts` を page 座標系に拡張 (panel.rect.x/y を加算)
- `svg-overlay.ts` を polygon-aware に修正 (panel polygon 内に bubble をクリップ、はみ出し防止)
- a07 ep01 で 1 page 検証 → 全 22 page 検証

**工数**: 2-3 日

**完了基準**:
- a07 ep01 を L09 で render したとき、各 panel に dialogue bubble が表示される
- bubble は panel polygon 内に収まる (越境なし)
- bubble 形状 (speech / thought / shout / narration) が storyboard.dialogue.bubble_type を反映

### Phase B: breakout 機構 (応用)

**目的**: 一部 bubble を panel 枠越境配置し、隣接 panel の枠線を消す。

**スコープ**:
- breakout 判定ロジック (`bubble/breakout-detector.ts` 新規)
  - 候補条件: importance ≥ 4 の panel の bubble、隣接 panel に空き領域あり、reading_order が近い
- 越境 bubble の page 座標計算 (panel 越え pixels)
- 越境した部分の隣接 panel 枠線を mask (枠線 SVG から該当区間削除)
- audit_rules で 1 page あたりの breakout 数上限チェック (catalog 観察で平均 1-3 個)

**工数**: 2-3 日

**完了基準**:
- a07 ep01 で 1-3 個の bubble が panel 越境して表示される
- 越境した部分の隣接 panel 枠線が消える
- catalog 観察と整合した breakout 頻度

## 当 plan の対象

**Phase A のみ** を MVP-3 として実装。Phase B は別計画として分離。

理由:
- Phase A 単独で「吹き出しが page に出る」品質ジャンプがあり、独立価値高い
- Phase B は Phase A 完成後に追加機能として上乗せ可能
- 5-7 日まとめて 1 コミットだとレビュー困難、scope creep リスク高い

## Phase A 実装詳細

### 1. `src/lib/manga/bubble/placer.ts` 修正

`placeBubbles` のシグネチャに optional `pageOriginX?: number, pageOriginY?: number` を追加 (default 0, 0 で従来挙動)。指定時は出力 BubblePosition の x, y にオフセットを加算。

### 2. `src/lib/manga/bubble/svg-overlay.ts` 修正

`renderBubbleOverlay` のシグネチャに optional `clipPolygon?: [number, number][]` を追加。指定時は SVG `<defs><clipPath>` で bubble の描画領域を polygon に制限。

### 3. `src/lib/manga/bubble/page-bubble-composer.ts` 新規

```ts
export type PageBubbleInput = {
  pagePlanPage: PagePlanV2["pages"][number];
  storyboardPage: EpisodeStoryboardV2["pages"][number];
  pageWidth: number;
  pageHeight: number;
};

export function composePageBubbles(input: PageBubbleInput): {
  svg: string;            // page 全体に重ねる bubble overlay SVG
  bubbleCount: number;
  warnings: string[];
};
```

各 panel ごとに:
1. storyboardPage.panels[i].dialogue から DialogueInput 配列を作る
2. placer.ts で panel ローカル配置 (panelWidth/Height = pp.rect.w/h)
3. pageOriginX/Y に rect.x/y を渡して page 座標へ変換
4. polygon があれば clipPolygon で panel 形状内にクリップ
5. svg-overlay で SVG 文字列に
6. 全 panel 分を `<g>` タグで結合して page SVG に

### 4. L09 統合

`scripts/manga/layers/L09-render.ts` の panel_composite ルートで、page PNG 合成後に bubble overlay を **追加 SVG レイヤー** として composite する:

```ts
const bubbleSvg = composePageBubbles({...});
// composeMangaPage / composePanelsIntoPage の後で追加 sharp composite
await sharp(pageOutputPath).composite([{ input: Buffer.from(bubbleSvg), top: 0, left: 0 }]).toFile(pageOutputPath);
```

実装は L09-render.ts ではなく、`src/lib/manga/render/page-with-bubbles.ts` (新規) に切り出して、L09 から呼ぶのがクリーン。

### 5. テスト

- `placer.test.ts`: pageOriginX/Y で出力座標がシフトすること、polygon クリップ
- `page-bubble-composer.test.ts`: storyboard 1 page の dialogue が SVG に変換されること

### 6. 手動検証

a07 ep01 P3 (buildup, dialogue 多め) を L09 で render → bubble が描画されているか確認。

## やってはいけない

- breakout (越境) ロジック実装は **Phase B** で対応 (本 Plan は Phase A のみ)
- v3/v4 mapper を変更しない
- pattern dictionary を変更しない
- svg-renderer (name preview) は触らない (画像 render と別レイヤー)
- bubble の形状描画 (speech/thought/shout) の追加は既存 svg-overlay.ts で対応、新規追加しない

## 工数見積もり (Phase A のみ)

| Step | 内容 | 工数 |
|---|---|---|
| 1 | placer.ts に pageOrigin 追加 | 0.5日 |
| 2 | svg-overlay.ts に clipPolygon 追加 | 0.5日 |
| 3 | page-bubble-composer.ts 新規 | 1日 |
| 4 | L09 統合 + page-with-bubbles.ts | 0.5日 |
| 5 | unit test + a07 ep01 smoketest | 0.5日 |
| **合計** | | **3 日** |

## 完了基準 (Phase A)

- a07 ep01 全 22 page を L09 で render → 各 panel に bubble が描画される
- bubble は panel polygon 内に収まる (越境なし)
- `npm test` pass / `tsc` clean for new files
- 既存 a07 ep01 page render が **bubble 無し版と並べて比較できる** (Phase A 前後の変化が一目瞭然)
