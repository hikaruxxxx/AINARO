# ヘルモード/モブ高生型 長編生成パイプライン v3 — 実装計画

## Context

なろうダンジョン系Top30を28軸（世界設定W12 + キャラC8 + 周辺S8）でスコアリングした結果、長期連載に耐える作品（ヘルモード43点・モブ高生65点）を貫く**7つの根幹**が判明した：

- W6 能力理論の体系化
- W10 ステータス可視化
- C1 主人公人格の濃度
- C8 階層上昇による章替え
- S1 計算可能な戦闘
- S2 装備/アイテムの精細化
- S5 通貨/経済感覚

既存の `screen-mass → expand-logline → generate-plot → generate` は**話単位生成**のためこれら7軸が話ごとに揺れ、結果として「型E（テンプレ最小・100話で頭打ち）」しか生成できない。

ヘルモード型/モブ高生型を生成するには、世界設定・主人公・関係性・章構造を**事前に固定**し、状態スナップショットを話を跨いで保つ仕組みが必要。本計画はそのMVPを8週間で実装する。

設計の詳細は `data/research/pipeline_design_hellmode_mobukousei.md` 参照。

## Goal (Phase 1 MVP・4週間)

**ヘルモード型（型C, 目標28軸合計40+）の作品を1本（30話）生成できるパイプラインを構築する**。

モブ高生型（型A, 目標60+）の対応は Phase 2（週5-8）で拡張。

## 既存資産との関係

- 既存 `Layer 1 expand-logline` / `Layer 2 generate-plot` / `generate` は**触らない**（短編生成用に維持）
- 新パイプラインは **`longform` モード**として並列に動く
- 既存の `data/generation/anchors/battle_dungeon/` `plot-templates/battle_dungeon.md` は**読み取り専用で参照**
- スラッシュコマンド方式（`.claude/commands/*.md`）に揃える
- API課金は禁止。各層はサブエージェント呼び出しで動かす（メモリ `feedback_no_anthropic_api.md` 準拠）

## 新規ディレクトリ構造

```
data/generation/profiles/                    # 型別プロファイル
├── hellmode_type/                           # Phase 1 で作る
│   ├── profile.yaml                         # 28軸目標スコア / 重点軸
│   ├── world_bible_template.md              # ワールドバイブル雛形
│   ├── protagonist_template.md              # 主人公プロファイル雛形
│   ├── story_arcs_template.md               # 章設計雛形
│   └── episode_patterns.yaml                # 5パターンの辞書
└── mobukousei_type/                         # Phase 2 で追加

data/generation/works/{slug}/longform/       # work ごとの生成成果物
├── _meta.json                               # 既存形式に profile_type を追加
├── world_bible/
│   ├── world.md                             # W1-5
│   ├── ability_system.json                  # W6/W10
│   ├── dungeon_theory.md                    # W7
│   └── status_format.md                     # W10 共通フォーマット
├── protagonist.md                           # C1
├── relationship_graph.json                  # C3/C7（型C は簡易版）
├── story_arcs.md                            # C8
├── episode_patterns.yaml                    # S1
└── episodes/
    ├── ep0001.md                            # 本文
    ├── ep0001_state.json                    # 状態スナップショット
    └── ep0001_audit.md                      # 整合性監査レポート
```

## 新規スラッシュコマンド（8個）

| Layer | コマンド | 役割 |
|---|---|---|
| 0 | `/longform-init {slug} {profile_type}` | プロファイル選択＋ディレクトリ初期化 |
| 1 | `/build-world-bible {slug}` | 世界設定の事前生成（W1-12） |
| 2 | `/build-protagonist {slug}` | 主人公プロファイル生成（C1） |
| 3 | `/build-relationship-graph {slug}` | 関係性網生成（C3/C7、型A必須・型C簡易） |
| 4 | `/build-story-arcs {slug}` | 章構造設計（C8） |
| 5 | `/build-episode-patterns {slug}` | エピソードパターン辞書（S1、5-10種） |
| 6 | `/generate-longform-episode {slug} {ep_number}` | 本文生成＋状態スナップショット更新 |
| 7 | `/audit-coherence {slug} {ep_number}` | 整合性監査（表記揺れ・状態単調性・口癖密度） |

各コマンドは既存 `.claude/commands/expand-logline.md` のフォーマットに揃える。

## 新規TypeScriptスクリプト（4本）

`scripts/generation/` に追加:

- `longform-init.ts` — Layer 0 のディレクトリ初期化＋ `_meta.json` 拡張
- `state-snapshot.ts` — 状態スナップショット管理（HP/MP/スキル一覧/所持金/関係性の差分追跡）
- `coherence-checker.ts` — 整合性チェッカー（ルールベース：表記揺れ検出・ステータス単調性違反・口癖密度集計）
- `longform-status.ts` — `data/generation/works/{slug}/longform/` の進捗を一覧表示

## Phase 1 MVP 成果物（4週間）

### 週1: プロファイル雛形 + Layer 0/1
- `data/generation/profiles/hellmode_type/` 5ファイル作成
- `/longform-init` コマンド + `longform-init.ts`
- `/build-world-bible` コマンド（手動でヘルモード事例から逆算した雛形を1作品分作る）

### 週2: Layer 2/3
- `/build-protagonist` コマンド
- `/build-relationship-graph` コマンド（型C は簡易：4-6グループ・各2-3人）

### 週3: Layer 4/5
- `/build-story-arcs` コマンド（章数3-5、各章の階層上昇イベント明示）
- `/build-episode-patterns` コマンド（型C 5パターン：スキル発見・戦闘最適化・関係進展・世界の謎・章替えクライマックス）

### 週4: Layer 6/7
- `/generate-longform-episode` コマンド + `state-snapshot.ts`
- `/audit-coherence` コマンド + `coherence-checker.ts`
- 1作品実例（slug = `tokyo_meikyu_v3` または別テーマ）で30話生成

### Phase 2（週5-8）
- 型A（モブ高生型）プロファイル追加
- 関係性ネットワークの自動生成強化
- エピソードパターン辞書を10パターンに拡張
- 既存 `pairwise-judge` への評価軸（設定一貫性／口癖濃度／戦闘の数値計算性）追加
- v12-ep1 ヒット予測モデルへの特徴量追加（型C/A 適合度）

## Critical Files

### 新規作成
- `data/generation/profiles/hellmode_type/profile.yaml`
- `data/generation/profiles/hellmode_type/world_bible_template.md`
- `data/generation/profiles/hellmode_type/protagonist_template.md`
- `data/generation/profiles/hellmode_type/story_arcs_template.md`
- `data/generation/profiles/hellmode_type/episode_patterns.yaml`
- `.claude/commands/longform-init.md`
- `.claude/commands/build-world-bible.md`
- `.claude/commands/build-protagonist.md`
- `.claude/commands/build-relationship-graph.md`
- `.claude/commands/build-story-arcs.md`
- `.claude/commands/build-episode-patterns.md`
- `.claude/commands/generate-longform-episode.md`
- `.claude/commands/audit-coherence.md`
- `scripts/generation/longform-init.ts`
- `scripts/generation/state-snapshot.ts`
- `scripts/generation/coherence-checker.ts`
- `scripts/generation/longform-status.ts`
- `data/generation/works/{slug}/longform/` 配下（実例1作品分）

### 参照のみ（変更しない）
- `data/generation/anchors/battle_dungeon/anchors.json` — anchor を世界設定の参考に使う
- `data/generation/plot-templates/battle_dungeon.md` — プロット雛形を参照
- `data/research/narou_dungeon_top30_full_depth.md` — 28軸スコアリング基準
- `data/research/pipeline_design_hellmode_mobukousei.md` — 設計ドキュメント
- `data/research/dungeon_samples/n3669fw_ヘルモード.md` — ヘルモード本文サンプル（テンプレ抽出元）
- `data/research/dungeon_samples2/r44_n0112fi_モブ高生.md` — モブ高生本文サンプル

## メモリ制約と整合

- **`feedback_no_anthropic_api.md`**: ANTHROPIC_API_KEY課金前提にしない → 各Layerコマンドはサブエージェント呼び出し（Claude Code内部）で完結。`scripts/generation/*.ts` はLLMを直接叩かず、ファイル操作・整合性ルールのみ
- **`feedback_template_problem.md`**: サブエージェントに大量タスクを渡さない → 1コマンド=1Layer。Layer 6の本文生成も「1話ずつ」呼び出す
- **`feedback_no_confirmation.md`**: 確認不要で進む → MVP実装中は途中確認なし
- **`project_main_kpi.md`**: 月間完走者数が主KPI → 長編生成パイプラインは完走可能な作品設計を目指す（章構造で離脱回避）
- **`project_phase1_v2_design.md`**: 既存の Phase1 v2 6層設計と整合 → 本計画の Layer 0-7 がほぼ対応

## Verification

### 構造検証（週1終了時）
```bash
ls data/generation/profiles/hellmode_type/   # 5ファイル
ls .claude/commands/longform-*.md            # 8ファイル
ls .claude/commands/build-*.md
ls .claude/commands/audit-coherence.md
ls .claude/commands/generate-longform-episode.md
```

### 動作検証（週4終了時）
```bash
# 初期化
/longform-init demo_hellmode hellmode_type

# Layer 1-5 順次実行
/build-world-bible demo_hellmode
/build-protagonist demo_hellmode
/build-relationship-graph demo_hellmode
/build-story-arcs demo_hellmode
/build-episode-patterns demo_hellmode

# 1話生成 + 監査
/generate-longform-episode demo_hellmode 1
/audit-coherence demo_hellmode 1

# 30話まで反復
for i in $(seq 1 30); do
  /generate-longform-episode demo_hellmode $i
  /audit-coherence demo_hellmode $i
done

# 進捗確認
npx tsx scripts/generation/longform-status.ts demo_hellmode
```

### 品質検証（週4終了時）
1. 30話の整合性監査レポートで「A判定」が25話以上
2. 主人公の口癖密度が1話あたり2回以上を維持
3. ステータス値の単調性違反が0件
4. 章替えイベントが計画通り発生
5. 28軸の手動スコアリング（または既存の pairwise-judge ベース）で **合計35点以上**

### 失敗時のロールバック
新規ファイルのみ追加で既存ファイルは変更しないため、ロールバックは新規ディレクトリ削除で完結:
```bash
rm -rf data/generation/profiles/hellmode_type/
rm .claude/commands/longform-*.md .claude/commands/build-*.md
rm .claude/commands/generate-longform-episode.md .claude/commands/audit-coherence.md
rm scripts/generation/longform-*.ts scripts/generation/state-snapshot.ts scripts/generation/coherence-checker.ts
rm -rf data/generation/works/demo_hellmode/longform/
```

## このパイプラインで作れない部分（人間の介入が必要）

- 主人公の「執着のオリジナリティ」（前世の趣味・憎悪・欲求）→ Layer 0 でユーザー記述
- キャラ同士の「ハマる」ケミストリー → Layer 3 で人間がレビュー
- 章替えクライマックスの感情曲線 → Layer 4 で人間が方向性を指定

AI は構造とルールの一貫性を保証し、人間が「魂」を入れる役割分担を明示的にする。

## 完了基準

- [ ] 型Cプロファイル雛形5ファイルが揃う
- [ ] 8つのスラッシュコマンドが揃う
- [ ] 4つのTypeScriptスクリプトが動く
- [ ] 1作品（30話）が `data/generation/works/{slug}/longform/episodes/` に揃う
- [ ] 整合性監査でA判定25話以上
- [ ] 28軸スコア35点以上
