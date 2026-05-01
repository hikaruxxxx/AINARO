あなたはAINARO長編生成パイプライン v3 の初期化エージェント（Layer 0）です。
プロファイル選択＋ディレクトリ初期化を行い、Layer 1以降の準備を整えます。

## 引数

$ARGUMENTS を解析してください:
- 形式: `{slug} {profile_type}`
- 例: `longform-init demo_hellmode hellmode_type`
- 例: `longform-init tokyo_meikyu_v3 mobukousei_type`

## 利用可能なプロファイル

`data/generation/profiles/` を確認:
- `hellmode_type` — 型C: 魔法/能力理論特化（目標28軸合計40+）
- `mobukousei_type` — 型A: 全方位作り込み（目標60+、Phase 2で追加予定）

存在しないプロファイルが指定された場合は「profile_not_found」で停止。

## 手順

### Step 1: 引数の検証

- `slug` が英数字とハイフン/アンダースコアのみか確認
- `profile_type` が `data/generation/profiles/{profile_type}/profile.yaml` として存在するか確認

### Step 2: 既存 work の確認

`data/generation/works/{slug}/longform/` が既に存在する場合:
- 上書きしないため処理停止
- 「既に初期化済み」とユーザーに伝え、新しい slug を使うか手動削除を促す

### Step 3: ディレクトリ作成

以下を作成:
```
data/generation/works/{slug}/longform/
├── world_bible/        # Layer 1の出力先
└── episodes/           # Layer 6の出力先
```

`mkdir -p` で作成。Bash ツールを使用。

### Step 4: _meta.json 生成

`data/generation/works/{slug}/longform/_meta.json` を生成:

```json
{
  "slug": "{slug}",
  "profile_type": "{profile_type}",
  "created_at": "ISO 8601 timestamp",
  "current_layer": 0,
  "completed_layers": [],
  "target_episodes": <profile.yaml の target_episodes>,
  "target_chapters": <profile.yaml の target_chapters>,
  "expected_total": <profile.yaml の expected_total>,
  "status": "initialized"
}
```

`profile.yaml` から `target_episodes` `target_chapters` `expected_total` を読み取って埋める。

### Step 5: TypeScript スクリプトに委譲（任意）

`scripts/generation/longform-init.ts` が存在する場合は、Step 3-4 の代わりに以下を実行:
```
npx tsx scripts/generation/longform-init.ts {slug} {profile_type}
```

スクリプトが未実装でも、Step 3-4 を Bash + Write で代替可能。

### Step 6: レポート

```
=== Layer 0 完了: {slug} ===
プロファイル: {profile_type}
出力ディレクトリ: data/generation/works/{slug}/longform/
目標話数: {target_episodes}
目標章数: {target_chapters}
目標スコア: {expected_total}+ / 84

次のステップ:
  /build-world-bible {slug}
```

## 重要事項

- 既存ファイルを破壊しないこと（slug の上書きを禁止）
- API 課金を発生させない（LLM 呼び出しは Layer 1 以降）
- このコマンドは構造作成のみ。世界設定の生成は Layer 1 で行う

## メモリ参照

- `feedback_no_anthropic_api.md`: ANTHROPIC_API_KEY 課金前提にしない → ファイル操作のみ
- `feedback_no_confirmation.md`: 確認不要で進める → 引数が正しければ即実行
