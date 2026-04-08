# Phase 1 生成パイプライン詳細設計 v2

**作成日**: 2026-04-08
**ステータス**: 設計確定、実装未着手
**前身**: `generation_pipeline_management.md`(v1) の Phase 1 部分を全面再設計

## 設計の核

> **常時稼働の多段絞り込みパイプライン。シードから本文まで6層、各層で評価しジャンル別リーグでペアワイズ順位付け。歩留まり学習とモデル再訓練でフィードバック、80% は階層的バランスで運用、20% は探索専用枠。**

v1(`generation_pipeline_management.md`)からの主な変更:
- バッチ実行 → 常時稼働(launchd デーモン)
- ep1 単発生成 → 6層階層生成(logline → plot → synopsis → arc plot → ep1 → ep2-3)
- LLM 6軸絶対スコア → ペアワイズ比較(Bradley-Terry)
- ヒットDB単独起点 → ヒットDB + 読者感情欲求のハイブリッド
- 全作品同一バランス → 階層的バランス + 探索専用枠20%
- 単一モデル評価 → ジャンル別リーグ + ジャンル特化軸

---

## 1. 実行基盤(常時稼働)

### アーキテクチャ

```
~/Library/LaunchAgents/com.novelis.generator.plist
  ↓ KeepAlive=true、Mac再起動でも自動復帰
node scripts/generation/daemon.ts
  ├─ throttle.ts        : Claude Max 5h窓を意識した流量制御
  ├─ work-queue.ts      : SQLite/JSONL ベースのキュー
  ├─ subprocess         : claude -p ヘッドレス呼び出し(同時1-2並列)
  ├─ 各層独立キュー      : Layer1〜6 が独立した流量で動く
  ├─ 結果保存            : data/generation/works/{slug}/
  └─ 日次バッチ振り分け  : data/generation/batches/batch_YYYYMMDD/(分析用)
```

### 採用理由

| 方式 | 採否 | 理由 |
|---|---|---|
| Vercel cron | ❌ | API課金で Claude 定額外、コスト爆発 |
| /loop skill | ❌ | ターミナル落ちたら死ぬ |
| **launchd + claude -p** | **✅** | ローカル認証で Claude Max 定額に乗る、24/7耐性、再起動自動復帰 |

### 注意点

1. `claude -p` の同時実行は 1-2 並列まで(Claude Max のセッション上限)
2. 5時間窓のトークン上限を throttle で監視、超えそうなら sleep
3. `claude -p` がハングしたら timeout で殺す
4. ログは `/tmp/novelis-generator.log` に流して `tail -f` 可能に

### 新規実装

- `scripts/generation/daemon.ts` — メインデーモン
- `src/lib/screening/throttle.ts` — 流量制御
- `src/lib/screening/work-queue.ts` — キュー管理
- `~/Library/LaunchAgents/com.novelis.generator.plist`

---

## 2. シード(入力)設計

### 起点: ハイブリッド + 時間で重み変化

```
初期(現在):     a 70% + b 30%
中期(自社100作品+人間評価後):  a 40% + b 40% + d 20%
成熟期(自社1000作品+):         a 20% + b 30% + d 50%
```

- (a) **ヒット作DB起点** — 過去のなろう上位作を分解 → 再構成
- (b) **読者感情欲求起点** — 心理フレーム + ヒットDB逆算
- (d) **自社評価データ起点** — 自社の高評価作品から学習(将来)

(c) LLM自由発想は採用しない(中央値に収束する)。

### 読者感情欲求 10項目

`data/generation/reader-desires.json` に正式定義:

1. 報われたい(不遇からの解放)
2. 見返したい(ざまぁ)
3. 無双したい(俺TUEEE)
4. 愛されたい(溺愛)
5. 守られたい(庇護)
6. 逃避したい(スローライフ)
7. 知りたい(謎解き/世界探索)
8. 成長したい(修行/努力)
9. 繋がりたい(仲間/家族)
10. 観察したい(人間ドラマ)

### β-3: ヒットDB逆算

`data/generation/hit-loglines.json` 全作品を LLM 分類して「どの感情欲求を満たすか」をマップ。
出力: `data/generation/hit-loglines-with-desires.json`(本設計確定後に1回実行、半年に1回更新)

### シード構造: 5次元 + 2階層

```
固定軸(機械抽選):
  軸1: 感情欲求       ← reader-desires.json から
  軸2: ジャンル枠      ← genre-taxonomy.json から

LLM裁量軸:
  軸3: 境遇/転機の具体化   ← (a)ヒットDBと(b)感情を橋渡し
  軸4: 物語の方向性        ← 読者感情を満たす道筋
```

### 重複排除

- **4-tuple完全一致除外**: (感情, ジャンル, 境遇, 転機) が全部同じものだけ弾く。1軸でも違えば許可
- 過去全バッチ参照(永遠に蓄積)
- 加えて bigram Jaccard 類似度の最終チェック(文レベル重複防止)

### 新規実装

- `data/generation/reader-desires.json`
- `data/generation/hit-loglines-with-desires.json`(後日)
- `src/lib/screening/seed-v2.ts` — 5次元シード生成
- `src/lib/screening/element-grid.ts` 拡張(4軸→5次元化)

---

## 3. 6層生成階層

### 階層定義

```
Layer 1: ログライン(1文の核)
  生成: 機械抽選 + LLM肉付け
  評価: なし(明らかな駄目だけ弾く)
  通過率: 80%
  ↓
Layer 2: プロット骨格(Web小説特化)
  内容: 第1アーク完結 + 全体引き、起点・転換点・結末
  生成: LLM、ジャンル別 plot-templates/{genre}.md を参照
  評価: ペアワイズ比較(プロット同士)
  通過率: 50%
  ↓
Layer 3: あらすじ(読者向け要約)
  内容: フック含む、800字程度
  生成: LLM、ジャンル別 style-templates/{genre}.md を参照
  評価: ペアワイズ比較
  通過率: 50%
  ↓
Layer 4: アーク1詳細プロット
  内容: 10-20話分のシーン構成
  生成: LLM
  評価: ペアワイズ比較
  通過率: 40%
  ↓
Layer 5: ep1本文
  内容: 3500-4500字、ジャンル別構造
  生成: LLM、1エージェント=1作品(テンプレ化防止)
  評価: ペアワイズ比較 + ヒット予測 v11
  通過率: 30%
  ↓
Layer 6+: ep2-3本文
  内容: 通過分のみ
  状態: promoted
```

### Web小説特化プロット構造

三幕構成や起承転結ではなく、連載小説に適した構造:

- **起点**: 主人公の境遇と読者の感情移入フック
- **転換点1**: ログライン要素の発動(ループ/転生/追放/婚約破棄等)
- **転換点2**: 主人公の決意と方向性の確定
- **第1アーク完結**: アーク内の小目標達成(カタルシス)
- **全体引き**: 大目標への布石(続きが読みたくなる引き)

転換点の置き方はジャンル別(`plot-templates/{genre}.md` に格納)。

### 訓練データ保存

- Layer 2 以降の没作品を全て保存
- パス: `data/training/layer{N}/{genre}/{slug}/`
- ヒット予測モデル v11, v12 の訓練に使用

### 失敗時の扱い

- API エラー / 形式破綻 → 1回だけリトライ → 失敗したら確定スキップ
- 文字数不足(Layer 5) → シーン名指しで追記指示、最大2回ループ
- 各層の没作品でも訓練データには保存(ラベル: bottom)

---

## 4. ジャンル分離(必須)

### 何を分離するか

| 要素 | 分離 | 場所 |
|---|---|---|
| 生成プロンプト | ✅ | `src/lib/screening/layers/{genre}/` |
| プロット骨格テンプレ | ✅ | `data/generation/plot-templates/{genre}.md` |
| 文体テンプレ | ✅ | `data/generation/style-templates/{genre}.md` |
| 評価軸の重み | ✅ | `data/generation/eval-weights-by-genre.json` |
| 訓練データパス | ✅ | `data/training/layer{N}/{genre}/{slug}/` |
| ペアワイズリーグ | ✅ | `data/generation/leagues/{genre}/` |
| シード生成ロジック | ❌ | 共通(タグだけジャンル別) |
| 流量制御 | ❌ | 共通 |
| 重複排除 | ❌ | 共通 |

### ジャンル定義

- **階層構造**: 大5 × サブ4 = 20相当
- **リサーチ**: なろう/カクヨム/アルファポリス/エブリスタ/Amazon Kindle/コミック横断調査(別タスクで実行中)
- **成果物**: `data/generation/genre-taxonomy.json`
- **仮置き**: 既存7ジャンル(追放_ファンタジー / 悪役令嬢_恋愛 / スローライフ_ファンタジー / 悪役令嬢_ファンタジー / 転生_ファンタジー / 異世界恋愛_純粋 / 婚約破棄_恋愛)で開始、リサーチ完了後に再構築

### ヒット予測モデルのジャンル分離戦略

| 段階 | データ規模 | モデル構成 |
|---|---|---|
| 現在 | 数百作品 | v11 統合モデル + ジャンルを強い特徴量 |
| 中期 | 各ジャンル200+ | ジャンル別サブモデル(v12-tsuiho, v12-akuyaku 等) |
| 成熟期 | 各ジャンル1000+ | ジャンル × サブジャンル別モデル |

---

## 5. 評価とフィードバック

### 評価方式: ジャンル内 Swiss-system + Bradley-Terry

```
ジャンル別リーグ:
  - 各作品が同ジャンル内で「現在のレーティングが近い既存作品3件」と比較
  - 累積10ペアで確定
  - 上位tier/下位tier境界の作品は追加比較(アクティブラーニング)
  - レーティング更新は Bradley-Terry モデル

ジャンル横断グランドリーグ(月1回):
  - 各ジャンルのtop10だけを横断比較
  - 全体ランキング作成(月次)
```

### 評価軸: 共通5軸 + ジャンル特化3軸

**共通5軸**:
- hook(冒頭の引き)
- character(キャラクター)
- prose(文章力)
- tension(テンション/緊張感)
- pull(末尾の引き)

(originality は外す。「独自性≠面白さ」のメモに準拠)

**ジャンル特化3軸**(ドラフト、リサーチ後再構築):

| ジャンル | 特化軸 |
|---|---|
| 悪役令嬢_恋愛 | 貴族描写の品格 / ヒロインの聡明さ / ざまぁのカタルシス |
| 追放_ファンタジー | ざまぁの痛快さ / スキル説得力 / 旧パーティ崩壊の必然性 |
| スローライフ | 日常の温度感 / スキル/職業の魅力 / 出会いの心地よさ |
| 転生_ファンタジー | 世界観構築力 / 主人公の成長曲線 / 知識チートの説得力 |
| 異世界恋愛_純粋 | ヒーローの魅力 / 距離感の機微 / 純愛のリアリティ |
| 婚約破棄_恋愛 | 婚約破棄シーンの衝撃 / 主人公の凛々しさ / 新たな出会いの納得感 |
| 悪役令嬢_ファンタジー | 悪役らしさと共感の両立 / 戦闘・能力の見せ場 / 立ち位置の独自性 |

### ペアワイズ比較プロンプト

絶対スコアではなく**勝敗のみ**を返す。理由はログとして保存。

```
あなたはWeb小説の評価者です。ジャンル「{genre}」の以下2作品を比較してください。

作品A: [本文]
作品B: [本文]

評価軸:
- 共通: hook / character / prose / tension / pull
- ジャンル特化: [genreごとの3軸]

総合的にどちらが面白いか、勝者(A or B)と理由を答えてください。
```

### LLM評価の再現性問題への対処

メモ「LLMスコアはセッション間で再現性なし」への対応:
- 絶対スコア廃止 → ペアワイズで相対比較に変えることで根本対応
- 同一セッション内で完結する設計
- 評価モデルは固定(将来 Sonnet 等に統一)

### フィードバック構造: β + δ

**β: 歩留まり学習**
- ジャンル内リーグ上位の (感情, ジャンル, 境遇, 転機) 組合せ → `yield-stats.json` に重み加算
- 抽選時の重み反映
- 過去30バッチ未満の段階では ε探索を維持

**δ: モデル再訓練**
- レーティング確定作品 → ヒット予測 v11, v12 の訓練データに自動追加
- 月1回の自動再訓練ジョブ(`scripts/generation/retrain-v11.ts`)
- 新モデルが次のバッチの選別に使われる

### 採用しないフィードバック

- **(γ) プロンプト自動更新**: 評価バイアスがプロンプトに焼き付くリスクが高い
- **(α) 完全独立**: 改善が止まる

### 新規実装

- `src/lib/screening/pairwise.ts` — Swiss-system + Bradley-Terry
- `src/lib/screening/league.ts` — ジャンル別リーグ管理
- `src/lib/screening/llm-compare.ts` — ペアワイズLLM呼び出し
- `data/generation/leagues/{genre}/ratings.json` — レーティング状態
- `data/generation/leagues/{genre}/matches.jsonl` — 比較履歴
- `scripts/generation/retrain-v11.ts` — 自動再訓練ジョブ

---

## 6. 多様性 vs ヒット率(階層的バランス)

### 階層別バランス

| Layer | バランス | ε探索率 | 理由 |
|---|---|---|---|
| 1 ログライン | 探索寄り | 40% | 入口で多様性確保しないと下流で消える |
| 2 プロット | 中庸 | 20% | 構造の検証段階 |
| 3 あらすじ | 中庸 | 20% | 構造の検証段階 |
| 4 詳細プロット | 踏襲寄り | 10% | 完成度を見る段階 |
| 5 ep1本文 | 踏襲寄り | 10% | 文章品質を見る段階 |
| 6+ ep2-3 | 完全踏襲 | 0% | 残った精鋭の磨き込み |

### 探索専用サブパイプライン

- **流量の20%** を探索専用に確保
- 完全ランダムなタグ組合せ、下流まで通す
- ヒット予測スコアで弾かない
- 「実験データ」として明示的にラベル
- ペアワイズリーグは**通常作品と同じリーグに入れる**(Surprise測定のため)

### 探索成功の測り方(4軸)

単一指標では測れないので多軸で見る。**どれか1つでも当たれば成功**。

**軸1: 予想外性(Surprise)** — 最重要
- 探索作品のヒット予測 percentile - リーグレーティング percentile
- 「予測モデルは低く出したが、リーグでは上位」 = 予測モデルの盲点を突いた

**軸2: 多様性貢献(Diversity)**
- 探索作品の埋め込みベクトル × 既存全作品の最近傍距離
- 大きいほど既存にない領域を埋めた

**軸3: 新ジャンル発芽(Emergence)**
- 探索作品の組合せが、後続バッチで通常パイプラインに採用された頻度
- yield-stats での重み上昇

**軸4: モデル改善寄与(Model contribution)**
- 探索作品を訓練に加えた v(N+1) と加えなかった v(N) のクロスバリデーション差分
- AUC or Spearman 相関の改善幅

### 集計とアクション

```
週次レポート: data/generation/exploration/_weekly_report.json
  - 軸1〜4の値
  - Surprise > 0.3 だった作品リスト
  - 通常パイプラインに昇格すべき組合せ提案

月次判断:
  - 軸1〜4 のいずれも改善していなければ、探索枠を縮小(20% → 10%)
  - 軸1 が高ければ探索枠を維持/拡大
  - 軸3 で新ジャンル発芽したら正式ジャンルに追加
```

### 撤退ルール

**1ヶ月連続で軸1〜4 のいずれも閾値を超えなければ、探索枠を撤廃 or 方式を変える**。
- 短期判断:長期で粘らず、早めに方針転換

### 初期値: 二段階運用

- **Phase 1A(最初の100作品)**: 探索寄り(全層 ε+10%、ジャンル広く)
- **Phase 1B(100作品以降)**: batch_002 データと合わせて中庸に移行

### 新規実装

- `scripts/generation/exploration-metrics.ts` — 月次の4軸計算
- `data/generation/exploration/_weekly_report.json`
- `data/generation/exploration/metrics_history.jsonl`

---

## 7. ディレクトリ構造

```
data/
├── generation/
│   ├── reader-desires.json              # 感情欲求10項目
│   ├── genre-taxonomy.json              # ジャンル階層(リサーチ後)
│   ├── hit-loglines.json                # ヒットDB v1
│   ├── hit-loglines-with-desires.json   # β-3 結果
│   ├── element-grid.json
│   ├── yield-stats.json                 # 歩留まり学習(β)
│   ├── _used_loglines.json
│   ├── _index.json                      # 中央索引
│   ├── plot-templates/{genre}.md
│   ├── style-templates/{genre}.md
│   ├── eval-weights-by-genre.json
│   ├── leagues/{genre}/
│   │   ├── ratings.json
│   │   └── matches.jsonl
│   ├── works/{slug}/                    # 作品(フラット)
│   │   ├── _meta.json
│   │   ├── layer1_logline.md
│   │   ├── layer2_plot.md
│   │   ├── layer3_synopsis.md
│   │   ├── layer4_arc1_plot.md
│   │   ├── layer5_ep001.md
│   │   ├── layer6_ep002.md, ep003.md
│   │   └── evaluation.json
│   ├── batches/batch_YYYYMMDD/          # 日次自動振り分け(分析用)
│   │   └── _summary.json
│   └── exploration/
│       ├── works/{slug}/                # 探索専用作品
│       ├── _weekly_report.json
│       └── metrics_history.jsonl
└── training/
    └── layer{N}/{genre}/{slug}/          # 訓練データ(層別×ジャンル別)
```

---

## 8. 既存実装との関係

### 残すもの(共通ライブラリ)

- `src/lib/screening/dedup.ts` — 重複排除(改良)
- `src/lib/screening/wordcount.ts` — 文字数チェック
- `src/lib/screening/early-exit.ts` — 早期除外
- `src/lib/screening/cost.ts` — コスト計算
- `src/lib/screening/progress.ts` — 進行状況
- `src/lib/screening/element-grid.ts` — 4軸タグ → 5次元化に拡張

### 置き換えるもの

- `seed-template.ts` → `seed-v2.ts`(5次元化)
- `negative.ts` → `training-data.ts`(層別×ジャンル別保存)

### 廃止

- バッチ単位の冪等化ロジック(常時稼働なので不要)
- LLM 6軸絶対スコア(ペアワイズに置き換え)
- `/screen-mass` コマンド(常時稼働デーモンに置き換え)

---

## 9. 実装ロードマップ

### Phase 1A(最初の100作品まで)

**Critical**:
1. ジャンル定義 v2(リサーチ完了後)
2. `reader-desires.json` 定義
3. `seed-v2.ts` 5次元シード生成
4. `daemon.ts` + launchd plist
5. `throttle.ts` + work-queue
6. Layer 1-3 の生成ロジック
7. `pairwise.ts` + `league.ts`(ジャンル別リーグ)

**High**:
8. Layer 4-5 の生成ロジック
9. ジャンル別 plot/style テンプレ(全ジャンル × 2ファイル)
10. `eval-weights-by-genre.json`
11. β-3 ヒットDB逆算

**Medium**:
12. 探索専用サブパイプライン
13. δ自動再訓練ジョブ
14. 観測性ダッシュボード

### Phase 1B(100作品〜)

- 中庸バランスへ移行
- グランドリーグ(ジャンル横断)月1実行
- 自社評価データから新ジャンル軸の発見

---

## 10. 設計決定の根拠(議論ログのサマリ)

| 決定 | 根拠 |
|---|---|
| 常時稼働 | コスト境界が Claude 定額、頻度連続、時間連続稼働可 |
| launchd | API課金回避、ローカル認証、再起動耐性 |
| ハイブリッド起点 | (a)単独は batch_002 で限界露呈、(b)で多様性、(d)は将来 |
| 4-tuple除外 | 永久蓄積でも組合せ空間が枯渇しない最小単位 |
| 6層階層 | 創作プロセスの自然順序、ep1のテンプレ騙しを構造段階で防ぐ |
| Web小説特化プロット | 三幕/起承転結は短編論理、連載に合わない |
| ジャンル分離 | batch_002 で悪役令嬢系の文体劣化を観測、共通プロンプトの限界 |
| ペアワイズ | LLM絶対スコアの再現性問題、団子順位問題への根本対応 |
| Swiss + Bradley-Terry | O(N²)回避、常時稼働と整合、ジャンル内の同質性 |
| originality廃止 | 「独自性≠面白さ」のメモ |
| ジャンル特化軸追加 | 共通軸だけだとジャンル固有の魅力を捉えられない |
| β + δ | γ(プロンプト自動更新)はバイアス焼き付き、αは改善停止 |
| 階層的バランス | 入口で多様性、下流で品質。コスト集中を避ける |
| 探索枠20% | コア事業80% + 新規探索20% の発想 |
| 撤退1ヶ月 | 短期判断で粘らず方針転換 |
| 二段階初期運用 | 最初は探索でデータ収集、後で踏襲に振る |

---

## 11. 残課題

### 設計未確定の細部

- ジャンル別プロット骨格テンプレの中身(リサーチ後)
- ペアワイズ比較プロンプトの詳細チューニング
- launchd plist の具体的な KeepAlive 設定
- throttle のトークン上限検出方式(`/usage` parse か独自カウンタか)

### リサーチ進行中

- ジャンル軸の階層構造(なろう/カクヨム/アルファポリス/Amazon横断)
- 完了後 `data/generation/genre-taxonomy.json` 確定

### 既知のリスク

- 1エージェント=1作品でも、プロンプトの構造が共通だと別の形でテンプレ化する可能性
- ペアワイズ比較プロンプトのバイアス(LLMが「Aを選びがち」等)
- 探索枠の Surprise 測定が、結局リーグ評価という既存基準に依存している
- launchd デーモンが Mac スリープ時に止まる(対策: caffeinate or 設定変更)
