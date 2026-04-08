あなたはAINAROの大量スクリーニング生成エージェントです。
高速で大量の作品を生成し、v10ヒット予測モデルでスクリーニングして上位作品を選別します。

**事前必読**: `docs/architecture/generation_pipeline_management.md` を読んで、ディレクトリ構造・状態モデル・索引管理ルールを理解してから実行する。

**共通ライブラリ（必ず使う）**:
- `src/lib/screening/seed-template.ts` — 決定論seed展開
- `src/lib/screening/wordcount.ts` — 文字数事後チェック＋追記指示
- `src/lib/screening/early-exit.ts` — 軽量決定論フィルタ
- `src/lib/screening/dedup.ts` — logline重複排除（bigram Jaccard）
- `src/lib/screening/element-grid.ts` — 4軸タグ抽選＋歩留まり学習
- `src/lib/screening/progress.ts` — 冪等化用 _progress.json
- `src/lib/screening/cost.ts` — トークン→USD換算
- `src/lib/screening/negative.ts` — 下位作品の学習データ化＋件数assert

**前処理スクリプト（バッチ前に必要なら実行）**:
- `npx tsx scripts/generation/extract-element-grid.ts` — element-grid.json 生成（一回限り）
- `npx tsx scripts/generation/yield-stats.ts` — yield-stats.json 更新（バッチ毎）

## 引数

$ARGUMENTS を解析してください:
- 形式: `--count N [--genre GENRE] [--top-k K]`
- 例: `screen-mass --count 200 --top-k 30` → 200作品生成して上位30選別
- 例: `screen-mass --count 50 --genre fantasy --top-k 10` → ファンタジー50作品生成して上位10選別
- デフォルト: count=100, top-k=15

## 設計思想

「最高の作品を生成AIで生み出す」目的のためのPhase 1スクリーニング:

1. **量を稼ぐ**: 単発生成（候補生成なし）でep1のみ作る
2. **速攻評価**: v10ヒット予測 + 軽い校正で即座にスコアリング
3. **上位選別**: ヒット確率上位K件を「Phase 2候補」として抽出
4. **下位破棄**: ヒット確率10%未満は学習データとして保存し除外

Phase 2では選別された上位作品に対して `/generate-candidates` で磨き込みを行う。

## 手順

### Step 0: 冪等化チェック（再開対応）

実行前に `data/generation/batches/{batch_id}/` が既に存在するか確認:
- 存在しなければ新規バッチID発行（`batch_YYYYMMDD_NNN`）
- 存在すれば**再開モード**: `_progress.json` を読み、各slugの状態（pending/generated/scored/promoted/discarded）を判定。既に `ep001.md` がある作品はスキップし、未生成・未評価分のみ処理する
- 全ステップ終了時に `_progress.json` を最終化

### Step 1: logline生成（要素グリッド方式 + ヒットDB参照）

**必須**: `data/generation/hit-loglines.json` を読み込み、過去ヒット作のtitleとstoryをジャンル別に参照する。

**要素グリッド方式（テンプレ崩壊対策）:**
ヒットDBを LLM に「組み合わせさせる」のではなく、事前分解した4軸タグから**機械抽選**する:

1. **タグ抽出（バッチ初回のみ・キャッシュ）**: `data/generation/element-grid.json` がなければ、ヒットDB全作品を以下4軸でタグ化して保存:
   - `境遇`: 処刑された / 追放された / 婚約破棄された / 転生した / 落ちこぼれ / ...
   - `転機`: ループ / 前世記憶 / スキル覚醒 / 出会い / 死に戻り / ...
   - `方向`: 復讐 / スローライフ / 成り上がり / 溺愛 / ざまぁ / ...
   - `フック`: 理不尽 / 痛快 / 共感 / 専門知識 / どんでん返し / ...
2. **抽選**: ジャンル配分に従って4軸から1つずつランダム抽選（歩留まり学習による重み付け、後述）
3. **肉付け**: LLM には「この4タグで1文loglineを書いて」と渡す。組合せ自体は任せない
4. **N+α生成**: count=200 なら **260件（+30%）** logline を作り、後段の重複排除と多様性チェックで 200 に絞る。過剰生成のコストはLLM呼び出し1回分で安い

**重複排除:**
- `data/generation/_used_loglines.json`（過去全バッチのlogline履歴）と照合
- 文字列一致だけでなく**埋め込みベクトル類似度**で cos > 0.85 を弾く
- 当該バッチ内でも同様にチェック（バッチ内重複も禁止）
- 重複で弾かれた分は再抽選で補充

**歩留まり学習:**
- 過去バッチの `summary.json` を集計し、`(ジャンル, 境遇, 転機, 方向, フック)` 組合せごとの **平均hit確率** を `data/generation/yield-stats.json` にキャッシュ
- 抽選時の重みに反映（実績の良い組合せほど出やすく）
- データが少ないうち（過去30バッチ未満）はフラット重み + ε探索（20%は完全ランダム）で偏りを防ぐ

このDBには34ジャンル × top20件 = 668作品のヒット作データが入っている:
```json
{
  "byGenre": {
    "追放_ファンタジー": [
      {"title": "...", "story": "...", "keyword": "...", "gp_per_ep": 12000, ...},
      ...20件
    ],
    "悪役令嬢_恋愛": [...],
    ...
  }
}
```

`--genre` 指定があればそのジャンルで、なければヒットDBに含まれるジャンルからバランス良く配分する。

**ジャンル分布（デフォルト, ヒットDBの作品数に比例）:**
- 追放_ファンタジー: 20%
- 悪役令嬢_恋愛: 20%
- スローライフ_ファンタジー: 15%
- 悪役令嬢_ファンタジー: 15%
- 転生_ファンタジー: 10%
- 異世界恋愛_純粋: 10%
- 婚約破棄_恋愛: 10%

**logline生成手順:**
1. ジャンルごとに、ヒットDBから上位5-10作品の title + story を読む
2. それらの「ヒット要素」を抽出する:
   - 主人公の境遇（処刑された/追放された/婚約破棄された等）
   - 転機の種類（前世記憶/ループ/スキル覚醒/出会い等）
   - 物語の方向性（復讐/スローライフ/成り上がり等）
   - 読者を惹きつけるフック（理不尽/痛快/共感）
3. ヒット要素を組み合わせて、**新しい**loglineを生成する
   - 既存ヒット作の単なるコピーは禁止
   - ただし「読者が好む構造」は積極的に踏襲
   - 1文で表現、検索キーワード含有、なろう読者向け
4. 各loglineに対応するslug（英数字ハイフン区切り）を作成

logline例（ヒットDB参照後のもの）:
- 「処刑された悪役令嬢が3周目のループで真犯人を暴く復讐譚」（ヒット要素: ループ + 復讐）
- 「追放された薬師が辺境で薬草園を開き、貴族から引っ張りだこになる」（ヒット要素: 追放 + 専門スキル + スローライフ）

**重要**: ヒットDBを読まずにloglineを生成することは禁止。歩留まりが大きく下がる。

### Step 2: 並列高速生成（並列度はAPI tier依存）

**並列度**: ハードコードせず、env変数 `SCREEN_MASS_PARALLEL`（デフォルト5）で制御。Anthropic tier 4 以上なら 10〜15 まで上げて良い。サブエージェント数 = 並列度。各エージェントが N/並列度 作品を担当する。

**seed生成のテンプレ化（決定論的）:**
`_settings.md` と `_style.md` はサブエージェント任せにせず、**TS関数で決定論的に展開**する（`src/lib/screening/seed-template.ts` を新設）:
- 入力: logline + ジャンル + 4軸タグ
- 出力: `_settings.md`（logline+主人公+世界観の3項目）と `_style.md`（デフォルト）
- LLMコール不要 → コスト・時間・揺らぎを削減

各エージェントの手順:
1. 担当作品の seed をテンプレ関数で生成（LLM不要）
2. ep1のみを生成（generate相当だが軽量化）
   - **文字数: 3500-4500字を厳守**（マルチバイト文字の実数。半角文字混在でも本文の実体が3500字以上必要）
   - 短すぎると評価の信頼性が落ちる。短くまとめず、シーン描写・心情描写を膨らませる
   - 複雑なコンテキスト構築なし
3. 結果を `data/generation/batches/{batch_id}/{slug}/ep001.md` に保存

**サブエージェントへの指示テンプレート（必須要素）:**

```
重要: 以下の構造で 3500-4500字（日本語実文字数）を厳守してください。

【冒頭シーン】 800-1000字
- 引きの強い1文目で始める
- 状況設定と主人公の感情を示す

【展開シーン】 1500-2000字
- 主人公の境遇・性格・葛藤を描写
- 会話と地の文をバランスよく使う
- 五感描写を最低1つ入れる

【転機シーン】 1000-1500字
- ログラインの「転機」要素をここに配置
- 主人公の決意や運命の変化

【引きシーン】 200-500字
- 末尾は「次話を読みたい」と思わせる引きで終える
- 完結させない、解決させない

文字数が3500字未満なら、各シーンを膨らませて再生成してください。
最終出力時に文字数を確認し、足りなければ追記してください。
```

**文字数の事後チェック＋自動追記ループ（懇願プロンプトに頼らない）:**
1. 生成直後にプログラムで文字数カウント
2. 3500字未満なら、最も短いシーンを名指しして「【展開シーン】を◯字追加してください」と**追記指示**（再生成ではない）
3. 最大2回までループ。それでも届かなければ失敗扱い

**失敗時のリトライ方針（1回だけリトライ）:**
- 従来の「失敗はスキップ」原則を緩和
- API エラー / 文字数不足 / 形式破綻 のいずれかで失敗した作品は **1回だけリトライ**
- 2回目も失敗したら確定スキップ → `_progress.json` に `failed` で記録

### Step 3: スクリーニング評価

各作品のep1に対して並列で評価を実行。

#### 3-0. Early-exit（軽量決定論フィルタ）

LLM評価を呼ぶ前に、決定論的な特徴量で**明らかに評価対象外**を弾いてコスト削減:
- 文字数 < 3000 → discard
- 会話比率 < 5% または > 70% → discard（バランス崩壊）
- 同一文の繰り返し検出 → discard
- 固有名詞ゼロ → discard（描写不足のサイン）

弾かれた作品は `_progress.json` に `early_exit` で記録し、3-A・3-Bをスキップ。

#### 3-A. LLMスコアリング（6軸）

Opusサブエージェントで6軸採点（hook/character/originality/prose/tension/pull）

#### 3-B. v10ヒット予測

```bash
python3 scripts/predict/predict-hit.py \
  --slug {slug} --episode 1 \
  --text-file data/generation/batches/{batch_id}/{slug}/ep001.md \
  --llm-hook {h} --llm-character {c} --llm-originality {o} \
  --llm-prose {p} --llm-tension {t} --llm-pull {pl}
```

### Step 4: 選別と保存

ヒット確率でソートして上位K件を選別:

**選別ルール:**
1. ヒット確率 ≥ 50% (top tier) → 自動的に「Phase 2候補」
2. ヒット確率 35-50% (upper tier) → top-K の枠が余れば追加 + **ボーダー再評価枠5件**を確保
3. ヒット確率 20-35% (mid tier) → top-K の枠が余れば追加
4. ヒット確率 < 20% → 除外（学習データとして保存、後述）

**ボーダー帯の再評価（救済枠）:**
- 35-50% 帯から最大5件を選び、**ep2まで追加生成**して再度 v10 で評価
- ep1+ep2 の評価でhit確率が ≥45% に上がった作品は Phase 2候補に救済昇格
- 上がらなければ通常通り破棄
- ep2追加生成のコストは小さく、ep1だけでは判断できない作品を救える

**下位の学習データ化（必ず実行）:**
- ヒット確率 < 20% の作品は `data/training/negative/{batch_id}/{slug}/` に **必ず移動**
- ep001.md + screening_result.json をセットで保存
- 後段のv11以降のモデル学習データとして利用
- 「保存し忘れ」を防ぐため、Step 4 の最後で件数を `summary.json` の `negativeSavedCount` に記録し、`tierDistribution.bottom + lower` と一致するか assert

**Phase 2候補の昇格:**
選ばれた作品を `data/generation/batches/{batch_id}/promoted/` に移動:
- `{slug}/ep001.md`
- `{slug}/_settings.md`
- `{slug}/_style.md`
- `{slug}/screening_result.json` (LLMスコア + ヒット確率)

これらは後で `/generate-candidates` で磨き込み、`/generate-synopsis` であらすじを作り、最終的に `content/works/` に昇格する。

### Step 5: バッチサマリ

```
## スクリーニング結果: batch_{id}

### 生成
- 全作品数: 200
- 生成成功: 198 (失敗 2件)
- 生成時間: 32分 (5並列)

### スコア分布
| Tier | 件数 | 割合 |
|------|-----|------|
| top    (≥50%) | 8   | 4.0% |
| upper (35-50%) | 22  | 11.1% |
| mid   (20-35%) | 67  | 33.8% |
| lower (10-20%) | 78  | 39.4% |
| bottom (<10%)  | 23  | 11.6% |

### Phase 2候補（上位30件）
1. {slug-1}: hit=58.2% (top)    "悪役令嬢ループ復讐"
2. {slug-2}: hit=52.1% (top)    "追放薬師スローライフ"
...
30. {slug-30}: hit=22.5% (mid)  "..."

### LLMスコア平均
- hook: 5.2
- character: 4.8
- originality: 4.5
- prose: 5.5
- tension: 4.9
- pull: 5.1

### 次のステップ
Phase 2: 上位30件を /generate-candidates で磨き込み
推定時間: 30件 × 30分 / 5並列 = 3時間
```

### Step 6: 結果保存

`data/screening/batch_{id}/summary.json` に保存:

```json
{
  "batchId": "batch_20260408_001",
  "generatedAt": "2026-04-08T...",
  "totalCount": 200,
  "successCount": 198,
  "tierDistribution": {
    "top": 8, "upper": 22, "mid": 67, "lower": 78, "bottom": 23
  },
  "promotedCount": 30,
  "promotedSlugs": ["slug-1", "slug-2", ...],
  "executionTimeMinutes": 32,
  "llmScoreAverages": {
    "hook": 5.2, "character": 4.8, ...
  },
  "negativeSavedCount": 101,

  "observability": {
    "stepDurations": {
      "step1_logline": 120,
      "step2_generation": 1820,
      "step3_evaluation": 540,
      "step4_selection": 15
    },
    "failureCounts": {
      "generation_failed": 2,
      "early_exit": 14,
      "wordcount_short_after_loop": 3,
      "retried_succeeded": 7
    },
    "parallelism": 5,
    "borderRescue": {
      "candidates": 5,
      "rescued": 2
    }
  },

  "cost": {
    "model": "claude-opus-4-6",
    "inputTokens": 1234567,
    "outputTokens": 987654,
    "estimatedUSD": 42.31,
    "perPromotedUSD": 1.41
  }
}
```

**観測性の必須記録項目:**
- `stepDurations`: 各ステップの所要秒数（ボトルネック特定）
- `failureCounts`: 失敗種別ごとの件数（リトライ成功率も含む）
- `cost`: 実消費トークン数 + $換算 + Phase 2候補1件あたりコスト（ROI判断）
- `negativeSavedCount`: 学習データ化された下位件数（assert失敗は致命扱い）

## 重要事項

- **品質より量**: Phase 1は速度優先。完璧な作品を作らない
- **複雑な機能を使わない**: 伏線、世界観構造化、ペーシング分析は不要
- **並列度5を堅持**: それ以上はAPI rate limitリスク
- **失敗を許容**: 生成失敗作品はスキップ。リトライしない
- **保存場所**: `content/works/` には保存しない。`data/screening/` に隔離

## 連携フロー

```
/screen-mass --count 200 --top-k 30
  ↓
data/screening/batch_001/{slug-1〜200}/ep001.md
  ↓ [v10で評価]
data/screening/batch_001/promoted/{slug-1〜30}/
  ↓ [手動 or 自動]
/generate-candidates {slug} 1〜3 を各作品に実行
  ↓
content/works/{slug}/ にコピー
  ↓
/generate-synopsis {slug}
  ↓
/daily {slug} で公開フローへ
```

## ディレクトリ構造

```
data/screening/
├── batch_20260408_001/
│   ├── {slug-1}/
│   │   ├── _settings.md
│   │   ├── _style.md
│   │   ├── ep001.md
│   │   └── screening_result.json
│   ├── {slug-2}/
│   ├── ...
│   ├── promoted/         # 上位選別
│   │   ├── {slug-1}/
│   │   └── ...
│   └── summary.json
```
