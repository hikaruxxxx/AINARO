# Bible V3 Migration Guide

V2 → V3 fact-based schema 移行の手順書。a07-modern-dungeon で完了済み実装をベースに、b/c 系作品 (転生貴族・ダンジョン探索) や将来の他作品で migration する時のレシピ。

## 概要

V2 schema は flat な BibleSnapshot ({ characters, locations, props, world, ... }) で、長大化すると以下の問題が出る:
- 「ランクは生涯固定 (in-world belief)」と「実は書き換え可能 (第10巻 reveal)」が flat に混在 → ユーザーが矛盾と感じる
- AI 生成で 41.6万字 / 対比型 1,113件 / 抽象語 537回 の冗長量産
- LLM Judge が 100,000 字 hard-clip で全体の 7.7% しか見ない
- volume_synopsis が単一 dict で 13 巻シリーズに使い回される

V3 schema は fact-based:
- **Layer (5値)**: `in_world_belief / revealed_at_volume / meta_truth / system_specification / character_arc_state`
- **Aspect (16値)**: identity / appearance / psychology / backstory / speech / relationship / location_layout / location_history / prop_function / prop_provenance / world_rule / system_param / history_event / faction_dynamics / motif_meaning / motif_directive
- **FactPov (5値)**: author_omniscient / protagonist / specific_character / in_world_public / in_world_secret
- 各 fact は `(entity, aspect, layer, episode/pov/temporal, evidence)` の 5 軸で索引可能

## 前提

- V2 snapshot.json が完成している (characters / locations / props / costumes / visual_motifs / relations / world / etc 全 field 充填済)
- bible-lint で fatal が許容範囲内 (理想 0、現状 a07 で 70 件は別問題として残置)
- Codex CLI が動く環境 (LLM refine 用)

## 移行ステップ

### Phase 5-A: deterministic 1 周回

```bash
npx tsx scripts/manga/migrate/v2-to-v3-classify.ts \
  --slug <slug>
```

出力 (`data/manga/works/<slug>/bible/`):
- `v3-classified-preview.json`: V3 snapshot 全体 (entities + relations + facts + volumes)
- `v3-classified-needs-review.json`: confidence < 0.7 の fact (deterministic adapter は 1.0 固定なので空配列)
- `unresolved_references.json`: 本文中の未定義固有名詞 (現状 a07 で 1,971 件、Phase 8-A で 16,181 から削減)
- `role_enum_violations.json`: role enum 違反 (例: `role: "heroine"` → `role: "supporting" + subrole: "heroine"` 推奨)
- `fact_source_path_index.json`: fact_id → source_path reverse index

所要時間: 数秒 (LLM コール無し)

### Phase 5-B: LLM refine N 周回

```bash
npx tsx scripts/manga/migrate/v2-to-v3-classify.ts \
  --slug <slug> \
  --with-llm-refine \
  --rounds 3 \
  --max-parallel 5
```

各 fact について Codex に「現状の layer/aspect が妥当か、不正なら正解、confidence (0-1)、rationale」を問う。N 周回 (default 3) 並列 5 で実行。

周回間で classification が安定しない fact は aggregated_confidence を半減、failed round があれば -0.2。結果を v3.facts.evidence.confidence に上書き、stable/unstable 判定。

追加出力:
- `v3-classified-llm-refine.json`: full result (rounds 別 layer / confidence / rationale + summary)
- `v3-classified-llm-progress.jsonl`: resume 用 (1 line per fact*round、中断時の続きから可)

所要時間: a07 600 facts × 3 rounds で約 80-120 分 (Codex CLI 並列 5、ChatGPT Pro 定額枠内)

### Console UI で結果確認

`npm run console -- --no-open` で起動 → [http://localhost:5174/?slug=<slug>#bible/v3_preview](http://localhost:5174/?slug=<slug>#bible/v3_preview) を開く。

確認項目:
- **Refine summary section**: total / stable / unstable / avg・median confidence / <0.7 件数
- **Layer filter**: in_world_belief / revealed_at_volume / meta_truth / system_specification / character_arc_state を切替
- **Unstable filter**: stable=false の fact のみ抽出
- **Confidence < 0.7 filter**: 人間レビュー対象だけ抽出
- **Fact card**: stable/unstable/failed badge + aggregated_confidence
- **Provenance modal**: round ごとの suggested_layer / suggested_aspect / confidence / rationale (current と一致は緑、differs は黄、failed は赤)
- **Role enum violations**: 推奨修正案 (例: 「白瀬灯里 → role: supporting + subrole: heroine」)
- **Unresolved references**: 上位 50 件 (固有名詞検出、Phase 8-A 改善後で精度向上)

### needsReview 対応

confidence < 0.7 の fact は人間レビューが必要:
1. provenance modal で rounds 履歴を確認
2. layer/aspect が本当にずれているか判断
3. ずれていれば V2 snapshot.json を直接編集して body を分割・再分類
4. 再度 Phase 5-A → 5-B を回す

### 本番置換 (Phase 8、未実装)

現状は `v3-classified-preview.json` への preview のみ。本番置換 (`snapshot.json` を V3 で上書き) は Phase 8 で実装予定。

将来は以下のように atomic write を使う:
```ts
import { writeSnapshotV3Atomic } from "@/lib/manga/bible/atomic-write";

const result = await writeSnapshotV3Atomic(v3, {
  bibleDir: bibleDir(slug),
  stageLabel: "phase-5-migration-final",
  splitFacts: true,
});

if (!result.ok) {
  console.error(`atomic write failed: ${result.error}, rollback used: ${result.rollback_used}`);
}
```

splitFacts=true で `facts/{characters,locations,world,motifs,props,events}/<id>.json` に分割保存、`fact_index.json` で全 fact フラット index 生成。pre-write backup (snapshot.bak-pre-<stage>-<ts>.json) と sha256 checksum verify で crash 耐性。

## 既知問題

### 1. deterministic adapter の confidence=1.0 固定

Phase 5-A の v2ToV3 は機械的変換で confidence は全 1.0。本物の信頼度判定は Phase 5-B (LLM refine) でのみ得られる。

### 2. undefined-reference-detector の過検出

Phase 8-A で 16,181 → 1,971 件まで削減 (88% reduction、組み込み除外辞書 250 語、漢字 2 字基本除外、character 姓名分割)。残り 1,971 件のうち本物の未定義固有名詞 (entity 登録漏れ) は数十件、残りは:
- 役職呼称 (例: 「主任」「部長」「窓口担当」)
- character 別名 (敬称付き、ニックネーム)
- 一般固有名詞っぽい複合語 (「鑑定石プロトコル」「ナビ第二段階」など、bible.entities に登録すれば消える)

精度を更に上げるには `built-in 除外辞書` を作品ジャンル別に拡張。

### 3. detectLayerReveals は info finding

同 entity 同 aspect で layer 違い fact が複数あるのは plan で「reveal 構造として正常」と定義されたため、fatal でなく info で出力。reveal の段差として保存される (例: 「ランクは生涯固定」in_world_belief vs 「実は書き換え可能」meta_truth)。

### 4. role=heroine の正規化は未実行

Phase 4 で `CharacterEntryV2.subrole` を optional 追加、Phase 5-A で role enum violations を `role_enum_violations.json` に出力するが、実 V2 snapshot.json の修正は未実行。Phase 8 で本番置換時に正規化する。

### 5. broker-v3 / composer は shim 構成

Phase 2-8C で V3 wrapper は legacy broker / composer をそのまま呼ぶ shim 構成。USE_BIBLE_V3=true で出力は完全一致 (parity test で保証)。Phase 9 以降に本物の V3 logic に置換予定。

## 着手順序まとめ

```
1. V2 snapshot.json 完成 (deepen pipeline)
2. Phase 5-A 実走 (deterministic preview、数秒)
3. role_enum_violations / unresolved_references を確認
4. v3-classified-preview.json を git commit (PR レビュー材料)
5. Phase 5-B 実走 (LLM refine 3 周回、80-120 分)
6. Console v3 preview で stable / unstable / needsReview を視認
7. confidence < 0.7 を人間レビュー
8. 必要なら V2 snapshot.json を編集 → Phase 5-A/B 再走
9. (Phase 8) 本番置換 atomic write (未実装)
10. (Phase 8) USE_BIBLE_V3=true で a07 ep01 再生成、既存 V2 と diff 確認
```

## 参考実装

- 型定義: [src/lib/manga/schemas-v2.ts](../../src/lib/manga/schemas-v2.ts) 末尾 `BibleSnapshotV3` セクション
- adapter: [src/lib/manga/bible/v3-adapter.ts](../../src/lib/manga/bible/v3-adapter.ts)
- broker: [src/lib/manga/bible/broker-v3.ts](../../src/lib/manga/bible/broker-v3.ts)
- migration: [src/lib/manga/bible/migrate-classify.ts](../../src/lib/manga/bible/migrate-classify.ts)
- atomic write: [src/lib/manga/bible/atomic-write.ts](../../src/lib/manga/bible/atomic-write.ts)
- lint: [src/lib/manga/qa-v2/bible-lint.ts](../../src/lib/manga/qa-v2/bible-lint.ts) (chunked judge / undefined-ref / provenance / depth-spec V3 対応)
- Console UI: [src/lib/manga/ops-console/web/views/bible.ts](../../src/lib/manga/ops-console/web/views/bible.ts) (v3 preview タブ)

## 関連 Plan

- [`~/.claude/plans/wild-exploring-crescent.md`](file:///Users/hikarumori/.claude/plans/wild-exploring-crescent.md): V3 移行 plan 全文 (Phase 1-8C 完了マーク済)

## 関連 commits (V3 移行 main thread)

| Phase | commit | 内容 |
|---|---|---|
| 1 | c453bea | V3 schema + v3-adapter + determinism test |
| 2 | 732fba2 | broker-v3 read-only mirror + parity test |
| 3 | f34f31e | bible-lint chunked + --llm-lint + provenance |
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
| R9 | c77a87b | atomic write + rollback ヘルパー |
