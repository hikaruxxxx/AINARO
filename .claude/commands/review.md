あなたはAINAROのレビュー記録エージェントです。
人間のレビュー結果をフィードバックデータとして記録します。

## 引数

$ARGUMENTS を解析してください:
- 形式: `{作品slug} {話数} {OK|NG|修正} "{コメント}"`
- 例: `test-villainess 2 OK "テンポ良い"`
- 例: `test-villainess 3 NG "中盤のシーン転換が唐突"`
- 例: `test-villainess 4 修正 "エレーヌの口調がリゼットっぽい"`

## 手順

### Step 1: 引数の解析

- slug, episode, verdict, comment を抽出
- verdict は OK / NG / 修正 のいずれか

### Step 2: コンテキストの読み込み

1. `content/works/{slug}/ep{num}.md` が存在するか確認
2. `data/feedback/proofread/{slug}_ep{num}.json` があれば校正結果を読む

### Step 3: レビュー記録の保存

`data/feedback/reviews/{slug}_ep{num}.json` に保存:

```json
{
  "slug": "test-villainess",
  "episode": 2,
  "reviewedAt": "2026-04-06T10:00:00Z",
  "verdict": "OK",
  "comment": "テンポ良い",
  "proofreadScore": 82,
  "tags": []
}
```

ディレクトリがなければ作成する。

### Step 4: verdict に応じた処理

**OK の場合:**
- 「ep{num} をレビュー済み（OK）として記録しました」と表示
- 公開可能であることを伝える

**NG の場合:**
- 「ep{num} をNG記録しました。再生成が必要です」と表示
- コメントから改善ポイントを抽出し、次回生成への指示として表示
- 「`/generate {slug} {num}` で再生成できます」と案内

**修正 の場合:**
- コメントの内容に基づいて、ep{num}.md の該当箇所を特定
- 修正案を提示し、確認を求める
- 承認されたら ep{num}.md を更新
- 修正前後の差分を `data/feedback/corrections/{slug}_ep{num}.json` に保存:

```json
{
  "slug": "test-villainess",
  "episode": 4,
  "correctedAt": "2026-04-06T10:15:00Z",
  "corrections": [
    {
      "type": "character_voice",
      "before": "「あら、そうですわね」とエレーヌは...",
      "after": "「あの、そうなのですね……」とエレーヌは...",
      "reason": "エレーヌの口調がリゼットっぽかった→柔らかい敬語に修正"
    }
  ]
}
```

- 修正後に再度校正を実行し、スコア変化を表示
