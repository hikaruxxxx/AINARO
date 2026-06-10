# reference_pool — 漫画 reference 用素材プール

漫画パイプラインの bible-images 生成 (L02) と page-director (L05) で使う「参考画像」素材を、
**用途別に分離して管理**するためのディレクトリ。

## 背景: なぜ用途別に分けるか

L02 は「描き込まれた背景 (detailed_bg)」のサンプルから学習したいが、L05 は
「コマ全体の構図」のサンプルから学習したい。両者を混ぜると:

- L02 にトーンバック (`tone_back`) や atmospheric_fade を混ぜる → 「描かない背景」を学習し、
  生成された location ref がスカスカになる
- L05 にトーンバックを排除する → 「ここは背景を抜く」というプロ判断を取りこぼし、
  全コマ詰め込みの素人っぽいレイアウトになる

`background_treatment` (`src/lib/manga/schemas-v2.ts` の `BackgroundTreatment` 型) で
panel-level に分類し、用途別 reference pool を導けるようにする。

## ディレクトリ構成

```
data/manga/reference_pool/
├── README.md                                    # ← 本ファイル
├── _learner_runs/                               # LLM vision 出力 (panel-level メタ)
│   ├── _tasks/{source}/batch-NNN.json           # prepare で生成される task spec
│   ├── _tasks/{source}/batch-NNN.prompt.md      # 同 agent prompt 雛形
│   ├── _responses/{source}/batch-NNN.json       # agent dispatch 結果
│   └── {source}-{YYYY-MM-DD}.json               # merge 出力 (集約された panel meta)
├── _internal_crops/                             # ⚠️ kindle_archive 由来クロップ (internal only)
│   └── {source}/
│       ├── _manifest.json                       # provenance + 警告
│       └── page_NNNN_pMM_{treatment}.png        # 個別 panel crop (人間レビュー専用)
├── {source}-stats.md                            # 集計レポート (markdown)
├── background/                                  # ← 将来用、現状空。
│                                                #    ai_use_allowed な背景 ref のみ置く
└── panel_layout/                                # ← 将来用、現状空。
                                                 #    ai_use_allowed な構図 ref のみ置く
```

## rights ポリシー (重要)

| ディレクトリ | 由来 | 用途 |
|---|---|---|
| `_internal_crops/` | **`kindle_archive`** 商業漫画から自動クロップ | 人間 curator/reviewer 専用。AI training/inference には**絶対**流さない |
| `background/`, `panel_layout/` | bible_generated / manual_upload / external_purchased のみ | L02/L05 の reference として安全に渡せる |
| `_learner_runs/` | metadata only (rationale + bbox) | OK。pixel は含まない |

`src/lib/manga/bible/provenance.ts` の `isAllowedForProduction` で
`source_type === "kindle_archive"` および `learning_source_chain` 経由の transitive
reject が入っている。`_internal_crops/` の中身を間違えて L02 の `referenceImagePaths`
に渡すと、provenance gate で reject されるはず — それでも自動防衛は完璧ではないので、
コードレビュー時に「`_internal_crops/` を読み込むコードがないこと」を必ず確認する。

## 使い方

### 1. 既存素材から学習データを作る

```bash
# Phase 1: タスク準備 (page list を batch 化)
npx tsx scripts/manga/layers/L05c-pattern-bg-learner.ts \
  --mode prepare \
  --source data/manga/raw/page-flip/level-gacha-vol1 \
  --pages 1-30 --batch-size 6

# Phase 2: 各 batch に対し Claude session で Agent (general-purpose) を並列 dispatch
#   prompt は data/manga/reference_pool/_learner_runs/_tasks/{source}/batch-NNN.prompt.md
#   response は data/manga/reference_pool/_learner_runs/_responses/{source}/batch-NNN.json に保存

# Phase 3: agent 出力を merge
npx tsx scripts/manga/layers/L05c-pattern-bg-learner.ts \
  --mode merge --source data/manga/raw/page-flip/level-gacha-vol1
```

### 2. internal review crops を作る

```bash
npx tsx scripts/manga/utils/build-internal-crops.ts --source level-gacha-vol1
# → data/manga/reference_pool/_internal_crops/level-gacha-vol1/*.png
#    (kindle_archive flag, internal_only)
```

特定の treatment だけ:

```bash
npx tsx scripts/manga/utils/build-internal-crops.ts \
  --source level-gacha-vol1 --treatments detailed_bg,floating_ui
```

### 3. 統計レポートを生成

```bash
npx tsx scripts/manga/utils/learner-stats.ts --source level-gacha-vol1
# → data/manga/reference_pool/level-gacha-vol1-stats.md
```

## L02 プロンプト改善への活用 (現状方針)

`_learner_runs/{source}.json` と `{source}-stats.md` を読んで、L02 (`src/lib/manga/bible/v2-images.ts`)
の `buildLocationRefPrompt` / `buildPropRefPrompt` を「商業漫画の背景描画密度に近づける」方向に
**人間がプロンプト改善**する。LLM 生成プロンプトに pixel を直接渡すフローは持たない (rights のため)。

例: level-gacha-vol1 stats では atmospheric_fade が 52% と支配的 → location ref で
「全画面描き込み」を強要するプロンプトはやり過ぎ。establishing 用と panel 内用を分ける、等。

## 将来 (Phase B) — production reference の追加

外部購入素材 / 自社書き起こしが貯まってきたら:

1. `background/{source}/` に PNG を配置
2. `_manifest.json` に `source_type: external_purchased` または `manual_upload`
3. L02 の `referenceImagePaths` 引数に許可 source からのみ pull するヘルパを追加
4. provenance チェックで learning_source_chain に kindle_archive が混じってないことを担保
