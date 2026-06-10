# Effect Lines MVP-4 計画

## 背景

kindle-test-1 catalog 観察 (193 page) で **165 page (85%) に何らかの効果線/モーション線が発生** している。商業漫画らしさの主要欠落要素のひとつ。

> 当初ユーザ情報「58%」は控えめな見積もり。実カウント:
> - 効果線あり: 165 page (85%)
> - 効果線なし: 28 page (15%)

現状の AINARO の状況:

- 効果線関連の実装は `src/lib/manga/` 配下に **0 件** (grep 結果)
- L09 render に effect_line 関連の統合 0 件
- bubble system が L9 統合済み (`src/lib/manga/bubble/{placer,svg-overlay,page-bubble-composer,breakout-detector}.ts` + `src/lib/manga/render/page-with-bubbles.ts`) で類似アーキテクチャを流用可能

つまり「bubble system と並列の effect_lines system を作って L9 に統合する」のが基本設計。

## 全体ゴール

storyboard.panels の各 panel に対して、SVG overlay として効果線を描き、最終 page PNG に焼き込む。bubble overlay の前に重ねる。

## 効果線の 4 分類 (catalog 観察ベース)

| 種別 | 用途 | catalog 例 | 推論ルール候補 |
|---|---|---|---|
| `speed_lines` | 移動・走行・突進 | 「スピード線」「縦速度線」 | action_brief に「走る/突進/向かう」+ shot_type=medium/wide |
| `focus_lines` | 集中・感情の対峙 | 「集中線」「強烈な放射状集中線」 | shot_type=close_up + (importance≥4 or silence=true) |
| `radial_burst` | 衝撃・インパクト・見せ場 | 「放射線」「impact放射」 | importance=5 + bleed=true (or sfx に「ドン/バン/ガン」系) |
| `vibration` | 軽い動揺・驚き・ガーン | 「軽い震え」「ガーン」 | shot_type=close_up + (driving emotion 系 expression) |

**Phase A は上記 4 種を rule-based detector で実装。LLM 推論なし。**

## Phase 分割

### Phase A: rule-based detector + SVG overlay + L9 統合 (本 Plan の対象)

**目的**: panel 既存属性から効果線種別と強度を自動判定し、SVG overlay として page PNG に焼き込む。schema 変更なし。

**スコープ**:
- 新規: `src/lib/manga/effect-lines/detector.ts` — rule-based 判定
- 新規: `src/lib/manga/effect-lines/svg-overlay.ts` — 4 種の効果線 SVG レンダラ
- 新規: `src/lib/manga/effect-lines/page-effect-composer.ts` — page 単位で overlay 構築
- 新規: `src/lib/manga/render/page-with-effect-lines.ts` — L9 から呼ぶ entry
- L09-render.ts: bubble overlay の **直前** に effect_lines overlay を追加 (effect_lines → bubble の重ね順)
- 既存 schema (`PanelV2` `EpisodeStoryboardV2` `PagePlanV2`) は無変更
- 既存 storyboard を再生成せずに ep01 に効果線が乗る (rule 推論のみのため)

**工数**: 2-3 日

**完了基準**:
- a07 ep01 を L09 で render したとき、catalog 観察と整合した割合 (~85%) の page に効果線が描画される
- 各効果線は panel 内に収まる (越境なし、Phase B で対応)
- bubble との重なりで読みづらさが出ていない (effect_lines → bubble の順で bubble が前)
- a07 ep01 全 22 page で smoketest pass

### Phase B: 効果線の breakout (越境) 対応

**目的**: 一部の effect_lines を panel 越境配置し、隣接 panel の枠線を消す (bubble breakout と同じパターン)。

**スコープ**:
- `breakout-detector.ts` を新規 (or bubble の流用): importance=5 の `radial_burst` のみが越境候補
- 越境した部分の隣接 panel 枠線を mask
- catalog 観察で「強烈speedlines + impact放射」「集中線複数本 (右上 panel と下段に)」のような越境表現を再現

**工数**: 1 日

### Phase C: storyboard schema 拡張 (effect_lines 明示フィールド)

**目的**: rule 推論では拾えない演出意図を、storyboard 段階で LLM に明示させる。

**スコープ**:
- `EpisodeStoryboardV2 PanelV2` に optional `effect_lines?: { type, intensity }` を追加
- L4 storyboard-extractor の prompt に効果線の指示
- detector.ts は明示フィールドが優先、無ければ rule fallback (後方互換)

**工数**: 1 日

## 当 plan の対象

**Phase A のみ** を MVP-4 として実装。Phase B/C は別計画として分離。

理由:
- Phase A 単独で「効果線が page に出る」品質ジャンプがあり、独立価値高い
- bubble breakout MVP-3 と同じ Phase 切り戦略 (=過去成功パターン)
- 5+ 日まとめて 1 コミットだとレビュー困難、scope creep リスク高い

## Phase A 実装詳細

### 1. `src/lib/manga/effect-lines/detector.ts` 新規

```ts
export type EffectLineType = "speed" | "focus" | "radial" | "vibration";
export type EffectLineIntensity = "subtle" | "normal" | "strong";

export type EffectLineSpec = {
  type: EffectLineType;
  intensity: EffectLineIntensity;
  /** SVG 描画時の追加パラメータ。direction は度数 (0=右, 90=下) */
  direction?: number;
  /** focus/radial 時の中心座標 (panel ローカル比率 0.0-1.0) */
  centerX?: number;
  centerY?: number;
};

export function detectEffectLines(panel: PanelV2): EffectLineSpec | null;
```

**ルール (優先順)**:

1. `silence=true` かつ `shot_type=close_up` かつ `importance>=4` → `focus`, `strong`, center=panel 中央
2. `importance=5` かつ (`bleed=true` or sfx に「ドン/バン/ガン/ドカ」) → `radial`, `strong`
3. `action_brief` に「走/突進/疾走/駆け/飛び/向か/進」 → `speed`, intensity は importance に応じて
4. `shot_type=close_up` かつ expression に驚き系 (`shocked` `surprised` `gasping`) → `vibration`, `subtle` or `normal`
5. `importance>=4` かつ `shot_type=medium` (action 系 silhouette) → `speed`, `normal`
6. それ以外 → `null` (= 効果線なし)

ヒット率目標: catalog 観察と整合する **80-90% カバレッジ**。100% は LLM 推論なしには不可能なので Phase C で拡張。

### 2. `src/lib/manga/effect-lines/svg-overlay.ts` 新規

`renderEffectLineOverlay(spec, panelWidth, panelHeight, clipPolygon?)` で 4 種の SVG を返す:

- `speed`: 並行な細い直線群 (direction 方向に流れる)、line 間隔 = panelWidth/40
- `focus`: 中央 (centerX, centerY) から放射状の細線 (24-36 本)、長さ = panel 半径
- `radial`: 中央から放射状の太線 + 短い切れ目 (impact)、line 数 = 12-16 本
- `vibration`: panel 縁に短い震え線 (4-8 本)、外周近く

`clipPolygon` 指定時は `<defs><clipPath>` で panel polygon 内にクリップ。SVG 描画は黒線、stroke-width は intensity に応じて 1-3px。

### 3. `src/lib/manga/effect-lines/page-effect-composer.ts` 新規

```ts
export type PageEffectInput = {
  pagePlanPage: PagePlanV2["pages"][number];
  storyboardPage: EpisodeStoryboardV2["pages"][number];
  pageWidth: number;
  pageHeight: number;
};

export function composePageEffects(input: PageEffectInput): {
  svg: string;
  effectCount: number;
  warnings: string[];
};
```

各 panel ごとに:
1. `detectEffectLines(panel)` で spec を取得
2. spec が null なら skip
3. `renderEffectLineOverlay(spec, panelW, panelH, clipPolygon)` で SVG 文字列
4. panel rect.x/y で page 座標へ変換 (`<g transform="translate(x,y)">`)
5. 全 panel 分を結合して 1 個の page SVG に

### 4. `src/lib/manga/render/page-with-effect-lines.ts` 新規

```ts
export async function overlayEffectLinesOntoPage(args: {
  pageOutputPath: string;  // 既存 page PNG (effect_lines 無し版)
  pagePlanPage; storyboardPage; pageWidth; pageHeight;
}): Promise<{ effectCount: number }>;
```

実装パターンは `src/lib/manga/render/page-with-bubbles.ts` と同じ:
1. `composePageEffects(...)` で SVG 取得
2. `effectCount===0` なら no-op
3. sharp の composite で page PNG に焼き込み (上書き)

### 5. L09-render.ts 統合

bubble overlay の **直前** に effect_lines を追加。**重ね順**: render PNG → effect_lines → bubble。

```ts
// 既存
await composeMangaPage / composePanelsIntoPage で page PNG 生成

// 新規 (effect_lines を bubble の前に)
const effectResult = await overlayEffectLinesOntoPage({...});
if (effectResult.effectCount > 0) console.log(`[L09] effects p${page.page_no}: ${effectResult.effectCount}`);

// 既存
const bubbleResult = await overlayBubblesOntoPage({...});
```

panel_composite ルート (line 351) と page_one_shot ルート (line 274) の **両方** に追加。

### 6. テスト

- `detector.test.ts`: 6 ルールの境界条件 (各ルールで hit / miss するパネル例)
- `page-effect-composer.test.ts`: 4 panel の page で各種類が出ること
- `svg-overlay.test.ts`: SVG 文字列に種別ごとの正しい構造 (line 数、clipPath) が含まれる

### 7. 手動検証

a07 ep01 全 22 page を L09 で render し、catalog 観察と整合する割合 (80-90%) の page に効果線が出ることを確認。

## やってはいけないリスト (Codex への scope creep 防止)

- ❌ Phase B (breakout 越境) 実装は別 Plan で対応
- ❌ Phase C (storyboard schema 拡張) は本 Plan では触らない
- ❌ `EpisodeStoryboardV2` `PanelV2` `PagePlanV2` 型変更
- ❌ L4 storyboard-extractor の prompt に効果線の指示を入れる
- ❌ bubble の placer.ts svg-overlay.ts page-bubble-composer.ts breakout-detector.ts は無変更
- ❌ pattern dictionary / mapper-v3/v4 への影響
- ❌ 他 layer (L05, L06, L07, L08, L11...) への波及
- ❌ catalog-v1.md 更新 (効果線統計記録は別タスク)
- ❌ 「ついでに」既存 bubble の挙動修正
- ❌ MEMORY.md / CLAUDE.md / pipeline-v2.md 等 SSoT への記述追加

## 検証

### tsc / test
- `npx tsc --noEmit` で既存 unrelated 失敗以外 clean
- `npm test` で既存 + 新規 test pass

### a07 ep01 実走
- L09 を a07 ep01 で再走 (effect_lines 統合版)
- 22 page 中 18-20 page (80-90%) に効果線が描画されることを確認
- bubble が effect_lines に隠されていないことを目視確認 (重ね順は effect → bubble の順で bubble が前)

## 工数見積もり (Phase A のみ)

| Step | 内容 | 工数 |
|---|---|---|
| 1 | detector.ts (rule + 6 ルール unit test) | 0.5日 |
| 2 | svg-overlay.ts (4 種の SVG renderer) | 1日 |
| 3 | page-effect-composer.ts | 0.5日 |
| 4 | page-with-effect-lines.ts + L09 統合 | 0.5日 |
| 5 | a07 ep01 smoketest + 微調整 | 0.5日 |
| **合計** | | **3 日** |

## 完了基準 (Phase A)

- a07 ep01 全 22 page を L09 で再 render → 80-90% の page に効果線が描画される
- 効果線は panel 内に収まる (越境は Phase B)
- bubble との重なり問題なし
- `npm test` pass / `tsc --noEmit` 既存以外 clean
- 既存 a07 ep01 page render が **effect_lines 無し版と並べて比較できる** (Phase A 前後の品質変化が一目瞭然)

## 関連

- 上位 SSoT: `docs/plans/manga/pipeline-v2.md`
- 戦略: `docs/plans/manga/strategy.md`
- 類似アーキテクチャ: `docs/plans/manga/bubble-breakout-mvp3.md` (bubble system Phase A の流用元)
- 関連メモリ: project_layout_patterns_b2pp.md, feedback_panel_geometry_polygon.md
