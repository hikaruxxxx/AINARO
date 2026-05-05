# 月次台帳 YYYY-MM

> KDP/KU 専業の月次経費・売上記録。`_template.md` を `cp` して使用。

## 1. 売上 (Amazon KDP/KU)

KDP 月報 CSV (`data/manga/works/{slug}/kdp/reports/YYYY-MM.csv`) と突合する。
ingest-kdp-report.ts (Track A3-1, 未実装) で自動投入予定だが、まずは手動。

| ASIN | 作品 | 巻 | KENPC pages | KENPC royalty (¥) | unit sales | unit royalty (¥) | 合計 (¥) |
|---|---|---|---|---|---|---|---|
|   |   |   |   |   |   |   |   |
| **合計** |   |   |   |   |   |   |   |

## 2. AI モデル / SaaS

| 日付 | サービス | 用途 | 金額 (¥) | インボイス | 領収書 |
|---|---|---|---|---|---|
| YYYY-MM-DD | ChatGPT Pro | 漫画画像生成 | 30,000 | 適格 | contracts/chatgpt-pro/YYYY-MM.pdf |
| YYYY-MM-DD | Anthropic API | (Phase B 以降) | 0 | - | - |
| YYYY-MM-DD | Vercel | (Web 撤退で 0) | 0 | - | - |
| YYYY-MM-DD | Supabase | KDP DB | 0 | - | - |

## 3. Amazon 広告 (AMS)

実績は AMS 管理画面から CSV DL → `data/manga/works/{slug}/ads/YYYY-MM.csv`。

| 日付 | キャンペーン | spend (¥) | sales (¥) | ROAS | 摘要 |
|---|---|---|---|---|---|
|   |   |   |   |   |   |
| **合計** |   |   |   |   |   |

## 4. 外注・素材購入

| 日付 | 取引先 | 内容 | 金額 (¥) | インボイス | 領収書 |
|---|---|---|---|---|---|
| YYYY-MM-DD | (例: フォント購入) |  |  |  |  |
| YYYY-MM-DD | (例: 商標調査) |  |  |  |  |

## 5. 通信費 / 機材

| 日付 | 内容 | 金額 (¥) | 領収書 |
|---|---|---|---|
|   |   |   |   |

## 6. KDP 入稿実績

| 日付 | slug | 巻 | ASIN | 状態 | 備考 |
|---|---|---|---|---|---|
| YYYY-MM-DD | a07-modern-dungeon | 1 | (未取得) | submitted/published/unpublished |  |

## 7. 月次サマリ

- 売上合計: ¥
- 経費合計 (2-5): ¥
- 営業利益: ¥
- 累計入稿巻数: (前月) + (今月)
- 累計刊行 ASIN 数:

## 8. メモ・課題

-
