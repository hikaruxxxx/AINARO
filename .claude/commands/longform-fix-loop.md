あなたはAINARO長編生成パイプライン v3 の自動修正ループエージェントです。
L7 監査で FAIL になった話を L6 で再生成 → L7 再監査 → ... を最大 3 回繰り返し、
最終的に人間レビューに渡す形まで持っていきます。

## 引数

$ARGUMENTS を解析してください:
- 形式: `{slug} {ep_number} [max_retries]`
- 例: `longform-fix-loop a07-novel 1 3`
- max_retries 省略時はデフォルト 3

## 前提

- Phase A の台帳 (`world_bible/quantitative_facts.yaml`) が存在
- L6 (`/generate-longform-episode`) と L7 (`/audit-coherence`) が機能している
- API 課金禁止 (`feedback_no_anthropic_api.md`)

## 手順

### Step 1: 初回監査

まず現在の本文 (`ep{N}.md`) に対して L7 監査を実行:

```bash
npx tsx scripts/generation/coherence-checker.ts {slug} {ep_number}
python3 scripts/generation/quantitative-audit.py {slug} {ep_number}
```

両方の exit code を見る:
- 両方 0 (PASS) → 完了。次のステップへ進む推奨を出す
- どちらか 1 (FAIL) → 修正ループに入る

### Step 2: 修正ループ

`retry_count = 0` から開始、`retry_count < max_retries` の間:

#### Step 2-1: FAIL 理由の抽出

両監査の JSON レポートから FAIL/WARN 項目を抽出:

- `ep{N:04d}_audit.json`: スキル名表記揺れ、ステータス単調性、書式、口癖密度、関係性
- `ep{N:04d}_quant_audit.json`: forbidden_claims, quantitative_growth, exp_counter_continuity, text_numerical_claims

これらを「修正指示書」として整形:

```markdown
# ep{N} 修正指示

## FAIL項目
- [forbidden_claims] 本文中「いつも倒している」が台帳の forbidden_claims に該当。
  該当箇所: 「いつもなら胴体を殴って...」
  根拠台帳: encounters.f1_session_goblin_count

- [quantitative_growth] 「Lv1上昇に数日」と書かれているが台帳は 12-36ヶ月。

## WARN項目 (修正推奨)
- [linguistic_red_flags] 「四年間ずっと」が3箇所。希少性侵食の疑いあり。
```

#### Step 2-2: L6 retry

`/generate-longform-episode {slug} {ep_number}` を再起動するが、
修正指示を追加コンテキストとして渡す。サブエージェントで実行:

```
Agent(
  description: "ep{N} 修正再生成 (retry {retry_count+1})",
  prompt: "ep{N} を以下の修正指示に従って再生成してほしい。"
          "L6 の全ファイル投入 + 以下の指示書 + 過去 retry の失敗内容を踏まえる。"
          "\n\n{修正指示書}\n\n"
          "重要: forbidden_claims に該当する記述は絶対に書かないこと。"
          "linguistic_red_flags は文脈で希少性を保つこと。"
          "数値主張は台帳と整合させること。",
  subagent_type: "general-purpose"
)
```

#### Step 2-3: 再監査

retry 後の本文を Step 1 と同じ手順で監査。

#### Step 2-4: 判定

- 両方 PASS → ループ終了、完了レポート
- まだ FAIL → `retry_count += 1`、ループ継続
- `retry_count == max_retries` でまだ FAIL → 人間 escalate

### Step 3: 完了 or escalate

#### 完了の場合

```
=== ep{N} 自動修正ループ完了 ===
retry 回数: {N}回
最終判定: PASS / PASS_WITH_WARN
保存先: ep{N:04d}.md
レポート: ep{N:04d}_audit.md, ep{N:04d}_quant_audit.md

次のステップ:
  /generate-longform-episode {slug} {N+1}
  または別話の監査
```

#### escalate の場合

```
=== ep{N} 自動修正失敗 (人間レビュー要請) ===
retry 上限 {max_retries} 回でも FAIL が残った。
残った FAIL 項目:
  - {項目1}
  - {項目2}

考えられる原因:
  - 台帳の設定が物語上の必要性と矛盾している
  - L6 プロンプトが台帳を十分参照できていない
  - 修正指示の表現が曖昧

推奨アクション:
  1. {残った FAIL 項目} の本文を人間レビューで修正
  2. または quantitative_facts.yaml を見直し
  3. または L6 プロンプトに台帳を投入する仕組みを強化
```

## オーケストレーションのポイント

- L6 retry はサブエージェントで実行 (API 課金禁止のため会話本体 or 内部エージェント)
- 修正指示は **具体的な該当箇所** と **根拠台帳** を必ず含める (曖昧指示は機能しない)
- retry のたびに「過去の retry で何が失敗したか」を累積して渡す (同じミスを繰り返させない)
- WARN は修正必須ではないが、人間レビュー前の確認推奨

## 重要事項

- API 課金禁止
- ファイルへの破壊的変更は最終 retry 成功時のみ commit (途中の retry は temp ファイル経由)
  - 簡易実装: `ep{N}.md` を直接上書きする方式でも可。バックアップを `ep{N}.md.backup-r{retry}` として保存
- 監査 JSON / MD は毎 retry で上書きされる (履歴は git で追跡)

## メモリ参照

- `feedback_no_anthropic_api.md`
- `feedback_codex_mcp_unreliable.md` (Codex でなく Claude サブエージェントを使う根拠)
