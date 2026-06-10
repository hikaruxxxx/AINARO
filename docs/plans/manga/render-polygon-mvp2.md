# Render Polygon Support MVP-2 (Phase B3) 計画

## 背景

MVP-1 で `PagePlanPanel.polygon` が page-mapper-v4 から書き込まれるようになったが、
L09 render (`panel-composite.ts` + `render-v2/page-composer.ts`) は rect ベースのまま。
polygon 注入された page_plan を render しても、最終 PNG では panel が rect で並ぶだけで
**polygon 形状は失われる**。MVP-2 でこのギャップを埋める。

## ゴール

panel PNG を polygon で clip して page に合成する。`is_borderless` (枠線なし) と
`bleed_polygon` (ページ縁まで延長) フラグも反映する。

非ゴール:
- panel image **生成 prompt** の polygon 形状反映 (rect bbox aspect ratio で生成のまま、
  クリップは合成時のみ。Phase B4 で扱う)
- bubble breakout / motion lines (別 MVP)

## 実装

### 1. `src/lib/manga/render/polygon-utils.ts` (新規, ~80行)

共通ユーティリティ:
- `polygonToSvgMask(polygon, w, h, offsetX, offsetY)`: polygon を白塗り SVG マスクとして文字列化
- `polygonBbox(polygon)`: bounding box を返す (mapper-v4 と同じロジック、再利用)
- `polygonSvgFrame(polygon, opts)`: 枠線用 SVG `<polygon>` 文字列を返す

### 2. `src/lib/manga/render/panel-composite.ts` 修正 (旧 v1 ルート)

`composeMangaPage` の panel 合成ループを polygon-aware に:

```ts
for (const panel of options.panels) {
  const { rect, polygon, is_borderless, bleed_polygon } = panel;
  const usePolygon = polygon && polygon.length >= 3;

  // panel 画像を rect bbox にリサイズ (cover)
  const resized = await sharp(panel.source_image_path)
    .resize(innerW, innerH, { fit: "cover", position: "center" })
    .png().toBuffer();

  // polygon 指定時は clip mask 適用
  if (usePolygon) {
    const mask = polygonToSvgMask(polygon, rect.w, rect.h, -rect.x, -rect.y);
    const clipped = await sharp(resized)
      .composite([{ input: Buffer.from(mask), blend: "dest-in" }])
      .png().toBuffer();
    overlays.push({ input: clipped, top: rect.y, left: rect.x });
  } else {
    overlays.push({ input: resized, top: rect.y, left: rect.x });
  }
}

// 枠線も polygon-aware に
const borderSvg = buildBorderSvg({
  ...,
  panels: panels.map(p => ({ ...p, _polygon: p.polygon, _borderless: p.is_borderless }))
});
```

`buildBorderSvg` を改修:
- panel が `polygon` 持ちなら `<polygon points="...">` で枠線描画
- `is_borderless` なら枠線スキップ
- 従来通り rect しかなければ `<rect>` 描画 (回帰防止)

### 3. `src/lib/manga/render-v2/page-composer.ts` 修正 (現行メイン)

同じパターンで polygon clip + polygon 枠線を実装。両 renderer で `polygon-utils.ts` を共用。

### 4. `bleed_polygon` 対応

`bleed_polygon === true` の panel:
- 枠線描画時、page 縁 (x=0/y=0/x=W/y=H) に接する辺は **stroke skip** (枠線が縁に出ないように)
- Phase B3 では simple impl: `bleed=true なら枠線まるごと skip` で OK (商業漫画でも bleed コマは枠線消すことが多い)

### 5. `is_borderless` 対応

`is_borderless === true` の panel:
- 枠線描画 skip
- panel 画像はそのまま rect bbox に貼り付け (clip しない、隣接 panel と blend する効果を狙う)

### 6. PagePlanPanel スキーマ拡張

`schemas-v2.ts` の `PagePlanPanel` に optional `is_borderless?: boolean` と
`bleed_polygon?: boolean` を追加。pattern-applier.ts で slot のフラグを panel に書き込む
ロジックを有効化 (現状は `void slot.is_borderless` で破棄してる)。

## 検証

### 自動

- `npx tsc --noEmit -p .` パス
- `npm test` パス (既存 + 新規 5 ケース for polygon-utils)
- 新規テスト:
  - `polygon-utils.test.ts`: SVG マスク文字列が期待通り、bbox 計算正確
  - `panel-composite.test.ts` を polygon ケースで拡張 (or smoketest 追加)

### 手動 smoketest

a07 ep01 の **1 page** を render してみて polygon 形状が反映されているか視覚チェック:

1. 既存の panel PNG (placeholder で良い、白背景にナンバー入りで OK)
2. `composeMangaPage` を直接呼び出すスクリプトを用意 (or L09 を flag で起動)
3. 出力 PNG を ブラウザで open し、polygon 通りにクリップされた panel が並んでいることを確認

placeholder 用意の手順:
- 1 panel PNG = 単色 + 大きな数字。これを page_plan の各 panel に使い回す
- composeMangaPage で page 出力 → 期待通り polygon 形状で並ぶか確認

## 工数見積もり

| Step | 内容 | 工数 |
|---|---|---|
| 1 | polygon-utils.ts (mask SVG / bbox / frame) | 0.5日 |
| 2 | panel-composite.ts に polygon clip + frame 適用 | 0.5日 |
| 3 | page-composer.ts に同上 | 0.5日 |
| 4 | bleed / is_borderless 対応 + schema 拡張 + applier 修正 | 0.5日 |
| 5 | unit test + a07 ep01 smoketest | 0.5日 |
| **合計** | | **2.5 日** |

## やってはいけない

- v3/v4 mapper を変更しない
- svg-renderer (name preview) を変更しない (PNG render と別レイヤー)
- panel image **生成** roting (gpt-image-2 等) を変更しない (合成のみ)
- bubble overlay (吹き出し) ロジックを変更しない (svg-overlay.ts 別レイヤー)

## 完了基準

- 既存 rect ベースの page render が **1 ピクセルも変わらない** (polygon 未指定時)
- polygon 指定時は polygon 通りに panel がクリップされる
- a07 ep01 で 1 page smoketest 成功
- tsc + npm test pass
