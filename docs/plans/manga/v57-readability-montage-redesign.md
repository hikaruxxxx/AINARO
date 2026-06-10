# 漫画 V57「読めなさ」改修計画 — コマ割り半委任への転換

**Status**: P1-P4 実装完了 (2026-06-10)、§7 通し読み検証 **合格** (2026-06-11、v59 全 22p)
**Scope**: 横読み白黒漫画 v2 パイプライン L5(page-director) → L9(prompt-composer / render)
**起点**: a07-modern-dungeon ep01 V57 診断 + 半委任 vs 現行の対比生成実験
**関連**: SSoT `pipeline-v2.md` / 戦略 `strategy.md` / メモリ `feedback_manga_freehand_paneling` `project_manga_v57_diagnosis`
**実装分担**: 設計=本書(Claude)、実装=Codex、レビュー=Claude (CLAUDE.md フロー準拠)

---

## 1. 問題

V57 は絵の破綻・文字化け・二重描画がほぼ消えたが、**漫画として読めない**。各コマが「説明文付きの独立した一枚絵」になり、コマを追って物語を読む体験にならない。定量: close_up 62/110・eye_level 70・独白36≒会話40。

## 2. 検証結果 (2026-06-02・本計画の根拠)

「**コマ割りを座標で命令 (現行)** vs **シーン半委任 (コマ数とリズムのヒントだけ、レイアウト/カメラ/大ゴマは AI 判断)**」を**同一 ref・同一画風**で対比生成 (`scripts/manga/_oneoff-freehand-experiment.ts`)。

| シーンタイプ | ページ | 結果 |
|---|---|---|
| 対話 | p04 | 半委任 > 現行 (引き寄せ・視線誘導が自然) |
| 内省 | p03 | 半委任 > 現行 (群衆の中の孤立を構図で語る) |
| 会話 | p09 | 半委任 > 現行 (灯里の大ゴマ出現を見せ場化) |
| 戦闘 | p17 | 半委任 ≧ 現行 (動きの分解=構え→ヒット→吹っ飛び→着地ができた) |

→ **4タイプ全部で半委任が現行に勝つか同等。** 懸念した 読み順(RTL)・日本語セリフ・顔一貫性 はいずれも破綻せず。完全ゼロ指示(freehand)より最小ヒント(semifree)が安定。

## 3. 真因

最上位の原因は「**コマ割り(レイアウト)を座標で命令していること**」。現行は L5 page-director が各コマの rect/サイズ/ROW構造/読み順を `composePagePrompt` 経由で prompt に座標注入し (`prompt-composer-v2.ts` の `## LAYOUT` / `## ROW LAYOUT` / `## PANEL SIZE OVERRIDE`、643行〜/744行/829行〜)、AI に「このマスにこれを描け」と強制する。これがコマの緩急・視線誘導を殺し、顔アップの羅列を生む。

> **旧 P1 (panel に transition/eyeline を追加 = 指示を増やす) は撤回。** 指示を増やす方向は逆。半委任にすると AI がコマ間連結も自然に解決した。

## 4. 設計方針 (strategy.md 整合)

| 方針 | 内容 | strategy.md との関係 |
|---|---|---|
| **L5 座標注入を外す** | LAYOUT/ROW LAYOUT/PANEL SIZE/per-panel rect の prompt 注入を撤去 | §3「L05 は薄く」「L05 のテンプレ作り込みはアンチパターン」と完全一致。作り込んだ L5 が主犯だった |
| **半委任 prompt 型へ** | シーン内容 + セリフ + 画風 + ref + 最小ヒント(4-6コマ/引き・アップ・大ゴマ混在/RTL) | 検証済みの semifree プロンプト構成を本番化 |
| **セリフは embed 前提** | AI が画像内にセリフを描く。後段 SVG overlay 方式は両立しないので撤回判断 | 最近の embed mode 復帰と整合 |
| **指示は足さない** | 過剰演出ガードも最小限。ルールを増やすと元の木阿弥 | `feedback_ai_image_over_prompting` |

## 5. 具体改修 (効く順・ファイル:行)

### P1【本丸】composePagePrompt を半委任モードに
- `prompt-composer-v2.ts`: `## LAYOUT` / `## ROW LAYOUT` / `## PANEL SIZE OVERRIDE` / per-panel の rect・shot_type・camera 指定の生成を**止める** (フラグ `paneling: "freehand"` を新設し、既定を切替)。
- 代わりに `## DIRECTION (semifree)` を注入: 「4-6コマ目安、RTL厳守、引き/アップ/大ゴマを混ぜろ、無音の余白を使え、Less is more」。コマ数の目安は storyboard の panel 数を**参考値**として渡すに留める (強制しない)。
- セリフ(dialogue/monologue/narration)は話者付きで列挙する (embed)。検証スクリプトの `buildSceneAndLines` がそのまま雛形。
- 実装の正典は `scripts/manga/_oneoff-freehand-experiment.ts` の semifree プロンプト構成。これを composePagePrompt に移植する。

### P2 セリフ描画を embed に一本化
- L9 render は AI が描いたセリフをそのまま採用 (SVG overlay 焼き込みを行わない経路を既定化)。
- 読み順・誤字は L11 audit / 人手確認で担保。

### P3 density-floor 緩和 (独白過多の抑制)
- `dialogue-density-floor.ts`: `text_total_min` を引き下げ、前半 page_role(opening_hook/establishing/buildup) に monologue+narration の**上限**を導入。半委任で絵が語る分、text で埋める必要が減る。

### P4 L5 page-director の位置付け縮小
- page_plan(rect) は KDP 入稿・reading_order 等で使う分だけ残し、**render prompt には渡さない**。L5 のテンプレ拡張は停止 (strategy.md アンチパターン)。

## 6. 残課題と対処 (2026-06-02 抑制実験で更新)

1. **生成が重い** (300秒タイムアウト頻発) → `generateMangaImage` の `timeoutMs` 既定を 600000、`maxRetries` を 2 に (L9-render の呼び出し)。コスト/時間増を許容するか要判断。
2. **スタイル制約の遵守低下** (p17 で禁止の効果線/飛沫を AI が追加) → action では効果線を許容する方針に振るか、CONSTRAINTS の文言を最小調整。増やしすぎない。
3. **AI 過剰演出 (UI/数値・システム声の実体化)** → 抑制ヒント (in-frame UI/数値は最小、システム声は実体化せず吹き出しのみ) は p08/p20/p22 で**有効と確認** (灯里実体化が消え、巨大数値→現実値、コマ割りは無傷)。ただし**一律抑制はやりすぎ**: p22 の灯里大ゴマ (見せ場)・p20 の異常値 (「桁が違う」の視覚化) まで消えた。→ **抑制をデフォルトにし、見せ場の演出意図 (大ゴマ・見せたい異常値) は SCENE 記述から明示注入して上書き**する設計にする。
4. **数値のページ間揺らぎ** (embed の弱点: 残高 2138D→117G、経験値 98億→1250 と毎回変わる) → 確定すべき数値 (残高/ランク/経験値) は SCENE 記述に固定値で明示し、AI に発明させない。bible の quantitative_facts と同期。

## 7. 検証計画

- 揺らぎ確認: 4タイプ各 2-3 回再生成し、半委任が**安定して**現行に勝つか (画像生成は揺らぐ `feedback_image_gen_volatility`)。
- 全 22 ページを半委任で再生成 → V57 と通し読み比較。「コマを追って読めるか」を Claude + ユーザー視認で判定。
- 合格なら本番 composePagePrompt を切替、L5 prompt 注入を撤去。

## 8. SSoT / 戦略反映

- `pipeline-v2.md`: 既に本書を参照済 (関連ドキュメント)。L5/L9 節に「render prompt は半委任型、座標注入なし」を追記。
- `strategy.md`: §3 で L05 は元々「薄く」指定 → 本転換は戦略に忠実。§8 アンチパターン「L05 テンプレ作り込み」の実害が出た実例として追記検討。

## 9. 改訂履歴

- 2026-06-02 初版: P1=panel に transition/eyeline 追加 (指示を増やす) を中心に立案。
- 2026-06-02 改訂: 実画像検証で **半委任 (指示を減らす) が4タイプ全部で優位**と判明。P1 を撤回し、コマ割り座標注入の撤去 + 半委任 prompt 型へ全面転換。
- 2026-06-10 P1-P4 実装完了:
  - P1: `prompt-composer-v2.ts` に `PanelingMode` (`semifree` 既定 / `coordinate` フォールバック) + `composePagePromptSemifreeCore` を実装。SCENE には storyboard の action 連結 + `scene.key_visual_intent` を **Showcase (見せ場上書き)** として注入 (§6-3 の「一律抑制やりすぎ」対策)。抑制ヒント 2 行 (UI/数値最小・システム声非実体化) は DIRECTION の default。
  - P2: semifree では polygon frames overlay も skip (L09 で coordinate 時のみ適用)。maxRetries 1→2 (§6-1)。
  - P3: `dialogue-density-floor.ts` の text_total_min 引き下げ + 前半 page_role に `mono_narration_max` 上限導入。
  - P4: L09 は semifree 時 pagePlanPage / pageBackgroundTreatments を composer に渡さない。
  - 数値揺らぎ (§6-4): BIBLE FACTS block を semifree でも維持 (参照 section 名を LINES に修正)。
  - prompt size 実測: a07 p17=5030 chars / p04=5601 chars (旧 8-10k から削減)。テスト 568 件 pass。
  - 本番経路 smoke render (p04/p17 v58、Pro 枠 +2): 両ページとも成立。p04 は引き→中景→寄り→超アップのズーム演出、p17 は構え→ヒット→余韻→内省の動作分解 + 大ゴマ見せ場を AI が自律構成。RTL 読み順・話者帰属・SFX embed いずれも破綻なし。観測された embed 誤差: p17「俺の力じゃない。手順だ」の句点→読点揺れ (→ roadmap X1 vision gate の検出対象)。
- 2026-06-10 同日: 多エージェント監査 → `commercial-quality-roadmap-2026-06.md` 策定。N1 (render の fit:"fill" 全ページ +5.7% 横伸び歪み) を即日修正 (contain + 白 padding)。
- 2026-06-11 §7 通し読み検証 **合格** (v59 全 22p 一括 render、Pro 枠 +24):
  - **判定: 「コマを追って物語を読める」を全 22p で達成**。引き→寄りのズーム演出 (p4)、無音のタメ (p13 水滴)、戦闘の動作分解 (p17-19)、社会格差の絵示 (p11-12)、cliffhanger (p22) まで通読成立。V57 の「説明文付き一枚絵の羅列」から質的転換。
  - 発見した不具合と対処:
    1. **並列 render の画像衝突 race**: p05/p06 がバイト同一 (codex agent の最終書込が衝突)。tmpdir 隔離 + Node 側 copyFileSync 方式で根治、p05 再生成成功 (commit b62b576 + d6d671b)。
    2. **LINES 形式漏れ**: p12 で話者ラベル「獅童 雪（台詞）：」ごと、p16 でカギ括弧ごと吹き出しに描画 → CONSTRAINTS に書式禁止 1 文追加 (b62b576)。
    3. **embed 誤字** (roadmap X1 vision gate の検出対象実例): p07「倍化→倍信化」、p19「膝→鳩」、p17 v58 句読点揺れ。
    4. 軽微: p10 時計が 06:14 (到着前なのに目標時刻)、p21 TV 内灯里の顔 drift、響 (on_screen_via=photo) が光るアバターとして実体寄りに描画 (演出としては成立、意図確認は要ユーザ判断)。
