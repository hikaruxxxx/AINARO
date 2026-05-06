# a07-modern-dungeon Vol.1 各話 pull_link 設計 (Phase Y WY-3 反映)

**作成**: 2026-05-06 (Phase Y WY-8 出版前準備)
**対象**: ep01-ep10 (Vol.1 完結、200ページ想定)
**目的**: 各話の cliffhanger と次話の opening_hook を pull_link で接続し、KU read-through 最大化

各話の brief は `episodes/ep{NN}/_brief.v2.md` を参照。本文書は WY-3 で定義した
`PullLink { current_episode_cliff: CliffhangerPatternId, next_opening_hook_hint: string }`
を ep01-ep10 すべてに割り当てたもの。

将来 ep02-10 の storyboard 生成時、L4.9 Cliffhanger Architect で
本表のパターンを参照して `pull_link` を注入する。

---

## ep01 → ep02

| 項目 | 内容 |
|---|---|
| ep01 cliffhanger pattern | **ability_or_identity_glimpse** |
| ep01 cliff の核 | 公社監査室で匿名IDの異常加算を検知、ナビが「次の隠し条件を開示します」 |
| next_opening_hook_hint | 「翌朝、レンは前夜の経験値倍化が再現するか半信半疑のまま、再びダンジョン1階へ向かう。同じ場所で同じ操作をした瞬間、再度のナビ音声 + 経験値ログ更新で、現実だったと確信する」 |
| ep02 推奨 hook pattern | P1_daily_anomaly (日常×異変、再現性確認の structure) |
| 期待効果 | 「夢/偶然じゃない」と確信させる導入で、ep02 を読み始めた読者が一気に引き込まれる |

## ep02 → ep03

| 項目 | 内容 |
|---|---|
| ep02 cliffhanger pattern | **relationship_shift** (匿名共犯成立の予感) |
| ep02 cliff の核 | コンビニに常連客として現れたナナミから「お前、Fランクで2.4倍出してるな?」と核心を突かれる |
| next_opening_hook_hint | 「翌日、レンは中古装備店で値切りに成功した翌朝、ヒビ入りスマホに見慣れない通知。攻略wiki裏管理人Nmから匿名 DM。「会って話したい」と短く」 |
| ep03 推奨 hook pattern | P5_heroine_encounter or P1_daily_anomaly |
| 期待効果 | 関係性が広がる予感で次話を読みたくなる |

## ep03 → ep04

| 項目 | 内容 |
|---|---|
| ep03 cliffhanger pattern | **heroine_jeopardy** (ナビ消滅リスクの初期予兆) |
| ep03 cliff の核 | ナビが「私を見つけてほしくない」と漏らし、レンは初めて声を「道具」ではなく「相手」として意識する |
| next_opening_hook_hint | 「ナビの言葉が頭から離れないまま、レンは4Fから5Fへの隠し踏み順を実行する。型落ち装備を値切って準備した武器を握り、5F到達の瞬間、視界に新しい青HUDが展開する」 |
| ep04 推奨 hook pattern | P6_status_window_reveal (固有スキル覚醒) |
| 期待効果 | ナビが「相手」になった + 固有スキル覚醒の二重ピーク |

## ep04 → ep05

| 項目 | 内容 |
|---|---|
| ep04 cliffhanger pattern | **unknown_threat_silhouette** (DPC 監査室、組織的圧力の予兆) |
| ep04 cliff の核 | 5Fオーガを討伐した直後、DPC内部監査室の画面に匿名IDが検知され、Sランクの監査官が「異常記録だ」と低く呟く |
| next_opening_hook_hint | 「コンビニ夜勤明けの朝、レンは新しい装備を試そうと中古装備店へ。常連客のナナミが、いつもと違う真剣な目で振り返る。「あんた、F級匿名で2.4倍出した動画、wiki に上がってる」」 |
| ep05 推奨 hook pattern | P5_heroine_encounter (ナナミの正体露呈) |
| 期待効果 | 監査の影 + 共犯候補登場の二重引き |

## ep05 → ep06

| 項目 | 内容 |
|---|---|
| ep05 cliffhanger pattern | **relationship_shift** (匿名共犯関係の確立) |
| ep05 cliff の核 | ナビの存在を半分だけナナミに明かし、匿名のまま記録を世に流す共犯関係が成立 |
| next_opening_hook_hint | 「数日後、レンの郵便受けに見慣れない封書。DPC からの参考人出頭通知。ナナミが画面越しに苦笑する。「来たな」」 |
| ep06 推奨 hook pattern | P3_protagonist_monologue_outburst (出頭への覚悟独白) |
| 期待効果 | 共犯関係 + 制度圧力の挟撃で読者の緊張感維持 |

## ep06 → ep07

| 項目 | 内容 |
|---|---|
| ep06 cliffhanger pattern | **protagonist_resolve_monologue** (元上司・槇島の侮蔑を拒否) |
| ep06 cliff の核 | DPC で槇島主任から「再鑑定同意書」を突きつけられるが、レンは「サインしません」と初めて拒否、退出 |
| next_opening_hook_hint | 「コンビニのテレビで Sランク幼馴染の灯里が 20F に挑戦するニュース。ナナミからメッセージ「お前、画面見てるか?」」 |
| ep07 推奨 hook pattern | P5_heroine_encounter (灯里 + 過去) |
| 期待効果 | 主人公の能動性 + 幼馴染要素で感情移入を深める |

## ep07 → ep08

| 項目 | 内容 |
|---|---|
| ep07 cliffhanger pattern | **protagonist_resolve_monologue** (感情で 20F 挑戦を決める) |
| ep07 cliff の核 | 灯里からの 5年ぶりのメッセージを読んだレンが、冷静な最適化を捨てて 20F に行くと決める瞬間 |
| next_opening_hook_hint | 「コンビニ夜勤明けの帰り道、暗い路地で複数の足音。フードの男たちがレンを取り囲む。「お前の声を提供してもらおう」」 |
| ep08 推奨 hook pattern | P7_in_media_res_action (戦闘中盤からの突入) |
| 期待効果 | 感情の高揚 + 物理的危機で緊張感最大 |

## ep08 → ep09

| 項目 | 内容 |
|---|---|
| ep08 cliffhanger pattern | **unknown_threat_silhouette** (玄蔵登場、声の所有者問い) |
| ep08 cliff の核 | 沈黙の声に拉致されかけたレンを、獅童玄蔵が救出。しかし玄蔵は「その声、誰のものだ?」と問う |
| next_opening_hook_hint | 「翌日、ナナミから「F級匿名で 20F 単独挑戦を予告した」と連絡。レンは夜勤シフトを最後に調整しながら、ナビに小さく問う。「俺たちはどこまで行ける?」」 |
| ep09 推奨 hook pattern | P3_protagonist_monologue_outburst (覚悟への移行) |
| 期待効果 | 新キャラ (玄蔵) + 自責 + 公開挑戦の三重圧 |

## ep09 → ep10

| 項目 | 内容 |
|---|---|
| ep09 cliffhanger pattern | **ability_or_identity_glimpse** (ナビが規約違反の一手を選択肢として渡す) |
| ep09 cliff の核 | 氷室玲二が公開検証を宣言、灯里が DPC モニター席に座る前で、ナビが「規約違反の一手を選択権として渡す」とレンに選ばせる |
| next_opening_hook_hint | 「20F に入ったレンの視界に、記録の番人の巨大シルエット。ナビが珍しく長い前置きを置く。「3つの隠しルール、最後の一手は規約違反です。それでも、行きますか?」」 |
| ep10 推奨 hook pattern | P4_splash_pullback (派手見開きから引き戻し、20F 戦闘) |
| 期待効果 | 選択の重さ + 戦闘開始の緊張感最大 |

## ep10 → Vol.2 (巻末)

| 項目 | 内容 |
|---|---|
| ep10 cliffhanger pattern | **heroine_jeopardy** (Vol.1 末、ナビ消滅リスク型) |
| ep10 cliff の核 | 20F 記録の番人を撃破、世界最速記録を獲得。ただしナビの声色が少女のように変わり、灯里がレンの正体に気づく |
| **Vol.2 への teaser** | ナビ「契約者上限に接近。私の優先順位が下がります」。レンの困惑、灯里の確信、画面外で動き出す DPC・玄蔵・氷室玲二・沈黙の声 |
| 次巻 opening_hook | Vol.2 ep11 は「ナビの声が途切れた朝」から始まる。レンは新宿西口で立ち尽くし、ナビが本当に消えたのかを試す |
| 期待効果 | Vol.2 必読化、5因子 (ナビ消滅 / 灯里覚知 / DPC追跡 / 玄蔵 / 沈黙の声) すべてが Vol.2 で動く伏線化 |

---

## 全話の cliffhanger pattern 配分

Phase Y WY-3 cliffhanger-patterns.json で定義した 7パターンの分布:

| pattern | ep | 回数 |
|---|---|---|
| ability_or_identity_glimpse | ep01, ep04 (DPC検知)→unknown_threat, ep09 | 2-3 |
| relationship_shift | ep02, ep05 | 2 |
| heroine_jeopardy | ep03 (初期予兆), ep10 (巻末) | 2 |
| unknown_threat_silhouette | ep04, ep08 | 2 |
| protagonist_resolve_monologue | ep06, ep07 | 2 |
| daily_intrusion | (使用なし、light_recovery 標準ジャンル向け) | 0 |
| next_volume_foreshadow | (Vol.2 末、Vol.3 末で活用予定) | 0 |

→ a07 (現代ダンジョン × システム音声) の特性 (緊張系・能力可視化・関係性のある相棒) と整合。

---

## 将来の ep02-10 storyboard 生成時の指示 (storyboard-extractor へ)

- bible.meta.tone_profile = ` { darkness: 0.3, comedic_density: 0.8, recovery_cadence: 0.9, sidekick_presence: 0.9 }` を後付けで付与 (現状 unset)
- bible.meta.subtype = `external_social` (memory: dungeon-modernサブタイプ で確定済)
- bible.meta.profile_id = `light_recovery_type` (商業ライン狙い)
- 各話の brief.cliffhanger_hook を本ドキュメントの **next_opening_hook_hint** で更新
- 各話の cliffhanger_pattern を本ドキュメントの **pattern_id** で固定
- L4.1 Opening Hook 編集パスの推奨 pattern を本ドキュメントの **次話 推奨 hook pattern** で固定

これにより、ep01 で実装した Phase Y craft (Hook + Cliffhanger + narration_kind + recovery beat) が
ep02-10 でも自動反映される。

---

## 編集判断カードDB との接続

各 cliffhanger pattern に対応する編集判断カード:

| pattern | カード |
|---|---|
| ability_or_identity_glimpse | EC-0010 |
| protagonist_resolve_monologue | EC-0008 |
| heroine_jeopardy | EC-0009 |
| (Hook 系) P1_daily_anomaly | EC-0006 |
| (Hook 系) P6_status_window_reveal | EC-0007 |

→ Phase Y WY-7 Console「品質改善」view の `related_cards` セクションで、各話 audit findings に
これらのカードが表示される。修正方向性の標準化が進む。

---

## Phase Z への申し送り

- 各話の `pull_link` を実装後、Phase Z WZ-2 で実 KENP read-through を計測 → どの pattern が
  実際に次話 read-through に効くかを校正
- 巻末 (ep10) の `heroine_jeopardy` 効果は Vol.2 売上で計測可能
