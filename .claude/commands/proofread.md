あなたはAINAROの校正エージェントです。
指定されたエピソードに対して、NG表現・文体一貫性・設定整合性・AI検出・人気予測の5観点で校正を実行してください。

## 引数

$ARGUMENTS を解析してください:
- 形式: `{作品slug} {話数}` または `{作品slug} {開始}-{終了}`
- 例: `test-villainess 2` → ep002を校正
- 例: `test-villainess 2-5` → ep002〜005を一括校正

## 手順

### Step 1: ファイル読み込み

1. `content/works/{slug}/ep{num}.md` を読み込む
2. 設定ファイルを読み込む:
   - `content/works/{slug}/_settings.md`
   - `content/works/{slug}/_style.md`
   - `content/style/base_guidelines.md`
   - `content/style/blacklist.md`

### Step 2: 5観点の校正

以下の観点でテキストを分析し、問題点と改善提案を出す:

#### A. NG表現チェック
- blacklist.md に記載された表現がテキストに含まれていないか
- base_guidelines.md の禁止事項に該当しないか
- 検出した場合: 該当箇所を引用し、代替表現を提案

#### B. 文体一貫性チェック
- _style.md のパラメータと実テキストの統計を比較:
  - 平均文長（sentence_length_avg）
  - 会話比率（dialogue_ratio）
  - 内面独白比率（inner_monologue_ratio）
  - テンポ（tempo: slow/medium/fast）
  - 改行頻度（line_break_frequency）
- 乖離が大きいパラメータを指摘

#### C. 設定整合性チェック
- キャラの口調が _settings.md の設定と一致しているか
- 世界観の固有名詞に表記揺れがないか
- _plot.md の指示（シーン構成・伏線・引き）が反映されているか

#### D. AI臭さチェック
- 以下の観点でAI生成の痕跡をチェック:
  - 文長が均一すぎないか（変動係数が低い）
  - 接続詞が均等に使われすぎていないか
  - 文末パターンが単調でないか
  - 段落の長さが均一すぎないか
- スコア目安: 50以下が目標（「人間的」と判定される水準）

#### E. 人気ポテンシャル評価
- 冒頭の引き込み力（最初の3行にフック要素があるか）
- テンポ（短文と長文の緩急があるか）
- 引きの強さ（末尾が疑問・危機・未解決で終わるか）
- 感情起伏（感情の緩急があるか）
- 疑問率（人気作品は疑問文が多い傾向 ← 検証済み仮説）

### Step 3: 結果レポート

以下のフォーマットで結果を表示する:

```
=== 校正結果: {slug} ep{num} ===

[総合] {スコア}点 ({グレード})

[NG表現] {件数}件
  - 「{表現}」→ {代替案}（{行番号付近}）

[文体] 目標との一致度
  文長: 目標{x}字 → 実測{y}字
  会話率: 目標{x}% → 実測{y}%
  独白率: 目標{x}% → 実測{y}%
  テンポ: {判定}

[設定] {問題点があれば列挙}

[AI検出] {スコア}/100
  {特に高い指標があれば指摘}

[人気予測] {グレード} ({スコア}点)
  強み: {箇条書き}
  改善: {箇条書き}

--- 修正提案 ---
1. {最優先の修正}
2. {次に重要な修正}
3. ...
```

### Step 4: 結果保存

`data/feedback/proofread/{slug}_ep{num}.json` に結果をJSON保存:
```json
{
  "slug": "...",
  "episode": 1,
  "proofreadAt": "ISO日時",
  "overallScore": 82,
  "grade": "A",
  "ngExpressions": 1,
  "styleScore": 85,
  "settingsScore": 90,
  "aiDetectionScore": 42,
  "popularityScore": 68,
  "issues": ["会話率が低い", "..."],
  "suggestions": ["会話シーンを追加", "..."]
}
```
ディレクトリがなければ作成する。
