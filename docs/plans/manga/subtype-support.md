# subtype 対応 — modern_dungeon の external_social vs gacha_ui 分岐

**目的**: `dungeon-modern` ジャンル内に **2 サブタイプ** が並立することが
2 冊目精読 (レベルガチャ Vol.1-3) で判明した。
これを bible / storyboard 生成パイプラインに反映する。

## 背景

- 2026-05-01 v2: kindle-test-1 (缶詰ガチャ) を精読 →
  外部 SNS / ニュース / 配信が必須、ステータスは 1 panel 簡素という前提
- 2026-05-06 v3: レベルガチャ Vol.1-3 を追加精読 →
  SNS panel 殆ど不使用、ステータスは 2 ページ全面、ガチャ rarity で社会的反応
- 結論: dungeon-modern は **single pattern ではなく subtype 分岐が必要**

詳細マッピング: `docs/strategy/manga_craft/40_genres/modern_dungeon.md` の
「サブタイプの分類」セクション。

## サブタイプ仕様

| subtype | 代表 | SNS panel | ステータス UI | 装備 | 海外要素 |
|---|---|---|---|---|---|
| `external_social` | kindle-test-1 (缶詰ガチャ) | 必須 (5-10 回/巻) | 1 panel 簡素 | 制服のまま戦闘 | 1 巻終盤 cliffhanger |
| `gacha_ui` | レベルガチャ Vol.1-3 | 不要 | 2 ページ全面 + rarity 表示 | 甲冑切替 | 殆ど無し |
| `hybrid` | (要選定) | 半々 | 中間 | 中間 | 中間 |

bible 設定で `subtype` を明示し、storyboard-builder が場面別 directives を
切り替える。

## 実装範囲

### 1. schema 追加: `src/lib/manga/schemas-v2.ts`

```typescript
export type DungeonModernSubtype = "external_social" | "gacha_ui" | "hybrid";

// BibleSnapshotV2.meta に追加
meta: {
  // ...既存フィールド...
  /** ジャンル内サブタイプ (現状 dungeon-modern でのみ使用) */
  subtype?: DungeonModernSubtype;
}
```

`schemas-v2.zod.ts` 側にも対応する zod 定義を追加。
未設定の bible は L01b bible-lint で warning (後方互換は維持)。

### 2. directives 改修: `src/lib/manga/storyboard-v2/craft-guide-directives.ts`

現状:
```typescript
const GENRE_DIRECTIVES: Record<string, string[]> = {
  modern_dungeon: [
    "【現代ダンジョン】SNS/配信動画/ニュース速報 panel を活用して...",
    "【現代ダンジョン】現代の生活感 (制服/コンビニ/スマホ) と異世界要素...",
  ],
  // 他の genre...
};
```

改修後:
```typescript
type SubtypeDirectives = Record<string, string[]>;

const GENRE_DIRECTIVES: Record<string, string[]> = {
  battle_dungeon: [/* 既存 */],
  isekai_tensei_cheat: [/* 既存 */],
  isekai_slowlife: [/* 既存 */],
  // modern_dungeon は subtype 分岐ありなので別管理
};

const MODERN_DUNGEON_SUBTYPE_DIRECTIVES: SubtypeDirectives = {
  external_social: [
    "【modern_dungeon/external_social】SNS/配信動画/ニュース速報 panel を 1 巻 5-10 回配置",
    "【modern_dungeon/external_social】ステータス画面は 1 panel 簡素 (章末・章頭で 1 回ずつ更新)",
    "【modern_dungeon/external_social】1 巻終盤 cliffhanger で海外探索者を初登場 (シルエット型)",
    "【modern_dungeon/external_social】主人公は制服のまま戦闘 (装備切替演出は最小限)",
  ],
  gacha_ui: [
    "【modern_dungeon/gacha_ui】SNS panel は使わない。社会的反応はガチャ rarity と数値で内部完結",
    "【modern_dungeon/gacha_ui】ステータス画面は 2 ページ全面見開き (スキル一覧 + 数値 before/after 矢印 + rarity 色分け + New マーカー)",
    "【modern_dungeon/gacha_ui】ガチャ pull 演出は 2 ページ見開き + 大きな効果音 (「ジャララ」「キラッ」) + 斜めテキストパネル",
    "【modern_dungeon/gacha_ui】1 回ガチャ / 10 回ガチャの UI ボタンを panel に直接描画",
    "【modern_dungeon/gacha_ui】主人公の装備切替 (制服↔甲冑) を panel で可視化",
    "【modern_dungeon/gacha_ui】数値 before/after は必ず矢印付きで「121 (←115)」",
  ],
  hybrid: [
    "【modern_dungeon/hybrid】external_social と gacha_ui の作法を併用、各々の頻度を半分ずつ",
    "【modern_dungeon/hybrid】設計難易度高。Phase A では避けることを推奨",
  ],
};

// buildCraftGuideDirectives() のシグネチャを拡張
export function buildCraftGuideDirectives(
  toneProfile?: ToneProfile,
  genre?: string,
  subtype?: string,  // 新規
): string {
  // ...既存処理...
  
  // genre 別 directive 注入時の分岐
  if (genre === "modern_dungeon") {
    // subtype 必須化 (warning + default = external_social)
    const sub = subtype ?? "external_social";
    const dirs = MODERN_DUNGEON_SUBTYPE_DIRECTIVES[sub];
    if (dirs) {
      lines.push(`### modern_dungeon/${sub} の追加 directive`);
      for (const d of dirs) lines.push(`- ${d}`);
      lines.push("");
    }
  } else if (genre && GENRE_DIRECTIVES[genre]) {
    // 既存ロジック維持
    lines.push(`### ジャンル別 directive (${genre})`);
    for (const d of GENRE_DIRECTIVES[genre]) lines.push(`- ${d}`);
    lines.push("");
  }
  
  return lines.join("\n");
}
```

### 3. 呼び出し側の更新

`buildCraftGuideDirectives` を呼ぶ箇所を全て更新:

```bash
grep -rn "buildCraftGuideDirectives" src/lib/manga/ scripts/manga/
```

各呼び出しで `bible.meta.subtype` を渡す。

主な呼び出し元: `src/lib/manga/storyboard-v2/storyboard-extractor.ts`

### 4. bible-lint への警告追加 (`L01b`)

`src/lib/manga/bible-lint/` 配下:
- `genre === "modern_dungeon"` で `subtype` 未設定 → warning
- メッセージ例: `"bible.meta.subtype が未設定です。modern_dungeon は external_social / gacha_ui / hybrid のいずれかを明示推奨。docs/plans/manga/subtype-support.md 参照"`

### 5. テスト

- 既存の `_smoke-l13-preflight.ts` または `_smoke-week2.ts` を更新
- subtype = `external_social` / `gacha_ui` の両方で `buildCraftGuideDirectives` が正しい directives を出力することを確認
- snapshot test 推奨

### 6. 既存 bible のマイグレーション

`content/manga/bibles/` 以下の既存 bible スナップショットを確認:
- `genre === "modern_dungeon"` のものに `subtype` を後付け (大半は external_social と推定)
- 該当 bible のリストアップ:
  ```bash
  grep -rl '"genre": *"modern_dungeon"' content/manga/bibles/
  ```

## 受入基準

1. ✅ `BibleSnapshotV2` に `subtype?: DungeonModernSubtype` が追加されている
2. ✅ zod schema にも対応する型が追加されている
3. ✅ `buildCraftGuideDirectives` が `subtype` 引数を受ける
4. ✅ subtype 別 directive が出力される (external_social / gacha_ui / hybrid)
5. ✅ 既存呼び出し元が全て更新されている
6. ✅ bible-lint で `modern_dungeon` の subtype 未設定 warning が出る
7. ✅ smoke test が通る (両 subtype)
8. ✅ 既存 bible 全件に subtype が後付けされている

## 参考ドキュメント

- 作法 v3 索引: `docs/strategy/manga_craft/README.md`
- modern_dungeon 詳細: `docs/strategy/manga_craft/40_genres/modern_dungeon.md`
- subtype スキーマ: `docs/strategy/manga_craft/50_index.json` の `subtype_schema`
- 場面別 directive (item_analysis): `docs/strategy/manga_craft/30_scenes/item_analysis.md`
- 場面別 directive (social_reaction): `docs/strategy/manga_craft/30_scenes/social_reaction.md`

## メモ

将来 `battle_dungeon` や `isekai_tensei_cheat` でも subtype が必要になる
可能性がある。その場合、`MODERN_DUNGEON_SUBTYPE_DIRECTIVES` を一般化して
`SUBTYPE_DIRECTIVES: Record<genre, Record<subtype, string[]>>` の形に
リファクタする想定。
