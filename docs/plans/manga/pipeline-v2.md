# 漫画パイプライン v2 設計plan (SSoT)

**Status**: Active (2026-05-02 〜)
**Predecessor**: `_archive/pipeline-v1-2026-05-02.md` (旧 v1、stage1-8 手作業含む)
**Decision basis**: Codex + Claude エージェント red-team レビュー (2026-05-02)、L0-L17 大規模再設計を 12 layer に圧縮
**上位戦略**: `strategy.md` — 投資配分 (厚く/薄く) と陳腐化耐性の判断基準。新規 layer 着手前に必ず参照

## 設計原則

1. Single source of truth per layer — 各 layer は 1 モジュール / 1 スキーマ / 1 CLI エントリ
2. No legacy compat — stage1-8 / 旧 DB 経路 / 自由文字列 subjects は完全破棄
3. Hard fail over silent skip — bible 未登録キャラ・refs 解決失敗・schema 不一致は即停止
4. Asset by ID — ファイルパス直指定禁止、`asset_id` を主キーに `source_provenance` 強制
5. Snapshot-only — Phase A は JSON snapshot 経路に集約 (DB は Phase B で再評価)
6. Idempotent layer rerun — 各 layer は input hash でキャッシュ、変更分のみ再実行
7. Explicit capability dependency — render 前に `data/manga/capability/{model}.json` 読込必須

## 12 Layer 全体図

```
═══ PHASE 1: WORK SETUP (once / 作品) ═══
L1  Bible Snapshot         V2企画書 → bible/snapshot.json
L2  Bible Images           snapshot → bible/refs/{characters,locations,props}/

═══ PHASE 2: EPISODE PLANNING (per ep) ═══
L3  Shotlist               bible + ep_text → episodes/epNN/shotlist.json
L4  Storyboard             shotlist + bible → storyboard.json (entity_id binding hard required)
L5  Page Director          storyboard + capability → page_plan.json
L6  Continuity Resolve     page_plan + bible → page_plan + continuity_group_ids
L7  Refs Resolution        page_plan + bible/refs → resolved_refs.json
L8  Incremental Refs       resolved_refs.unresolved → bible/refs/_ep{N}/

═══ PHASE 2.5: NAME GATE (per ep, 人間判定) ═══
L8.5 Name Preview         storyboard + page_plan + bible/refs → name/p{NN}.svg + name_manifest.json + name_approval.json (all-pending)
                          + L8.6 audit を内部呼出し → name/name_audit.json
L8.6 Name Audit (rule)    audit-rules.ts (純TS、LLM 不使用) で 14 ルール検査
                          - dialogue_overflow / panel_overcrowd / panel_undercrowd / shot_repetition
                          - focus_entity_missing / ref_thumbnail_missing / dialogue_speaker_absent
                          - importance_imbalance / silent_run / bleed_overuse / reading_order_jump
                          - establishing_late / cliffhanger_role_mismatch / opening_hook_no_focus
                          warning 表示のみ。L9 gate は人間判定のみで走る (audit は gate しない)
L8.7 Name Approval        serve-ops.ts の ops console SPA で a/r 操作 → name_approval.json 上書き

═══ PHASE 3: RENDER (per ep) ═══
L9  Render                 page_plan + resolved_refs + name_approval (gate) → renders/p{NN}.png (吹き出し・ナレーション・擬音を画像内に焼き込み)
                          ※ approved 以外のページは skip / hard fail (--skip-name-gate で回避可)
L11 Audit                  renders + bible → audit.json
L12 Repair                 audit.failed → re-run L7-L9 for failed panels

═══ PHASE 4: PUBLISH (per volume) ═══
L13 KDP Package            volumes/vNN/episodes 全部 → kdp/{manuscript,cover}.pdf
```

## ディレクトリ構造

```
data/manga/
├── _archive/2026-05-02-pre-redesign/   ← 旧 stage1-8 退避先
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
    │   └── kdp/
    │       ├── manuscript.pdf
    │       ├── cover.pdf
    │       └── metadata.json
    └── episodes/ep{NN}/
        ├── shotlist.json
        ├── storyboard.json
        ├── page_plan.json
        ├── resolved_refs.json
        ├── name/                ← L8.5 出力 (SVG ネーム + manifest)
        │   ├── p{NN}.svg
        │   ├── name_manifest.json
        │   └── name_audit.json  ← L8.6 出力 (audit findings、warning のみ、gate しない)
        ├── name_approval.json   ← L8.7 出力 (人間 or migration 判定)
        ├── renders/p{NN}.png
        ├── audit.json
        ├── repair_log.json
        └── _incremental_refs/
```

## CLI

```bash
# end-to-end (L1 → L12)
npx tsx scripts/manga/pipeline.ts --slug a07-modern-dungeon --episode 1

# Phase 1 だけ
npx tsx scripts/manga/pipeline.ts --slug a07-modern-dungeon --to L2

# 単一 layer 再実行 (upstream は cache)
npx tsx scripts/manga/pipeline.ts --slug a07-modern-dungeon --episode 1 --layer L7 --force

# Volume 仕上げ
npx tsx scripts/manga/pipeline.ts --slug a07-modern-dungeon --volume 1 --layer L13

# === ネーム gate (L8.5 / L8.7 / L9 gate) ===
# ネーム生成 → ブラウザで承認 → L9 から再開
npx tsx scripts/manga/pipeline.ts --slug a07-modern-dungeon --episode 1 --to L08_5
npx tsx scripts/manga/serve-ops.ts --slug a07-modern-dungeon --episode 1
# → http://localhost:5174/works/a07-modern-dungeon/episodes/ep01/#name-gate で a/r 操作
npx tsx scripts/manga/pipeline.ts --slug a07-modern-dungeon --episode 1 --from L09

# 既存 ep を all-approved (migration) で初期化
npx tsx scripts/manga/migrate-name-approval.ts --slug a07-modern-dungeon --episodes 1-10

# gate 緊急回避 (推奨しない)
npx tsx scripts/manga/pipeline.ts --slug a07-modern-dungeon --episode 1 --layer L09 --skip-name-gate

# === reject 集計レポート (v2) ===
npx tsx scripts/manga/name-reject-report.ts                     # 全作品
npx tsx scripts/manga/name-reject-report.ts --slug a07-modern-dungeon --json

# === L5 v3 (importance/page_role/右綴じ) ===
# デフォルトは v3、明示的に v2 に戻す場合は --mapper v2
npx tsx scripts/manga/layers/L05-page-director.ts --slug a07-modern-dungeon --episode 1 --mapper v3
npx tsx scripts/manga/layers/L05-page-director.ts --slug a07-modern-dungeon --episode 1 --mapper v2
```

## 実装ファイル対応

| Layer | エントリ | コア実装 |
|---|---|---|
| L1 | `scripts/manga/layers/L01-bible.ts` | `src/lib/manga/bible/v2-adapter.ts` + `bible-snapshot.ts` |
| L2 | `scripts/manga/layers/L02-bible-images.ts` | `bible/character-images.ts` + `location-images.ts` + `provenance.ts` |
| L3 | `scripts/manga/layers/L03-shotlist.ts` | `shotlist/{scene-splitter, rhythm-curve, shot-planner}.ts` |
| L4 | `scripts/manga/layers/L04-storyboard.ts` | `storyboard/storyboard-builder-v2.ts` (entity_id hard required) |
| L5 | `scripts/manga/layers/L05-page-director.ts` (--mapper v2/v3) | `page-director-v2/page-mapper-v2.ts` (旧) / `page-director-v2/page-mapper-v3.ts` (現行、importance 非均等 + page_role 別 template + 右綴じ読順) |
| L6 | `scripts/manga/layers/L06-continuity-resolve.ts` | `page-director/continuity-resolver.ts` |
| L7 | `scripts/manga/layers/L07-refs-resolution.ts` | `page-director/continuity-refs-v2.ts` (shot_type 引数追加) |
| L8 | `scripts/manga/layers/L08-incremental-refs.ts` | `bible/character-images.ts` (variant 引数で個別生成) |
| L8.5 | `scripts/manga/layers/L08-5-name-preview.ts` | `name-preview/{svg-renderer, blocking-estimator, audit-rules, types}.ts` |
| L8.6 | (L8.5 から内部呼出) | `name-preview/audit-rules.ts` (rule-based、14 ルール、warning 表示のみ) |
| L8.7 | `scripts/manga/serve-ops.ts` (ops console SPA) | `ops-console/web/views/name-gate.ts` + `name-preview/types.ts` schema |
| Reject report | `scripts/manga/name-reject-report.ts` | `name_approval.json` + `name_audit.json` 集計 |
| L9 | `scripts/manga/layers/L09-render.ts` (name gate 内蔵) | `render/gpt-image-2-adapter.ts` + `generate/prompt-composer-v2.ts` |
| L11 | `scripts/manga/layers/L11-audit.ts` | `qa/{face-consistency, bubble-overlap, continuity-check}.ts` |
| L12 | `scripts/manga/layers/L12-repair.ts` | `repair/policy.ts` |
| L13 | `scripts/manga/layers/L13-kdp.ts` | `publish/kdp/{pdf-x1a, spine-calc, cover-composer, colophon-gen}.ts` |
| orchestrator | `scripts/manga/pipeline.ts` | (cache + force + dry-run) |

## A07 着手順序 (Week 1-5)

### Week 1: 基盤
1. ✅ stage1-8 / work-1 bible を `_archive/2026-05-02-pre-redesign/` へ
2. ✅ `data/manga/capability/gpt-image-2.json` を Pilot 既知値から起こし
3. ✅ `data/manga/works/a07-modern-dungeon/meta.json` 作成
4. ✅ 新 SSoT `pipeline-v2.md` (本ファイル)
5. `src/lib/manga/schemas.ts` v2 集約 (Zod)

### Week 2: Phase 1 (L1-L2)
6. `bible/v2-adapter.ts` — V2企画書 → snapshot 変換
7. `bible/provenance.ts` — kindle_archive reject ガード
8. A07 snapshot.json 生成
9. A07 character refs (5キャラ × 5 variants ≈ 25枚, Codex Pro 枠)
10. A07 location refs (4ロケ × 3 angles = 12枚)

### Week 3: Phase 2 (L3-L8)
11. `bible/source-loader.ts` を snapshot 起点へ
12. `storyboard-builder-v2.ts` (entity_id hard required)
13. `continuity-refs-v2.ts` (shot_type/camera 引数)
14. A07 ep1 を L3→L7 まで通す
15. L8 incremental refs

### Week 4: Phase 3 (L9-L12)
16. `render/gpt-image-2-adapter.ts`
17. `prompt-composer-v2.ts`
18. A07 ep1 22ページ render
19. `bubble/vertical/typesetter.ts`
20. ep1 22ページ bubble overlay
21. `qa/{bubble-overlap, continuity-check}.ts`
22. L11 audit + L12 repair

### Week 5: Phase 4 (L13)
23. `publish/kdp/{pdf-x1a, spine-calc, cover-composer, colophon-gen}.ts`
24. ep1 単体 KDP package テスト
25. SSoT/README 反映完了
26. ep2 着手準備

## 確定スキーマ

### bible/snapshot.json (L1)

```typescript
type BibleSnapshot = {
  schema_version: 2;
  meta: {
    slug: string;
    title: string;
    art_style: ArtStyle;
    genre: string;
    target_pages_per_volume: number;
    target_episodes_per_volume: number;
    target_pages_per_episode: number;
  };
  world: {
    premise: string;
    rules: string[];
    system: string;
    timeline: string;
    factions: Array<{ name: string; summary: string }>;
  };
  characters: Array<{
    id: string;
    name: string;
    role: "protagonist" | "heroine" | "antagonist" | "supporting";
    age_visual?: string;
    spec: CharacterSpec;
    attribute_classifier: AttributeClassifierLabels;
    continuity_anchors: string[];
    appears_in_volumes: number[];
  }>;
  locations: Array<{
    id: string;
    name: string;
    spec: LocationSpec;
    continuity_anchors: string[];
    appears_in_episodes: number[];
  }>;
  props: Array<{
    id: string;
    name: string;
    owner_character_id?: string;
    spec: PropSpec;
    continuity_anchors: string[];
  }>;
  costumes: Array<{
    id: string;
    character_id: string;
    valid_from_episode: number;
    valid_until_episode: number | null;
    spec: CostumeSpec;
  }>;
  relations: Array<{
    from_character_id: string;
    to_character_id: string;
    relation_type: string;
    description: string;
  }>;
  style_directives: {
    global: string;
    scene_overrides: Record<string, string>;
    overlay_rules: string[];
  };
  visual_motifs: Array<{ name: string; meaning: string; draw_directive: string }>;
  continuity_seeds: Array<{
    group_id: string;
    kind: "character_face" | "character_outfit" | "character_back"
        | "location_layout" | "prop" | "tv_variant";
    target_id: string;
    invariant_description: string;
  }>;
};
```

### bible/refs/_provenance.json

```typescript
type RefsProvenance = {
  schema_version: 1;
  refs: Array<{
    asset_id: string;
    path: string;
    source_type: "bible_generated" | "manual_upload" | "kindle_archive" | "external_purchased";
    rights_status: "ai_use_allowed" | "internal_only" | "blocked";
    created_by: "system" | string;
    created_at: string;
    derived_from: string[];
    license_note: string;
    qa_score?: number;
    training_candidate: boolean;
  }>;
};
```

### episodes/epNN/storyboard.json (L4, entity binding 強制)

```typescript
type EpisodeStoryboard = {
  schema_version: 2;
  episode_id: string;
  total_pages: number;
  pages: Array<{
    page_no: number;
    page_role: PageRole;
    panels: Array<{
      panel_id: string;
      panel_no: number;
      reading_order: number;
      shot_type: "close_up" | "medium" | "wide" | "establishing";
      camera: "eye_level" | "low_angle" | "high_angle" | "over_shoulder" | "birds_eye";
      bleed: boolean;
      silence: boolean;
      entities: {
        characters: Array<{
          character_id: string;          // bible.characters[].id 必須
          role: "speaker" | "listener" | "background" | "silhouette";
          on_screen_via: "in_person" | "tv" | "photo" | "phone";
          expression: string;
        }>;
        location_id: string;             // bible.locations[].id 必須
        props: Array<{ prop_id: string; held_by_character_id?: string }>;
        focus_entity_id: string;
      };
      action: string;
      key_visual: string;
      dialogue: Array<{ character_id: string; text: string }>;
      monologue: Array<{ character_id: string; text: string }>;
      narration: string[];
      sfx: string[];
      continuity_group_ids?: string[];   // L6 で注入
    }>;
  }>;
};
```

### episodes/epNN/resolved_refs.json (L7)

```typescript
type ResolvedRefs = {
  schema_version: 1;
  episode_id: string;
  capability_profile_id: string;
  render_strategy: "page_one_shot" | "panel_composite" | "hybrid";
  panels: Record<string, {
    scope: "panel" | "page";
    refs: Array<{
      asset_id: string;
      path: string;
      weight: number;                    // capability に応じて 1.0 固定もあり
      role: "style" | "character_face" | "character_full" | "character_back"
          | "character_outfit" | "location" | "prop" | "continuity_anchor"
          | "previous_panel" | "negative";
      target_entity_id?: string;
      source: "deterministic" | "continuity_forced" | "llm_judged" | "repair_forced";
      rationale: string;
    }>;
    budget: { max: number; optimal: number; used: number };
    truncated: boolean;
    unresolved_entities: string[];
    warnings: string[];
  }>;
};
```

## L7 Refs Resolution 決定論ルール

```
RULE 1  常時: + style_plate (weight 1.0)
RULE 2  shot_type=close_up & 1キャラ: + char_face_v1 + char_3view_v1(0.5)
RULE 3  shot_type=medium  & 1キャラ: + char_full_v1 + char_face_v1(0.5)
RULE 4  shot_type=wide & no character focus: + loc_v1
RULE 5  shot_type=over_shoulder: + char_full_v1(0.5) + loc_v1
RULE 6  shot_type=establishing & bleed: + loc_v1 のみ
RULE 7  on_screen_via=tv: + char_tv_variant_v1 (無ければ face)
RULE 8  continuity_group_ids 指定: 該当refを weight 1.0 で強制 (RULE 2-7 上書き)
RULE 9  multi-character (3+): focus_entity face/full、脇役 outfit/full、その他 silhouette
RULE 10 budget 超過時の優先: style > continuity_forced > focus_entity > キャラ > location
```

## KDP 詳細

### B6 サイズ
- 本文: 128×182mm = 1748×2480 px @ 350dpi
- 塗り足し込み: 138×192mm = 1843×2587 px

### 背幅計算
```
背幅 mm = ページ数 × 0.0795 (Amazon POD 白黒の場合)
背幅 px = 背幅 mm × (350 / 25.4)
```
表紙 cover = 表+背+裏+塗り足し12mm を一枚 PDF に。

### 入稿 PDF
- 本文: PDF/X-1a, CMYK, 350dpi
- 表紙: PDF/X-1a, CMYK, 表+背+裏一体
- メタ: ISBN (KDP 自動付与 OK)、ASIN、AI使用タグ (project_kakuyomu_ai_tag_mandate.md 同等)

### 奥付 / 版権ページ
- 著者名 (ペンネーム)
- 初版発行日
- 発行所 (個人 KDP の場合は著者名のみ)
- AI 使用開示文 (固定文言)

## 関連ドキュメント

- 旧 SSoT (アーカイブ): `docs/plans/manga/_archive/pipeline-v1-2026-05-02.md`
- メモリ: project_horizontal_manga_pivot / project_kdp_strategy / project_pilot_complete_2026-05-01 / project_chatgpt_pro_image_gen / feedback_no_anthropic_api / feedback_quality_over_novelty
- 作品メタ: `data/manga/works/a07-modern-dungeon/meta.json`
- capability: `data/manga/capability/gpt-image-2.json`

## 撤回したもの (記録)

- ✗ Pre-Phase Capability Verification 12-24枚: API側に role-tag/weight/mask が無い → false 確定で測りようがない、Pilot 既知値で代替
- ✗ L0 Init を独立 layer 化: meta.json + bible に集約
- ✗ L4 Aux Bible 細分化: snapshot 1ファイルで十分
- ✗ L6 Episode Plot 独立 layer 化: shotlist/scene-splitter で扱える
- ✗ Ref Selector 独立 layer 化: continuity-refs/resolver の拡張で十分
- ✗ ResolvedRefs に mask_binding/negative_ref 最初から含める: capability 確定後に optional 追加
- ✗ stage4 storyboard JSON の変換器: 1週間 vs 半日再生成、捨てて再生成判断
