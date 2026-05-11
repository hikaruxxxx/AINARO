# AINARO 漫画 bible V3 移行 — 次セッション引継ぎ

## 前セッション (2026-05-11) の成果

| commit | 内容 |
|---|---|
| a3b3fd7 | feat: L4 storyboard 詳細化 prompt に visibility 縛り + bible context 注入 |
| d2a60bd | fix: applyCharBudget が先頭 fact 1 件の単独 max 超過で空配列を返すバグを skip ロジックで修正 |
| 6726327 | docs: V3 移行 handoff を 2026-05-11 セッション成果で更新 |
| 980737c | feat: sub-split prompt に長さ上限 800字 / 長文 field の段落分割指示を追加 |
| b8c43ec | fix: sub-split default timeout を 60s→180s に拡張 (long prompt 出力対応) |
| 39f8a95 | docs: handoff を sub-split 再走完了 + L4 visibility 縛り本実証成果で更新 |
| e1784f3 | fix: contextForScene を cast-fair filter に変更 (各 cast 毎に per-budget query → merge) |
| 2445be9 | docs: handoff に cast-fair filter 完了を反映 |
| 3d85576 | feat: Wave 1 - USE_BIBLE_V3 default true + undefined-reference-detector 強化 |

- handoff の **最優先タスク (L4 visibility 縛り)** 完了
- 副産物として broker-v3 `applyCharBudget` のバグを発見・修正
  - 修正前: cast character の最初の長文 fact 1 件で空配列を返し、character section が完全消滅
  - 修正後: a07 ep01 S01 で character section に psychology fact 1 件 (1,628 字) が正しく拾われる
- 連鎖発見: a07 cast facts には relationship aspect の 5K-8K 字超長文 fact が複数存在 (sub-split が長さを意識していない設計)
  - sub-split prompt を拡張 (980737c) し、新 prompt で 1 fact 検証: **8,323 字 → 5 sub-facts (各 120-203 字、すべて 800 字目安以下)、副次効果として revealed_at_volume layer に正しく分類**
- 378 → 379 tests (+1: buildSubSplitPrompt 拡張指示確認)
- 詳細 spec: `/tmp/v3-l4-spec/spec.md`, `/tmp/v3-l4-spec/spec-budget.md`, `/tmp/v3-l4-spec/spec-subsplit-len.md`
- a07 全体再 sub-split 2 回目 (timeout 180s) で **190/190 成功 / failed=0**
  - facts: 1,156 → 1,205 (+49)
  - layer 分布: in_world_belief 706→724, revealed_at_volume 33→70 (2倍), character_arc_state 120→127, system_specification 142→155
  - 平均 confidence 0.91、avg <0.7 fact=0
  - **fatal lint 70 → 30 (半減)**
- swap-v2-to-v3 で facts/ 反映済 (snapshot.json は V2 不変、snapshot.v3.json + facts/{characters,locations,motifs,props,world}/ 更新)
- L4 visibility 縛り検証 (V3 直接読み込み path):
  - characters facts 0/1 → **7 件** (appearance×5 + backstory×2、各 216-272 字)
  - location facts → 6 件、world_rules → 31 件、motifs → 1 件
  - prompt size: 7,515 → 9,922 chars (Codex 入力上限 32k 内、実用問題なし)

## このセッションのゴール

V3 移行 plan の **残課題に着手**:
1. ~~(最優先) L4 storyboard visibility 縛りの本格実装~~ — **完了 (a3b3fd7)**
2. ~~b/c 系作品 (転生貴族・現代ダンジョン2 等) で V3 migration を実走~~ — **a07 以外の作品 bible が `data/manga/works/` 配下に存在しないため skip**
3. ~~Character 長文 fact の sub-split~~ — **完了 (980737c + b8c43ec、a07 再 sub-split → swap 済)**
4. ~~broker-v3.contextForScene の cast-fair filter~~ — **完了 (e1784f3、a07 ep01 S01 でレン 3 + 灯里 3 にバランス回復)**
5. ~~USE_BIBLE_V3 default true 化~~ — **完了 (3d85576、USE_BIBLE_V3=false で V2 fallback、それ以外は V3)**
6. ~~undefined-ref detector 改善~~ — **部分完了 (3d85576、a07 で 1,971 → 1,442 件 -26.8%、known_terms.json 拡張で更に削減可)**
7. (任意・**新最優先候補**) a07 bible の depth 不足解消 — fatal lint 27 件のうち depth 系。主人公 growth_per_volume 未着手 / antagonist 心理 60-80% 不足 / location history 未着手 / visual_motifs 各種項目不足。LLM コール多のため background 必要
8. (任意) bible-lint の「ライン」誤検出修正 — 床ライン/体のライン等が LINE 商標と誤判定される 3 件 (compliance:trademarks.tech_services rule の正規表現修正)
9. (任意) L3.5 強化 — volume_plot 連動深化、巻またぎ伏線の自動配置、episode-patterns 辞書のカバー率向上
10. (任意) L11 audit / L12 repair の本格化 (現状は雛形のみ)
11. (任意) L8.5/8.6/8.7 name gate UI 改善 (Console 中央コックピット化)

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

### 1. (新規・最優先候補) Character 長文 fact の sub-split

**背景:**
前セッションで L4 visibility 縛り (a3b3fd7) + applyCharBudget 修正 (d2a60bd) を入れて、a07 ep01 S01 で character section に fact 1 件が拾われるようになった。

しかし、a07 cast (レン) の facts を見ると、最初の数件が異常に長い (2,546 / 3,815 / 3,255 字)。これらは V2 の `psychology_deep` `personality_visual_detailed` `belief_system_full` 等の長大フィールドが Phase 9 sub-split で分割されていない疑い。

```
レン facts body length 上位:
  fact 1: 2,546 chars (backstory)
  fact 2: 3,815 chars (psychology)
  fact 3: 3,255 chars (...)
  fact 4: 1,345 chars
  fact 5: 1,312 chars
  fact 6: 2,316 chars
  fact 7-46: 50-80 chars (speech 等、short fact)
```

**目指す状態:**
- character の長文 V2 source fields も sub-split 対象に追加
- 各 character fact が ~500 字以下に分割される
- L4 visibility 縛り prompt の character section に複数 fact (identity / appearance / psychology / backstory / relationship / speech) がバランスよく拾われる

**対象ファイル候補:**
- `scripts/manga/migrate/v2-to-v3-classify.ts` (Phase 9 sub-split を駆動)
- `src/lib/manga/migrate/llm-sub-split.ts` (推定: sub-split LLM ロジック)
- 関連: `data/manga/works/a07-modern-dungeon/bible/facts/characters/` の現状確認

**確認手順:**
```bash
# 既存 fact body length を集計
npx tsx -e "
import { promises as fs } from 'node:fs';
const dir = 'data/manga/works/a07-modern-dungeon/bible/facts/characters';
const files = await fs.readdir(dir);
for (const f of files.filter(n => n.endsWith('.json'))) {
  const fact = JSON.parse(await fs.readFile(dir + '/' + f, 'utf-8'));
  console.log(\`\${f}: body=\${fact.body?.length ?? 0} chars\`);
}
"
```

**規模感:** 中。`v2-to-v3-classify.ts --with-sub-split` の動作確認 + 必要なら sub-split target field の拡張 + a07 で再 migrate (LLM コール多)。

### 2. ~~b/c 系作品で V3 migration 実走~~ skip 確定

`data/manga/works/` 配下に a07-modern-dungeon 以外の bible は存在しない (2026-05-11 確認)。b/c 系 = 「ダンジョン探索」「転生貴族領地経営」は bible 構築自体が未着手。bible 構築は別ワーク扱い (`run-deepen-all.ts` 等)。

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

1. `git log --oneline -30` で commits 確認 (前セッションで a3b3fd7 / d2a60bd 追加)
2. `npx vitest run` で 378 tests 全 pass を確認
3. `npm run console -- --no-open` で Console 起動 (port 5174、必要なら open)
4. a07 で `npx tsx /tmp/v3-l4-spec/preview-prompt.ts` で L4 visibility 縛り後の prompt を再確認 (前セッションの試験 script、残してある)
5. **Character 長文 fact の sub-split 着手** から始める (新最優先候補)

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
