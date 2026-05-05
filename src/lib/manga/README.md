# src/lib/manga/ ライブラリ構造 (v2)

横読み白黒漫画パイプライン v2 の本流ロジック。
SSoT: `docs/plans/manga/pipeline-v2.md`

## 12-Layer 構造

```
═══ PHASE 1: WORK SETUP ═══
L01 bible-snapshot       bible/v2-adapter.ts (V2企画書 → snapshot)
                         bible/bible-snapshot.ts (旧 v1 型、参考)
                         bible/provenance.ts (refs source rights ガード)
L02 bible-images         bible/v2-images.ts (キャラ/ロケ/プロップ refs 生成)

═══ PHASE 2: EPISODE PLANNING ═══
L03 shotlist             shotlist-v2/scene-extractor.ts
L04 storyboard           storyboard-v2/storyboard-extractor.ts (entity_id 強制)
L05 page-director        page-director-v2/page-mapper-v2.ts (deterministic templates)
L06 continuity-resolve   page-director-v2/continuity-resolve-v2.ts
L07 refs-resolution      page-director-v2/refs-resolver-v2.ts (RULE 1-10)
L08 incremental-refs     bible/v2-images.ts (variants 引数で個別生成)

═══ PHASE 3: RENDER ═══
L09 render               render-v2/prompt-composer-v2.ts + generate/codex-image.ts (流用)
L10 bubble               bubble-v2/vertical-typesetter.ts
L11 audit                qa-v2/audit.ts
L12 repair               (L9/L10 を re-run、新規モジュール最小)

═══ PHASE 4: PUBLISH ═══
L13 kdp                  publish-v2/kdp/{spine-calc,manuscript-pdf,cover-composer,colophon-gen}.ts
```

## ディレクトリ構成

```
src/lib/manga/
├── types.ts, schemas.ts                   # 既存 v1 (primitive 型は v2 でも流用)
├── schemas-v2.ts                          # v2 layer 出力型
│
├── capability/                            # ModelCapabilityProfile loader
│   └── capability.ts
│
├── bible/                                 # L1-L2 + L8
│   ├── v2-adapter.ts                      # 新: V2企画書 → BibleSnapshotV2
│   ├── v2-images.ts                       # 新: BibleSnapshotV2 → refs/
│   ├── provenance.ts                      # 新: kindle_archive reject 含む rights ガード
│   ├── bible-snapshot.ts                  # 既存 v1 型
│   ├── snapshot-adapter.ts                # 既存
│   ├── character-images.ts                # 既存 (DB 経路あり、v2 では未使用)
│   ├── location-images.ts                 # 既存 (同上)
│   └── ...                                # その他 v1 既存
│
├── shotlist-v2/                           # L3
│   └── scene-extractor.ts                 # bible+brief → shotlist (Codex CLI)
│
├── storyboard-v2/                         # L4
│   └── storyboard-extractor.ts            # shotlist+bible → storyboard (entity_id 強制)
│
├── page-director-v2/                      # L5-L7
│   ├── page-mapper-v2.ts                  # storyboard+capability → page_plan
│   ├── continuity-resolve-v2.ts           # +continuity_group_ids
│   └── refs-resolver-v2.ts                # +resolved_refs (RULE 1-10)
│
├── render-v2/                             # L9
│   └── prompt-composer-v2.ts              # panel/page → English prompt + refs paths
│
├── bubble-v2/                             # L10
│   └── vertical-typesetter.ts             # 縦書きSVG overlay (sharp合成)
│
├── qa-v2/                                 # L11
│   └── audit.ts                           # 解像度/サイズ/期待 bubble 数チェック
│
├── publish-v2/kdp/                        # L13
│   ├── spine-calc.ts
│   ├── manuscript-pdf.ts
│   ├── cover-composer.ts
│   └── colophon-gen.ts
│
├── render/, bubble/, generate/, llm/      # 既存 v1 コア (codex-image / svg-overlay は v2 が流用)
└── repair/, qa/                           # 既存 v1 (L12 で repair-policy.ts を将来活用)
```

## 呼び出し関係 (v2)

```
V2企画書JSON
    ↓
bible/v2-adapter.ts
    ↓
bible/snapshot.json
    ↓
bible/v2-images.ts → bible/refs/ + _provenance.json
    ↓
shotlist-v2/scene-extractor.ts → episodes/epNN/shotlist.json
    ↓
storyboard-v2/storyboard-extractor.ts → storyboard.json (entity_id 強制)
    ↓
page-director-v2/page-mapper-v2.ts → page_plan.json
    ↓
page-director-v2/continuity-resolve-v2.ts → +continuity_group_ids
    ↓
page-director-v2/refs-resolver-v2.ts → resolved_refs.json
    ↓
render-v2/prompt-composer-v2.ts + generate/codex-image.ts → renders/p{NN}.png
    ↓
bubble-v2/vertical-typesetter.ts → bubbles/p{NN}.png
    ↓
qa-v2/audit.ts → audit.json
    ↓
repair/ (L12) → re-run L9-L10
    ↓
publish-v2/kdp/* → volumes/vNN/kdp/{manuscript,cover}.pdf
```

## v1 と v2 の関係

- v1 (build-bible.ts / character-images.ts / etc) は DB 経路あり。Phase A は使わない (snapshot に集約)
- v2 ライブラリは v1 の primitive 型 (CharacterSpec / LocationSpec / etc) を import して流用
- v2 は schema_version: 2 を持ち、v1 (schema_version: 1) と区別

## 関連

- スクリプト: `scripts/manga/README.md`
- SSoT: `docs/plans/manga/pipeline-v2.md`
- 旧 SSoT: `docs/plans/manga/_archive/pipeline-v1-2026-05-02.md`
- 作法: `docs/strategy/manga_craft_guide.md`
- データ: `data/manga/README.md`
