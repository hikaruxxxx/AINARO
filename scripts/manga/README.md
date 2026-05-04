# scripts/manga/ 構造 (v2)

横読み白黒漫画パイプライン v2 のスクリプト群。
SSoT: `~/.claude/plans/manga-pipeline-v2.md`

## 12-Layer パイプライン

```
═══ PHASE 1: WORK SETUP (once / 作品) ═══
L01 bible-snapshot       layers/L01-bible.ts        ← V2企画書 → bible/snapshot.json
L02 bible-images         layers/L02-bible-images.ts ← snapshot → bible/refs/

═══ PHASE 2: EPISODE PLANNING (per ep) ═══
L03 shotlist             layers/L03-shotlist.ts          ← bible + brief → shotlist
L04 storyboard           layers/L04-storyboard.ts        ← shotlist + bible → storyboard (entity_id 強制)
L05 page-director        layers/L05-page-director.ts     ← storyboard + capability → page_plan
L06 continuity-resolve   layers/L06-continuity-resolve.ts← page_plan + bible → +continuity_group_ids
L07 refs-resolution      layers/L07-refs-resolution.ts   ← page_plan + bible/refs → resolved_refs
L08 incremental-refs     layers/L08-incremental-refs.ts  ← resolved_refs.unresolved → bible/refs/_ep{N}/

═══ PHASE 3: RENDER (per ep) ═══
L09 render               layers/L09-render.ts            ← page_plan + resolved_refs → renders/p{NN}.png
L10 bubble               layers/L10-bubble.ts            ← renders + storyboard.dialogue → bubbles/p{NN}.png
L11 audit                layers/L11-audit.ts             ← bubbles + bible → audit.json
L12 repair               layers/L12-repair.ts            ← audit.failed → re-run L9-L10

═══ PHASE 4: PUBLISH (per volume) ═══
L13 kdp                  layers/L13-kdp.ts               ← volumes/v{NN}/episodes 全部 → kdp/{manuscript,cover}.pdf
```

## オーケストレーター

```bash
# end-to-end (L01 → L12)
npx tsx scripts/manga/pipeline.ts \
  --slug a07-modern-dungeon --episode 1 \
  --concept data/manga/_archive/.../A07_v2.json \
  --brief-file data/manga/works/a07-modern-dungeon/episodes/ep01/_brief.md

# 単一 layer 再実行
npx tsx scripts/manga/pipeline.ts --slug a07-modern-dungeon --episode 1 --layer L09 --force

# Volume 仕上げ (KDP)
npx tsx scripts/manga/pipeline.ts \
  --slug a07-modern-dungeon \
  --volume 1 --episodes 1 \
  --layer L13 \
  --author "AINARO" \
  --publication-date 2026-06-01
```

## 既存スクリプト (v1)

v1 build-bible.ts / generate-shotlist.ts / generate-storyboard.ts / page-director-smoketest.ts / generate-panels.ts は
v2 化のため layers/L0N-*.ts に置き換えられた。v1 は scripts/manga/ ルートに残置するが、Phase A 検証では使わない。

## 取り込み系 (継続利用)

- `ingest-kindle.ts` — Kindle 素材取り込み
- `ingest-manual.ts` — 手動素材取り込み
- `extract-from-video.ts` — 動画素材抽出

## 評価ベンチ (継続利用)

- `eval-bench/run-phase-a.ts`
- `eval-bench/runner-fal.ts`
- `eval-bench/runner-replicate.ts`

## アーカイブ

- `_archive/feasibility-week0/` — Week 0 Pilot 完了済 (2026-05-01)

## 関連

- 設計 (SSoT): `~/.claude/plans/manga-pipeline-v2.md`
- 旧設計 (アーカイブ): `~/.claude/plans/_archive-2026-05-02-codex-swift-kettle.md`
- ライブラリ: `src/lib/manga/`
- 作法: `docs/strategy/manga_craft_guide.md`
- データ: `data/manga/`
