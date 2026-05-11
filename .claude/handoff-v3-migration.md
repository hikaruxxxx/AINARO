# AINARO 漫画 bible V3 移行 — 次セッション引継ぎ

## このセッションのゴール

V3 移行 plan の **残課題に着手**:
1. (最優先) L4 storyboard visibility 縛りの本格実装
2. b/c 系作品 (転生貴族・現代ダンジョン2 等) で V3 migration を実走、a07 を量産展開ロールモデルとして検証
3. (任意) undefined-ref detector 更改善 (1,971 → 数百件)
4. (任意) USE_BIBLE_V3 を default true 化検討 (a07 で十分検証されたら)

## 前提 (前セッションで完了済)

- repo: `/Users/hikarumori/Developer/AINARO`
- branch: `feat/manga-pipeline-v2` (push 済、最新 commit `80b8a91`)
- plan: `~/.claude/plans/wild-exploring-crescent.md` (Phase 1-8C + 拡張完了マーク済)
- 手順書: `docs/architecture/bible_v3_migration_guide.md` (b/c 系展開用レシピ)

### V3 移行 27 commits (Phase 1-9)

| Phase | commit | 内容 |
|---|---|---|
| 1 | c453bea | V3 schema + v3-adapter + determinism test |
| 2 | 732fba2 | broker-v3 read-only mirror + parity test |
| 3 | f34f31e | bible-lint chunked + --llm-lint + provenance + undefined-ref |
| 3-ext | 0f91ec1 | depth-spec layer/aspect filter + V3 fact-based depth check |
| 4 | 20df8bd | deep-extractor 文体規制 + Stage 8 per-volume + Stage 9 v3 cross-ref |
| 5-A | bd10d92 | a07 V2→V3 deterministic migration script |
| 5-B | b738076 | LLM refine N 周回 classify (Codex CLI 並列) |
| 6 | d5de6cb | USE_BIBLE_V3 flag + monologue-layer-check |
| 7 | 9eb9259 | Console v3 preview タブ + provenance modal |
| 7-ext | cd477ba | Console v3 preview に LLM refine 結果表示 |
| 8-A | 57cd86c | undefined-reference-detector 精度改善 (16,181→1,971) |
| 8-B | d8b625c | USE_BIBLE_V3 V2/V3 parity (intersection 1.000) |
| 8-C | 0109bf0 | prompt-composer USE_BIBLE_V3 全 broker 呼び出し wire-up |
| 拡張 | c77a87b | V3 snapshot atomic write + rollback (R9 緩和) |
| 拡張 | 8c59233 | swap-v2-to-v3.ts (Phase 8 本番置換準備) |
| 9 | 0c20c6b | Phase 9 V2 string LLM sub-split |
| swap fix | d8b1192 | swap script V2 保護型に修正 (snapshot.json=V2 維持、V3 並存) |
| 9-A | f2743c0 | broker-v3 を本物 V3 fact-based logic に置換 (主要 2 wrapper) |
| 9-C | 17fc120 | Console handler facts/ 分割ロード API |
| 9-A 完成 | 80b8a91 | broker-v3 残り 9 wrapper 全て本物 V3 logic に置換 |
| docs | f6cc950 | bible_v3_migration_guide.md |
| docs | 4066ba1 | CLAUDE.md V3 section 追加 |
| api fix | da0e53a | bible-v3-preview API llmRefine shape 修正 |

### a07 で実証済の V3 経路

- `data/manga/works/a07-modern-dungeon/bible/snapshot.json` = V2 (schema_version=2、変更禁止)
- `data/manga/works/a07-modern-dungeon/bible/snapshot.v3.json` = V3 (schema_version=3、entities=82)
- `data/manga/works/a07-modern-dungeon/bible/facts/{characters,locations,world,motifs,props}/<id>.json` = 1,156 facts split
- `data/manga/works/a07-modern-dungeon/bible/fact_index.json` = 全 fact index
- `data/manga/works/a07-modern-dungeon/bible/v3-classified-llm-refine.json` = LLM refine 結果 (stable 67%、avg conf 0.57)
- `data/manga/works/a07-modern-dungeon/bible/snapshot.v2-final.json` = V2 永久保存 (rollback 用)
- `data/manga/works/a07-modern-dungeon/episodes/ep01/renders/p05_v14.png` = USE_BIBLE_V3=true で生成 (broker-v3 主要 2 本物化時点)
- `data/manga/works/a07-modern-dungeon/episodes/ep01/renders/p15_v15.png` = USE_BIBLE_V3=true で生成 (全 11 wrapper 本物化後)

### Phase 9 で実装した V3 経路全体

```
USE_BIBLE_V3=true
   ↓ L09-render (flag 認識)
   ↓ prompt-composer-v2 (全 broker 呼出 *FromV2 経由)
   ↓ broker-v3 (11 wrapper 全て本物 V3 logic):
     - summarizeCharacterForEpisodeV3 (visibility filter で巻ごと変化)
     - relevantWorldRulesV3 (4 件 hard-clip 撤廃、char_budget 動的)
     - activeCostumeForV3 (episode_range 整合性)
     - relationshipStateAtV3 (pov=specific_character + character_arc_state)
     - relevantMotifsV3 (entities[kind=motif] + facts[aspect=motif_directive])
     - summarizeMotifForPanelV3 / summarizeLocationForSceneV3 / summarizeWorldRulesForSceneV3
     - attributeTagsForV3 / continuityAnchorTextForV3 / sceneOverrideTextForV3
   ↓ v3-loader.loadBibleSnapshotV3FromDir (snapshot.v3.json + facts/ 集約)
   ↓ 1,156 facts visibility filter で抽出
   ↓ prompt 構築 → 画像生成
```

### 数値メトリクス

- **297 → 372 tests** (+75 新規、tsc clean、全 pass)
- a07 V3 facts: **1,156** (sub-split で 600→1,156)
- Layer 分布: in_world_belief 677 / system_specification 153 / character_arc_state 143 / meta_truth 119 / revealed_at_volume 64
- LLM refine: stable 67%、avg conf 0.57、meta_truth 88.2% / character_arc_state 82.5% 高品質
- Console v3 preview: facts 1,156 / role violations 2 / unresolved refs 1,971 表示
- render 検証: p5 v14 + p15 v15、failed=0、商標リーク 0

## このセッションでやること (詳細)

### 1. (最優先) L4 storyboard visibility 縛り

**現状:**
- Phase 6 で `monologue-layer-check` audit 実装 (storyboard 生成後の検出)、a07 で fatal=0
- ただし storyboard 生成 prompt 自体に visibility 制約は入っていない (cast が meta_truth fact を喋る monologue が出力されうる)
- a07 では fatal=0 だが、これは「現状の bible が meta_truth phrase を含まない」なのか「LLM が運良く meta_truth を漏らさなかった」のか不明

**目指す状態:**
- storyboard 生成 prompt に「cast は in_world_belief 層しか知らない、narration は at_volume までの reveal を許容」を明示
- broker-v3.contextForSceneV2 を visibility="in_world_only" で呼び、 cast 視点の bible context を取得して生成
- 結果: monologue が meta_truth を漏らさない構造的保証

**対象ファイル:**
- `scripts/manga/layers/L04-storyboard.ts`
- `src/lib/manga/scene-graph/storyboard-from-scenes.ts` (主に enrichStoryboardWithLLM 関数)
- `src/lib/manga/storyboard-v2/storyboard-extractor.ts`

**実装方針:**
- L4 内の LLM prompt に「visibility=in_world_only context」を明示挿入
- broker-v3.contextForSceneV2 を呼んで visibility 別の bible context を取得
- prompt template に「cast monologue は in_world_belief facts のみ言及可」「narration は revealed_at_volume <= current_vol まで可」明文化
- 既存 monologue-layer-check と二重 guard

**規模感:** 中-大 (storyboard 生成 path の調査が必要)。Codex に依頼するなら spec を厚めに準備。

### 2. b/c 系作品で V3 migration 実走

**前提:**
- a07-modern-dungeon は完了
- b/c 系 = Phase A 検証 3 作品 (転生貴族領地経営 / ダンジョン探索 / a07 含む) のうち a07 以外
- `data/manga/works/` を見て他作品の bible 存在を確認

**確認手順:**
```bash
ls data/manga/works/  # a07 以外の作品が存在するか
# 各作品で snapshot.json (V2) があれば migration 可能
# 無ければ bible 構築から (run-deepen-all.ts)
```

**bible が完成していれば即実行可能:**
```bash
# Phase 5-A deterministic 1 周回
npx tsx scripts/manga/migrate/v2-to-v3-classify.ts --slug <slug>

# Phase 9 sub-split + Phase 5-B refine (推定 2-3h)
npx tsx scripts/manga/migrate/v2-to-v3-classify.ts --slug <slug> --with-sub-split --with-llm-refine --rounds 3 --max-parallel 5

# Phase 8 本番置換 (V2/V3 並存)
npx tsx scripts/manga/migrate/swap-v2-to-v3.ts --slug <slug> --allow-fatal --yes

# 検証
USE_BIBLE_V3=true npx tsx scripts/manga/layers/L09-render.ts --slug <slug> --episode 1 --pages 1 --skip-name-gate --auto-version --concurrency 1
```

### 3. (任意) undefined-reference-detector 更改善

**現状:** a07 で 1,971 件 (Phase 8-A で 16,181→1,971 に改善済)
**目標:** 数百件まで絞る
**改善余地:**
- 役職呼称 (主任、部長、窓口担当) を除外辞書に追加
- character 別名・敬称付き形を `expandCharacterNames` の対象拡張
- 「鑑定石プロトコル」「ナビ第二段階」のような複合語を bible.entities に登録 → 自動消える

### 4. (任意) USE_BIBLE_V3 default 化

a07 で十分検証 → `process.env.USE_BIBLE_V3 === "true"` を default true に変更
- 影響範囲: scoring-loop / prompt-composer-v2 / L9
- リスク: 他作品で V3 swap してない場合 fallback (v2ToV3 adhoc 変換) が走るので動くはずだが要検証

## 制約・ルール

- src/ scripts/ 編集は **Codex 経由** (CLAUDE.md 三段リレー)
- レビュー証跡: `echo ok > /tmp/ainaro-codex-reviewed-$(git rev-parse HEAD)`
- docs/, *.md, snapshot.json 等のデータファイルは Claude 直接編集 OK
- コミットメッセージ: `<type>: <日本語説明>`
- Co-Authored-By: Claude Opus 4.7 (1M context) を残す
- 各 logical change ごとに 1 commit
- LLM コール (Codex CLI 経由) は ChatGPT Pro 定額枠内、追加課金なし
- ANTHROPIC_API_KEY 課金前提にしない (`feedback_no_anthropic_api` メモリ参照)

## 着手順

1. `git log --oneline -30` で 27 commits 確認
2. `npx vitest run` で 372 tests 全 pass を確認
3. `npm run console -- --no-open` で Console 起動 (port 5174、必要なら open)
4. a07 で USE_BIBLE_V3=true 経路の動作再確認 (p1 だけでも render してみる)
5. **L4 visibility 縛り着手** から始める (最優先)

## 注意点

### V2/V3 並存状態
- snapshot.json は V2 (絶対に touch 禁止、broker default 経路の source)
- snapshot.v3.json + facts/ が V3 (USE_BIBLE_V3=true で読む)
- swap script は `--v2-overwrite` flag を持つが **使わない** (Phase 9 本物実装完了まで V2 保護)

### broker-v3 全 wrapper 本物 V3 logic
- Phase 9-A 完成 (commit 80b8a91) で 11 wrapper 全て本物実装
- 内部で `v2ToV3(v2)` → V3 logic を呼ぶ V2 互換 shim も併設 (*FromV2 suffix)
- prompt-composer-v2 の USE_BIBLE_V3=true 分岐は全部 *FromV2 を呼ぶ

### Console 起動状態
- 前セッションで `npm run console` 起動済 (port 5174)
- 新セッションで bundle 再生成が必要なら **再起動** (HMR なし、`project_console_dev_no_hmr` メモリ参照)
- `lsof -ti:5174 | xargs -r kill` → `npm run console -- --no-open` で再起動

### 既知問題
- a07 で role enum 違反 2 件 (白瀬灯里・獅童響、`role: "heroine"`)、`role_enum_violations.json` で推奨修正案 (supporting + subrole=heroine) あり、未適用
- a07 で fatal lint 70 件 (Phase 8 で減ったが残る)、内訳: depth 不足 67 件 + 「ライン」誤検出 3 件。swap は `--allow-fatal` 経由で完走済
- L9 で USE_BIBLE_V3=true 時 prompt size 8K threshold を僅か超過 warning (8231 chars)、render は完走

### メモリ参照
- `~/.claude/projects/-Users-hikarumori-Developer-AINARO/memory/MEMORY.md` 索引
- 重要: `feedback_no_anthropic_api`, `project_kdp_strategy`, `project_megahit_strategy`, `project_genre_3parallel`, `project_console_dev_no_hmr`
