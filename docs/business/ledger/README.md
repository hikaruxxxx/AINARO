# 事業台帳 (KDP/KU 専業運用)

KDP 出版事業の **税務・経費・契約証跡** をテキストで残す台帳。

設計根拠: `~/.claude/plans/b-1-codex-gentle-bengio.md` Track D-2

## なぜこの台帳が必要か

- KDP/KU 専業 (Web 配信なし) の事業構造では、Amazon 売上以外のお金の動き
  (広告費 / 外注費 / 素材購入 / 通信費 / 機材費) を別途記録する必要がある。
- インボイス制度 (2023〜) 下で、AI モデル課金・素材購入・サブスク契約は
  仕入税額控除の対象になりうる。最初から残さないと後で詰まる。
- 5 年 EXIT 戦略を採るなら、買い手 DD で必ず聞かれるのが「経費構造」と
  「Amazon 以外のキャッシュフロー」。
- LLM 進化と無関係に資産化される領域。

## ディレクトリ構造

構造ドキュメント (本 README + _template) は `docs/business/ledger/` に配置し
**git 管理対象**。実数値の月次台帳と契約スキャンは `data/business/ledger/`
に置き **git 管理対象外** (`/data/` は .gitignore で除外済)。

```
docs/business/ledger/        # git 管理 (構造ドキュメント)
├── README.md              ← 本ファイル
└── _template.md           ← 月次台帳テンプレ (毎月コピーして使う)

data/business/ledger/        # git 管理外 (実数値・機密)
├── 2026-05.md             ← 月次台帳実体
├── 2026-06.md
└── contracts/             ← 契約・領収書スキャン
    ├── chatgpt-pro/
    ├── kdp-account/
    └── ...
```

## 月次台帳の使い方

1. 月初に `cp docs/business/ledger/_template.md data/business/ledger/YYYY-MM.md`
2. 取引が発生したら該当セクションに追記 (日付 / 金額 / 摘要 / 領収書パス)
3. 月末に「収支サマリ」を更新 (KDP 月報 CSV と突合)
4. 確定申告期 (3 月) に年次集計する想定

## 機密扱い

- 個人特定情報・口座番号・実売上・ASIN/ISBN を含むため `data/business/`
  全体を `.gitignore` で除外している。
- 領収書 PDF は `data/business/ledger/contracts/` 配下。
- バックアップは Time Machine + 個人 Drive を想定。CI/CD に晒さない。

## 関連メモリ

- 事業構造: `project_kdp_strategy.md`
- AI 入力ポリシー: `~/.claude/CLAUDE.md` の AI セキュリティ規定
