# 漫画パイプライン v2 設計plan (SSoT)

**Status**: Active (2026-05-02 〜、2026-05-17 9 ステージ構造に再編)
**Predecessor**: `_archive/pipeline-v1-2026-05-02.md` (旧 v1、stage1-8 手作業含む)
**Decision basis**: Codex + Claude エージェント red-team レビュー (2026-05-02)、L0-L17 大規模再設計を 12 layer に圧縮
**上位戦略**: `strategy.md` — 投資配分 (厚く/薄く) と陳腐化耐性の判断基準。新規 layer 着手前に必ず参照

> **2026-05-17 更新**: EXIT戦略前提変更 (月50本量産 → **月5-10本高品質**) に伴い、12 layer を **9 ステージ構造** に再編。詳細 plan は `~/.claude/plans/ainaro-ep1-bible-generic-shore.md`。実装は Sprint 0-7 (Phase A + 7 Sprint、9 commit) で完了。本ファイルの 12 layer 全体図は historical 記録として残す。
>
> ### 9 ステージへの変更点
>
> | 旧 | 新 | 変更 |
> |---|---|---|
> | L01-L02 | Stage 1 Bible/Asset Gate | 統合 |
> | (なし) | **Stage 0 Source Adapter** | **新規 (L00-novel-adapter、小説→brief.v2.md)** |
> | L02b-vol | Stage 2 Volume/Episode Design | 単独 |
> | L03 + L03.5 | Stage 3 Manga IR | 両立 (統合せず) |
> | L04 + L04.1 + L04.9 | Stage 4 Storyboard/Name | scene-swap 固定 |
> | L05 | Stage 5 Page Direction + Sprint 7 enforceVarianceRule | **panel rect 強制 (variance ≥ 3.0x)** |
> | L06 + L07 | Stage 5 L0607-resolve | **統合済** |
> | L08.7 + L08.9 | Stage 6 Pre-render Gate | + RenderConstraints Rule 16-18 |
> | L09 | Stage 7 Render | MANGA_CRAFT_DIRECTIVES_V6 統合 |
> | L11 全 | Stage 8 Repair/Export | **triage モード追加** |
> | L02b監査 / L05.5 / L05b/c / L09b | (削除候補) | --quality-tier=premium で skip |
> | (なし) | **Pro 枠 ledger** | **新規 (data/manga/_ledger/pro-quota.sqlite)** |
>
> ### 運用ルール (月5-10本高品質)
>
> - 安全上限: 月 5-6 本 (24P + bible refs 拡充 + retry 込み)
> - 攻めた上限: 月 7-8 本
> - 月 10 本: OpenAI API バックアップ必須 (`OPENAI_API_KEY_BACKUP`)
> - quota check は `src/lib/manga/_ledger/quota.ts` で自動化、80%/95% threshold で警告/切替
>
> ### 2026-05-17 関連 commit
>
> - `ae6e4e6` MANGA_CRAFT_DIRECTIVES_V6 統合
> - `b2fc16f` scene-graph RenderConstraints + Rule 16-18
> - `cb6b3d4` schemas-v2 L2b Story Hierarchy + scene-graph 整備
> - `501e923` L00-novel-adapter (小説→brief.v2.md)
> - `313f0a2` L0607-resolve (L06+L07統合)
> - `c596606` L11 triage モード
> - `3636cae` Pro 枠 ledger (SQLite + 自動切替)
> - `f2bd5af` pipeline --quality-tier=premium
> - `0c7fa8b` L05 enforceVarianceRule + variance-rich layout patterns
> - `84681e1` Sprint 7 追加チューニング: L9 prompt に PANEL SIZE OVERRIDE 追加 (page-specific な panel rect 強制ディレクティブ)
> - `826acc7` Sprint 8 案1: L9 prompt に ROW LAYOUT 追加 (row-grouping で AI の縦積み bias を矯正)
> - `3f5bd80` Sprint 8 案2: effect-lines detector で establishing 大コマの radial 誤発火を抑制
> - `316355f` Sprint 9 案A+B: storyboard narration を bible 準拠に修正 + L9 prompt に BIBLE FACTS section 追加
> - `b18c404` Sprint 10 案1: bible-facts-audit を新設 (storyboard narration の bible 整合性検証 CLI)
> - `1280fb5` Sprint 10 案2: ROW LAYOUT に行高 % と幅×高さの 2D 指定を追加
> - `8359f3e` Sprint 11 案1: L9 prompt に ESTABLISHING RESTRICTIONS section を追加 (overlay 数制限 + negative list)
> - `0c93d73` Sprint 12 案1+5: SCENE PANEL RESTRICTIONS に拡張 (wide shot_type 対応 + 文字数 800→300 字圧縮)
> - `1a589c8` Sprint 13 案1: SCENE PANEL RESTRICTIONS の directive 強度を補強 (Max 0/1 細分化 + MUST not 格上げ)
> - `366d2e7` Sprint 14 案1: BibleSnapshotV2.meta に quantitative_facts を追加し bible-facts-audit が優先参照
> - `cce9743` Sprint 15 案4: bible-facts-audit に ranks 値検証を追加 (架空 rank「SS級」等の検出)
> - `e89883d` Sprint 16 案1: quantitative_facts に personal_timeline_facts を追加し個人時間軸誤検出を解消
> - `be51418` Sprint 18: dialogue-density-floor を新設 (page_role 別 dialogue/text 下限 audit)
> - `62d5303` Sprint 19 案3: a07 ep01 storyboard の dialogue/narration を補強 (12 page → findings 0、商業漫画レベル達成)
> - `7b899d7` Sprint 20 案1: L04 storyboard 生成 prompt に density floor directive を注入 (生成段階での予防網)
> - `2df5910` Sprint 21 案6: prompt size 警告閾値 8000→12000 + BIBLE FACTS 抜粋 300→150 字圧縮 (warning ノイズ解消)
> - `8660359` Sprint 22 案6: SCENE PANEL RESTRICTIONS + ROW LAYOUT を compact 化 (各 30-40% 文字数削減)
> - `314e0da` Sprint 22 案5: PanelV2 schema に effect_lines を正式追加 (effect-lines/types.ts 切り出し、detector unsafe cast 解消)
> - `3fb7d3d` Sprint 22 案2: L03.5 scene candidate prompt に key_lines 量 floor directive を追加 (中間表現>監視網 根本対応)
>
> ### Sprint 7 追加チューニング結果 (a07 ep01 p01/p12 で実画像検証)
>
> - **p12 (5 panel page、複雑 layout)**: v3 → v4 で微改善 (見せ場の奥のゲート panel がより大きく描かれる傾向)
> - **p01 (3 panel page、page_plan ratios [50%, 12%, 12%])**: AI が中下段の小さい 2 panel を「均等 25% × 2」に読み替える傾向、prompt 強化だけでは矯正困難
>
> ### Sprint 8 案1 (row-grouping) 結果 (a07 ep01 p01 v5、Pro 枠 +1 枚)
>
> - **構造的成功**: v4 までは「上=50%、中段=25%、下段=25%」と AI が 3 panel page を縦積み 3 行に読み替えていたが、v5 で「上段=50% 全幅、下段=右下+左下 SIDE-BY-SIDE」と page_plan 本来の 2 行構成を認識
> - **未解決**: panel area % の厳密一致 (12% × 2 ではなく 25% × 2 になる)。AI は「2 panel 横並び = その行の高さを使う」と読むため変動 h を尊重しない
>
> ### Sprint 8 案2 (effect-lines detector 修正) 結果 (a07 ep01 p01 v6、Pro 枠 +1 枚)
>
> - **効果線誤発火の完全解消**: v5 まで上段全体に走っていた網目状放射線が消失。夜景の establishing が「静かな情景」として正しく描かれ、ダンジョンゲート青白光や手前のホログラム広告が初めて明確に視認できるように
> - storyboard の `effect_lines: null` opt-out を尊重 + `shot_type=establishing/wide` での radial 自動発火を抑制
> - 商業漫画品質: v5 B- → v6 B+ (1 段階上昇)
>
> ### Sprint 9 案A+B 結果 (a07 ep01 p01 v7、Pro 枠 +1 枚)
>
> - **bible 設定逸脱の発見**: storyboard.json panel#1 narration が「三年前」(bible は 20年前)、「十五歳で受ける」(bible は 18歳までに) と二重逸脱。前回 Sprint 9 提案「ナレーション 1 行のみ」は方向が逆 (実際は文章量不足 + bible 数値改変が問題) と判明、撤回。
> - **A 対症療法**: storyboard.json panel#1 narration を bible 準拠 (「20年前、世界中の都市の地下にダンジョンが現れた。」「18歳までに受ける鑑定石が、S〜Fの一字で人生の入口を決める。」) に書き換え
> - **B prompt 防御**: L9 prompt に `## BIBLE FACTS (must match exactly)` section 追加。bible.world.timeline + system の先頭 300 字を抜粋して embed、「数値・年代・段階数は新規発明禁止」「narration は仕様通りに描画 (paraphrase 禁止)」を指示
> - **効果**: v6 まで AI 補完で描かれていた架空ランキング表「S級 0.2% / A級 3.1% / F級 67.3%」が v7 で消失。narration が bible 準拠で正確に描画される。商業漫画品質 v6 B+ → v7 A-
> - **未解決**: L04 storyboard 生成段階の bible 数値検証は未実装 (a07 ep01 のみ手動修正、他作品は同種逸脱の可能性)
>
> ### Sprint 10 案1+2 結果 (a07 ep01 で実走行、p01 v8 で render 検証、Pro 枠 +1 枚)
>
> - **案1 (bible-facts-audit)** ✓ 実用ツールとして機能: a07 ep01 走行で panel p022「三年前。公社、鑑定窓口。」を warning 検出 (これはレン 18 歳基準で 3年前=15歳鑑定の個人時間軸、誤検出として許容)、panel#1 (修正済) は OK
> - **案2 (ROW LAYOUT 行高 %)** △ 構造は維持、area% 厳密一致は未達: v8 で「panel#2/3 が 50% width × 25% height」と指示しても実画像は 25% × 2 のまま (12% × 2 への矯正は AI が踏まえない)。AI の確率的揺らぎで描き込み密度は v7 比で再悪化
>
> ### Sprint 11 案1 結果 (a07 ep01 p01 v9、Pro 枠 +1 枚) ★ 本セッション最高品質
>
> - **establishing overlay が劇的に整理**: v8 で 4-5 個あった補完 overlay (ランキング表/詳細統計/SNS/LIVE/報奨) が v9 で **1 個 (ホログラム広告)** に絞られた
> - 「Less is more」directive + negative list (SNS/LIVE/ranking/statistics/fake brand) が極めて効果的
> - 下段 panel#2 (close_up) も波及的に整理 — establishing 抑制で AI 全体が控えめに
> - **商業漫画品質: v8 B+ → v9 A〜A-** (本セッション内 1-2 段階上昇)
> - prompt size 8532 > 8000 threshold で警告、render 自体は成功
>
> ### Sprint 12 案1+5 結果 (Pro 枠 +2 枚)
>
> - **a07 ep01 p01 v10**: overlay が v9 の 1 個から v10 で 2 個に微増 (確率揺らぎ or 文字数圧縮で directive 強度低下、品質 v9 A〜A- → v10 B+〜A-)
> - **a07 ep01 p12 v10**: wide 抑制効果で公社入口ゲート panel の描き込みが整理、本セッション初の p12 高品質出力 (B+ レベル)
> - 文字数圧縮 (8532 → 8310) で p01 の prompt warning 緩和、p12 は依然 9995 字で超過
>
> ### Sprint 13 案1 結果 (a07 ep01 p01 v11 + p05 v11、Pro 枠 +2 枚)
>
> - **p01 v11**: overlay 1 個に絞り戻し成功 (v10 の 2 個から 1 個へ、強化 directive 効果実証)。商業漫画品質 **A〜A-** (本セッション最高水準復活)
> - **p05 v11 (初評価)**: 6 panel 構成、上段に意図的な集中線 (close_up なので Sprint 8 案2 除外対象外、storyboard 意図と整合)、中段ホテル/下段「適性ランクは一生固定」+ 鑑定結果 F の公社アプリ。**B+〜A-**
>
> ### Sprint 13 で skip 判断したもの
> - **案4 (一括 audit 適用)**: `audit-bible-facts.ts --all` モードは既実装、対象作品が a07-modern-dungeon の 1 つしかないため実適用余地なし。将来作品増えてから
> - **案5 (PanelV2 型 effect_lines)**: schema 拡張 + 3 ファイル import 同期で工数大、detector のテスト 5 ケースで挙動担保済みのため後回し
>
> ### Sprint 14 案1 結果 (a07 bible に quantitative_facts 手動追加で audit 再走行)
>
> - schema 拡張完了: `BibleSnapshotV2.meta.quantitative_facts?: { years_ago?: number[]; judgement_age_max?: number; ranks?: string[] }` (後方互換 optional)
> - bible-facts-audit が構造化 facts を優先採用、regex 値とマージ
> - a07 bible に手動で `{years_ago: [20], judgement_age_max: 18, ranks: [...]}` を追加、audit 再走行で動作確認
> - panel p022「三年前」誤検出は引き続き残存 (個人時間軸由来、`personal_timeline_facts` 拡張は Sprint 15 候補)
>
> ### Sprint 15 案4 結果 (a07 ep01 で audit 再走行)
>
> - rank_mismatch 0 件 (storyboard には S級 / F級 のみで ranks 内正規、AI 補完による架空 rank 混入は未発生)
> - years_ago_mismatch 1 件 (前回同様 p022 個人時間軸誤検出、Sprint 16 で対応)
> - 機能としては「SS級」「Sプラス級」「S+級」のような架空 rank が混入した瞬間に検出される検査網が完成
>
> ### Sprint 16 案1 結果 (a07 ep01 で audit 再走行)
>
> - **findings 0 件達成** (前回まで p022「三年前」が個人時間軸誤検出として残存していたが、reference_years_ago: [3] 登録で抑制成功)
> - bible-facts-audit が「真の bible 逸脱」と「個人時間軸」を明確に区別、本番運用レベルへ
>
> ### Sprint 17 案4+5 結果 (検証のみ、Pro 枠 +1 枚)
>
> **案4 (p12 V1 vs v10 比較)**:
> - V1 (Sprint 0 前) は 8 panel 構成、wide panel (公社入口ゲート) に overlay 詰め込み気味
> - v10 (Sprint 12 案1+5 後) は 6 panel に整理、wide 抑制で公社ゲート panel がクリーンな環境描写に
> - 品質: V1 B → v10 B+ (wide 拡張の実効性、複雑 layout page でも確認)
>
> **案5 (p19 v11 render)**:
> - V1 は縦積み 5 panel、panel area ほぼ均等
> - v11 は 2 列 grid 5 panel、上段 close_up DOMINANT (約 1/3) + 中下段で variance あり、主人公の右手 close_up が追加され余韻増
> - 品質: V1 B → v11 B+〜A- (close_up + wide 混在 page でも構造改善累積)
> - SCENE PANEL RESTRICTIONS の直接効果は見えず (establishing なし)、Sprint 7-10 (enforceVariance + ROW LAYOUT + effects 修正) の累積効果が支配的
>
> **案6 (ep02/ep03 一括 audit)**: 対象 storyboard 未生成のため skip
>
> ### Sprint 18 結果 (a07 ep01 で dialogue-density-floor audit 実行) — render 中断契機
>
> ユーザーから「全 page render」を依頼された際、ネーム (storyboard) を確認したところ
> セリフ/ナレーション量が全体的に少なく、特に dialogue page で物語進行が成立しない
> 状態と指摘あり。集計と audit ツール (dialogue-density-floor) を新設して構造課題を可視化。
>
> - **a07 ep01 は 24 page 中 12 page で 21 findings** (商業漫画下限を下回る)
> - **致命的 (dialogue page で dialogue ≤ 1)**: p3, p6, p7, p12, p22 — 「会話していない会話シーン」
> - **準致命 (reveal で dialogue+mono ≤ 1)**: p5, p20, p23
> - **text 不足**: p2, p10, p11, p14, p21
> - 全 24 page 平均 text 量は 2.2 行で商業漫画標準 (5-12 行) の 1/3-1/5
> - 集計コマンド: `node --import tsx scripts/manga/audit-dialogue-density.ts --slug a07-modern-dungeon --episode 1`
>
> ### Sprint 19 案3 結果 (a07 ep01 storyboard 全 12 page 手動補強、Pro 枠 +2 枚で検証)
>
> phase 1 (致命 5 page):
> - p3 (コンビニ夜勤): 同僚/TVニュース/客の off-frame dialogue 4 行追加 → total=7
> - p6 (鑑定回想): 公社窓口員 dialogue 3 行追加 → total=6
> - p7 (深夜帰宅): 内容上 dialogue 不適のため page_role を buildup に変更
> - p12 (公社ゲート): システム音声 dialogue 3 + monologue 2 追加 → total=6
> - p22 (ナビ確認): nav 応答 dialogue 2 追加で物語転換点を明示 → total=6
>
> phase 2 (軽症 8 page): p2/p5/p10/p11/p14/p20/p21/p23 を最小修正で補強
>
> audit 結果: 全 24 page で **findings 0 達成** (商業漫画下限クリア)
>
> 実画像検証 (v12):
> - **p3 v12 (A)**: 同僚/客/TVニュース dialogue が image overlay として描画、会話 page として商業漫画レベル
> - **p22 v12 (A-)**: ナビ-レンの会話 dialogue が overlay、物語転換点が v11 比で明示
>
> ### Sprint 20 案1 結果 (L04 prompt 生成段階での予防網完成)
>
> - shotlist 経路 (`extractStoryboardFromShotlist`) と scene_graph 経路 (`buildPanelDetailPrompt`) の両方に density floor directive を注入
> - 既存 audit-dialogue-density (検出網) と同 floor 値を共有 — 生成 → 検証の双方向ループ完成
> - 補強パターン (off-frame voice / システム音声 / 状況描写 / リアクション) も prompt に明示
> - 562 tests 全 pass、tsc clean
>
> ### 生成 → 検証パイプライン (完成形)
>
> ```
> L04 storyboard 生成 prompt (density floor directive 注入済)
>     ↓
> storyboard.json
>     ↓
> audit-dialogue-density (Sprint 18 で検出網)
>     ↓ findings 0 ?
> L09 render
>     ↓
> audit-bible-facts (年代/年齢/ランク整合性、Sprint 14-16)
> ```
>
> ### Sprint 21 案6 結果 (warning ノイズ解消、Pro 枠 +1 枚)
>
> - PROMPT_WARN_THRESHOLD=12000 を新設、MAX_PROMPT_CHARS=8000 は tier downgrade トリガーとして据え置き (品質セーフティ機構維持)
> - BIBLE FACTS の timeline/system 抜粋 300→150 字、a07 では必要 facts (20年前/18歳まで/七段階) を概ね保持
> - p3 v13 で warning 消失 + 品質維持を確認 (dialogue 4 + monologue + TV ニュース overlay 全描画)
>
> ### Sprint 22 完了 (案2, 案5, 案6 + 進行中の案3)
>
> - **案6 (compact 化)**: SCENE PANEL RESTRICTIONS + ROW LAYOUT prompt 出力 30-40% 削減、562 tests 維持
> - **案5 (effect_lines schema)**: effect-lines/types.ts 切り出しで循環依存回避、detector の unsafe cast 解消
> - **案2 (L03.5 key_lines floor)**: scene candidate prompt に panel 数別下限 directive、空 [] を生成失敗扱いに格上げ
> - **案3 (残 22 page v13 render)**: background 実行中、Pro 枠 +22 消費見込み、結果は次セッションで集約
>
> ### 三層 dialogue 密度防御 (完成形)
>
> ```
> L03.5 scene candidate prompt (key_lines 量 floor) ← Sprint 22 案2
>     ↓
> scene_graph.json (dialogue_plan.key_lines)
>     ↓
> L04 storyboard 生成 prompt (page_role 別 density floor) ← Sprint 20 案1
>     ↓
> storyboard.json
>     ↓
> audit-dialogue-density (生成後の検出網) ← Sprint 18
> ```
>
> ### Sprint 23 候補
>
> 1. **(検証)** L03.5 を a07 ep01 で再走行 → key_lines floor directive の実効性測定
> 2. **(検証)** L04 を a07 ep01 で再走行 → density floor 反映の予防網実効性確認
> 3. **(検証)** Sprint 22 案3 結果集約 → 全 page 品質測定 (商業漫画 24 page セット完成)
> 4. **(中)** L11 audit に area % 乖離検出 (vision 解析必須)
> 5. **(低)** effect_lines schema 拡張後の test fixture 整理 (cast 削除)

## 設計原則

1. Single source of truth per layer — 各 layer は 1 モジュール / 1 スキーマ / 1 CLI エントリ
2. No legacy compat — stage1-8 / 旧 DB 経路 / 自由文字列 subjects は完全破棄
3. Hard fail over silent skip — bible 未登録キャラ・refs 解決失敗・schema 不一致は即停止
4. Asset by ID — ファイルパス直指定禁止、`asset_id` を主キーに `source_provenance` 強制
5. Snapshot-only — Phase A は JSON snapshot 経路に集約 (DB は Phase B で再評価)
6. Idempotent layer rerun — 各 layer は input hash でキャッシュ、変更分のみ再実行
7. Explicit capability dependency — render 前に `data/manga/capability/{model}.json` 読込必須

## 12 Layer 全体図

```
═══ PHASE 1: WORK SETUP (once / 作品) ═══
L1   Bible Snapshot        V2企画書 → bible/snapshot.json
L2   Bible Images          snapshot → bible/refs/{characters,locations,props}/
L2b  Story Plot            (2026-05-13 物語OS再設計)
                           --phase=series: snapshot + V2企画書 → series_plan.json
                                            (全N巻の arc 配分・主人公長期成長・core_hook 進化)
                           --phase=volume: snapshot + series_plan + V2企画書 → volumes/v{NN}/plot.json
                                            (schema_version 2: belongs_to_arcs, episodes[].arc_position,
                                             episodes[].volume_position, episodes[].scenes[] (5-7 個),
                                             scenes[].directing_intent (opening_hook/world_anchor/
                                             midpoint_turn/cliffhanger_setup/final_pull))
                           2026-05-14 構造強化:
                           - Episode Archetype Patterns (話型辞書): data/manga/episode_patterns/{subtype}.json
                             Pass 1 で archetype_id 割当、Pass 2 で phase→scene 制約注入
                           - Visual Channel Map: scene.primary_channels[] で情報伝達チャネル明示
                           - Reader State Assertions: scene.reader_state_after で読者知識/感情/疑問を累積追跡

═══ PHASE 2: EPISODE PLANNING (per ep) ═══
L3   Shotlist              bible + ep_text → episodes/epNN/shotlist.json
L3.5 Scene-Graph           bible + shotlist + brief + volume_plot (scenes 込み) → episodes/epNN/scene_graph.json
                           L2b scene_skeleton.scene_no を継承、directing_intent を Scene に転記
                           物語論理 (arc/beat/cast/dialogue_plan/foreshadow/protagonist/relationship/time)
                           × 頁演出 (page_budget/mode/turn_anchor/layout_pattern/subtype/render_strategy)
                           × 選別ループ (candidates×5 → pairwise → predict-hit → anchor 比較 → 採用)
                           Phase β B1-B5-1 + γ 巻全体 cross-episode validator まで完成 (2026-05-07)。
                           a07 第 1 巻 10 episode を新方式で生成済み (sequential 実走 41 分、errors=0)。
                           詳細: docs/plans/manga/scene-graph-l3-5.md
L4   Storyboard            scene_graph + bible → storyboard.json (panel は scene_id を継承、entity_id binding hard required)
L4.5 Reader Journey Sim    scene_graph + storyboard + bible → reader_journey.json (2026-05-14 新設)
                           LLM で初見読者をページ順シミュレート、理解度/感情/離脱リスク/疑問を構造化 FB
                           CLI: scripts/manga/layers/L04_5-reader-journey.ts
                           Console: 読者ジャーニータブ (engagement 推移 + 改善提案)
L5  Page Director          storyboard + capability → page_plan.json
L6  Continuity Resolve     page_plan + bible → page_plan + continuity_group_ids
L7  Refs Resolution        page_plan + bible/refs → resolved_refs.json
L8  Incremental Refs       resolved_refs.unresolved → bible/refs/_ep{N}/

═══ PHASE 2.5: NAME GATE (per ep, 人間判定) ═══
L8.5 Name Preview         storyboard + page_plan + bible/refs → name/p{NN}.svg + name_manifest.json + name_approval.json (all-pending)
                          + L8.6 audit を内部呼出し → name/name_audit.json
L8.6 Name Audit (rule)    audit-rules.ts (純TS、LLM 不使用) で 14 ルール検査
                          - dialogue_overflow / panel_overcrowd / panel_undercrowd / shot_repetition
                          - focus_entity_missing / ref_thumbnail_missing / dialogue_speaker_absent
                          - importance_imbalance / silent_run / bleed_overuse / reading_order_jump
                          - establishing_late / cliffhanger_role_mismatch / opening_hook_no_focus
                          warning 表示のみ。L9 gate は人間判定のみで走る (audit は gate しない)
L8.7 Name Approval        serve-ops.ts の ops console SPA で a/r 操作 → name_approval.json 上書き

═══ PHASE 3: RENDER (per ep) ═══
L9  Render                 page_plan + resolved_refs + name_approval (gate) → renders/p{NN}.png (吹き出し・ナレーション・擬音を画像内に焼き込み)
                          ※ approved 以外のページは skip / hard fail (--skip-name-gate で回避可)
                          ※ 2026-05-07〜 render_strategy=page_one_shot 既定 (1ページ 1 codex コール + LAYOUT GEOMETRY 注入)
L11 Audit                  renders + bible → audit.json
L12 Repair                 audit.failed → re-run L7-L9 for failed panels

═══ PHASE 4: PUBLISH (per volume) ═══
L13 KDP Package            volumes/vNN/episodes 全部 → kdp/{manuscript,cover}.pdf
```

## render_strategy 既定 (2026-05-07 〜)

L9 の既定 render_strategy は **`page_one_shot`** (1 ページ = 1 codex 画像生成コール)。

- L5 page-mapper-v3 の `chooseRenderStrategy` は capability.recommended_strategy=`panel_composite` の場合のみ panel_composite を返し、それ以外は常に `page_one_shot`。
- L7 refs-resolver-v2 は `page_one_shot` ページに対して `page_${N}` packet (panel-level refs を union+dedupe) を生成。
- L9 は `composePagePrompt` に `pagePlanPage` を渡し、rect / polygon / importance / bg_treatment 情報を **LAYOUT GEOMETRY** セクションに整形してプロンプト末尾の `PAGE LAYOUT:` 行直後に注入。複雑コマ割 (HERO splash / 縦長スリット / L字嵌込 / 巨大文字背景 / 時間圧縮ストリップ など) を 1 コールで成立させる。
- panel_composite 経路 (L9 内 `panel_composite` 分岐 + `composePanelsIntoPage` + `L09b-page-compose.ts`) は capability override 時の fallback として残置。新規ページは原則使わない。

検証根拠: `_archive/scripts-deprecated/_oneoff-pageshot-p2-3.ts` で a07 ep01 を題材に 25 patterns + 5 variants を生成、約 76% 強再現 / 24% 部分再現 / 失敗ゼロ。詳細は `~/.claude/.../memory/project_manga_render_pageshot_pivot.md`。

## ディレクトリ構造

```
data/manga/
├── _archive/2026-05-02-pre-redesign/   ← 旧 stage1-8 退避先
├── capability/
│   └── gpt-image-2.json
├── style-plates/
│   └── manga_bw_seinen_*.png
└── works/{slug}/
    ├── meta.json
    ├── bible/
    │   ├── snapshot.json
    │   └── refs/
    │       ├── characters/{char_id}/{variant}.png
    │       ├── locations/{loc_id}/{variant}.png
    │       ├── props/{prop_id}/{variant}.png
    │       └── _provenance.json
    ├── volumes/v{NN}/
    │   ├── plot.json
    │   └── kdp/
    │       ├── manuscript.pdf
    │       ├── cover.pdf
    │       └── metadata.json
    └── episodes/ep{NN}/
        ├── shotlist.json
        ├── storyboard.json
        ├── page_plan.json
        ├── resolved_refs.json
        ├── name/                ← L8.5 出力 (SVG ネーム + manifest)
        │   ├── p{NN}.svg
        │   ├── name_manifest.json
        │   └── name_audit.json  ← L8.6 出力 (audit findings、warning のみ、gate しない)
        ├── name_approval.json   ← L8.7 出力 (人間 or migration 判定)
        ├── renders/p{NN}.png
        ├── audit.json
        ├── repair_log.json
        └── _incremental_refs/
```

## CLI

```bash
# end-to-end (L1 → L12)
npx tsx scripts/manga/pipeline.ts --slug a07-modern-dungeon --episode 1

# Phase 1 だけ
npx tsx scripts/manga/pipeline.ts --slug a07-modern-dungeon --to L2

# 単一 layer 再実行 (upstream は cache)
npx tsx scripts/manga/pipeline.ts --slug a07-modern-dungeon --episode 1 --layer L7 --force

# Volume 仕上げ
npx tsx scripts/manga/pipeline.ts --slug a07-modern-dungeon --volume 1 --layer L13

# === ネーム gate (L8.5 / L8.7 / L9 gate) ===
# ネーム生成 → ブラウザで承認 → L9 から再開
npx tsx scripts/manga/pipeline.ts --slug a07-modern-dungeon --episode 1 --to L08_5
npx tsx scripts/manga/serve-ops.ts --slug a07-modern-dungeon --episode 1
# → http://localhost:5174/works/a07-modern-dungeon/episodes/ep01/#name-gate で a/r 操作
npx tsx scripts/manga/pipeline.ts --slug a07-modern-dungeon --episode 1 --from L09

# 既存 ep を all-approved (migration) で初期化
npx tsx scripts/manga/migrate-name-approval.ts --slug a07-modern-dungeon --episodes 1-10

# gate 緊急回避 (推奨しない)
npx tsx scripts/manga/pipeline.ts --slug a07-modern-dungeon --episode 1 --layer L09 --skip-name-gate

# === reject 集計レポート (v2) ===
npx tsx scripts/manga/name-reject-report.ts                     # 全作品
npx tsx scripts/manga/name-reject-report.ts --slug a07-modern-dungeon --json

# === L5 v3 (importance/page_role/右綴じ) ===
# デフォルトは v3、明示的に v2 に戻す場合は --mapper v2
npx tsx scripts/manga/layers/L05-page-director.ts --slug a07-modern-dungeon --episode 1 --mapper v3
npx tsx scripts/manga/layers/L05-page-director.ts --slug a07-modern-dungeon --episode 1 --mapper v2
```

## 実装ファイル対応

| Layer | エントリ | コア実装 |
|---|---|---|
| L1 | `scripts/manga/layers/L01-bible.ts` | `src/lib/manga/bible/v2-adapter.ts` + `bible-snapshot.ts` |
| L2 | `scripts/manga/layers/L02-bible-images.ts` | `bible/character-images.ts` + `location-images.ts` + `provenance.ts` |
| L3 | `scripts/manga/layers/L03-shotlist.ts` | `shotlist/{scene-splitter, rhythm-curve, shot-planner}.ts` |
| L4 | `scripts/manga/layers/L04-storyboard.ts` | `storyboard/storyboard-builder-v2.ts` (entity_id hard required) |
| L5 | `scripts/manga/layers/L05-page-director.ts` (--mapper v2/v3) | `page-director-v2/page-mapper-v2.ts` (旧) / `page-director-v2/page-mapper-v3.ts` (現行、importance 非均等 + page_role 別 template + 右綴じ読順) |
| L6 | `scripts/manga/layers/L06-continuity-resolve.ts` | `page-director/continuity-resolver.ts` |
| L7 | `scripts/manga/layers/L07-refs-resolution.ts` | `page-director/continuity-refs-v2.ts` (shot_type 引数追加) |
| L8 | `scripts/manga/layers/L08-incremental-refs.ts` | `bible/character-images.ts` (variant 引数で個別生成) |
| L8.5 | `scripts/manga/layers/L08-5-name-preview.ts` | `name-preview/{svg-renderer, blocking-estimator, audit-rules, types}.ts` |
| L8.6 | (L8.5 から内部呼出) | `name-preview/audit-rules.ts` (rule-based、14 ルール、warning 表示のみ) |
| L8.7 | `scripts/manga/serve-ops.ts` (ops console SPA) | `ops-console/web/views/name-gate.ts` + `name-preview/types.ts` schema |
| Reject report | `scripts/manga/name-reject-report.ts` | `name_approval.json` + `name_audit.json` 集計 |
| L9 | `scripts/manga/layers/L09-render.ts` (name gate 内蔵) | `render/gpt-image-2-adapter.ts` + `generate/prompt-composer-v2.ts` |
| L11 | `scripts/manga/layers/L11-audit.ts` | `qa/{face-consistency, bubble-overlap, continuity-check}.ts` |
| L12 | `scripts/manga/layers/L12-repair.ts` | `repair/policy.ts` |
| L13 | `scripts/manga/layers/L13-kdp.ts` | `publish/kdp/{pdf-x1a, spine-calc, cover-composer, colophon-gen}.ts` |
| orchestrator | `scripts/manga/pipeline.ts` | (cache + force + dry-run) |

## A07 着手順序 (Week 1-5)

### Week 1: 基盤
1. ✅ stage1-8 / work-1 bible を `_archive/2026-05-02-pre-redesign/` へ
2. ✅ `data/manga/capability/gpt-image-2.json` を Pilot 既知値から起こし
3. ✅ `data/manga/works/a07-modern-dungeon/meta.json` 作成
4. ✅ 新 SSoT `pipeline-v2.md` (本ファイル)
5. `src/lib/manga/schemas.ts` v2 集約 (Zod)

### Week 2: Phase 1 (L1-L2)
6. `bible/v2-adapter.ts` — V2企画書 → snapshot 変換
7. `bible/provenance.ts` — kindle_archive reject ガード
8. A07 snapshot.json 生成
9. A07 character refs (5キャラ × 5 variants ≈ 25枚, Codex Pro 枠)
10. A07 location refs (4ロケ × 3 angles = 12枚)

### Week 3: Phase 2 (L3-L8)
11. `bible/source-loader.ts` を snapshot 起点へ
12. `storyboard-builder-v2.ts` (entity_id hard required)
13. `continuity-refs-v2.ts` (shot_type/camera 引数)
14. A07 ep1 を L3→L7 まで通す
15. L8 incremental refs

### Week 4: Phase 3 (L9-L12)
16. `render/gpt-image-2-adapter.ts`
17. `prompt-composer-v2.ts`
18. A07 ep1 22ページ render
19. `bubble/vertical/typesetter.ts`
20. ep1 22ページ bubble overlay
21. `qa/{bubble-overlap, continuity-check}.ts`
22. L11 audit + L12 repair

### Week 5: Phase 4 (L13)
23. `publish/kdp/{pdf-x1a, spine-calc, cover-composer, colophon-gen}.ts`
24. ep1 単体 KDP package テスト
25. SSoT/README 反映完了
26. ep2 着手準備

## 確定スキーマ

### bible/snapshot.json (L1)

```typescript
type BibleSnapshot = {
  schema_version: 2;
  meta: {
    slug: string;
    title: string;
    art_style: ArtStyle;
    genre: string;
    target_pages_per_volume: number;
    target_episodes_per_volume: number;
    target_pages_per_episode: number;
  };
  world: {
    premise: string;
    rules: string[];
    system: string;
    timeline: string;
    factions: Array<{ name: string; summary: string }>;
  };
  characters: Array<{
    id: string;
    name: string;
    role: "protagonist" | "heroine" | "antagonist" | "supporting";
    age_visual?: string;
    spec: CharacterSpec;
    attribute_classifier: AttributeClassifierLabels;
    continuity_anchors: string[];
    appears_in_volumes: number[];
  }>;
  locations: Array<{
    id: string;
    name: string;
    spec: LocationSpec;
    continuity_anchors: string[];
    appears_in_episodes: number[];
  }>;
  props: Array<{
    id: string;
    name: string;
    owner_character_id?: string;
    spec: PropSpec;
    continuity_anchors: string[];
  }>;
  costumes: Array<{
    id: string;
    character_id: string;
    valid_from_episode: number;
    valid_until_episode: number | null;
    spec: CostumeSpec;
  }>;
  relations: Array<{
    from_character_id: string;
    to_character_id: string;
    relation_type: string;
    description: string;
  }>;
  style_directives: {
    global: string;
    scene_overrides: Record<string, string>;
    overlay_rules: string[];
  };
  visual_motifs: Array<{ name: string; meaning: string; draw_directive: string }>;
  continuity_seeds: Array<{
    group_id: string;
    kind: "character_face" | "character_outfit" | "character_back"
        | "location_layout" | "prop" | "tv_variant";
    target_id: string;
    invariant_description: string;
  }>;
};
```

### bible/refs/_provenance.json

```typescript
type RefsProvenance = {
  schema_version: 1;
  refs: Array<{
    asset_id: string;
    path: string;
    source_type: "bible_generated" | "manual_upload" | "kindle_archive" | "external_purchased";
    rights_status: "ai_use_allowed" | "internal_only" | "blocked";
    created_by: "system" | string;
    created_at: string;
    derived_from: string[];
    license_note: string;
    qa_score?: number;
    training_candidate: boolean;
  }>;
};
```

### episodes/epNN/storyboard.json (L4, entity binding 強制)

```typescript
type EpisodeStoryboard = {
  schema_version: 2;
  episode_id: string;
  total_pages: number;
  pages: Array<{
    page_no: number;
    page_role: PageRole;
    panels: Array<{
      panel_id: string;
      panel_no: number;
      reading_order: number;
      shot_type: "close_up" | "medium" | "wide" | "establishing";
      camera: "eye_level" | "low_angle" | "high_angle" | "over_shoulder" | "birds_eye";
      bleed: boolean;
      silence: boolean;
      entities: {
        characters: Array<{
          character_id: string;          // bible.characters[].id 必須
          role: "speaker" | "listener" | "background" | "silhouette";
          on_screen_via: "in_person" | "tv" | "photo" | "phone";
          expression: string;
        }>;
        location_id: string;             // bible.locations[].id 必須
        props: Array<{ prop_id: string; held_by_character_id?: string }>;
        focus_entity_id: string;
      };
      action: string;
      key_visual: string;
      dialogue: Array<{ character_id: string; text: string }>;
      monologue: Array<{ character_id: string; text: string }>;
      narration: string[];
      sfx: string[];
      continuity_group_ids?: string[];   // L6 で注入
    }>;
  }>;
};
```

### episodes/epNN/resolved_refs.json (L7)

```typescript
type ResolvedRefs = {
  schema_version: 1;
  episode_id: string;
  capability_profile_id: string;
  render_strategy: "page_one_shot" | "panel_composite" | "hybrid";
  panels: Record<string, {
    scope: "panel" | "page";
    refs: Array<{
      asset_id: string;
      path: string;
      weight: number;                    // capability に応じて 1.0 固定もあり
      role: "style" | "character_face" | "character_full" | "character_back"
          | "character_outfit" | "location" | "prop" | "continuity_anchor"
          | "previous_panel" | "negative";
      target_entity_id?: string;
      source: "deterministic" | "continuity_forced" | "llm_judged" | "repair_forced";
      rationale: string;
    }>;
    budget: { max: number; optimal: number; used: number };
    truncated: boolean;
    unresolved_entities: string[];
    warnings: string[];
  }>;
};
```

## L7 Refs Resolution 決定論ルール

```
RULE 1  常時: + style_plate (weight 1.0)
RULE 2  shot_type=close_up & 1キャラ: + char_face_v1 + char_3view_v1(0.5)
RULE 3  shot_type=medium  & 1キャラ: + char_full_v1 + char_face_v1(0.5)
RULE 4  shot_type=wide & no character focus: + loc_v1
RULE 5  shot_type=over_shoulder: + char_full_v1(0.5) + loc_v1
RULE 6  shot_type=establishing & bleed: + loc_v1 のみ
RULE 7  on_screen_via=tv: + char_tv_variant_v1 (無ければ face)
RULE 8  continuity_group_ids 指定: 該当refを weight 1.0 で強制 (RULE 2-7 上書き)
RULE 9  multi-character (3+): focus_entity face/full、脇役 outfit/full、その他 silhouette
RULE 10 budget 超過時の優先: style > continuity_forced > focus_entity > キャラ > location
```

## KDP 詳細

### B6 サイズ
- 本文: 128×182mm = 1748×2480 px @ 350dpi
- 塗り足し込み: 138×192mm = 1843×2587 px

### 背幅計算
```
背幅 mm = ページ数 × 0.0795 (Amazon POD 白黒の場合)
背幅 px = 背幅 mm × (350 / 25.4)
```
表紙 cover = 表+背+裏+塗り足し12mm を一枚 PDF に。

### 入稿 PDF
- 本文: PDF/X-1a, CMYK, 350dpi
- 表紙: PDF/X-1a, CMYK, 表+背+裏一体
- メタ: ISBN (KDP 自動付与 OK)、ASIN、AI使用タグ (project_kakuyomu_ai_tag_mandate.md 同等)

### 奥付 / 版権ページ
- 著者名 (ペンネーム)
- 初版発行日
- 発行所 (個人 KDP の場合は著者名のみ)
- AI 使用開示文 (固定文言)

## 関連ドキュメント

- 旧 SSoT (アーカイブ): `docs/plans/manga/_archive/pipeline-v1-2026-05-02.md`
- メモリ: project_horizontal_manga_pivot / project_kdp_strategy / project_pilot_complete_2026-05-01 / project_chatgpt_pro_image_gen / feedback_no_anthropic_api / feedback_quality_over_novelty
- 作品メタ: `data/manga/works/a07-modern-dungeon/meta.json`
- capability: `data/manga/capability/gpt-image-2.json`

## 撤回したもの (記録)

- ✗ Pre-Phase Capability Verification 12-24枚: API側に role-tag/weight/mask が無い → false 確定で測りようがない、Pilot 既知値で代替
- ✗ L0 Init を独立 layer 化: meta.json + bible に集約
- ✗ L4 Aux Bible 細分化: snapshot 1ファイルで十分
- ✗ L6 Episode Plot 独立 layer 化: shotlist/scene-splitter で扱える
- ✗ Ref Selector 独立 layer 化: continuity-refs/resolver の拡張で十分
- ✗ ResolvedRefs に mask_binding/negative_ref 最初から含める: capability 確定後に optional 追加
- ✗ stage4 storyboard JSON の変換器: 1週間 vs 半日再生成、捨てて再生成判断
