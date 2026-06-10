# ネーム gate 導入計画 (L8.5 / L8.7 / L9 gate)

**Status**: ARCHIVED (2026-05-05) — Phase 2C で ops console SPA に統合済み。serve-name.ts shim と旧 inline HTML は撤廃。現役の操作 UI は `npx tsx scripts/manga/serve-ops.ts --slug ... --episode N` → `http://localhost:5174/works/{slug}/episodes/epNN/#name-gate`。本ドキュメントは初期計画の歴史記録として残置。
**SSoT 関連**: `docs/plans/manga/pipeline-v2.md` の追補
**Codex thread**: 019df56b-f62c-79e2-990b-84d8c66b1e4d (2026-05-05)

## Context

漫画パイプライン v2 (12-layer) では、ユーザーが視覚的に作品の優劣を判断できる最初のチェックポイントが L9 Render (gpt-image-2 経由、1ページ ≈ 1分、Codex Pro 月枠も消費) しか存在しない。L1-L8 は全て JSON 出力で、ストーリーフロー・コマ割り・台詞密度・キャラ配置の善し悪しを JSON から目で確認するのは不可能に近い。

結果として:
- 「このネームつまらない」「コマ割りが読みにくい」「キャラ配置がおかしい」を発見するために L9 を回す必要がある = 時間と Codex Pro 枠を消費
- L9 後に reject されると L3-L9 全部やり直し
- ユーザーの判断速度 = パイプラインの iteration 速度 = 最終品質を決定する

商業漫画家が「ネームで OK 判断 → 清書」というプロセスを踏むのに対し、現状のパイプラインは清書に飛んでから判定する構造になっている。

**目的**: L9 Render に到達する前に、SVG ベースの軽量ネーム表現と人間承認ゲートを挿入し、ページ単位で 1-2 分で reject できるイテレーションループを作る。L9 を「探索」から「承認済み清書」に変える。

## 設計判断 (Codex 議論結果)

1. **A (SVG ネーム) と C (HTML 承認 UI) は一体施策として扱う**。SVG だけだと「見られる」だけで pipeline の制御点にならない。承認状態を `name_approval.json` として永続化し、L9 が承認済みページのみ render する gating 機構までを v1 とする。
2. **B (低解像度 quick render) は通常フローに組み込まない**。「表紙級・初登場・戦闘見開き・A で判断不能」なページのみ明示的に呼ぶ pilot command として 2週目以降に追加。常用すると第二の L9 になる。
3. **D (pre-render audit) は最初は rule-based、LLM は Phase 2**。台詞密度・コマ数・重要度配分・読順破綻・focus_entity 不在は決定論で落とせる。LLM は「物語として面白いか」だけに絞り、v2 で導入。
4. **L4 storyboard schema の blocking 拡張 (foreground/background/gaze/bubble_zones) は v1 必須にしない**。v1 SVG renderer 側で speaker/listener/focus から疑似 blocking を推定する。本格導入は L4 storyboard-builder のプロンプト負荷と failure mode を見ながら v2 以降。
5. **L5 page-mapper-v2 の表現力強化 (importance 非均等・page_role 別テンプレ・右綴じ読順) は L8.5 導入後に着手**。先に L8.5 で問題を可視化し、reject 理由集計から実データに基づいて優先度を決める。

## 1週間スコープ (v1: ネーム gate 配管)

最初の成功条件は「**L9 を回す前に 22 ページを 1-2 分で reject できること**」。これに直接効かない施策は v2 へ。

### 新規 layer

| Layer | 役割 | 入力 | 出力 |
|---|---|---|---|
| **L8.5 Name Preview** | SVG ネーム + index.html 静的生成 | storyboard.json + page_plan.json + bible.snapshot.json + bible/refs | `episodes/ep{NN}/name/p{NN}.svg`, `name/index.html`, `name/name_manifest.json` |
| **L8.7 Name Approval** | 人間判定の収集と永続化 | (人間の操作) | `episodes/ep{NN}/name_approval.json` |
| L9 (改修) | 承認済みページのみ render | `name_approval.json` 必須 | (既存出力) |

### 実装ファイル

| ファイル | 内容 |
|---|---|
| `scripts/manga/layers/L08-5-name-preview.ts` | L8.5 CLI エントリ。`--slug X --episode N` |
| `scripts/manga/serve-name.ts` | L8.7 用ローカル HTTP server。preview を serve + `POST /api/name-approval` |
| `scripts/manga/migrate-name-approval.ts` | 既存 ep1-10 を all-approved (`approval_source: "migration"`) で初期化 |
| `src/lib/manga/name-preview/svg-renderer.ts` | コア SVG レンダラ。純TS、依存は最小 |
| `src/lib/manga/name-preview/index-html.ts` | name/index.html ビルダー (キーボード a/r 操作 + reject 理由 select) |
| `src/lib/manga/name-preview/blocking-estimator.ts` | speaker/listener/focus_entity から疑似 blocking 推定 |
| `src/lib/manga/name-preview/types.ts` | NameApproval / NamePageStatus schema |
| `scripts/manga/layers/L09-render.ts` (改修) | name_approval.json 読込 + gate ロジック |
| `scripts/manga/pipeline.ts` (改修) | ALL_LAYERS に L08_5 / L08_7 を追加、orchestrator の選択ロジック調整 |
| `docs/plans/manga/pipeline-v2.md` (改修) | 12-layer 図に L8.5/L8.7 を追記、L9 gate 仕様を反映 |

### 確定スキーマ

```ts
// src/lib/manga/name-preview/types.ts
export type NamePageStatus = "approved" | "rejected" | "pending";

export type NameRejectReason =
  | "story_problem"      // 展開がつまらない/感情が弱い → L3/L4 再生成
  | "panel_problem"      // コマ内容/カメラ/焦点の問題 → L4 該当 panel patch
  | "layout_problem"     // コマ割り/重要コマサイズ → L5 template 再選択
  | "dialogue_problem"   // 台詞長/位置 → L4 dialogue patch
  | "continuity_problem" // キャラ/場所/小物の選択 → L6/L7 再実行
  | "render_risk";       // ネームは良いが絵で事故りそう → quick render or L9 pilot

export type NameApprovalSource = "human" | "migration";

export type NamePageDecision = {
  status: NamePageStatus;
  approval_source: NameApprovalSource;
  reasons: NameRejectReason[];
  rerun_from: "L3" | "L4" | "L5" | "L6" | "L7" | null;
  note: string;
  decided_at: string;
};

export type NameApproval = {
  schema_version: 1;
  episode_id: string;
  updated_at: string;
  pages: Record<string, NamePageDecision>; // key = page_no as string
};
```

### SVG ネームに描画する要素

`PanelV2` の既存フィールドのみで実現:

- B6 比率ページ (1748×2480 縮尺)、L5 の `rect` をそのまま枠として描画
- 右綴じ前提の reading order 番号 + 流線
- コマごとに `shot_type` / `camera` ラベル (例: "CU/eye_level")
- `importance` を枠線太さ + 背景濃度 + ラベルで表現 (1-5 段階)
- `bleed` は裁ち落とし枠表示、`silence` は無音マーカー (♪なし記号)
- focus entity の顔サムネイル (bible/refs/characters/{id}/face_v1.png から)
  - 存在しなければ entity name の枠ラベルで fallback
- 登場キャラ一覧 (panel 上部に小さく)
- `key_visual` を短い構図説明として中央配置
- 台詞 / モノローグ / ナレーション / SFX を占有量に応じた領域で表示
- ページ末に `page_role` バッジ (reveal / cliffhanger / aftermath / establishing)
- 自動警告: 文字量過多 / コマ過多 / 同一 shot_type 連続 / focus_entity 不在

### L8.7 server 仕様 (`serve-name.ts`)

`POST /api/name-approval` の保存ロジックは下記を厳守:

- **`rerun_from` は派生値**。client から body に入れて送られてきた `rerun_from` は **無視**し、server 側で `deriveRerunFrom(body.reasons)` (`src/lib/manga/name-preview/types.ts`) を呼んで再計算した値を `name_approval.json` に書き込む。
- 理由: `name_approval.json` は L9 gate と将来の retrospective が読む単一の真実。HTML を直接編集された/古いキャッシュが残った/JS バグで `reasons` と `rerun_from` がズレるケースが起きても、保存境界で server が SSoT に従って整合を保証する責務がある。
- `reasons` 自体は client 側 enum を信用してよい (`NameRejectReason` の値を server で再 validate)。
- 同様に `status` も基本は client 値だが、`approved` で `reasons.length > 0` のような矛盾を弾くこと。

### L9 gate の挙動

```ts
// L09-render.ts 起動時
const approval = await loadNameApproval(slug, episode);
if (!approval && !args.skipNameGate) {
  throw new Error("[L09] name_approval.json not found. Run L8.5 then L8.7, or pass --skip-name-gate");
}

const targetPages = args.pages ?? pagePlan.pages.map(p => p.page_no);
const renderable = targetPages.filter(no => {
  if (args.skipNameGate) return true;
  const dec = approval?.pages[String(no)];
  if (!dec || dec.status !== "approved") {
    console.warn(`[L09] SKIP page ${no}: status=${dec?.status ?? "missing"}`);
    return false;
  }
  return true;
});
```

挙動表:

| `name_approval.json` の状態 | デフォルト | `--skip-name-gate` |
|---|---|---|
| ファイル不存在 | hard fail | render 続行 |
| `pending` | hard fail | render 続行 |
| `rejected` | hard fail | render 続行 |
| `approved` | render | render |

### 既存 ep1-10 への移行

```bash
npx tsx scripts/manga/migrate-name-approval.ts --slug a07-modern-dungeon --episodes 1-10
```

各 ep で `name_approval.json` を生成、全ページを以下で初期化:

```json
{
  "status": "approved",
  "approval_source": "migration",
  "reasons": [],
  "rerun_from": null,
  "note": "Initialized from pre-gate episode",
  "decided_at": "2026-05-05T..."
}
```

これにより既存パイプラインを止めず、新規 ep のみ gate が効く。`approval_source: "migration"` で人間判定と区別でき、後段の retrospective report (v2) で「migration なのに L9 で問題が出た」ケースを抽出できる。

### CLI

```bash
# 個別実行
npx tsx scripts/manga/pipeline.ts --slug a07-modern-dungeon --episode 11 --layer L08_5
npx tsx scripts/manga/serve-name.ts --slug a07-modern-dungeon --episode 11
# → ブラウザで http://localhost:5174 を開いて承認、 a/r キーで状態切替

# 通常フロー (L8.5 で停止 → 人間承認 → L9 から再開)
npx tsx scripts/manga/pipeline.ts --slug a07-modern-dungeon --episode 11 --to L08_5
# (人間承認)
npx tsx scripts/manga/pipeline.ts --slug a07-modern-dungeon --episode 11 --from L09

# 移行 (既存 ep を all-approved 初期化)
npx tsx scripts/manga/migrate-name-approval.ts --slug a07-modern-dungeon --episodes 1-10

# 緊急回避
npx tsx scripts/manga/pipeline.ts --slug a07-modern-dungeon --episode 11 --layer L09 --skip-name-gate
```

### 着手順序

| Day | タスク |
|---|---|
| 1 | `name-preview/types.ts` schema、`svg-renderer.ts` 骨格、a07 ep1 で 1ページ単体 SVG 出力 |
| 2 | SVG renderer 全要素 (importance/bleed/silence/face_thumb/dialogue) を ep1 全22ページで確認 |
| 3 | `index-html.ts` 、`L08-5-name-preview.ts` CLI、ブラウザで一覧表示 |
| 4 | `serve-name.ts` 、a/r 操作、reject 理由 select、`name_approval.json` 書き込み |
| 5 | L9 gate 改修、`migrate-name-approval.ts` 、ep1-10 移行、ep11 で end-to-end 通し |
| 6 | pipeline.ts orchestrator 統合、SSoT 更新 |
| 7 | バグ修正 + a07 ep11 のネーム → 承認 → L9 で実運用テスト |

## 2週間スコープ (v2: 賢くする週、本プランの範囲外メモ)

v1 を運用しながら以下を順次着手:

- **L8.6 Name Audit (rule-based)**: 台詞長 / コマ数 / 重要度配分 / 同一 shot 連続 / 読順破綻 / focus_entity 不在 / page 末 hook 検査。warning 表示 (gate ではない)
- **reject 理由集計レポート**: `scripts/manga/name-reject-report.ts` で reject reason 分布を作品横断で集計、L4/L5 改善の優先度根拠
- **L5 強化**: importance 非均等 slot → page_role 別 template → 右綴じ読順明示
- **`blocking` field を任意 field として L4 schema に追加**: storyboard-builder が出せるなら出す、出せなければ SVG renderer 側の推定にフォールバック
- **Quick render pilot command**: `--pages=1,8,22 --mode=rough` で 512×768 低解像度 spot check
- **Retrospective report**: 「ネームで予見できた問題」 vs 「L9 で初めて分かった問題」分類、A で十分な範囲と B が必要な範囲を実データから決定

## 撤回 / 検討したが採用しない案

- ✗ **B (低解像度 quick render) を通常フローに組込み**: API 呼び出しと待ち時間がゼロにならず、第二の L9 になる。pilot command 化に変更。
- ✗ **L8.6 audit score を gate に混ぜる**: v1 から audit を hard gate にすると「人間 OK だが rule が落とす」調整に時間を取られる。warning のみ。
- ✗ **L4 blocking field を v1 必須化**: storyboard-builder のプロンプト負荷と failure mode が増える。任意 field で v2。
- ✗ **L5 を先行強化**: 検証する視覚面が無い状態で触っても改善が測れない。L8.5 で問題顕在化後に着手。
- ✗ **静的 HTML だけで承認管理**: ブラウザからローカル FS への安全な書き込み手段が無く、結局 server が要る。最初から薄い HTTP server で書く。

## Verification

### v1 完了基準

1. `a07-modern-dungeon` ep11 (新規エピソード) で:
   - `pipeline.ts --to L08_5` が SVG 22ページ + index.html を生成
   - ブラウザでネーム一覧が見え、a/r キーで判定が `name_approval.json` に書き込まれる
   - 全ページ approved 後 `pipeline.ts --from L09` が完走
   - 1ページ rejected の状態で L9 を起動すると hard fail
   - `--skip-name-gate` で hard fail を回避できる
2. `a07-modern-dungeon` ep1-10 が `migrate-name-approval.ts` 後に既存通り L9 以降を回せる
3. ネーム判定 22ページが 1-2 分以内で完了する (人間タイマー測定)
4. SSoT (`pipeline-v2.md`) に L8.5 / L8.7 / L9 gate が反映され、12-layer 図が更新されている

### 動作確認手順

```bash
# 1. ep11 のネーム生成
npx tsx scripts/manga/pipeline.ts --slug a07-modern-dungeon --episode 11 --to L08_5

# 2. ブラウザで承認
npx tsx scripts/manga/serve-name.ts --slug a07-modern-dungeon --episode 11
# → open http://localhost:5174

# 3. gate 動作確認 (1ページ rejected の状態で L9)
npx tsx scripts/manga/pipeline.ts --slug a07-modern-dungeon --episode 11 --from L09
# → "[L09] SKIP page X: status=rejected" を期待

# 4. 既存 ep 移行確認
npx tsx scripts/manga/migrate-name-approval.ts --slug a07-modern-dungeon --episodes 1-10
ls data/manga/works/a07-modern-dungeon/episodes/ep01/name_approval.json

# 5. 緊急回避
npx tsx scripts/manga/pipeline.ts --slug a07-modern-dungeon --episode 11 --layer L09 --skip-name-gate
```

## 関連

- SSoT: `docs/plans/manga/pipeline-v2.md`
- メモリ: project_horizontal_manga_pivot, project_pilot_complete_2026-05-01, feedback_commercial_vs_readable, feedback_rtl_reading_order_bug, project_chatgpt_pro_image_gen
- Codex thread: 019df56b-f62c-79e2-990b-84d8c66b1e4d (2026-05-05)
