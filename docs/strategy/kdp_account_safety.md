# KDP アカウント安全運用ルール (Phase A 以降)

**作成**: 2026-05-06
**対象**: AINARO Phase A (3作品 KDP+KU 検証) および Phase B (量産) の全期間
**関連plan**: [/Users/hikarumori/.claude/plans/groovy-wishing-castle.md](/Users/hikarumori/.claude/plans/groovy-wishing-castle.md) WX-5 / WX-8

---

## なぜこの文書が必要か

KDP 専業の最大リスクは **アカウント停止** (BAN)。AI生成漫画はAmazon側の警戒対象であり、AI開示・商標・複数アカウント・IP類似の判断ミスは即時停止につながる。1つでも作品が停止された場合、復旧は数週間〜数ヶ月、最悪は永久停止。

このため Phase X (Week 1-6) で **運用防衛を生成craftと同格優先**で整備する (Codex 根本異論「KDP運用リスクは本丸」反映)。

---

## 1. アカウント運用の基本原則

### 1.1 単一KDPアカウント原則

- **1 KDPアカウント** で全作品を出版する
- 副アカウント・複数アカウント運用は **規約違反のため不採用** (Amazon Author/Publisher Account Terms)
- 家族名義での別アカウント取得も禁止 (世帯単位で見られる)

### 1.2 ペンネーム/レーベル戦略

Phase A 採用案 (Codex レビュー反映 2026-05-06):

```
1 KDPアカウント
  └─ 1レーベル: "Novelis"
        ├─ 作品1 ダンジョン探索系  → ペンネーム A (例: 篠崎 奏汰)
        ├─ 作品2 転生貴族・領地経営 → ペンネーム B (例: 葉月 リオ)
        └─ 作品3 現代ダンジョン系   → ペンネーム C (再選定中)
```

理由:
- **作品トーンの混線回避**: 3作品の画風・読者層が異なる → 統一ペンネームだと「この作家は何系?」と混乱
- **将来の出版社OS化**: レーベル "Novelis" で束ねて、Phase B 量産時もレーベル単位で管理
- **EXIT 時のIP価値**: ペンネーム独立だと作品単位で売却可、レーベル束ねると一括売却可、両方の選択肢を残す
- **アカウント1本**: KDP 規約遵守、レポート集約・税務処理シンプル

### 1.3 著者名表記の運用

- 表紙とKDP管理画面の Author Name は **ペンネーム** (作品ごとに別)
- レーベル名 "Novelis" は **表紙の帯または奥付** に併記
- 著者プロフィール (Author Central) は **ペンネームごとに別アカウント**を作る
  - 各ペンネームを横串で繋ぐような言及は避ける (Amazon側で同一人物と判定されてもメリットなし)
- 連絡先メール・電話・支払口座は1セットでOK (KDP側のアカウントは1本だから)

---

## 2. AI 開示の運用ルール

### 2.1 AI 開示 5区分 (KDP 公式準拠)

[src/lib/manga/disclosure.ts](src/lib/manga/disclosure.ts) で実装済。Phase A 全作品で **必ず以下5区分を申告**:

| 区分 | AINARO Phase A の通常設定 |
|---|---|
| `text` | "ai_generated" (台詞/モノローグ/ナレーション) |
| `images` | "ai_generated" (本文ページ画像、gpt-image-2) |
| `translation` | "human" (Phase A は日本語のみ、海外展開しない) |
| `cover` | "ai_generated" (表紙、gpt-image-2 + 人間構図指示) |
| `interior` | "ai_assisted" (組版・吹き出し配置は SVG 自動 + 人間レビュー) |

`ai_usage_level` enum: `"full_ai"` を採用 (5区分のうち interior 以外が ai_generated のため)。

### 2.2 奥付 AI 開示文 (必須)

[src/lib/manga/disclosure.ts](src/lib/manga/disclosure.ts) の `DEFAULT_AI_DISCLOSURE` で自動付与される定型文を **全作品の奥付ページに必須掲載**:

```
本作品の制作には生成AI(gpt-image-2 / claude-opus-4-7)を使用しています。
- 文章: 生成AI
- 画像: 生成AI (作画モデル: gpt-image-2)
- 翻訳: 該当なし
- 表紙: 生成AI
- 組版: AIアシスト
```

[src/lib/manga/publish-v2/kdp/preflight.ts](src/lib/manga/publish-v2/kdp/preflight.ts) の `validateAiDisclosure` で 5区分全てチェック、未設定はreject。

### 2.3 KDP 管理画面のAI申告

新規タイトル登録時にAmazon側が問う「Is this title AI-generated?」 に対し:
- **常に "Yes" と回答**
- text / images / translations の各区分でフラグを立てる (KDP管理画面の指示に従う)
- 嘘の申告は規約違反かつ後から発覚すると停止リスク。最初から正直申告で運用する

### 2.4 Phase A 出版実績ベースのアンチパターン蓄積

WZ-4 (Phase Z) で `docs/plans/manga/kdp.md` に追記する形でアンチパターンを記録:
- AI開示区分のミス例
- KDP審査で再申請になったケース
- BSR/レビューに「AI生成」が言及された場合の対応

---

## 3. 商標 / IP 類似チェック

### 3.1 自動チェック (WX-5 で実装)

[src/lib/manga/publish-v2/kdp/trademark-check.ts](src/lib/manga/publish-v2/kdp/trademark-check.ts) (新規) で以下を自動チェック:

1. **J-PlatPat (特許情報プラットフォーム)** で商標検索
   - 作品タイトル
   - 主要キャラクター名 (主人公・ヒロイン)
   - レーベル名 "Novelis"
2. **USPTO TESS (米国商標)** で同様チェック (海外KDP前提でなくても、Amazon は世界共通プラットフォーム)
3. **Amazon search 簡易類似**: タイトル + 主要キャラ名で Amazon 検索し、上位10件と類似度判定
4. 結果は `trademark_check_status: "passed" | "flagged" | "pending"` として記録
5. `flagged` の場合は preflight で reject、人間判断で通すか別タイトルにするか決定

### 3.2 人間判断のチェックリスト

`flagged` 時に確認:
- ヒットした商標の権利者は誰か
- 商品/サービス区分が漫画/書籍と被るか
- 既存作品名と完全一致 or 部分一致か
- ジャンル内での「定型表現」(例: 「異世界転生」) は商標的に弱いか
- 迷ったら回避 (タイトル変更)

### 3.3 既存IPへのリスペクト

Phase A 3作品の参考画風 (Berserk / Vagabond / Rose of Versailles / Solo Leveling) は **画風参考であって設定/キャラ/ストーリーは独立**。以下を厳守:
- 既存IPのキャラ名・固有名詞・組織名・地名・必殺技名を流用しない
- 「○○の作者風」「○○みたいな」と公的に言及しない (商品説明・SNSも含む)
- 学習源として既存IPを使った場合は asset provenance に記録 (WZ-6 出版社OS で管理)

---

## 4. KDP Select / KU 独占運用

### 4.1 独占の意味

KDP Select に登録 = KU で読まれるための条件。**電子版の独占**を Amazon と契約する (90日単位、自動更新)。

### 4.2 独占範囲の禁則

KDP Select 期間中は以下を **絶対に他社で公開しない**:
- 他の電子書籍ストア (BookWalker, Kindle 以外の Reader)
- noteなどの有料コンテンツプラットフォーム
- 自社サイトでの有料配信
- 他社の漫画アプリ (LINE Manga, Piccoma 等)

違反すると **KDP アカウント停止** + 売上没収。

### 4.3 許容範囲 (公開しても良い)

- 自社サイトでの **無料サンプル** (10%以内、KDP 規約準拠)
- SNS での **1〜2ページプレビュー** (宣伝目的)
- 紙書籍版 (KDP 紙書籍 or 別流通) ← 別契約で可

### 4.4 ファンコミュニティ運営

KDP Select 独占に抵触しない範囲で:
- Twitter/X で1ページ抜粋シェア (許容)
- Discord で読者コミュニティ運営 (本文配布は禁止)
- メルマガで新刊告知 (本文掲載は禁止)

---

## 5. レビュー / 売上の倫理

### 5.1 やってはいけないこと (規約違反)

- 自分や知人による **レビュー操作** (Amazon が同一IP/世帯/購入履歴でほぼ100%検出)
- 有料レビューの依頼
- レビュー用の無料配布の見返り条件 ("レビューしてくれたら..." 類)
- BSR を上げるための **自己購入** (検出されるとアカウント停止)
- KU 読了水増し (自分のアカウントで自作を読む含む)

### 5.2 許容される告知

- SNS で発売告知
- メルマガでの新刊案内
- Amazon Ads (公式広告)
- インフルエンサーへの **見本誌** 提供 (レビュー条件なし、純粋な紹介依頼)

---

## 6. データ・台帳の管理

### 6.1 KDP release ledger

[src/lib/manga/publish-v2/kdp/release-ledger.ts](src/lib/manga/publish-v2/kdp/release-ledger.ts) (既存) を活用。全作品の出版履歴を一元管理:

```
status: draft | preflight_ok | submitted | published | halted
```

`halted` は KDP からの停止通知や自主取り下げ。理由を必ず記録。

### 6.2 KU CSV ingest (WX-6 で実装)

[scripts/manga/ingest-kdp-report.ts](scripts/manga/ingest-kdp-report.ts) (新規) で:
- KDPレポートCSVをダウンロード → `data/manga/works/{slug}/kpi/ku-rt-{YYYY-MM}.json`
- 取得指標: KENPC, Pages Read, KU Borrows, レビュー数, BSR推移, ASIN単位売上
- FCE = `Pages Read / KENPC` を月次集計
- 当面は手動実行、Phase Y で週次自動化

### 6.3 月次台帳追記

[docs/business/ledger/{YYYY-MM}.md](docs/business/ledger/) に各月の集計を記録 (Phase Z で hook 自動化):
- 全作品の FCE
- KU ロイヤリティ (Global Fund × FCE per作品)
- 販売ロイヤリティ
- Amazon Ads 支出
- 純利益

### 6.4 1巻10万円判定の SoT

主指標は ledger の月次FCE × KENP単価 + 販売ロイヤリティ。`Phase A 1作目で月10万円達成` の判定もこの ledger を SoT とする。

---

## 7. Phase A 3作品の出版実行ロードマップ (再掲)

| Phase | 期間 | 内容 |
|---|---|---|
| WX-5 | Week 1-3 | trademark-check + AI開示検証 + ペンネーム/レーベル文書化 + Supabase migration実行 |
| WX-6 | Week 1-6 | KU CSV ingest スクリプト |
| WY-7 | Week 7-12 | 商品ページOS構築 (表紙CTR/Look Inside/Amazon Ads playbook) |
| WY-8 | Week 4-8 | a07 vol_0 リハーサル出版 (KDP プレビュー全 gate 通過、本出版はせず) |
| WY-8 | Week 9-16 | a07r vol_1 本出版 → 実 KENP 取得開始 |
| WZ-1 | Week 17-21 | 作品1 (ダンジョン探索) 本出版 |
| WZ-1 | Week 22-26 | 作品2 (転生貴族) 本出版 |

---

## 8. 違反時の対応プロトコル

### 8.1 KDP からの警告メール受領時

1. 即時対応: 該当作品の販売停止 (`halted` ステータス)
2. 警告内容を release ledger に記録
3. 修正対応 (タイトル変更/コンテンツ修正/AI開示修正) を実施
4. 再申請
5. 再発防止策を本文書に追記

### 8.2 アカウント停止通知

1. **慌てない**: KDP は経過観察期間がある場合が多い
2. KDP Support に異議申し立て (定型文ではなく作品ごとの事実を提示)
3. 復旧不可なら全作品の販売停止 → 別ペンネーム + 別レーベルで再構築 (新KDPアカウント取得には数ヶ月の冷却期間推奨)
4. **同一住所/口座での新アカウント取得は規約違反のため不可** → ピボットレベルの判断が必要

---

## 9. 文書改定履歴

- 2026-05-06: 初版作成 (WX-5 着手)
- (Phase Y 末で運用実績反映予定)
- (Phase Z 末で出版実績反映予定)
