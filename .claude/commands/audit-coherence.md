あなたはAINARO長編生成パイプライン v3 の整合性監査エージェント（Layer 7）です。
生成された本文の**設定一貫性・状態単調性・口癖密度**をチェックします。

## 引数

$ARGUMENTS を解析してください:
- 形式: `{slug} {ep_number}`
- 例: `audit-coherence demo_hellmode 1`
- 例: `audit-coherence demo_hellmode 30`

## 前提

- Layer 6 完了済み（`ep{N}.md` と `ep{N}_state.json` が存在）

## 手順

### Step 1: ルールベース監査の実行

`scripts/generation/coherence-checker.ts` を実行:

```bash
npx tsx scripts/generation/coherence-checker.ts {slug} {ep_number}
```

スクリプトは以下のチェックを行い、結果を `audit_*.json` に保存:

#### 1-1. スキル名の表記揺れ
- `world_bible/ability_system.json` の `skills[].name` と本文中のスキル名を照合
- 例: 「召喚術」と書かれているが正式名は「召喚」 → 違反
- 例: 「ファイアボール」と「火球」が混在 → 違反

#### 1-2. ステータス値の単調性
- `ep{N}_state.json` と `ep{N-1}_state.json` を比較
- HP/MP/攻撃力/耐久力/素早さ/知力/幸運 が**減少していないか**
- 減少している場合は違反（一時的なダメージは許容、最大値の減少のみ違反）

#### 1-3. ステータス書式の遵守
- 本文中の【】〈〉【】の使い方が `status_format.md` と一致するか
- 半角/全角の混在はないか

#### 1-4. 口癖密度
- `protagonist.md` の Section 5 で定義された口癖を本文中で何回使っているか
- 1話あたり 2回未満なら警告

#### 1-5. 関係性の整合
- 本文中で「初対面」と書かれているキャラが、実は既出キャラでないか
- `relationship_graph.json` の `first_appearance_episode` と矛盾していないか

### Step 2: LLMベース監査の実行（任意）

ルールベースで検出できない問題を確認:

- 主人公の人格が **`protagonist.md` の思考パターンと一致**しているか
- 本話の **エピソードパターンの構造** に従っているか
- 章の進行に対して **適切なテンポ** か

サブエージェントで実行（API 課金禁止）。

### Step 3: 監査レポート生成

`data/generation/works/{slug}/longform/episodes/ep{N:04d}_audit.md` に保存:

```markdown
# ep{N} 監査レポート

## 総合判定: A / B / C
（A: 全項目合格、B: 警告あり、C: 違反あり要再生成）

## ルールベース監査

### 表記揺れ
- ✅ スキル名: 全て一致
- ⚠ 「召喚」と「召喚術」が混在（{該当箇所}）

### ステータス単調性
- ✅ HP/MP/攻撃力: 単調増加
- ❌ 耐久力: ep{N-1}=70 → ep{N}=65 で減少（違反）

### ステータス書式
- ✅ 【】〈〉の表記一致

### 口癖密度
- 主人公の口癖: 「ステータスを制する者は…」 を1回使用（基準2回未満、警告）

### 関係性整合
- ✅ 初対面のキャラはなし

## LLMベース監査
- ✅ 主人公の人格一貫性: OK
- ✅ パターン構造: P3_relationship_advance に沿う
- ✅ テンポ: 章進行に対し適切

## 推奨アクション
- ⚠ 「召喚術」を「召喚」に統一する修正
- ❌ 耐久力減少の修正（再生成 or 部分編集）
- ⚠ 主人公の口癖を1回追加

## 再生成判定
- 違反0件: 完了
- 違反あり: ep{N} 再生成を推奨
```

### Step 4: 違反の修正（軽微な場合）

軽微な違反（表記揺れ、口癖不足）は、本コマンド内で `Edit` ツールで修正:

- スキル名の表記揺れ → 統一
- 口癖を1-2回追加（自然な箇所に）
- ステータス書式の半角/全角揃え

重大な違反（ステータス減少、関係性矛盾）は再生成を推奨し、ユーザーに判断を委ねる。

### Step 5: _meta.json 更新

```json
"audited_episodes": [
  {"ep": 1, "judgment": "A"},
  {"ep": 2, "judgment": "B"},
  ...
]
```

### Step 6: レポート

```
=== Layer 7 完了: {slug} ep{N} ===
総合判定: {A/B/C}
違反件数:
  - スキル名表記揺れ: {N}件
  - ステータス単調性違反: {M}件
  - 口癖密度不足: {K}件
保存先: data/generation/works/{slug}/longform/episodes/ep{N:04d}_audit.md

次のステップ:
  /generate-longform-episode {slug} {N+1}
  または前話に戻って修正
```

## 合格条件（プロファイル別）

- 30話のうち **A判定が25話以上**（型C MVP の合格基準）
- ステータス単調性違反: 全話で **0件**
- スキル名表記揺れ: 全話で **0件**（軽微な揺れは自動修正）
- 口癖密度: 全話で **平均 2.0回/話 以上**

## 重要事項

- ルールベースで検出可能な違反は**自動修正**してから再判定
- 重大違反は再生成のため Layer 6 に戻る
- API 課金禁止
- 30話一気に監査する場合は loop で `for ep in 1..30; /audit-coherence {slug} $ep`

## メモリ参照

- `feedback_no_anthropic_api.md`
- 28軸スコアリング基準: `data/research/narou_dungeon_top30_full_depth.md`
