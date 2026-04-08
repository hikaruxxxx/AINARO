あなたはAINAROの複数候補生成エージェントです。
同じエピソードに対して複数の案を並列生成し、評価・選別して最良案を採用します。

## 引数

$ARGUMENTS を解析してください:
- 形式: `{作品slug} {話数} [--count N]`
- 例: `generate-candidates test-villainess 1` → ep001を3案生成して選別
- 例: `generate-candidates test-villainess 3 --count 5` → ep003を5案生成
- デフォルト count: 3

## 設計思想

LLM生成は高分散。同じプロンプトでも当たり外れがある。
「打席数を増やして上位を選ぶ」のが最も効率的な品質向上戦略。

フロー:
1. N案を並列生成（サブエージェントで同時実行）
2. 各案を自動評価（proofread + predict-hit）
3. 複合スコアで最良案を選ぶ
4. 最良案を採用、他案は学習データとして保存

## 手順

### Step 1: 前提確認

1. `content/works/{slug}/` が存在すること
2. 該当話のプロット（`_plot/episodes/ep{num:03d}.md` または自動生成可能な情報）があること
3. 既に本採用版（`ep{num:03d}.md`）が存在する場合、ユーザーに上書き確認

### Step 2: 候補生成（並列）

N個のサブエージェントを並列起動する。各エージェントへの指示:

```
あなたはAINAROの小説生成エージェントです（候補#{i}）。

/generate {slug} {episode} の手順に従ってエピソードを生成してください。

重要: バリエーションを出すため、以下の要素で他の候補と差別化してください:
- 候補#1: 冒頭の掴みを「行動シーン」で始める
- 候補#2: 冒頭の掴みを「印象的な独白」で始める
- 候補#3: 冒頭の掴みを「会話」で始める
- 候補#4: 冒頭の掴みを「風景描写」で始める
- 候補#5: 冒頭の掴みを「時間軸の飛躍」で始める

その他の要素（プロット、キャラ、伏線等）は_plotやジャンル指示に従う。

出力先: data/candidates/{slug}_ep{num:03d}_c{i}.md
（最終的な ep{num}.md には保存しない。候補ファイルのみ）

フロントマター不要。本文のみを出力。
```

**並列実行**: Agentツールを1つのメッセージで複数回呼び出す（run_in_background=false）。

### Step 3: 候補の評価

各候補ファイルに対して自動評価を実行:

#### 3-A. Proofread評価

各候補について、proofread相当のチェックを実施:
- NG表現（blacklist.md）
- 文体一貫性（_style.mdパラメータとの乖離）
- AI臭さ（文長変動係数など）
- 5軸スコア: NG, style, settings, AI, popularity

出力: 各候補の grade (S/A/B/C/D) と 5軸スコア

#### 3-B. Hit予測

各候補について、predict-hit相当を実行:

```bash
python3 scripts/predict/predict-hit.py \
  --slug {slug} --episode {num} \
  --text-file data/candidates/{slug}_ep{num:03d}_c{i}.md \
  --llm-hook {hook} --llm-character {character} \
  --llm-originality {originality} --llm-prose {prose} \
  --llm-tension {tension} --llm-pull {pull}
```

LLMスコアは、各候補のテキストを読んで採点する（1-10の6軸）。
候補間で公平な基準で採点すること。

出力: 各候補の hitProbability (%)

### Step 4: 複合スコアで選別

以下の複合スコアで最良案を決定:

```
総合スコア = 0.5 * hit_probability + 0.3 * proofread_popularity + 0.2 * proofread_avg
```

重み付けの根拠:
- hit_probability (50%): 最重要。ヒット予測モデルの出力
- proofread_popularity (30%): 冒頭・テンポ・引き等の人気指標
- proofread_avg (20%): 全体品質（NG、文体、AI臭さの平均）

同点の場合の優先順位:
1. hit_probability が高い
2. grade が高い（S > A > B > C > D）
3. AI臭さスコアが低い

### Step 5: 結果レポート

以下の形式で結果を表示:

```
## 候補生成結果: {slug} ep{num}

### 候補一覧
| # | 冒頭タイプ | hit確率 | proofread | grade | 総合スコア |
|---|-----------|--------|-----------|-------|-----------|
| 1 | 行動シーン | 45.2%  | 82        | A     | 72.1 ← 採用 |
| 2 | 印象的独白 | 32.1%  | 75        | B     | 58.0      |
| 3 | 会話       | 38.5%  | 78        | B     | 64.8      |

### 採用: 候補#1
- hit確率: 45.2% (upper tier)
- 強み: 冒頭のフック強度、テンポの良さ
- 改善点: （該当があれば）

### 他候補の扱い
- 不採用の候補は `data/candidates/` に保存（学習データ）
- 将来、複数候補生成の改善に使う
```

### Step 6: 採用案の確定

1. 最良候補ファイル `data/candidates/{slug}_ep{num:03d}_c{best}.md` を
   `content/works/{slug}/ep{num:03d}.md` にコピー
   （フロントマターを追加: `# 第{num}話「{タイトル}」\n\n---\n\n{本文}`）

2. generate.mdのStep 7〜11と同じ後処理を実行:
   - 伏線台帳更新
   - 読者既知情報更新
   - アイロニー更新
   - ワールドステート更新（5話ごと）
   - 生成ログ記録

3. 候補選別結果を保存:
   `data/candidates/{slug}_ep{num:03d}_selection.json`
   ```json
   {
     "slug": "test-villainess",
     "episode": 1,
     "candidateCount": 3,
     "selectedCandidate": 1,
     "candidates": [
       {
         "id": 1,
         "opening_type": "action",
         "hitProbability": 45.2,
         "proofreadPopularity": 82,
         "proofreadAvg": 78,
         "grade": "A",
         "totalScore": 72.1
       },
       ...
     ],
     "generatedAt": "2026-04-08T..."
   }
   ```

4. 排他ロック解放（generate.mdと同様）

## 重要事項

- **並列生成必須**: サブエージェントを1メッセージで同時起動。順次実行は時間の無駄
- **公平な評価**: 候補間で同じ基準で採点する。最初の候補だけ厳しく評価しない
- **候補ファイルの保持**: 不採用案は削除しない。学習データとして価値がある
- **hit_probabilityの信頼度**: LLMスコア込みで採点するので reliability=medium 以上
- **count>5の場合**: API負荷を考慮して最大5に制限することを推奨

## 用途

- 新作の ep1〜ep3（最も重要な初期話）
- クライマックス話（tension_curve ★5の話）
- アーク転換点
- 過去にD評価が出た話の再生成

**通常の話は /generate を使う**。候補生成はコスト高なので、重要な話に絞る。

## ディレクトリ構造

```
data/candidates/
├── {slug}_ep001_c1.md        # 候補1の本文
├── {slug}_ep001_c2.md        # 候補2の本文
├── {slug}_ep001_c3.md        # 候補3の本文
└── {slug}_ep001_selection.json # 選別結果
```
