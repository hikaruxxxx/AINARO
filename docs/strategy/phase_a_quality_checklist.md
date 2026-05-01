# Phase A 制作品質チェックリスト v1

2026-05-01 確定。Week 0 Pilot で得られた知見から、Phase A 制作時に必ず守るべき品質要素を整理。

## 各ページ生成時の必須要素

### 1. プロンプト構造 (必須)

```
1. style (art_style 指定: manga_bw_seinen_dark / manga_bw_shoujo_classic / manga_bw_seinen_urban)
2. MINIMALISM_DIRECTIVE (描き込み抑制) ← 必須、prompt-composer.ts に組込済
3. STYLE_MIMIC (蔵書refs参照指示) ← 蔵書refsを使う場合のみ
4. RTL_DIRECTIVE or LTR_NOTICE (シーン特性で使い分け)
5. LAYOUT (パネル境界・ガター指示)
6. PROTAGONIST (主人公設定)
7. Scene description (panel#番号 + 物理オブジェクト記述)
8. NO_TEXT (画像内文字描画禁止、SVG重ね前提)
9. ANTI_AI (AIっぽさネガティブ)
```

### 2. シーン特性別戦略の使い分け

```
シーンが「明確な物理オブジェクト中心」か?
├─ Yes → F-2 (page_one_shot) + RTL_DIRECTIVE + panel#番号 + 物理オブジェクト名
│        例: スマホ・おにぎり・看板・エスカレーター・派遣会社の朝
│        rtl-fix-pilot/02 で実証 (A- 級)
└─ No → F-1 (panel_composite) で各panelを独立生成
        + page-director の TEMPLATES (16種) で RTL レイアウト配置
        例: 覚醒の顔・モンスター群・引きシルエット・splash
        本来の F-1 戦略、Month 2 でレンダラ実装
```

判定基準: 各 panel の主体が「実物として読者の知っている物」か「演出ビート」か。
- 物 (smartphone, escalator, sword, monster, building) → F-2 + RTL指示で生成可能
- 演出 (close-up of awakening eye, splash impact, abstract crowd silhouettes) → F-1 で独立生成 → コードで RTL 配置

**注**: 画像反転 (sips -f horizontal) 戦略は2026-05-01に撤回。左右反転は物理位置を入れ替えるだけでストーリー順序を変えないため、RTL化には機能しない。

### 3. 参照画像 (refs) の運用

- **キャラ Bible refs** (主人公・ヒロインの参照画像 4-8枚) → 全panel生成で必須注入
- **蔵書refs** (kindle-test-1 等の画風参照 6枚) → Phase A 1作目で全panel注入推奨。画風統一感を強化
- **直前パネル refs** (prompt-composer.ts:316 の prevPanelPath) → 連続コマで空間/時間連続性を保つ

### 4. 「描き込み抑制」のチェック項目

各ページ生成後、目視で以下を確認:
- [ ] 1ページ内で **明確な密度差** がある (低・中・高が混在)
- [ ] **白背景50%以上** のパネルが少なくとも1つある
- [ ] 群衆は **シルエット or 線ジェスチャー** で描かれている (個別顔はNG)
- [ ] 背景は **必要最低限** に抑えられている (建物の窓ガラス・ブロック・葉一枚一枚はNG)
- [ ] スクリーントーンが **均一適用されていない** (用途別に意図的)

### 5. RTL読み順チェック項目

- [ ] 各 tier 内で **右が先・左が後** にストーリーが進む
- [ ] panel#番号がストーリー順 (#1→#2→#3...) になっている
- [ ] 反転対象シーンは反転後に確認

### 6. AIっぽさの最終チェック (本物比較)

- [ ] kindle-test-1 のページと並べて、画風が「同じレーベル」と認識できるか
- [ ] キャラ顔がテンプレ的美形に陥っていないか (個性ある造形か)
- [ ] 線が「均一すぎ」じゃないか (プロの「迷い線」「強弱」があるか)
- [ ] コマごとに「呼吸 (余白)」があるか

## 失格条件 (再生成必須)

以下のいずれかに該当する場合は再生成:
- AIっぽさが顕著 (テンプレ顔、均一細密、airbrush的滑らかさ)
- コマ順序が破綻している (RTL読みでストーリーが逆流)
- キャラ一貫性破綻 (前ページと顔が違う)
- 画像内に意図しない文字描画 (吹き出しは別途SVGで重ねるため、画像内文字は全部NG)
- 著作権上の問題 (蔵書refs由来の構図を直接複製していないか)

## 1巻160-200ページの想定品質配分

| 品質ゾーン | 目安枚数 | 内訳 |
|---|---|---|
| A 級 (silence_panel 級) | 30-50ページ | 引きの大ゴマ・無音・余韻シーン |
| A- 級 (商業出版可能) | 100-130ページ | 通常dialogue / setup / aftermath |
| B+ 級 (修正後A-に上げる) | 20-30ページ | 複雑シーン・action |
| B- 以下 (再生成) | 0ページ目標 | 失格条件該当の場合は必ず再生成 |

**目標**: 1巻全ページが平均 A- 以上。少なくとも10-20ページが A 級 (引き・冒頭・クライマックス)。

## 品質確保のための制作工程

1. **ネーム生成** (storyboard-builder.ts + genre-presets.ts) — ジャンル特化
2. **page-director でレイアウト IR 生成** (テンプレ16から自動選択)
3. **F-2 ページ一発生成** (prompt-composer.ts → composePanelPrompt 経由、MINIMALISM 自動適用)
4. **画像反転** (必要なシーンのみ、sips -f horizontal)
5. **目視レビュー** (上記チェック項目)
6. **再生成 or SVG 吹き出し重ね**
7. **最終仕上げ** (誤字脱字・トーン濃淡微調整)
8. **KDP入稿用PDF/X-1a パッケージ**

## 残決定事項

- F-2 の page_one_shot プロンプト生成パイプライン (Month 2 で実装) に MINIMALISM/STYLE_MIMIC/反転を組込
- F-1 の panel_composite に prevPanelPath 連鎖を組込
- ベスト1パネルの再生成上限 (3回程度) と再生成失敗時のフォールバック (F-2 → F-1 切替等)
- 反転による看板・時計の鏡像問題への対応 (現状は「文字を描かない」で逃げている)
