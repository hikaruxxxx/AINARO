# Layout Patterns Dictionary v3 — 実物抽出ベース

- 起票: 2026-05-09
- ステータス: Draft (要ユーザレビュー)
- 関連 plan: `~/.claude/plans/layout-patterns-dictionary-v2.md` (失敗総括)
- 関連 memory: `feedback_archetype_real_extraction.md` / `feedback_panel_geometry_polygon.md`
- 関連 dict: `data/manga/layout_patterns/v1.json` (52 patterns) / `v2.json` (70 patterns、想像ベースで撤回)
- 一次資料: `data/manga/raw/kindle-references/test-1/pages/page_0001.png〜page_0156.png` (156 page)
- catalog: `data/manga/layout_patterns/catalog-v1.md` (68 page 観察済み)

---

## 1. 背景

### v2 で起きた失敗
2026-05-08 に commit した dict v2 (pat_053-070, 18 個追加) は、商業漫画の典型構図を「実物参照せず Codex に座標を想像で起こさせた」結果、ネーム生成で **奇抜・不自然な polygon** が量産された。schema/test pass しても **商業漫画として成立しない**。

具体的な問題例 (a07-ep01 ネームで観察):
- pc=5 cliffhanger 系 non-rect が機械的すぎて読みにくい
- 斜め切り欠きの角度・配置が商業漫画の典型から外れる
- pat_019 連続を解消する目的で追加した archetype が、根本の「読み心地」を悪化させた

**結論**: 2026-05-09 に env デフォルトを v1 に戻し (commit c6105ba)、v2 は `MANGA_LAYOUT_DICT=v2` 明示時のみ使う降格状態。

### v3 の存在意義
v1 (52 patterns) は kindle-test-1 から実物抽出されているが、**non-rect は 4/52 = 7.7%** しかない。一方、商業漫画 (kindle-test-1) では **少なくとも 10-15 page で明確な non-rect 構図** が観察済み (catalog-v1.md より)。**v1 は extraction 漏れ** がある。

v3 は「v2 で機械的に水増ししたものを破棄し、v1 で抽出漏れていた non-rect archetype を実物から追加する」リカバリ作業。

---

## 2. 設計原則

### 不変
1. **想像で polygon を起こさない**。必ず実 page の panel 境界線をトレースして座標化
2. **schema/test pass は必要条件であって十分条件ではない**。最終判断は「商業漫画として成立しているか」をユーザと一緒に視認
3. **ネーム SVG の実機目視レビュー必須** (memory「archetype 設計は実物抽出必須」)
4. **1 archetype あたり 30-60 分の手作業を想定**。量産的に増やさない

### スコープ
- 対象は **kindle-test-1** (現代ダンジョン缶詰ガチャ Vol.1) のみ。Phase A 検証作品 3 並行のうち external_social subtype 代表
- 他 subtype (gacha_ui / hybrid) の non-rect 拡張は **本 plan の対象外**。別 plan で実物作品確保後に着手
- 既存 v1 archetype の **修正・統合は対象外**。v3 は v1 base + 追加のみ

### 採用基準 (商業漫画として成立する non-rect)
1. polygon が **実 page の panel 境界トレース** であること
2. 物語的役割 (page_role / purpose_summary) が catalog 観察と一致
3. 隣接 panel 配置が読み順 (RTL) を破壊しない
4. ユーザが実 SVG レンダで「商業漫画として読める」と判定

---

## 3. ゴール (定量)

| 項目 | 現状 v1 | v3 目標 | 出典 |
|------|---------|---------|------|
| pc=2 non-rect | 2 | 2 (現状維持) | - |
| pc=3 non-rect | 0 | 2-3 追加 | catalog: page_0040, 0041, 0086, 0151 等 |
| pc=4 non-rect | 1 | 1-2 追加 | catalog: page_0023, 0145, 0146, 0152 |
| pc=5 non-rect | 0 | 2-3 追加 | catalog: page_0101, 0111, 0137 |
| pc=6 non-rect | 1 | 0 (現状維持) | サンプル不足 |
| pc=7+ non-rect | 0 | 0 (現状維持) | サンプル不足 |
| **合計 non-rect** | **4 (7.7%)** | **10-12 (≈ 18-20%)** | - |
| 総 archetype 数 | 52 | 60-64 | - |

### 非ゴール
- non-rect 比率を v2 と同じ 31.4% に揃えること (実物に存在しない比率は出さない)
- 全 156 page を網羅的に抽出し直すこと
- 既存 v1 archetype の polygon 精度向上 (別 plan)
- subtype 別 dict 分割 (将来課題)

---

## 4. 抽出候補 page (Phase 1 で視認確認)

catalog-v1.md から実物 non-rect として観察済み page を抽出。**Phase 1 でユーザと一緒に SVG/PNG を視認しながら採否判定** する。

### 強推 (catalog で明示的に non-rect / 越境記述あり)
| page | 観察記述 | 推定 archetype |
|------|----------|----------------|
| 0040 | 楕円 bubble 形状 panel | pc=2: rect-top + ellipse-bottom |
| 0041 | 斜めに傾いた長方形 panel (パース) | pc=2: tilted-rect + cu-bottom |
| 0086 | 画面全体を斜め分断 (1 panel 内部 2 分割) | pc=1: diagonal split |
| 0137 | 斜め切り欠き polygon panels 2 + L字 inset | pc=4: polygon slash combat |
| 0145 | L字風 panel (大が左下切り欠き、small rect 嵌込) | pc=4-5: L-shape cutout + inset |
| 0146 | 真横3分割 (3 column strip) | pc=3: horizontal strip |

### 中推 (panel 境界が atmospheric にぼやける／越境)
| page | 観察記述 | 検討事項 |
|------|----------|----------|
| 0023 | 縦長 hero + 細長 strip | strip 形状を polygon で表現すべきか rect で十分か |
| 0101 | 円形 effect 説明 panel 2 + rect 2 (4 並列) | 円形 panel は polygon 近似でよいか |
| 0111 | 斜め角度キャラ panel | 「斜め角度」が polygon 境界か内容のみか要視認 |
| 0126 | 巨大魔物 silhouette が panel 境界越境 | 越境は archetype 化すべきか SVG overlay 側か |
| 0151 | 怪物口 close-up が panel 境界越境 | 同上 |
| 0152 | 拳 close-up + 反対側に小 face strip | strip 形状判定 |

### 弱推 (要視認、archetype 化困難な可能性)
- 0006 / 0007 / 0085 / 0102 / 0103 (atmospheric fade で境界消失系。これは archetype より background_treatment で表現すべき)

---

## 5. 抽出フロー (1 page あたり 30-60 分)

```
[Step 1] page PNG を Read で表示 (Claude 視認)
   ↓
[Step 2] panel 境界をトレース → polygon 座標を mm 単位で採寸
   ↓
[Step 3] catalog-v1.md の該当 page 観察記述を再確認
   ↓
[Step 4] archetype draft (id, name, panel_count, role_hints, slots[].polygon, ...)
   ↓
[Step 5] schema 検証 (validator script)
   ↓
[Step 6] ネーム SVG 試作 (a07-ep01 等で 1 page 描画)
   ↓
[Step 7] **ユーザ視認レビュー** ← ここが本 plan の品質ゲート
   ↓
[Step 8] OK → dict v3.json に commit / NG → Step 4 戻る
```

**重要**: Step 7 が省略可能になった瞬間に v2 と同じ失敗を繰り返す。**全 archetype がユーザレビュー必須**。

---

## 6. Phase 分割

### Phase 1: 候補 page 視認・採否決定 (1.5h)
- 強推 6 page + 中推 6 page = 12 page を Read tool で表示
- ユーザと一緒に「これは archetype 化する価値があるか」を判定
- 採用候補リスト確定 (目標 6-8 page)
- 弱推 5 page は **Phase 1 では扱わない** (background_treatment 別案件)

### Phase 2: polygon 採寸 + archetype draft (採用 1 件あたり 30-45 分)
- 採用 page ごとに polygon 座標を採寸
- archetype フィールド (id, name, panel_count, page_role_hints, subtype_hints, purpose_summary, trigger_conditions, frequency, example_pages, features, slots) を埋める
- catalog-v1.md の該当 page 記述を `purpose_summary` / `features` に流用
- pat_071-078 程度の id を割り当て (v2 と衝突しないよう連番継続)
- **draft は markdown でユーザレビュー** → OK 後 v3.json に転記

### Phase 3: dict v3.json 生成 + schema 検証
- v1.json をベースコピー → 新 archetype を追加 → v3.json として保存
- 既存 validator (`scripts/manga/utils/validate-layout-patterns.ts` 想定) で schema pass 確認
- panel_count 別カバレッジ集計

### Phase 4: ネーム SVG 試作 + ユーザレビュー
- a07-ep01 を `MANGA_LAYOUT_DICT=v3` で再生成 (L9 なし、ネーム SVG までで十分)
- 新 archetype が選択された page の SVG をユーザ視認
- NG なら Phase 2 に戻る

### Phase 5: env 切替判断 (本 plan 完了後)
- v3 が default になるかは **別判断**。本 plan の完了は v3.json が存在し、明示時のみ使える状態まで
- default 切替は a07-ep03 以降の運用で十分検証してから

---

## 7. 完了条件 (Definition of Done)

1. `data/manga/layout_patterns/v3.json` が schema validator pass
2. 6-8 個の non-rect archetype が追加済み (合計 non-rect 10-12 個 ≈ 18-20%)
3. 全 archetype の `example_pages` が **実在する kindle-test-1 page** を指す
4. 全 archetype がユーザ視認レビュー pass
5. `MANGA_LAYOUT_DICT=v3` 明示時のみ v3 が読まれる loader 修正 (`pattern-loader.ts`)
6. 既存 v1 default の挙動は変わらない (regression なし)
7. catalog-v1.md に v3 採用 page を `### 採用 archetype: pat_NNN` で追記

---

## 8. 想定コスト

| Phase | 作業 | 見積 |
|-------|------|------|
| 1 | page 視認・採否 | 1.5h (ユーザ同席) |
| 2 | polygon 採寸 + draft (8 件) | 4-6h |
| 3 | v3.json 生成 + 検証 | 0.5h |
| 4 | ネーム SVG 試作 + レビュー | 1h |
| **合計** | - | **7-9h** |

API コスト: ほぼゼロ (画像生成なし、Codex は polygon 採寸補助のみ)

---

## 9. 制約・注意事項

- `pattern-loader.ts` 修正は src/ なので **Codex 経由必須** (CLAUDE.md フロー)
- v3.json も `data/manga/layout_patterns/` に置くが gitignore 対象ではないので **commit 必要**
- v2.json は **削除しない** (raw archive として残す)
- catalog-v1.md は **追記のみ**、既存記述を消さない
- ネーム SVG レビューは **PNG export して目視** (SVG 直接見では panel 境界判定が甘い)

---

## 10. リスク

| リスク | 対応 |
|--------|------|
| polygon 採寸の精度不足 | mm 単位で採寸、座標は整数化 (1 unit = 1 mm 想定) |
| ユーザレビュー bottleneck | Phase 2 を 2-3 件単位で区切り、レビュー → 次 batch |
| v1 archetype と v3 新規が pattern-matcher で競合 | trigger_conditions / page_role_hints を catalog 記述と密に対応させる |
| kindle-test-1 1 作品依存リスク | 受け入れる。他作品の non-rect 抽出は別 plan で |

---

## 11. 開始トリガー

ユーザレビュー (本 plan 採否) → OK なら **Phase 1 着手**。

Phase 1 は Read tool で page PNG を順次表示しユーザに採否を聞く UX。所要 1.5h。途中で abort 可能。

---

## 12. Phase 1 実施結果 (2026-05-09 完了)

### 視認総数
- 強推 6 page (0040 / 0041 / 0086 / 0137 / 0145 / 0146)
- 中推 6 page (0023 / 0101 / 0111 / 0126 / 0151 / 0152)
- 未観察サンプリング 5 page (0048 / 0063 / 0095 / 0112 / 0140) — Claude 自身視認
- 未観察 35 page — 5 並列 Agent (general-purpose) 視認
- Agent 採用候補 8 page を Claude 自身が再視認 (0050 / 0053 / 0054 / 0093 / 0120 / 0122 / 0135 / 0142)
- **合計 60 page 視認** (うち kindle-test-1 全 156 page の約 38%)

### 採用 archetype (確定 5 + 候補強 1 = 6 件)

| ID | page | 仮称 | panel_count | polygon 種別 | page_role |
|----|------|------|-------------|--------------|-----------|
| pat_071 | 0040 | ellipse_power_activation | 2 | 楕円 (8-12 頂点近似) | power_activation |
| pat_072 | 0041 | trapezoid_supernatural_reveal | 2 | 斜め台形 (4 頂点) | reveal_supernatural / hook |
| pat_073 | 0048 | diagonal_split_face_establishing | 2 | 斜め境界 polygon 分割 | reveal_location / cliffhanger |
| pat_074 | 0054 | silhouette_polygon_threat_reveal | 4 | キャラ群シルエット沿い不規則 polygon (8+ 頂点) | threat_reveal / spec_change |
| pat_075 | 0137 | slash_polygon_combat | 4 | 斜め切り欠き polygon 2 分割 | action_climax |
| pat_076 | 0145 | L_inset_item_explanation | 5-6 | L字 cutout (大 panel に小 rect 嵌込) | item_explanation |

### 却下統計
- **明確却下 17 page** (0023 / 0050 / 0053 / 0063 / 0086 / 0093 / 0095 / 0101 / 0111 / 0112 / 0120 / 0122 / 0126 / 0135 / 0140 / 0142 / 0146 / 0151 / 0152)
- 主な却下理由:
  - 全 rect + atmospheric / black bleed (≈10 page)
  - vertical/horizontal split 直線・直角 (≈3 page)
  - 越境吹き出し/SFX overlay (≈2 page)
  - 既採用と機能重複 (≈2 page)

### Agent 判定の信頼度
- 5 並列 Agent から **採用候補 8 件** 報告 → Claude 再視認で **6 件却下、2 件採用** (採用率 25%)
- 主な誤判定: rect 並列を「斜辺共有 pentagon」と誤認、rect 図版 inset を「L字 cutout polygon」と誤認、atmospheric を「斜め境界 polygon」と誤認
- 教訓: **画像 panel 形状判定はサブエージェント信頼度低い**。最終判定は Claude 自身 or ユーザの実物視認が必須

### Phase 2 着手条件
- ✅ 採用候補 6 archetype 確定
- ✅ 各 page の polygon 種別仮判定済み
- ⏳ 0054 (silhouette_polygon) は要相談ステータス、Phase 2 採寸時に再評価
- 次セッションで Phase 2 着手可能 (採寸 30-45min × 6 = 3-4h)

### 非ゴール再確認
- non-rect 比率 31% (v2 と同等) は **狙わない**。実物の出現頻度に従う
- 4+6 = 10 archetype, 全 58 patterns で **non-rect 17.2%** が新目標 (plan 当初目標 18-20% にほぼ到達)
- subtype 別 dict 分割は将来課題 (本 plan 対象外)

