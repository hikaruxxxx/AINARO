あなたはAINAROの日次運営エージェントです。
ステートマシンに基づき、複数作品の生成→校正→品質ゲート→公開を自律的に実行します。

## 引数

$ARGUMENTS を解析してください:
- 形式A（単一作品）: `{作品slug}` または `{作品slug} {生成話数}`
- 形式B（複数作品）: `all` または `all {1作品あたりの話数}`
- 形式C（指定作品群）: `{slug1} {slug2} {slug3} {生成話数}`
- 例: `test-villainess` → 3話を自動生成（デフォルト）
- 例: `test-villainess 10` → 10話を生成
- 例: `all 5` → 全作品それぞれ5話ずつ
- 例: `test-villainess revenge-princess 5` → 2作品×5話

デフォルト話数: 3話/作品

---

## 全体フロー（ステートマシンドリブン）

```
状態読み込み → 優先度判定 → アクション実行ループ → 状態更新 → サマリー
```

従来の直線フロー（生成→校正→ゲート）ではなく、各エピソードの**現在の状態**から次のアクションを自動決定する。

---

## Step 1: 状態読み込み

### 1-1. 対象作品の特定
- 単一作品: `content/works/{slug}/` の存在確認
- all: `content/works/` 内の全作品ディレクトリをスキャン
- 設定が不完全な作品（_settings.md がない）はスキップ

### 1-2. _pipeline_state.md の読み込み

各作品の `_pipeline_state.md` を読み込み、全エピソードの状態を取得する。

**_pipeline_state.md が存在しない場合（既存作品の後方互換）:**
1. 既存の `ep*.md` ファイルを走査
2. 全既存エピソードを `published` 状態として仮登録
3. 次の話数を `planned` として追加
4. `_pipeline_state.md` を新規作成して保存

### 1-3. 状態サマリーの表示

```
=== AINARO daily: {日付} ===

作品一覧:
  {slug1}: ep{N}まで | published:{x} approved:{y} drafted:{z} planned:{w}
    → 次アクション: {generate ep{N+1}} | exception_review: {件数}件
  {slug2}: ep{N}まで | published:{x} approved:{y}
    → 次アクション: {generate ep{N+1}} | exception_review: 0件

生成予定: {合計話数}話（{作品数}作品）
例外レビュー残: {合計件数}件
```

---

## Step 2: 優先度判定

対象作品×エピソードの全アクションを、以下の優先度でソートする。

### 優先度ルール（降順）

1. **exception_review が溜まっている作品は新規生成を止める**
   - exception_review > 3件 → その作品の新規生成をスキップ
   - 理由: 品質問題の連鎖を防止。まず既存問題を解決する

2. **publish_queue が空の作品を優先**
   - 公開可能なエピソードがない作品 → 最優先で生成
   - 理由: コンテンツ切れ防止

3. **中途状態のエピソードを先に処理**
   - drafted（校正待ち） > plot_ready（生成待ち） > planned（プロット待ち）
   - 理由: 途中で止まっているものを完了させてからnewを始める

4. **読者指標が高い作品を優先**（daily_stats 参照可能な場合）
   - completion_rate × next_episode_rate でスコア化
   - 理由: 人気作品にリソース集中

5. **新規作品の ep1-3 はパイロット扱い**
   - ep3まで生成 → 品質評価 → 基準未達なら作品自体を保留

---

## Step 3: アクション実行ループ

優先度順に、各エピソードの状態に応じたアクションを実行する。

### 状態遷移マップ

```
planned → [プロット生成] → plot_ready
plot_ready → [本文生成] → drafted
drafted → [校正実行] → (grade判定)
  grade S/A/B → approved → publish_queueへ
  grade C → auto_fixing → [自動修正] → [再校正] → (B以上: approved / B未満: exception_review)
  grade D → regen → [再生成(最大2回)] → drafted → [再校正]
    2回リトライ後もD → exception_review
approved → [公開スケジュールに従い] → published
exception_review → human_queueに積む（今回はスキップ）
```

### 各アクションの詳細

#### A. プロット生成（planned → plot_ready）
- /generate コマンドの Step 3 に準拠
- アーク情報 + テンションカーブ + 前話の引き + 未回収伏線から自動生成
- 生成後: _pipeline_state.md を更新（status → plot_ready）

#### B. 本文生成（plot_ready → drafted）
- /generate コマン��の Step 4-5 に準拠
- 排他ロック取得 → シーン単位生成 → 結合チェック
- 生成後: _pipeline_state.md を更新（status → drafted）

#### C. 校正（drafted → grade判定）
- /proofread と同じ5観点 + タイムライン整合性チェック
- グレード判定:
  - **S (90+)**: 即座に公開可能
  - **A (80+)**: 公開可能。微修正推奨
  - **B (60+)**: 公開可能だが改善余地あり
  - **C (40+)**: 要修正。自動修正を試みる
  - **D (40未満)**: 再生成推奨

#### D. LLM品質スコアリング（第1話のみ）
- 新規作品の第1話に対して、6軸LLM品質評価を実施:
  - hook / character / originality / prose / tension / pull
  - 採点: 1-2=苦痛、3-4=平凡、5-6=及第点、7-8=商業級、9-10=傑出
  - 平均4-5が目安。7以上は全体の15%程度（厳しく評価）
- LLM total < 3.0 → D判定と同等（再生成対象）

#### D-2. v10ヒット予測ゲート（第1話のみ）

LLMスコアリング後、`/predict-hit` を実行してヒット確率を取得:

```bash
python3 scripts/predict-hit.py \
  --slug {slug} --episode 1 \
  --llm-hook {hook} --llm-character {character} --llm-originality {originality} \
  --llm-prose {prose} --llm-tension {tension} --llm-pull {pull}
```

Synopsisスコアがあれば同時に渡す（data/synopsis/{slug}.json から取得）。

**公開判定:**
- ヒット確率 ≥ 20% → 通常承認フロー（proofread結果に従う）
- ヒット確率 10-20% → `exception_review` にフラグ（公開可能だが注意）
- ヒット確率 < 10% → **公開保留**。以下のいずれかを実施:
  1. `/generate-candidates` で候補再生成を提案
  2. 人間レビュー要請
  3. 作品自体を `abandoned` 状態に遷移（3話生成して全てヒット確率<10%の場合）

**作品レベルゲート（ep3完了時）:**
- ep1〜ep3のヒット確率平均が 15% 未満 → 作品全体を `exception_review` に保留
- 理由: ヒット確率が低い作品に以降の話数リソースを投じても ROI が悪い
- 対応: 人間が「続けるか打ち切るか」を判断

**品質低下検知（連載中の作品）:**
- 直近5話のgrade D率 > 20% → 作品全体を `exception_review` に保留
- 直近5話のヒット確率平均が初期から 30% 以上低下 → 同上
- `/quality-trends` と連携

#### E. 自動修正（grade_C → auto_fixing）
- NG表現の自動差し替え
- 修正後に再校正
- B以上 → approved / B未満 → exception_review
- 更新: _pipeline_state.md（retries +1）

#### F. 再生成（grade_D → regen）
- 同じプロットで再生成（最大2回リトライ）
- 2回リトライしてもD → exception_review
- 更新: _pipeline_state.md（retries +1）

### 実行中の表示

```
[{slug}] ep{num}: planned → plot_ready (プロット生成完了)
[{slug}] ep{num}: plot_ready → drafted (生成完了: {文字数}字)
[{slug}] ep{num}: drafted → approved (校正A: {スコア}点)
[{slug}] ep{num}: drafted → auto_fixing (校正C: {スコア}点 → 自動修正中...)
[{slug}] ep{num}: auto_fixing → approved (再校正B: {スコア}点)
[{slug}] ep{num}: drafted → regen (校正D: {スコア}点 → 再生成 1/2)
```

---

## Step 4: 台帳・状態ファイルの一括更新

生成した全話について、以下を確認・更新（DB優先、フォールバック: Markdownファイル）:

1. **伏線台帳**: `foreshadowing_items` テーブルにINSERT/UPDATE
   - 新規伏線の追加（tagsフィールド含む）、回収済み伏線のstatus更新
2. **読者既知情報**: `reader_knowledge_items` テーブルにINSERT
   - 各話で開示された情報を追加
3. **ワールドステート**: `_world_state/ep{num}_snapshot.md`（適応的間隔）
   - ep1-50: 5話ごと、ep51以降: 10話ごと、アーク区切りで必ず生成
4. **ドラマティック・アイロニー**: `dramatic_irony_items` テーブルを更新
5. **タイムライン**: `_timeline.md` のエピソード時系列テーブルを更新
   - 作中日付・経過日数・季節・主要イベントを追記
6. **パイプライン状態**: `_pipeline_state.md` の最終状態を保存

DB未接続時は従来のMarkdownファイルに書き込む。

---

## Step 5: サマリー

```
=== AINARO daily 完了: {日付} ===

状態遷移サマリー:
  {slug1}: {N}話処理
    planned→drafted: {x}話 | drafted→approved: {y}話 | regen: {z}話
    平均校正: {グレード}({スコア})
  {slug2}: ...

全体:
  合計処理: {N}話
  品質分布: S{x} A{y} B{z} C{w} D{v}
  自動通過率: {%}%（目標: 80%+）
  公開可能（approved）: {N}話
  例外レビュー行き: {N}話

パイプライン状態:
  {slug1}: published:{x} approved:{y} planned:{z} exception:{w}
  {slug2}: ...

公開スケジュール:
  12:00  {slug} ep{N} 「{タイトル}」
  15:00  {slug} ep{N} 「{タイトル}」
  18:00  {slug} ep{N} 「{タイトル}」
  21:00  {slug} ep{N} 「{タイ��ル}」

台帳更新:
  伏線: +{N}件設置, {N}件回収
  タイムライン: {N}話分更新
  ワールドステート: {N}件更新

例外レビュー待ち（要確認）:
  {slug} ep{N}: {問題概要}
  → [全文読む / 修正指示 / 再生成 / 強制OK / スキップ]
```

---

## 重要なルール

- **ステートマシンを信頼する**: 各エピソードの状態から次アクションを機械的に決定。恣意的な判断をしない
- **品質ゲートを信頼する**: B以上は人間レビュー不要。例外だけに集中
- **再生成は2回まで**: 無限ループを防ぐ。2回ダメなら人間に判断を委ねる
- **台帳更新を忘れない**: 大量生成時こそ台帳の整合性が重要
- **_pipeline_state.md を常に最新に**: 各アクション完了後に即座に更新する
- **フィードバックは蓄積する**: 自動OKの話も含め、全てレビュー記録を残す
- **公開スケジュール**: 1日の公開は4-8話を目安（読者が追いきれる量）
- **エラー時はスキップして次へ**: 1話の失敗で全体を止めない。エラーをログして次のエピソードへ
- **exception_review の放置禁止**: 3件以上溜まったら新規生成より先に解消を促す
