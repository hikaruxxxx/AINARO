# TikTok/Tinder風スワイプレコメンド機能

## Context
読者が作品のあらすじカードを左右にスワイプし、その行動データから好みを学習してレコメンドを最適化する。
既存の `/discover`（ランダム発見）と `/recommend`（読書履歴ベース）の中間に位置する **明示的な好み表明チャネル**。

## 仕組み

```
[スワイプUI] → [swipe-history.ts] → [recommendations.ts に統合]
                  localStorage         既存の読書履歴スコアに加算
```

- **右スワイプ** = 気になる → そのジャンル/タグのスコア加算
- **左スワイプ** = スキップ → 軽いペナルティ（完全除外はしない）
- スワイプ信号は `PersonalizedSection`・`/recommend` のスコアリングに自動反映

## 新規ファイル

| ファイル | 役割 |
|---------|------|
| `src/lib/swipe-history.ts` | スワイプ記録のlocalStorage管理 |
| `src/hooks/useSwipeGesture.ts` | タッチ/マウスジェスチャー処理フック |
| `src/components/novel/SwipeCard.tsx` | スワイプ可能なカード（ビジュアル） |
| `src/components/novel/SwipeStack.tsx` | カードスタック管理（状態機械） |
| `src/app/[locale]/swipe/layout.tsx` | 全画面レイアウト（黒背景） |
| `src/app/[locale]/swipe/page.tsx` | スワイプページ本体 |

## 修正ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/lib/recommendations.ts` | `swipeHistory`引数追加、スコアリングにスワイプ信号を統合 |
| `src/components/novel/PersonalizedSection.tsx` | スワイプ履歴をレコメンドに渡す |
| `src/components/layout/BottomNav.tsx` | `/swipe`でナビ非表示 |
| `src/messages/ja.json` / `en.json` | `swipe`セクション追加 |
| `src/app/[locale]/page.tsx` | ホームにスワイプCTAリンク追加 |

## スワイプデータ構造

```ts
type SwipeRecord = {
  novelId: string;
  direction: "right" | "left";
  genre: string;
  tags: string[];
  timestamp: string; // ISO
};
```

## スコアリング

既存の `getPersonalizedRecommendations` に追加:
- 右スワイプジャンル: +3
- 左スワイプジャンル: -1
- 右スワイプタグ: +1.5/tag
- 左スワイプタグ: -0.5/tag
- 時間減衰: `1 / (1 + daysSince * 0.1)`

## UIデザイン

- **カード**: 全画面、カバー画像/グラデーション背景、下部にタイトル・あらすじ・ジャンル
- **ドラッグ中**: 左右傾斜 + 緑/赤オーバーレイ + 「気になる」「スキップ」ラベル
- **カードスタック**: 3枚重ね表示（奥は縮小 scale 0.95, 0.9）
- **アニメーション**: CSS transform + transition（ライブラリ不要）
- **デスクトップ**: ボタンフォールバック + キーボード(←→)対応

## 小データセット対応（3作品）

- 全作品スワイプ後: サマリー画面（「3作品中 N作品に気になる」）
- リセットボタンで再スワイプ可能
- 作品2未満ではスワイプCTAを非表示

## 実装順序

1. `swipe-history.ts` — データ層
2. `useSwipeGesture.ts` — ジェスチャーフック
3. `SwipeCard.tsx` — カードUI
4. `SwipeStack.tsx` — スタック管理
5. `swipe/layout.tsx` + `swipe/page.tsx` — ルート
6. i18n文字列追加
7. `recommendations.ts` にスワイプ統合
8. `PersonalizedSection` + `/recommend` 連携
9. `BottomNav` 修正
10. ホームにCTA追加

## 検証方法

1. `/ja/swipe` にアクセスしてカードが表示される
2. 左右スワイプ/ボタンでカードが飛ぶ
3. localStorageに `ainaro_swipe_history` が記録される
4. ホームの `PersonalizedSection` にスワイプ信号が反映される
5. 全カードスワイプ後にサマリー画面が表示される
6. モバイル/デスクトップ両方で動作確認
