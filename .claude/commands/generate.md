あなたはAINAROの小説生成エージェントです。
指定された作品の次のエピソードを、シーン単位で生成します。

## 引数

$ARGUMENTS を解析してください:
- 形式: `{作品slug}` または `{作品slug} {話数}`
- 例: `test-villainess` → 次の話を自動判定
- 例: `test-villainess 3` → 第3話を生成

## 手順

### Step 1: 状態確認と排他ロック

1. `content/works/{slug}/` ディレクトリの存在を確認
2. 話数が未指定なら、既存の `ep*.md` から最新話数を取得し +1
3. 対象の話数が既に存在する場合は上書き確認
4. **排他ロック取得**（DB接続時）:
   - `SELECT acquire_generation_lock(novel_id, '{session_id}', {episode_number})`
   - 失敗時: 「他のプロセスが生成中です」と表示して終了
   - ロックは30分で自動解放（generation_locks.expires_at）
   - DB未接続時: `content/works/{slug}/.generation.lock` ファイルで代替

### Step 2: 設定ファイル読み込み（階層的コンテキスト構築）

#### コンテキストバジェット

数百話規模でもコンテキスト窓を圧迫しないよう、各レイヤーに上限を設ける。
合計目標: **25KB以内**（約18,000トークン相当）。残りを本文生成に確保する。

| レイヤー | 用途 | 上限目安 |
|----------|------|----------|
| L1 | 共通ルール | 3KB |
| L2 | 作品設定 | 5KB |
| L3 | 物語状態 | 8KB ← 肥大化の主戦場 |
| L4 | 話固有 | 5KB |
| L5 | フィードバック | 2KB |
| 予備 | | 2KB |

**縮退ルール**: レイヤーが上限を超える場合、以下の順で情報を削減する:
1. 回収済み伏線を除外（L3）
2. 読者既知情報を直近スナップショットのみに絞る（L3）
3. 過去レビューを直近3件に絞る（L5）
4. キャラ状態を該当シーン登場キャラのみに絞る（L3）

**レイヤー1: 共通ルール**
1. `content/style/base_guidelines.md` — 共通文体ガイドライン
2. `content/style/blacklist.md` — NG表現リスト
3. `content/style/scene_template.md` — シーンテンプレート

**レイヤー2: 作品設定**
4. `content/works/{slug}/_settings.md` — キャラ・世界観
5. `content/works/{slug}/_style.md` — 文体プロファイル

**レイヤー3: 物語状態（フィルタ付き読み込み）**

50話以上の作品では、状態ファイルをそのまま全読みしてはならない。以下のフィルタルールに従う。

6. **ワールドステート**: 最寄りスナップショット **1つだけ** を読む
   - `content/works/{slug}/_world_state/` から対象話数に最も近いスナップショットを選択
   - なければスキップ（初期話数）
   - 複数のスナップショットを読まない

7. **キャラクター状態**: 該当シーンの登場キャラのみ
   - `content/works/{slug}/_characters/` から登場キャラのファイルを読む
   - 対象話数に該当するPhaseセクションのみ参照
   - プロットに登場しないキャラは読まない

8. **伏線台帳**: フィルタ付きで読む
   - ソース: DBテーブル `foreshadowing_items`（DB未移行の場合は `_foreshadowing_ledger.md`）
   - **読む対象**: 以下の条件に合致する伏線のみ
     - `status = '未回収' OR status = '部分回収'`（回収済み・放棄済みは除外）
     - `planned_payoff_from <= 対象話数 + 15`（回収予定が15話以内）
     - `importance = 'S'`（S重要度は回収予定に関わらず常に読む）
   - Markdownファイルから読む場合も同じフィルタを手動で適用する

9. **読者既知情報**: 直近スナップショットのみ
   - ソース: DBテーブル `reader_knowledge_items`（DB未移行の場合は `_reader_knowledge.md`）
   - **読む対象**: 直近10話分の情報のみ（ep{num-10}〜ep{num-1}）
   - 10話より前の情報はワールドステートスナップショットに含まれている前提

10. **ドラマティック・アイロニー**: アクティブなもののみ
    - ソース: DBテーブル `dramatic_irony_items`（DB未移行の場合は `_dramatic_irony.md`）
    - **読む対象**: `is_active = true` のもののみ
    - 解決済みアイロニーは読まない

11. **テンションカーブ**: 対象話の前後のみ
    - `content/works/{slug}/_tension_curve.md`
    - 対象話のテンション・テンポ・役割 + 前後2話分のみ参照
    - カーブ全体は読まない

**レイヤー4: 話固有の指示**
12. プロット（優先順位）:
    - `content/works/{slug}/_plot/episodes/ep{num}.md` があればそれを使う
    - なければ `content/works/{slug}/_plot/arc{N}_{name}.md` のキーイベントから自動判断
    - どちらもなければ `_plot/overview.md` + テンションカーブ + 前話の流れから自動生成
    - **注意**: 50話以上でプロットがない場合、まず `/plot-arc` でアーク単位のプロットを事前生成すること
13. 前話: `content/works/{slug}/ep{num-1}.md` の末尾500字

**レイヤー5: フィードバック**
14. `data/feedback/reviews/` に過去のレビュー結果があれば読む
15. 直近のNG理由・修正傾向を抽出（**直近5件まで**。古いレビューは読まない）

### Step 3: プロット自動生成（詳細プロットがない場合）

対象話の詳細プロットファイルが存在しない場合、以下の情報から自動生成する:

1. **アーク情報**: 該当アークのキーイベント・テーマ
2. **テンションカーブ**: この話の目標テンション・テンポ・役割
3. **前話の末尾**: 前話の引きをどう回収するか
4. **未回収伏線**: 回収予定が近い伏線を自然に織り込む
5. **キャラ状態**: 該当フェーズでの行動原理・口調

自動生成するプロット内容:
- タイトル案
- シーン構成（2-3シーン、scene_template.md フォーマット）
- 伏線の設置/回収指示
- 引きの設計

生成したプロットを以下に保存する:
- DB接続時: `episode_plots` テーブルにINSERT（`is_auto_generated = true`）
- 常に: `_plot/episodes/ep{num}.md` にもファイルとして保存（可読性確保）

### Step 4: シーン単位生成

プロットのシーン数に応じて、1シーンずつ順次生成する。

**各シーンの生成ルール:**

文体ルール（_style.md + base_guidelines.md）:
- _style.md のパラメータに忠実に従う
- 読点は1文に2つまで
- 感情は「説明」ではなく「描写」で伝える
- 五感描写を各シーンに最低1つ（プロットの指定に従う）
- 同じ表現の近接反復を避ける（3文以内に同語彙禁止）
- blacklist.md の表現を使わない

キャラクター:
- _characters/{name}.md の該当Phaseの口調・行動原理に従う
- 外面の口調と内面の口調を使い分ける
- アイロニー台帳の情報を意識した描写

構成:
- 冒頭シーン: 最初の3行で読者を引き込む
- 最終シーン: 末尾は「引き」で終わる
- シーン間: トランジション指示に従って自然に繋げる

**シーン間チェック:**
各シーン生成後に以下を確認:
- 文字数が目安の±20%以内か
- キャラの口調が設定と一致しているか
- 前シーンの末尾との連続性

### Step 5: 結合と全体チェック

全シーンを結合し、以下を確認:
- 合計文字数: 3,500〜4,500字の範囲
- テンポの流れ: テンションカーブの指定と合っているか
- 引きの強度: 末尾が次話への期待を作っているか
- 伏線: 台帳の指示通り設置/回収されているか

### Step 6: 保存と更新

1. **本文保存**: `content/works/{slug}/ep{num}.md`
   - フォーマット: `# 第{num}話「{タイトル}」\n\n---\n\n{本文}`

2. **伏線台帳更新**（DB優先、フォールバック: `_foreshadowing_ledger.md`）
   - DB接続時: `foreshadowing_items` テーブルにINSERT/UPDATE
     - 新規伏線: `INSERT INTO foreshadowing_items (id, novel_id, content, planted_episode, planned_payoff_from, planned_payoff_to, importance)`
     - 回収時: `UPDATE foreshadowing_items SET status='回収済', actual_payoff_episode={num}`
   - DB未接続時: `_foreshadowing_ledger.md` に行を追加（従来通り）

3. **読者既知情報更新**（DB優先、フォールバック: `_reader_knowledge.md`）
   - DB接続時: `reader_knowledge_items` テーブルにINSERT
     - `INSERT INTO reader_knowledge_items (novel_id, episode_number, category, info, reader_knows, protagonist_knows)`
   - DB未接続時: `_reader_knowledge.md` に追記（従来通り）

3b. **ドラマティック・アイロニー更新**（DB優先、フォールバック: `_dramatic_irony.md`）
   - 新規アイロニー発生時: `INSERT INTO dramatic_irony_items`
   - 解決時: `UPDATE dramatic_irony_items SET is_active=false, resolution_episode={num}`

4. **ワールドステート更新**（適応的間隔）:
   - ep1〜ep50: 5話ごとにスナップショット生成
   - ep51〜: 10話ごとにスナップショット生成
   - アーク区切り時は話数に関わらず必ず生成
   - `_world_state/ep{num}_snapshot.md` を生成
   - スナップショットには「前回スナップショットからの差分」セクションを含める

5. **排他ロック解放**:
   - DB: `SELECT release_generation_lock(novel_id, '{session_id}')`
   - ファイル: `.generation.lock` を削除

6. **サマリー表示**:
   ```
   [完了] ep{num} 「{タイトル}」
   文字数: {N}字 | 会話率: {x}% | 独白率: {y}%
   テンション: {★} | テンポ: {tempo}
   伏線設置: {N}件 | 伏線回収: {N}件
   プロット: {自動生成 or 既存プロット使用}
   ```

---

## 重要なルール

- **コンテキストバジェット厳守**: 合計25KB以内。50話以上の作品では伏線台帳・既知情報を必ずフィルタし、全読みしない
- **プロットがなければ作る**: 月5,000話規模では全話のプロット手書きは不可能。自動生成を前提とする
- **シーン単位で品質担保**: 1話一括生成より、シーン単位の方が品質が安定する
- **状態ファイルの更新を忘れない**: 生成だけでなく、台帳・既知情報・ワールドステートの更新もセット
- **フィードバック反映**: 過去のレビューで指摘された問題を意識的に回避する
- **排他制御**: batch/dailyから呼ばれる場合、generation_locks によるロック管理はbatch/daily側が担当。単体実行時はロック不要
