# Layout Patterns MVP-1 (mapper-v4) 計画

## 背景と動機

現状の L5 page-director は v3 (`page-mapper-v3.ts`) で「importance→行ベース→2分割」の row-stack スキーム。商業漫画品質に届かないと a07 ep01 の検証で判明 (2026-05-06)。

## ゴール

`data/manga/layout_patterns/v1.json` (kindle-test-1 から抽出した 24 archetype) を **page-mapper-v4** が引いて、storyboard panels に polygon ベースの slot を割り当てる。pilot で「漫画のコマ割りになっている」と user 確認済。

非ゴール:
- pattern dictionary の自動拡張 (Phase 2)
- bubble breakout / motion lines (別 MVP)
- panel_count スケーリング (n=4 archetype を n=5 に派生する automation, Phase 2)

## 入出力

**入力**:
- `EpisodeStoryboardV2` (storyboard 各ページの panel 配列、importance, page_role, subtype)
- `data/manga/layout_patterns/v1.json` (24 archetype の dictionary)
- `CapabilityProfile` (既存 v3 と同じ)

**出力**: `PagePlanV2` (既存スキーマ、`PagePlanPanel.polygon` を含む)

## アーキテクチャ

### ファイル構成

```
src/lib/manga/page-director-v2/
  page-mapper-v3.ts          (既存、fallback 用に残す)
  page-mapper-v4.ts          (新規、本 MVP の中核)
  pattern-loader.ts          (新規、v1.json を読む薄いローダ)
  pattern-matcher.ts         (新規、storyboard page → archetype を選ぶ)
  pattern-applier.ts         (新規、archetype slot を panel に割当→PagePlanPanel 生成)
```

### 入力スキーマ (pattern dictionary)

`data/manga/layout_patterns/v1.json` (生成済) の構造:

```ts
type PatternDict = {
  schema_version: 1;
  page_dimensions: { width: number; height: number };
  page_margin: number;
  page_gutter: number;
  patterns: Pattern[];
};

type Pattern = {
  id: string;                    // "pat_001_3tier_dialogue_5"
  name: string;
  panel_count: number;
  page_role_hints: string[];     // ["dialogue", "buildup", ...]
  subtype_hints: string[];       // ["gacha_ui", "external_social"] or []
  purpose_summary: string;
  trigger_conditions: string;    // 自然言語、matcher の手がかり
  frequency: "high"|"medium"|"low";
  example_pages: number[];
  features: string[];
  slots: PatternSlot[];
};

type PatternSlot = {
  slot_id: string;
  reading_order: number;
  role_hint: string;             // "dialogue_progression" 等
  size_class: "small"|"medium"|"large"|"extra_large"|"xx_large";
  polygon: [number, number][];   // 時計回り、整数 px
  is_borderless?: boolean;
  bleed?: boolean;
  internal_diagonal_split?: [[number, number], [number, number]];
};
```

## Pattern matching algorithm

### Phase 1: 厳格マッチ

```
for each storyboard page:
  candidates = patterns where
    panel_count == page.panels.length AND
    page_role IN pattern.page_role_hints AND
    (subtype is null OR subtype IN pattern.subtype_hints OR pattern.subtype_hints == [])
  if candidates: pick first by frequency desc → assign
  else: → Phase 2
```

### Phase 2: 緩和マッチ (n 不一致)

```
for each unmatched storyboard page (n=N):
  candidates = patterns where
    panel_count IN [N-1, N+1] AND
    page_role IN pattern.page_role_hints
  if candidates: pick one (frequency desc, prefer N-1 over N+1) → assign with mismatch
  else: → Phase 3
```

### Phase 3: role 無視のフォールバック

```
candidates = patterns where panel_count == N
pick by frequency. role 不一致警告を log
if still none: v3 mapper にフォールバック (純 rect 出力)
```

### Tie-break ルール

同一 archetype 候補内で:
1. `frequency=high` を優先
2. `subtype_hints` が page subtype と一致するものを優先
3. importance_max ≥ 4 の page なら `size_class=extra_large/xx_large` を持つ archetype を優先

## Slot 割当 (apply)

`page.panels` を `reading_order` 昇順、`pattern.slots` を `reading_order` 昇順でソートし、index ベースで対応:

```
n_apply = min(len(panels), len(slots))
for i in 0..n_apply:
  panel.polygon = slots[i].polygon
  panel.rect    = bbox(slots[i].polygon)   ← 必須 (svg-renderer が rect 基準)
  if slots[i].is_borderless: panel.is_borderless = true
  if slots[i].bleed:         panel.bleed_polygon = true
  panel.slot_id = slots[i].slot_id
```

`len(slots) > len(panels)` の場合: 余り slot は捨てる
`len(panels) > len(slots)` の場合: 残り panel は polygon 未注入 (rect は v3 で計算した値を残す)。これにより部分マッチ時も画面破綻しない。

## rect-polygon 同期 (重要)

pilot で発覚した問題: svg-renderer が text/badge を `rect.x, rect.y` 基準で配置するため、polygon ≠ rect の場合に内容が polygon 外で clip される。

**解決**: pattern-applier が polygon を注入する際、必ず rect も polygon の bounding box で上書きする (上記コード参照)。これは将来 svg-renderer を polygon 中心 / centroid 基準に書き換えるまでの暫定措置。

将来 (Phase 2): svg-renderer を polygon centroid + bbox 基準に refactor。L字/凹形状のときに rect bbox では中央が形外に来る問題を解決。

## migration & fallback

### 切替戦略

- 起動環境変数 / capability profile で v3 / v4 を切り替えられるようにする
- 当初 default = v3、`MANGA_MAPPER=v4` の env で v4 起動
- a07 / a08 で v4 検証 → 安定したら default 移行

### v3 fallback 条件

v4 で以下が起きたら v3 に強制フォールバック (warn ログ):
- pattern dictionary 読み込み失敗
- Phase 3 でも候補無し
- 適用後の polygon が page bbox を超える (validation NG)

## 検証基準

### 自動 (npm test, tsc)

- `npx tsc --noEmit -p .` パス
- 既存 17 file / 112 tests パス
- 新規 unit test:
  - `pattern-matcher.test.ts`: 主要 page_role × panel_count の組合せで pattern 選択結果が決定的
  - `pattern-applier.test.ts`: rect-polygon bbox 同期、reading_order 対応、slot 不足時の rect フォールバック

### 手動 (visual)

- a07 ep01 全 22 ページを v4 で再生成→ pilot (`/tmp/a07-ep01-pattern-match.md` の hand-craft 結果) と同等以上の品質か?
- a07 ep02 (未生成 storyboard があれば) でも適用→ 別 storyboard でも漫画らしい layout が出るか

## 工数見積もり

| Step | 内容 | 工数 |
|---|---|---|
| 1 | pattern-loader.ts (JSON 読込, zod 検証) | 0.5日 |
| 2 | pattern-matcher.ts (Phase1-3 マッチング) | 1日 |
| 3 | pattern-applier.ts (slot 割当 + bbox 同期) | 1日 |
| 4 | page-mapper-v4.ts (上記を統合, v3 と同じ shape の出力) | 1日 |
| 5 | env switch / fallback / validate | 0.5日 |
| 6 | unit test 追加 | 1日 |
| 7 | a07 ep01 で manual smoketest + 修正 | 0.5日 |
| **合計** | | **5.5 日** |

## やってはいけない

- `data/manga/layout_patterns/v1.json` をコード生成中に書き換える (read-only)
- v3 mapper に手を入れる (fallback として原状保持)
- bubble breakout / motion lines / floating SFX 機構を MVP-1 で実装する (別 MVP)
- panel_count スケーリング (n=4 archetype を n=5 に派生する automation) を MVP-1 で実装する (Phase 2)
- svg-renderer を refactor する (rect 基準のまま、bbox 同期で対処)

## Phase 2 候補 (本 MVP の後)

1. **panel_count スケーリング**: archetype を n 可変化 (slot 補間/省略のルール導入)
2. **svg-renderer の polygon-aware 化**: 内側コンテンツを polygon centroid 基準に
3. **bubble breakout 機構**: storyboard.dialogue を panel 越境配置できるように
4. **motion lines / 効果線**: page_role 別の背景パターン挿入
5. **catalog 拡充**: vol-2/3/4 を走査して n=5 archetype 不足を解消
6. **storyboard 側の panel_count 可変化**: v3 mapper / storyboard generator が n=5 固定を緩和

## レビューチェックリスト (Codex 出力時)

- [ ] 4ファイル (loader / matcher / applier / mapper-v4) のみ新規追加
- [ ] v3 と zod / 既存 SVG renderer を一切変更していない
- [ ] PagePlanV2 の出力 shape が v3 と同等 (polygon フィールドが optional 追加されているのみ)
- [ ] env / config による v3↔v4 切替動作
- [ ] tsc + npm test pass
- [ ] a07 ep01 で v4 起動して手動確認できる手順が README で書かれている
