# L8.5 Name Preview 実装後のリファクタリング/整理

## Context

L8.5 ネームプレビュー gate (SSoT: `docs/plans/manga/name-gate.md`) を実装した直後で、コミット前。Codex 同期 (thread `019df57b-e00b-7bc2-9cf6-7cd980041882`) を経た最終プラン。

対象:

- M [scripts/manga/layers/_paths.ts](scripts/manga/layers/_paths.ts) — name 系パス追加のみ。**変更なしでコミット可**
- ?? [scripts/manga/layers/L08-5-name-preview.ts](scripts/manga/layers/L08-5-name-preview.ts)
- ?? [src/lib/manga/name-preview/types.ts](src/lib/manga/name-preview/types.ts)
- ?? [src/lib/manga/name-preview/blocking-estimator.ts](src/lib/manga/name-preview/blocking-estimator.ts)
- ?? [src/lib/manga/name-preview/svg-renderer.ts](src/lib/manga/name-preview/svg-renderer.ts)
- ?? [src/lib/manga/name-preview/index-html.ts](src/lib/manga/name-preview/index-html.ts)

L8.7 (`serve-name.ts`) / L9 gate / `migrate-name-approval.ts` は未着手。本プランは「コミット前に整える最小範囲」+「次に書くファイルに引き継ぐ仕様要求」を分けて記載。

## 推奨する変更 (in-scope)

### 1. `emptyApproval` を削除

[src/lib/manga/name-preview/types.ts:107-114](src/lib/manga/name-preview/types.ts#L107-L114) の `emptyApproval` は呼び出しゼロ。`pendingApproval` のみ使用。`migrate-name-approval.ts` も `approval_source: "migration"` で all-approved 初期化する設計のため使う見込みなし。

CLAUDE.md「未使用は素直に削除」原則に従い削除。前後の説明コメントも一緒に消す。

### 2. rerun 派生ロジックを types.ts に集約

[src/lib/manga/name-preview/index-html.ts:124-135](src/lib/manga/name-preview/index-html.ts#L124-L135) の inline JS が `REJECT_REASON_TO_RERUN` のマップと優先順位 `order` を **両方手書きで再定義**している。さらに後続の [scripts/manga/serve-name.ts](scripts/manga/serve-name.ts) (未実装) でも同じ派生計算が必要になる。

#### 修正方針

`src/lib/manga/name-preview/types.ts` に以下を追加:

```ts
/** rerun_from の優先順位 (上流ほど先頭)。L7 は現状 reasons mapping に出てこないが、将来用に含める */
export const RERUN_FROM_ORDER: ReadonlyArray<NonNullable<NameRerunFrom>> = [
  "L3", "L4", "L5", "L6", "L7",
];

/**
 * reasons から rerun_from を導出する SSoT 関数。
 * - render_risk は null になる (ネーム自体は OK 扱い)
 * - 複数 reason が選択されたときは最も上流の layer を採用
 */
export function deriveRerunFrom(reasons: NameRejectReason[]): NameRerunFrom {
  let best: NameRerunFrom = null;
  for (const r of reasons) {
    const v = REJECT_REASON_TO_RERUN[r];
    if (!v) continue;
    if (best === null || RERUN_FROM_ORDER.indexOf(v) < RERUN_FROM_ORDER.indexOf(best)) {
      best = v;
    }
  }
  return best;
}
```

`index-html.ts` 側:

- `import { ..., REJECT_REASON_TO_RERUN, RERUN_FROM_ORDER } from "./types";` を追加
- 関数冒頭で 2 つのマップを serialize:
  ```ts
  const mapJson = inlineJson(REJECT_REASON_TO_RERUN);
  const orderJson = inlineJson(RERUN_FROM_ORDER);
  ```
- inline JS の `const map = {...}; const order = [...];` を上記 JSON 埋め込みに置換
- `reasonToRerun` 関数本体 (順序解決ロジック) は `deriveRerunFrom` の挙動と同型なのでそのまま残してよい

### 3. `inlineJson` ヘルパーを追加

inline JS 内に JSON を埋めるとき `</script>` 終端を防ぐため、`</` を `<` にエスケープする小さなヘルパーを `index-html.ts` 内のローカル関数として追加:

```ts
function inlineJson(v: unknown): string {
  return JSON.stringify(v).replace(/</g, "\\u003c");
}
```

理由は `REJECT_REASON_TO_RERUN` (固定 enum 値) より、同じ script リテラルに入っている `slug` の方。slug は実質安全でも、helper 経由に揃えた方がレビューで説明しやすい (Codex の指摘)。`escapeHtml` とは別物 (HTML 属性用) なので統合しない。

## 後続 `serve-name.ts` への要求事項 (今は実装しないが SSoT に追記)

**`rerun_from` は派生値であり、保存境界 (POST /api/name-approval) で server が `reasons` から再計算して書き込むこと。client から送られてくる `rerun_from` は無視する。**

- 理由: HTML を直接編集された/古い HTML キャッシュが残っていた/JS バグで `rerun_from` と `reasons` がズレるケースを防ぐ。`name_approval.json` は L9 gate と将来 retrospective が読む単一の真実なので、派生値の整合は server が保証する責務。
- 実装: `serve-name.ts` の POST handler 内で `deriveRerunFrom(body.reasons)` を呼び、`body.rerun_from` を捨てる。
- このプラン適用後に `docs/plans/manga/name-gate.md` の L8.7 セクションへ 1-2 行追記する。

## 観察 (今回スコープ外、コミット後の別 PR 候補)

- **`fileExists` 重複** ([L08-5-name-preview.ts:60](scripts/manga/layers/L08-5-name-preview.ts#L60), [src/lib/manga/publish-v2/kdp/preflight.ts:79](src/lib/manga/publish-v2/kdp/preflight.ts#L79)): util 化候補だが今 v1 でやる必要なし。
- **`escapeXml` / `escapeHtml` の横断重複** (5 箇所): HTML と XML で `'` の表現が違う (`&#39;` vs `&apos;`) ため、雑な一本化は逆に責務を曖昧化する。今回触らない。
- **`parseArgs` 各 layer 重複**: 引数スキーマが層ごとに微妙に違うので慎重に。
- **inline JS 外出し**: `index-html.ts` の script リテラル ~150 行を別ファイル化する案。デプロイ/import パス管理の複雑化が上回るため v1 では現状維持。
- **`blocking-estimator` 責務 / `svg-renderer` 長関数 / `buildRefsExistsPredicate` 置き場所 / `schemas-v2` との分担**: いずれも「v1 を end-to-end で通して reject 理由が溜まってから」着手する方が筋が良い (Codex 同意)。L8.7 着手を遅らせる価値はない。

## 修正ファイル

1. [src/lib/manga/name-preview/types.ts](src/lib/manga/name-preview/types.ts)
   - `emptyApproval` を削除
   - `RERUN_FROM_ORDER` と `deriveRerunFrom(reasons)` を export 追加
2. [src/lib/manga/name-preview/index-html.ts](src/lib/manga/name-preview/index-html.ts)
   - `REJECT_REASON_TO_RERUN`, `RERUN_FROM_ORDER` import
   - ローカル `inlineJson` ヘルパー追加
   - inline JS 内の `map` / `order` リテラルを serialized JSON に置換
3. `docs/plans/manga/name-gate.md` (SSoT)
   - L8.7 セクションに「server が `rerun_from` を `reasons` から再計算」要件を追記

## 検証

```bash
# 型チェック
npx tsc -p tsconfig.json --noEmit

# 既存作品で再生成
npx tsx scripts/manga/layers/L08-5-name-preview.ts --slug a07-modern-dungeon --episode 1
```

期待:
- `data/manga/works/<slug>/episodes/ep01/name/p01.svg`, `index.html`, `name_manifest.json` が生成される
- `name_approval.json` が無ければ all pending で初期化、あれば保持
- `index.html` をブラウザで開き、ページに reject 理由をチェック → reject に遷移したとき、DevTools console で `decisions.get(N).rerun_from` が選んだ理由に対応する layer (`'L3' | 'L4' | 'L5' | 'L6'`) または `null` (render_risk 単独) を返すこと
- `1` (story) + `5` (continuity) の両方を選んだとき `rerun_from === 'L3'` (上流優先)
- `6` (render_risk) のみのとき `rerun_from === null`
