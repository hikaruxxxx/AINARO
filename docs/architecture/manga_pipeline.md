# 漫画パイプライン v2 アーキテクチャ (2026-05-02 全面再設計)

> SSoT (実装): `docs/plans/manga/pipeline-v2.md`
> 上位戦略 (投資配分・陳腐化耐性): `docs/plans/manga/strategy.md`
> 旧 SSoT (縦読み + 横読み 17層): `docs/plans/manga/_archive/pipeline-v1-2026-05-02.md`
> 対応型定義: `src/lib/manga/schemas-v2.ts`, `src/lib/manga/schemas.ts` (primitive 型)

## 1. 位置づけ

AINARO 横読み白黒漫画パイプライン (B6判 KDP+KU 専売) の本流アーキテクチャ。
2026-05-02 に Codex + Claude エージェントの red-team レビューを経て、L0-L17 の旧設計を **12 layer / Phase 1-4 境界** に圧縮した v2 設計。

旧 stage1-8 の手作業は `data/manga/_archive/2026-05-02-pre-redesign/` に退避済み。

## 2. 設計原則

1. **Single source of truth per layer** — 各 layer は 1 モジュール / 1 スキーマ / 1 CLI
2. **No legacy compat** — stage1-8 / 旧 DB 経路 / 自由文字列 subjects は完全破棄
3. **Hard fail over silent skip** — bible 未登録キャラ・refs 解決失敗・schema 不一致は即停止
4. **Asset by ID** — ファイルパス直指定禁止、`asset_id` を主キーに `source_provenance` 強制
5. **Snapshot-only** — Phase A は JSON snapshot 経路に集約 (DB は Phase B で再評価)
6. **Idempotent layer rerun** — 各 layer は input hash でキャッシュ、変更分のみ再実行
7. **Explicit capability dependency** — render 前に `data/manga/capability/{model}.json` 読込必須
8. **Bible-first ordering** — bible (キャラ・ロケ・style) → shotlist (bible 参照) の順を厳守

## 3. 12 Layer 全体図

```
═══ PHASE 1: WORK SETUP (once / 作品) ═══
L01 Bible Snapshot         V2企画書 → bible/snapshot.json
L02 Bible Images           snapshot → bible/refs/{characters,locations,props}/

═══ PHASE 2: EPISODE PLANNING (per ep) ═══
L03 Shotlist               bible + ep_brief → episodes/epNN/shotlist.json
L04 Storyboard             shotlist + bible → storyboard.json (entity_id binding hard required)
L05 Page Director          storyboard + capability → page_plan.json
L06 Continuity Resolve     page_plan + bible → page_plan + continuity_group_ids
L07 Refs Resolution        page_plan + bible/refs → resolved_refs.json (RULE 1-10)
L08 Incremental Refs       resolved_refs.unresolved → bible/refs/_ep{N}/

═══ PHASE 3: RENDER (per ep) ═══
L09 Render                 page_plan + resolved_refs → renders/p{NN}.png
L10 Bubble Overlay         renders + storyboard.dialogue → bubbles/p{NN}.png
L11 Audit                  bubbles + bible → audit.json
L12 Repair                 audit.failed → re-run L7-L10 for failed pages

═══ PHASE 4: PUBLISH (per volume) ═══
L13 KDP Package            volumes/vNN/episodes 全部 → kdp/{manuscript,cover}.pdf + metadata.json
```

## 4. Phase 境界の責務

| Phase | 単位 | 主成果物 | 再実行頻度 |
|---|---|---|---|
| Phase 1 | 作品 (slug) | bible/snapshot.json + bible/refs/ | once/work (重大変更時のみ再実行) |
| Phase 2 | 話 (episode) | shotlist / storyboard / page_plan / resolved_refs | per ep |
| Phase 3 | 話 (episode) | renders / bubbles / audit / repair | per ep (失敗時 L12 で部分再実行) |
| Phase 4 | 巻 (volume) | manuscript.pdf / cover.pdf / metadata.json | per volume |

## 5. ディレクトリ構造

```
data/manga/
├── _archive/2026-05-02-pre-redesign/   ← 旧 stage1-8 / work-1 bible
├── capability/
│   └── gpt-image-2.json
├── style-plates/
│   └── manga_bw_seinen_*.png
└── works/{slug}/
    ├── meta.json
    ├── bible/
    │   ├── snapshot.json
    │   └── refs/
    │       ├── characters/{char_id}/{variant}.png
    │       ├── locations/{loc_id}/{variant}.png
    │       ├── props/{prop_id}/{variant}.png
    │       └── _provenance.json
    ├── volumes/v{NN}/
    │   ├── plot.json
    │   └── kdp/{manuscript,cover}.pdf + metadata.json
    └── episodes/ep{NN}/
        ├── _brief.md
        ├── shotlist.json
        ├── storyboard.json
        ├── page_plan.json
        ├── resolved_refs.json
        ├── renders/p{NN}.png
        ├── bubbles/p{NN}.png
        ├── audit.json
        ├── repair_log.json
        └── _incremental_refs/
```

## 6. 確定スキーマ要点

### BibleSnapshotV2 (L1)
- meta / world (premise+rules+system+timeline+factions) / characters[] / locations[] / props[] / costumes[] / relations[] / style_directives / visual_motifs / continuity_seeds / volume_synopsis
- characters[].id 等は `char_xxx_v1` 形式、bible 内ユニーク

### RefsProvenance (L2)
- 各 ref に `source_type: bible_generated|manual_upload|kindle_archive|external_purchased` を必須
- `kindle_archive` は L7 で自動 reject (`isAllowedForProduction` ガード)

### EpisodeStoryboardV2 (L4)
- panel.entities.{characters[].character_id, location_id, props[], focus_entity_id} は bible.id への hard ref
- dialogue.character_id は panel.entities.characters に含まれていなければならない

### ResolvedRefs (L7)
- panel_id (or page_id) → ResolvedRefPacket
- 各 ref に role / target_entity_id / source / rationale 必須
- weight は capability.ref_weighting に応じる (現 gpt-image-2 = false → 1.0 固定)

## 7. L7 Refs Resolution 決定論ルール (RULE 1-10)

```
RULE 1  常時: + style_plate (weight 1.0)
RULE 2  close_up & 1キャラ: + char_face_front + char_face_diagonal(0.5)
RULE 3  medium & 1キャラ: + char_full_front + char_face_front(0.5)
RULE 4  wide & no character focus: + loc wide_establishing
RULE 5  over_shoulder: + char_full_back(0.5) + loc interior_eye_level
RULE 6  establishing & bleed: + loc wide_establishing のみ
RULE 7  on_screen_via=tv: + char tv_variant (なければ face_front)
RULE 8  continuity_group_ids 指定: 該当refを weight 1.0 で強制 (RULE 2-7 上書き)
RULE 9  multi-character (3+): focus_entity face/full + 脇役 outfit/full + その他 silhouette
RULE 10 budget 超過時優先: style > continuity_forced > focus_entity > キャラ > location
```

## 8. Capability Profile

`data/manga/capability/gpt-image-2.json` を render 前に必ず読込:
- ref_role_tagging / ref_weighting / ref_mask_binding / ref_negative — 全 false (現 gpt-image-2 image_gen API 経由では未対応)
- recommended_strategy = hybrid
- reference_image_optimal = 5 (Pilot 既知値)
- page_one_shot_success_rate = 0.95、panel_composite_success_rate = 0.88

## 9. KDP B6 仕様

- 本文ページ: 128×182mm = 1748×2480 px @ 350dpi
- 塗り足し込み: 138×192mm = 1843×2587 px
- 背幅 (POD 白黒): ページ数 × 0.0795 mm
- 表紙 PDF: 表+背+裏 一体、1748*2 + spine + 塗り足し
- 奥付ページ必須 (AI 使用開示文 含む)

## 10. CLI

```bash
# end-to-end
npx tsx scripts/manga/pipeline.ts \
  --slug a07-modern-dungeon --episode 1 \
  --concept data/manga/_archive/.../A07_v2.json \
  --brief-file data/manga/works/a07-modern-dungeon/episodes/ep01/_brief.md

# 単 layer 再実行
npx tsx scripts/manga/pipeline.ts --slug a07-modern-dungeon --episode 1 --layer L09 --force

# Phase 4 KDP
npx tsx scripts/manga/pipeline.ts \
  --slug a07-modern-dungeon --volume 1 --episodes 1 \
  --layer L13 --author "AINARO" --publication-date 2026-06-01
```

## 11. Codex/Claude red-team で撤回した設計

- ✗ Pre-Phase Capability Verification 12-24 枚 (API 側に role-tag/weight/mask 不在のため)
- ✗ L0 Init 独立 layer (meta.json + bible に集約)
- ✗ L4 Aux Bible 細分化 (snapshot 1ファイルで十分)
- ✗ L6 Episode Plot 独立 layer (shotlist で扱える)
- ✗ L10 Ref Selector 独立 layer (continuity-refs/resolver の拡張で十分)
- ✗ ResolvedRefs に mask/negative/bind を最初から含める (capability 確定後 optional 追加)
- ✗ stage4 storyboard JSON 変換器 (1週 vs 半日再生成、捨てて再生成判断)

## 12. 関連

- SSoT: `docs/plans/manga/pipeline-v2.md`
- 作法: `docs/strategy/manga_craft_guide.md`
- 戦略: `docs/strategy/platform_strategy_v4.md`, `project_kdp_strategy.md` (memory)
- ライブラリ: `src/lib/manga/README.md`
- スクリプト: `scripts/manga/README.md`
