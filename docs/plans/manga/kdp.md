# B-1 領域 (KDP特化) 実装計画 — Codexレビュー反映版

## Context

AINARO は 2026-04-30 に「自社Web配信 → Amazon KDP/KU専業」へピボット。Phase A 横読み白黒漫画 3作品並行 (a07-modern-dungeon / 残り2作品) で、ChatGPT Pro $200/月枠でAPI課金ゼロ運用。

### 戦略前提 (2026-05-05 確定)

- **完全KDP専業**: Web配信基盤・外部読者資産は構築しない。開発リソースをKDP最適化に100%集中
- **Track Bスコープ縮小**: 200-400件 anchor pool は overkill。30件の競合棚リストへ
- **Day1-5順序**: Codexレビュー指摘 (kdp-release.json優先 / preflight必須 / 79p未満背表紙テキスト禁止) を採用

### 直近ゴール

a07-modern-dungeon vol1 を実際にKDPに通すこと。中期は5年で10億円EXIT (買い手筆頭は集英社/講談社/KADOKAWA)。

### Codexレビュー (2026-05-04) で判明した致命点

1. 79ページ未満の背表紙テキストはKDP却下対象 → 元案A1-1 (背表紙縦書き) は優先順位逆転
2. AI開示は自由文ではなくKDP公式区分 (text/images/translation) に対応するチェックリスト必須
3. KDP/KU専業の「逃げ道なし」リスク: アカウント停止 / AI審査強化 / カテゴリ変更 / KENPC計算変更 / 広告単価上昇
4. 抜け漏れ: kdp-release.json入稿台帳、Amazon Ads運用、税務台帳、レビュー/海賊版対応、provenance dossier強化

### 4トラック構成

- **Track A**: L13 KDPパイプライン強化 (出版を通す最短経路に絞る)
- **Track B**: 30件競合棚リスト (anchor poolはPhase B以降へ)
- **Track C**: スキーマ + provenance + AI生成タグ + 冪等性監査
- **Track D** (新設): 入稿オペレーション台帳 + 防衛資産 (規約/税務/広告/レビュー/海賊版)

---

## 現状到達点 (Phase 1探索結果サマリ)

### L13 KDP (Track A)
- ✅ B6 manuscript.pdf / spine-calc / cover-composer / colophon-gen MVP実装済 ([scripts/manga/layers/L13-kdp.ts](scripts/manga/layers/L13-kdp.ts))
- ✅ KdpMetadata 型 ([schemas-v2.ts L442-458](src/lib/manga/schemas-v2.ts#L442-L458))
- ⚠️ 表紙暫定処理: `coverFront = allPages[0]` ([L13-kdp.ts L96](scripts/manga/layers/L13-kdp.ts#L96)) → KDP不可
- ❌ 79p未満背表紙テキスト禁止のpreflightなし、AI開示は自由文ハードコード ([L13-kdp.ts L130](scripts/manga/layers/L13-kdp.ts#L130))

### スキーマ・provenance (Track C)
- ✅ provenance.ts は kindle_archive reject 動作 ([provenance.ts L59](src/lib/manga/bible/provenance.ts#L59))
- ❌ schemas-v2.ts Zod化 0% / ai_usage_level Supabase未実装 / input hash冪等性 10%

---

## Track A: L13 KDPパイプライン強化 (出版を通す最短経路)

### A-1. Day 1-5: a07 vol1 実入稿 (Codex提案順)

| Step | 作業 | 主要ファイル | LLM進化耐性 |
|---|---|---|---|
| **A1-1** | `kdp-release.json` 入稿台帳 (タイトル/著者/説明/カテゴリ/キーワード/AI区分/価格/KU有無/発売日/広告開始日/プレビューワ指摘/修正履歴/ASIN を1ファイル集約) | 新規 [src/lib/manga/publish-v2/kdp/release-ledger.ts](src/lib/manga/publish-v2/kdp/release-ledger.ts) / 永続先 `data/manga/works/{slug}/volumes/v{NN}/kdp/kdp-release.json` | ◎ |
| **A1-2** | preflight: ページ数 / **79p未満背表紙テキスト強制禁止** / 背幅 / 裁ち落とし3mm / 表紙PDF寸法 / 本文PDF寸法 / 画像DPI≥300 / 空白ページ / 奥付存在 / AI開示 / ファイル存在 | 新規 [src/lib/manga/publish-v2/kdp/preflight.ts](src/lib/manga/publish-v2/kdp/preflight.ts) |  ◎ |
| **A1-3** | 表紙外部入力フック: `volumes/v{NN}/kdp/inputs/cover-front.png` 必須化、本文1ページ目流用を**禁止** | [L13-kdp.ts L96](scripts/manga/layers/L13-kdp.ts#L96) 修正 + `loadRequiredCoverInputs(slug, vol)` 追加 | ◎ |
| **A1-4** | AI開示構造化 (KDP公式区分): `ai_disclosure: { text, images, translation, cover, interior }` の5フィールドbool化 + KDP管理画面チェックリスト形式 | [schemas-v2.ts L442-458](src/lib/manga/schemas-v2.ts#L442-L458) `KdpMetadata` 拡張 + 新規 [src/lib/manga/disclosure.ts](src/lib/manga/disclosure.ts) | ◎ |
| **A1-5** | `kdp-input.md` 管理画面コピペ用Markdown生成 (タイトル/サブタイトル/Description HTML/7キーワード/2カテゴリ/ISBN/出版日/AI開示) | 新規 [src/lib/manga/publish-v2/kdp/kdp-input-md.ts](src/lib/manga/publish-v2/kdp/kdp-input-md.ts) | ◎ |
| **A1-6** | a07 vol1 実入稿リハーサル → KDPプレビューワ指摘を `kdp-release.json` に記録 | `npx tsx scripts/manga/layers/L13-kdp.ts --slug a07-modern-dungeon --volume 1 --episodes 1 --allow-short-volume` | — |

**変更点 (元案からの差分)**:
- ❌ 削除: 元案A1-1 (背表紙日本語縦書き) → 79p未満で禁止項目のためWeek3以降へ後ろ倒し
- ✅ 追加: A1-1 入稿台帳、A1-2 preflightで79p未満背表紙禁止を最優先化
- ✅ 強化: A1-3 表紙外部入力を**必須化** (元案は「あれば優先」)、A1-4 AI開示は5区分bool化

### A-2. Week 2-3: 量産化層 (3作品×複数巻)

| Step | 作業 | 方針 |
|---|---|---|
| A2-1 | シリーズ設定スキーマ `KdpSeries` (asin_by_volume等) | [schemas-v2.ts](src/lib/manga/schemas-v2.ts) 追加、永続 `data/manga/works/{slug}/kdp-series.json` |
| A2-2 | ASIN登録/奥付再生成 | 新規 [scripts/manga/layers/L13b-kdp-asin-register.ts](scripts/manga/layers/L13b-kdp-asin-register.ts) |
| A2-3 | BISAC/7キーワード/description: **手動運用、構造化テンプレのみ** | 新規 `data/manga/kdp/bisac-map.json` (ジャンル→BISAC手書きマップ) のみ。生成器 (keywords-gen.ts / description-gen.ts) は作らない |

**Codex指摘反映**: 元案A2-3〜A2-5 (BISAC動的選定 / 7キーワード生成 / description自動生成) は3作品段階では手動で十分、LLM進化で陳腐化する領域なので**コード化しない**。kdp-input.md のテンプレ穴埋め欄だけ用意し、手動入力。

### A-3. Week 4+: 計測層 (KDP売上→意思決定フィードバック)

| Step | 作業 | 主要ファイル |
|---|---|---|
| A3-1 | KDP月次レポートCSV取込 (KENPC v3.0 / Royalty / UnitsSold) | 新規 [scripts/manga/ingest-kdp-report.ts](scripts/manga/ingest-kdp-report.ts) → 既存 `MangaKpiRow` 拡張 |
| A3-2 | BSR スクレイピング (1日1回、robots.txt準拠、30 req/min上限) | 新規 [scripts/manga/scrape-bsr.ts](scripts/manga/scrape-bsr.ts) |
| A3-3 | 巻別実績集計 (表紙CTR / CVR / KENPC回収 / 広告KW別ROAS) | 新規 [src/lib/manga/kpi/volume-performance.ts](src/lib/manga/kpi/volume-performance.ts) |

### A-4. 後回し (実績次第)

- A+コンテンツ / 多言語英語ASIN / CMYK厳格化 / volume-state巻跨ぎ整合性 / keywords-gen自動化
- 起動条件: a07 vol1 で30日KENPC実績が出てから

---

## Track B: 30件競合棚リスト (anchor pool は Phase B以降)

200-400件 anchor pool / Bradley-Terry校正 / manga-bsr-watcher は **Phase B (作品30超) で再検討**。MVP段階では下記のみ。

### B-1. 30件競合棚リスト (Week 2-3)

**入力**: 新規 [data/manga/market-shelf/competitors.json](data/manga/market-shelf/competitors.json) (手動キュレーション 30-50件)
- shape: `asin / title / cover_thumb_url / description / review_count / rating / category_path / kindle_unlimited / price / publication_date / volume_count / bsr_snapshot_at`
- 9サブジャンル × 3-5件 = 30-50件

**用途**:
- 発売前の企画判断: 表紙・タイトル・商品説明・第1話フックの**定性比較のみ**
- BSR median長期取得は不要 (3作品段階では揺れノイズが大きく価値が低い)

**新規ファイル**:
- 手動キュレーション: スプレッドシート → JSON変換のみ
- 補助スクリプト: 新規 [scripts/manga/market-shelf-card.ts](scripts/manga/market-shelf-card.ts) (各ASIN→競合カードMarkdown生成)

**LLM進化耐性**: 競合メタデータDB自体は陳腐化しない。Phase B移行時に anchor pool への昇格パスを残す (`competitors.json` → `data/generation/manga-anchors/{genre}/anchors.json` のスキーマ互換性を意識)。

---

## Track C: スキーマ + provenance + AI生成タグ + 冪等性監査

### C-1. Week 2: MVP

**Zod化対象** (3型に絞る):
1. **`KdpMetadata`** ([L442](src/lib/manga/schemas-v2.ts#L442)) — L13出力 fail-fast
2. **`RefProvenanceEntry / RefsProvenance`** ([L185-206](src/lib/manga/schemas-v2.ts#L185-L206)) — production gate根拠
3. **`MetaJson`** (work meta.json、新規Zod schema) — L13入力検証

**新規ファイル**:
- [src/lib/manga/schemas-v2.zod.ts](src/lib/manga/schemas-v2.zod.ts) (~250行) — 上記3型のみZod schema、`.passthrough()` で未定義列許容
- TypeScript型を source of truth、Zod は L13/L7 の2入口で `.parse()` のみ

**provenance dossier強化** ([schemas-v2.ts L177-214](src/lib/manga/schemas-v2.ts#L177-L214) 拡張):
- `RefSourceType` に追加: `external_purchased` / `bible_image_repaired_v2`
- `RefProvenanceEntry` に追加項目 (Codex指摘):
  - `generation_prompt: string` (画像生成プロンプト全文)
  - `model_name: string` / `model_version: string`
  - `generation_timestamp: string`
  - `edit_history: { editor: string; timestamp: string; reason: string }[]`
  - `purchase_record_id?: string` (購入素材のライセンス番号)
  - `commercial_use_clause?: string` (商用利用条件文)
  - `trademark_check_status: 'pending' | 'passed' | 'flagged'` (商標・既存IP類似チェック結果)
  - `learning_source_chain: string[]` (学習元素材の transitive 追跡)
- [provenance.ts L59 `isAllowedForProduction`](src/lib/manga/bible/provenance.ts#L59) を **transitive reject** + **trademark_check必須化**

**AI生成タグ正規化** (Supabase migration):
- 新規 [supabase/migrations/20260505000000_manga_ai_usage_level.sql](supabase/migrations/20260505000000_manga_ai_usage_level.sql)
  ```sql
  ALTER TABLE manga_works ADD COLUMN ai_usage_level TEXT NOT NULL DEFAULT 'full_ai'
    CHECK (ai_usage_level IN ('full_ai','ai_assisted','human'));
  ALTER TABLE manga_works ADD COLUMN kdp_ai_disclosure_text BOOLEAN NOT NULL DEFAULT true;
  ALTER TABLE manga_works ADD COLUMN kdp_ai_disclosure_images BOOLEAN NOT NULL DEFAULT true;
  ALTER TABLE manga_works ADD COLUMN kdp_ai_disclosure_translation BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE manga_works ADD COLUMN kdp_ai_disclosure_cover BOOLEAN NOT NULL DEFAULT true;
  ALTER TABLE manga_works ADD COLUMN kdp_ai_disclosure_interior BOOLEAN NOT NULL DEFAULT true;
  ```
- KDP公式5区分にbool列を1対1対応 (Codex指摘: 自由文ではなくチェックリスト必須)

**冪等性 input hash (監査ログ用途に変更)**:
- 新規 [src/lib/manga/cache/input-hash.ts](src/lib/manga/cache/input-hash.ts) (~120行)
- L1-L8: SHA256 digest による cache skip (決定論的)
- **L9以降: hash記録のみ、skip対象外** (画像生成乱数で非決定論、Codex指摘反映)
- 用途は「再生成必要性の参考情報」「監査ログ」に限定

### C-2. 後回し

- volume-state 巻跨ぎ整合性 → 2巻目着手時に判断
- Zod漸進化全面展開 → Week5以降

---

## Track D (新設): 入稿オペレーション台帳 + 防衛資産

Codex指摘の抜け漏れ対応。1人開発でもKDP専業の「逃げ道なし」リスクを最低限ヘッジする領域。

### D-1. Week 2: 入稿オペレーション台帳

`kdp-release.json` (Track A1-1) が中核。各巻に対して以下を1ファイル集約:
```typescript
type KdpRelease = {
  schema_version: 1;
  slug: string;
  volume_no: number;
  status: 'draft' | 'preflight_ok' | 'submitted' | 'published' | 'unpublished';
  manuscript_pdf_path: string;
  cover_pdf_path: string;
  ai_disclosure: { text: bool; images: bool; translation: bool; cover: bool; interior: bool };
  rights_check: { trademark_passed: bool; ip_similarity_passed: bool; checked_at: string };
  kdp_inputs: { title, subtitle, description_html, keywords[7], categories[2], isbn?, asin? };
  pricing: { price_jpy: number; ku_enrolled: bool; royalty_plan: '35'|'70' };
  schedule: { published_at?: string; ad_start_at?: string };
  preview_log: { reviewed_at: string; issues: string[]; resolved: bool }[];
  edit_history: { timestamp: string; field: string; old: any; new: any }[];
};
```

### D-2. Week 4+: 防衛資産

| 領域 | 内容 | 優先度 |
|---|---|---|
| **Amazon Ads (AMS) 運用** | 少額テスト設計 / KW・ASINターゲ / 除外語 / 日次上限 / 表紙CTR / CVR / KENPC回収。`data/manga/works/{slug}/ads/` に運用ログ | Week 4 (vol1発売後) |
| **税務・インボイス台帳** | KDP税務情報 / 源泉 / 消費税・インボイス / 帳簿 / 広告費 / 外注費 / 素材購入記録。Markdownで `data/business/ledger/{YYYY-MM}.md` 蓄積。コード不要 | Week 2 (発売前から) |
| **アカウント停止リスク対策** | (a) AI開示の完全準拠 (Track A1-4で対応済) (b) 商標・既存IP類似チェック (Track C `trademark_check_status` で対応済) (c) **副アカウント運用は規約違反のため不採用** | Track A/Cに統合 |
| **レビュー対策** | Amazonレビュー規約に抵触しない範囲の読者導線 (依頼文ではなく自然な誘導)。`data/manga/works/{slug}/review-policy.md` にチェック項目 | Week 4 |
| **海賊版対応** | 発売後の定期検索 (Google検索 + DMCA削除依頼テンプレ)。`scripts/manga/search-piracy.ts` 月次実行 | Week 8+ (発売1ヶ月後) |

### D-3. Phase B以降

- 商標・既存IP類似チェック自動化 (現状は手動)
- 価格・KU動向のA/B (KDP内ASIN分割で粗いA/B可能)

---

## マイルストーン

| 期間 | 内容 |
|---|---|
| **Day 1-3** | A1-1 (kdp-release.json) / A1-2 (preflight 79p未満背表紙禁止) / A1-3 (表紙外部入力必須化) / A1-4 (AI開示5区分) / A1-5 (kdp-input.md) |
| **Day 4-5** | A1-6 a07 ep1 強引にvol0として実入稿リハーサル → プレビューワ指摘記録 |
| **Week 2** | C-1 (Zod 3型 + provenance dossier強化 + ai_usage_level migration + input hash監査ログ) / D-1 (kdp-release.json運用) / D-2 (税務台帳開始) |
| **Week 2-3** | A-2 量産化 (シリーズスキーマ + ASIN登録、生成器は作らない) / B-1 (30件競合棚リスト手動キュレーション) |
| **Week 3-4** | a07 vol1 ep1-7 render完了次第、本入稿 |
| **Week 4+** | A-3 KDP売上計測 / D-2 Amazon Ads運用開始 (vol1発売後) |
| **Week 8+** | D-2 海賊版定期検索 |
| **Phase B (作品30超)** | Track B anchor pool化 / volume-state巻跨ぎ / 多言語英語ASIN |

---

## LLM進化耐性 (B-1選定根拠の最終確認)

| 項目 | 陳腐化耐性 | 備考 |
|---|---|---|
| Track A1 物理規格・規約・preflight | ◎ | KDP仕様 |
| Track A2 シリーズスキーマ・ASIN管理 | ◎ | Amazon ID体系 |
| Track A3 KDP売上計測 (CSV取込/BSR) | ◎ | Amazonレポート規格 |
| Track A2-3 BISAC/keywords/description自動生成 | ✗ 手動運用に降格 | LLM進化で陳腐化、3作品では手動で十分 |
| Track B 30件競合棚リスト | ◎ | 公開メタデータDB |
| Track C provenance dossier (商標/プロンプト/モデル/編集履歴) | ◎ | 法務監査要件 |
| Track C ai_usage_level正規化 (KDP公式5区分) | ◎ | KDP規約準拠 |
| Track C input-hash (監査ログ用途) | ◎ | workflow効率 |
| Track D kdp-release.json入稿台帳 | ◎ | アカウント防衛・EXIT監査 |
| Track D 税務・Amazon Ads・海賊版対応 | ◎ | 事業運用 |

全項目でLLM進化耐性あり。Codex指摘で陳腐化リスクが高いと判明した A2-3 (生成器3つ) は手動運用に降格。

---

## Critical Files

### 新規作成

**Track A**:
- `src/lib/manga/publish-v2/kdp/release-ledger.ts` (A1-1)
- `src/lib/manga/publish-v2/kdp/preflight.ts` (A1-2)
- `src/lib/manga/publish-v2/kdp/kdp-input-md.ts` (A1-5)
- `scripts/manga/layers/L13b-kdp-asin-register.ts` (A2-2)
- `data/manga/kdp/bisac-map.json` (A2-3)
- `scripts/manga/ingest-kdp-report.ts` (A3-1)
- `scripts/manga/scrape-bsr.ts` (A3-2)
- `src/lib/manga/kpi/volume-performance.ts` (A3-3)

**Track B**:
- `data/manga/market-shelf/competitors.json` (B-1)
- `scripts/manga/market-shelf-card.ts` (B-1)

**Track C**:
- `src/lib/manga/schemas-v2.zod.ts` (C-1)
- `src/lib/manga/cache/input-hash.ts` (C-1)
- `src/lib/manga/disclosure.ts` (C-1, A1-4と兼用)
- `supabase/migrations/20260505000000_manga_ai_usage_level.sql` (C-1)

**Track D**:
- `data/business/ledger/{YYYY-MM}.md` (D-2税務台帳、空フォルダ作成)
- `scripts/manga/search-piracy.ts` (D-2 Week8+)

### 既存変更
- `scripts/manga/layers/L13-kdp.ts` (A1-3表紙必須化 / A1-4 AI開示構造化 / C-1 Zod parse統合)
- `src/lib/manga/schemas-v2.ts` (A1-4 KdpMetadata拡張 / A2-1 KdpSeries / C-1 RefProvenanceEntry拡張)
- `src/lib/manga/publish-v2/kdp/cover-composer.ts` (A1-3 表紙必須化、背表紙縦書きはWeek3以降)
- `src/lib/manga/bible/provenance.ts` (C-1 transitive reject + trademark_check必須化)
- `scripts/manga/pipeline.ts` (C-1 input-hash統合、L9以降は記録のみ)
- `scripts/manga/layers/_paths.ts` (A2-1 kdpSeriesPath)

### 削除/不採用
- ❌ 元案 `keywords-gen.ts` / `description-gen.ts` / `bisac-picker.ts` (LLM進化で陳腐化、手動運用)
- ❌ 元案 `volume-state.ts` (Phase B移行)
- ❌ 元案 `L13d-translate-en.ts` / `kdp_en/` (実績次第、後回し)
- ❌ 元案 `build-manga-anchor-pool.ts` / `calibrate-manga-anchors.ts` / `manga-bsr-watcher.ts` (Phase B移行、30件競合棚で代替)

---

## Verification

### Phase 1検証 (Day 5)
```bash
# preflight 検証
npx tsx scripts/manga/layers/L13-kdp.ts \
  --slug a07-modern-dungeon --volume 1 --episodes 1 \
  --allow-short-volume

# 期待される失敗ケース:
#   - 表紙画像未配置 → A1-3 で必須化
#   - 79p未満で背表紙テキスト指定 → A1-2 preflight で却下
#   - AI開示5区分のいずれか未設定 → A1-4 で fail-fast

# 期待される成功時の出力:
#   data/manga/works/a07-modern-dungeon/volumes/v01/kdp/
#     ├── manuscript.pdf (B6 350dpi)
#     ├── cover.pdf (背表紙テキストなし、79p未満想定)
#     ├── kdp-input.md (KDP管理画面コピペ用)
#     ├── kdp-release.json (入稿台帳)
#     └── metadata.json (構造化AI開示含む)
# → KDPプレビューワに手動アップロード→指摘を kdp-release.json.preview_log に記録
```

### Phase 2検証 (Week 3)
```bash
# Zod parse 強制
npx tsx -e "
import { KdpMetadataSchema, RefsProvenanceSchema } from './src/lib/manga/schemas-v2.zod';
import { readFileSync } from 'fs';
KdpMetadataSchema.parse(JSON.parse(readFileSync('./data/manga/works/a07-modern-dungeon/volumes/v01/kdp/metadata.json', 'utf-8')));
RefsProvenanceSchema.parse(JSON.parse(readFileSync('./data/manga/works/a07-modern-dungeon/bible/refs/_provenance.json', 'utf-8')));
"

# Migration 適用
npx supabase db push

# input-hash動作確認 (2回目で skip)
npx tsx scripts/manga/pipeline.ts --slug a07-modern-dungeon --episode 1 --to L8
npx tsx scripts/manga/pipeline.ts --slug a07-modern-dungeon --episode 1 --to L8  # cache hit
```

### Phase 3検証 (Week 4+)
```bash
# KDPレポートCSV取込
# 1. 手動DL: KDPレポート画面 → data/manga/works/a07-modern-dungeon/kdp/reports/2026-05.csv
npx tsx scripts/manga/ingest-kdp-report.ts --slug a07-modern-dungeon --month 2026-05

# BSR scraping
npx tsx scripts/manga/scrape-bsr.ts --slug a07-modern-dungeon
# → data/manga/works/a07-modern-dungeon/kdp/bsr-history.jsonl

# 巻別実績集計
npx tsx -e "
import { aggregateVolumePerformance } from './src/lib/manga/kpi/volume-performance';
console.log(await aggregateVolumePerformance('a07-modern-dungeon', 1));
"
```
