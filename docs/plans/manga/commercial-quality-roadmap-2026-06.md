# 漫画 商業クオリティ達成ロードマップ (2026-06-10)

**Status**: Active
**出自**: 多エージェント監査 (6 サブシステム精読 → 5 レンズギャップ分析 43 findings → 敵対的検証 23 件通過 → 統合)。
**前提**: v57 P1-P4 (コマ割り半委任 semifree 既定化) は 2026-06-10 実装完了 (commit 624f1b1)。
**統合原理**:
1. 半委任の検証を「正規経路・台帳内」で完了させる
2. 嘘をつくゲート (rect 前提検査) を撤去し、価値が生まれる場所 (render 後) に vision gate 1 本を置く
3. 実装済みなのに未配線の物語装置 (scene-graph 選別ループ / cliffhanger tournament / amplitude audit) を繋ぐ
4. 紙 (B6 印刷) の物理品質を確定する

**関連**: SSoT `pipeline-v2.md` / 改修 plan `v57-readability-montage-redesign.md` / 戦略 `strategy.md`

---

## 1. now (直近セッション) — 再走前に直すインフラ + §7 検証

N1-N4 を入れずに再走 (N5) すると、歪んだ画像・台帳外ファイル・虚構ゲートのまま検証することになる。

| # | 内容 | 規模 | 状態 |
|---|---|---|---|
| N1 | **fit:"fill" 廃止** — `L09-render.ts` の 1024x1536→1748x2480 アスペクト無視拡大が全ページ +5.7% 横伸び (顔比率・グリフ・吹き出し正円の恒常歪み)。contain + 白 padding に変更 | S | ✅ 2026-06-10 済 |
| N2 | **render 来歴記録** — RenderManifestEntry に prompt_sha256 / paneling mode / storyboard page hash を追加し、送信 prompt 全文を `renders/_prompts/p{NN}_{vN}.txt` に保存。無いと A/B・staleness 判定が timestamp 考古学に戻る | S-M | 未 |
| N3 | **name gate の再定義** — rect SVG レイアウト承認は半委任 render と構造的に不一致の虚構ゲート。exit 3/4 ブロックを外し「出来事+セリフ正解列+コマ数目安」のテキスト確認票に縮小 | M | 未 |
| N4 | **rect 前提検査の撤去・降格** — audit-vision の rect crop / bg_treatment_compliance / shot・camera 系 lint は semifree で「何も検査していないのに pass/fail を返す」偽データ化。削除 or info 降格。テキスト内容系 lint (dialogue_dedup / speaker_absent 等) は embed 正解データの lint として残す | M | 未 |
| N5 | **§7 通し読み検証** — 全 22p を L09 正規経路 (semifree) で再走 → V57 と通し読み比較。代表ページで SFX あり/なし A/B (実験は SFX 52 行を落として勝った = 検証構成と出荷構成の不一致)。storyboard の SFX を物語情報のみ 52→20 程度に厳選 | M + Pro枠22+ | ✅ 2026-06-11 合格 (v59 全 22p、詳細は v57 plan §9)。副産物: 並列 render race 発見→根治。SFX A/B は未 |
| N6 | **adopted-resolver default 反転 + L13 staleness 検査** — KDP package が v1 固定 fallback のため、今日 L13 を走らせると座標命令時代の旧画像が出荷される。manifest 最新既定 + resolved < 最新 を fatal に | S | 未 |
| N7 | **scene_overrides の key 整合** — bible の場面別アートディレクションが SceneMode 語彙不一致で一度も prompt に届いていない死データ。リネーム + トーン記述のみ採用 (コマ構成命令と HUD 言及は削除) | S | 未 |

## 2. next (1-2 週間) — 本物の品質ゲート 1 本 + 物語装置の配線

| # | 内容 | 規模 |
|---|---|---|
| X1 | **page 単位統合 vision gate を L11 に配線 (最優先)** — 検証ゼロの致命カテゴリ (RTL 読み順破綻 / embed 誤字 / 話者違い / 文字発明 / 顔一貫性) を 1 本に束ねる。page 画像 + LINES 正解列 + bible ref で同一 pass 判定。初期は auto-rank (flag ページのみ人手精査)、false-pass 率実測後に axis 単位で昇格。人手視認を全ページ→fail のみへ (月 100-200h → 10-20h)。※p17 v58 で「。→、」の embed 句読点揺れを実際に観測済み | M-L |
| X2 | **輝度トーン分布ゲート** — page PNG の white%/midgray% を商業 55 枚帯域 (white 38.9-62.6% / midgray 17.3-29.5%) と突合する決定論検査。「全面グレー AI 塗り」の定量検出 → reroll 候補化 | S |
| X3 | **KDP proof 1 冊を最優先発注** — 実効 203dpi・最小 4-5pt 相当の embed 文字が紙で読めるかは未検証。embed 一本化の品質上限を確定する律速タスク | S |
| X4 | **L03_5 を default pipeline に配線** — 「最大投資」の選別ループ (candidates×5 → pairwise) が一度も絵に接続されていない。L03→L03_5→L04 直列化 + key_lines 全空を validator error に | S-M |
| X5 | **cliffhanger tournament を ep1+各話末に拡大** — 既定 candidates 0→5。ep1 の引きは試し読み→購入転換の最重要点なのに single-shot 1 案が貫通 | S |
| X6 | **amplitude audit を scene_emotion ベースで L11 吸収** — panel intensity (V57 リライトで 110/110 null) と propagation 層を廃止、scene_emotion から page 曲線を直接計算。閾値は semifree 実測で再校正 | S-M |
| X7 | **面白さ self-pairwise** — storyboard → episode テキスト化 + pairwise で「改修前 vs 後」勝率記録。「読めるようになったが面白さ 10% のまま」を検知する唯一の出口 | S-M |
| X8 | **expression の semifree 経路接続** — 現在 semifree は表情情報を落としている。panel action 行末尾に畳み込み (新ルール文は足さない)。default 化前に 4 タイプ×2 枚 A/B 必須 | S-M |
| X9 | **L12 repair の revision_queue 合流** — v1 path 前提の死実装を整理、audit failed を既存 queue へ enqueue | S |

## 3. later (構造投資)

- **L1. reader_question_schedule の scene-graph 注入** (**ep02 着手前に必須**) — 9 問の連載牽引台帳が plot.json 止まり。ep02 生成の瞬間に問いの放置・重複開示が無検知で起こる確定債務
- **L2. TurnAnchor の物理ページ接地 (めくりフック)** — parity から verso/recto を決定論付与 + 「reveal/cliffhanger がめくり先に落ちているか」検査。AI prompt には注入しない
- **L3. 線画特化 SR 後処理** (Real-ESRGAN anime 系) — X3 の紙 proof 結果で優先度確定
- **L4. グレー→ドットトーン二値化の決定論後処理** — X2 で prompt 矯正不能と判明した場合の構造対策
- **L5. WEBTOON ヒット 10 作品 anchor pool (S3)** — X7 勝率が改善傾向を示してから (現状品質では全敗で勾配ゼロ)
- **L6. 量産運用装置群** — diegetic text (アプリ名/UI 数値) SSoT 化、視線誘導・写植の合否観点文書化、再生成コスト telemetry、version 棚卸し
- **L7. L04_9 cliffhanger-architect の限定運用** — default 列に入れず検証専用

### craft 文書の負債 (next〜later、検証で確認済みのもの)

- 章扉 (chapter_opener) が PageRoleV2 に無く、巻にすると話境界のない本になる → L02b で決定論挿入 + 専用最小プロンプト
- phase_a_quality_checklist が撤回済み前提 (NO_TEXT/SVG overlay/画像反転/panel_composite) のまま → embed 前提に改訂
- combat.md 等の「SFX は SVG 後付け」L1 MUST が embed 一本化と矛盾 → craft は what のみ規定、how は pipeline-v2.md に一元化
- manga_craft v3 の scene_type 別注入 (50_index.json) が未実装で全 47 ルール常時全量注入 → tier 別 load に置換 (指示総量は減る)
- 見開き (is_spread) の render 経路なし → 横長 1 コール→中央分割の構造変更 (巻クライマックス 1 箇所で検証から)

## 依存関係

N1→N5 (歪み修正が先) / N2-N4→N5 (台帳・ゲート整理が先) / N5→X9 / X4→L1 / X3→L3 / X7→L5

## 捨てる判断 (実施しないこと)

- レイアウト承認の register し直し (座標命令の復活)
- ページ自動入替によるめくり吸収 (物語破壊リスク)
- visual_params 数値の prompt 注入 / 全台詞への intent 伝搬 (Less is more 違反)
- panel 単位 emotional_intensity の決定論微調整 (層を減らす方向で解決)
- vision gate の無検証 auto-adopt (画像判定一致率 ≈25% の前例)
