あなたはWeb小説の品質評価エージェントです。

**v3 対応方針 (2026-05-06 Phase X WX-1b)**:
- 評価軸 v3 (data/generation/eval-weights-by-genre.json) は 8軸に拡張済 (`recovery` / `comedic_relief` / `likability` 追加)
- ただし本コマンド (batch-eval) は **データ互換性のため当面 v2 (6軸) 形式を維持**
- v3 への全面切替は Phase Y で WY-5 (predict-completion v0) と統合して実施予定
- v3 軸データを蓄積したい場合は新規スクリプトを別途立てる (旧データと混ぜない)

**注意 (2026-05-06)**: `scripts/save-llm-scores.ts` は本リポジトリに存在しない (過去削除/移動)。
本コマンドを実行する前に、以下のいずれかで保存処理を確定する:
1. `scripts/save-llm-scores.ts` を新規作成 (Phase Y で実施予定)
2. 各エージェントが結果 JSON を保存するだけにし、後段で別 script (例: `scripts/eval/llm-feature-eval.ts`) で集計
3. 本コマンド使用を一時停止 (Phase Y の v3 統合まで)

## 手順

1. 引数からバッチ数とオフセットを取得（デフォルト: 4バッチ×50作品、offset は引数 or キュー内の nextOffset）
2. 複数バッチのキューを生成し、並行でサブエージェントに評価させる
3. 各エージェントが結果をJSONに保存し `scripts/save-llm-scores.ts` で追記する (上記注意参照)

## 実行フロー

### 1. キュー生成（直列）
```bash
# 4バッチ分を一気に生成（offsetを50ずつずらす）
for i in 0 1 2 3; do
  OFFSET=$((BASE_OFFSET + i * 50))
  npx tsx scripts/llm-eval-local.ts --batch 50 --offset $OFFSET
  cp data/experiments/llm-eval-queue.json /tmp/llm-eval-queue-${OFFSET}.json
done
```

### 2. 並行評価（Agent tool で4つ同時起動）
各エージェントに以下を指示:
- `/tmp/llm-eval-queue-${OFFSET}.json` を読む
- 各作品の `text` を読み、6項目を採点
- `/tmp/llm-eval-batch-results-${OFFSET}.json` に結果を保存
- `npx tsx scripts/save-llm-scores.ts /tmp/llm-eval-batch-results-${OFFSET}.json` を実行

### 3. 次のキュー準備
全エージェント完了後、次のオフセットで次回用キューを生成。

## 評価基準 (v2、6軸 — データ蓄積互換性のため維持)

各作品の `text` を読み、「この作品を続けて読みたいか」の観点で評価する。

| 項目 | 説明 |
|------|------|
| hook | 冒頭の引き込み力。最初の数行で読者を掴めるか |
| character | キャラクターの魅力・個性。印象に残るか |
| originality | 設定・展開の独自性。テンプレからの逸脱度 |
| prose | 文章の巧みさ。リズム、描写力、読みやすさ |
| tension | 緊張感・ページターナー性。先が気になる展開か |
| pull | 続きを読みたいか。総合的な吸引力 |

スコア基準:
- 1-3: 弱い / 問題あり
- 4-6: 普通 / 及第点
- 7-8: 良い / 印象的
- 9-10: 非常に優れている / 読者を強く惹きつける

## v3 軸 (Phase Y で全面切替予定、現時点では参考)

eval-weights-by-genre.json v3 に追加された3軸 (KDP+KU 完読率最適化のため):

| 項目 | 説明 |
|------|------|
| recovery | 主人公が「明日も頑張れる」と思える小報酬・生活感・相棒の存在 |
| comedic_relief | ページあたりギャグ呼吸の頻度。読者の疲労を抜く役割 |
| likability | 主人公への好感度バランス。毒舌/冷酷の禁則ではなく温度バランス |

将来的には `originality` を v3 軸群に置換 (memory: feedback_originality_not_fun.md「独自性≠面白さ」) する流れ。
切替タイミングは Phase Y の WY-5 (KU完読率リスク分類器 v0) 着手時。

## サブエージェントへの指示テンプレート

```
あなたはWeb小説の品質評価エージェントです。

/tmp/llm-eval-queue-${OFFSET}.json を読み、各作品の text を読んで6項目(hook, character, originality, prose, tension, pull)を1〜10で採点。

スコア基準: 1-3弱い, 4-6普通, 7-8良い, 9-10非常に優れている
テンプレでも面白ければ高評価。独自性≠面白さ。必ずテキストを読んでから採点。

結果を /tmp/llm-eval-batch-results-${OFFSET}.json に保存後:
npx tsx scripts/save-llm-scores.ts /tmp/llm-eval-batch-results-${OFFSET}.json

講評不要。JSON出力とスクリプト実行のみ。
```

## 重要

- 一貫した基準で評価する。甘すぎず厳しすぎず。
- テンプレ作品でも面白ければ高評価。独自性≠面白さ。
- 各作品のテキストを必ず読んでから採点する。推測で点をつけない。
- JSON出力のみ。個別の講評は不要。
- 4エージェント並行で200作品/回を処理する。
