# 通勤経路に、ダンジョンがある ep1

**22p / 108 panels** (target 22p)

## 概要

- **theme**: 通勤と家計に縛られた平凡な営業係長が、ダンジョンを『冒険』ではなく『見積もれる副業』として捉えた瞬間、日常の数字が未知のリスクへ反転する面白さ。
- **arc**: 久志は変化を嫌い、仕事・家計・通勤ルートを小さな数字で管理することで日常を保っている。 → 初めて倒したゴブリンの査定額が見積もりより二十円安かったことに反応し、恐怖よりも営業としての計算精度を優先してダンジョン通いを習慣化する。 → 二万円相当の青い魔石を手に入れたことで、久志の数字で制御できる日常が管理事務所からの着信によって崩れ始める。
- **cliffhanger_hook**: なぜ一階層にD級相当の青い魔物が現れ、神楽坂は査定中の直後に久志へ電話してきたのか。
- **motifs**: スマホ画面に表示される査定額・家計簿・着信名 / 灰色の安い魔石と青く光る希少魔石の対比 / 畳んだスーツ上着とまくったワイシャツ袖 / オレンジ色のバリケードとのぼり / 地下駐車場の蛍光灯とコンクリート床
- **intended_experience**: 読者には、生活費を数えるだけの地味な男が、実はダンジョンを別の尺度で攻略し始めている高揚を感じてほしい。最後は『電話に出たら日常が壊れる』という不安と期待を残す。

## beats

| # | label | intensity | budget | summary |
|---|---|---|---|---|
| 1 | hook | 0.78 | 2p (1-2) | 地下駐車場型ダンジョンで、久志が青い犬型魔物と交戦している現在時制から始める。役員打ち合わせの議題と敵HP・ドロップ相… |
| 2 | inciting_incident | 0.34 | 4p (3-5) | 時間を巻き戻し、久志の人物像と都内ダンジョンの社会インフラ化を提示する。通勤経路に八潮リフトが現れても驚かず、のぼりや… |
| 3 | rising | 0.46 | 3p (2-4) | 久志が五百円でEランク登録を済ませ、神楽坂の軽い説明に押されて一階層へ入る。受付の事務的な空気と『見学だけ』という自己… |
| 4 | turn | 0.58 | 4p (3-5) | 一階層で久志が初めてゴブリンを倒し、魔石の査定額に反応する。恐怖や達成感ではなく、見積もりとの差額二十円への不満を強調… |
| 5 | rising | 0.67 | 4p (3-5) | 三ヶ月後、久志の朝ダンジョン通いが完全にルーティン化していることを描く。ゴブリン収益、コーヒー代、月換算の昼飯代、神楽… |
| 6 | climax | 0.88 | 3p (2-4) | 久志が青い魔物と正面から戦い、一撃目で見積もりが当たったことに震え、二撃目で倒す。戦闘そのものより、彼が三ヶ月間ずっと… |
| 7 | cliffhanger | 0.93 | 2p (2-4) | 床に残った青い希少魔石は通常と違って査定中になり、管理事務所の神楽坂から初めて電話がかかってくる。久志は電話に出ないま… |

## judge_input (画像生成前 1次judge)

- total_pages: 22 (target 22)
- total_panels: 108
- importance≥4: 21 panels (期待 9+)
- silence/pause/emote: 32 panels
- max_face_close_run: 1
- dialogue_chars_total: 1740
- avg_chars_per_panel: 16.1
- episode_cliffhanger_strength: 5
- render_risk_high: 10 panels


---

## P1 [establishing] ▶ right (RTL開き側) — target 6 panels — turn_strength=3

> 🪝 **page_open_hook**: 第1話冒頭の即時フック。地下駐車場型ダンジョンで、営業係長が冒険者ではなく見積担当の目で魔物を捉えていることを一撃で示す。

| # | imp | shot | NF | char | location | text | risk |
|---|---|---|---|---|---|---|---|
| 1 | 5 | wide/panel_landscape | establishing | 鴨下 久志 | 八潮リフト一階層・地下… | [N]樹脂製の警棒を振り下ろした瞬間、俺の頭では午後二時の議題が流れていた。 | medium |
| 2 | 3 | hands/panel_portrait | inform | 鴨下 久志 | 八潮リフト一階層・地下… | [N]一つ、既存顧客の基盤刷新案件の進捗。 | high |
| 3 | 3 | side/panel_landscape | contrast | 鴨下 久志 | 八潮リフト一階層・地下… | [N]二つ、競合ベンダーの相見積もり対応。 | medium |
| 4 | 2 | hands/panel_square | pause | 鴨下 久志 | 八潮リフト一階層・地下… | [N]ごり、と嫌な音がした。 | high |
| 5 | 3 | face_close/panel_portrait | emote | 鴨下 久志 | 八潮リフト一階層・地下… | [N]頭の中の議題は、四つ目に進まなかった。 | low |
| 6 | 4 | over_shoulder/panel_landscape | reveal | 鴨下 久志 | 八潮リフト一階層・地下… | [N]代わりに、別のものが浮かんだ。 | medium |

**panel #1** [imp=5, beat=1/hook, scene=ep1-s1]
- 🎯 purpose: 地下駐車場の蛍光灯、コンクリート床、警棒を構えるスーツ姿の久志、青い犬型魔物を同時に見せ、現代ダンジョンの異物感と主人公の異常な冷静さを冒頭で掴ませる。
- 🔄 change_from_prev: 本beat最初のコマとして、読者を説明抜きで戦闘中の現在時制へ投げ込む。
- 👁 visual_focus: 蛍光灯の硬い白光の下、ワイシャツ姿の久志が警棒を振り下ろし、青い甲殻の犬型魔物が床を削りながら低く滑り込むローアングルの決め画
- → link_to_next: 警棒の振り下ろし動作を次コマの打撃音へつなぐ。
- 📜 narration: 「樹脂製の警棒を振り下ろした瞬間、俺の頭では午後二時の議題が流れていた。」
- 📏 bubble_budget: count=1, max_chars=45, type=narration_box
- ⬜ negative_space: 上部の蛍光灯と天井梁の空きにナレーション枠を配置。戦闘軌道と被らせない。
- 🔃 turn: page_open / strength=2
- ⚠️ render_risk: medium

**panel #2** [imp=3, beat=1/hook, scene=ep1-s1]
- 🎯 purpose: 久志の手元と警棒の軌道に寄り、戦闘動作と会社員の内勤思考がずれている違和感を強める。
- 🔄 change_from_prev: 大きな状況提示から、打撃の瞬間の手元へスケールジャンプして緊迫を細く絞る。
- 👁 visual_focus: まくったワイシャツ袖、ネクタイを乱した胸元、両手で握られた樹脂製警棒の先端が画面外へ振り抜かれる
- 🎬 cut_type: scale_jump
- → link_to_next: 議題カウントを続け、読者に戦闘より会議が先に来る脳内リズムを飲み込ませる。
- 📜 narration: 「一つ、既存顧客の基盤刷新案件の進捗。」
- 📏 bubble_budget: count=1, max_chars=24, type=narration_box
- ⬜ negative_space: 警棒の軌道と逆側、左下に小さなナレーション枠用の余白。
- ⚠️ render_risk: high

**panel #3** [imp=3, beat=1/hook, scene=ep1-s1]
- 🎯 purpose: 青い犬型魔物が久志のいた場所を薙ぎ払い、床に爪痕を残すことで、頭の中の事務的な言葉と現実の危険を衝突させる。
- 🔄 change_from_prev: 手元の打撃から横長のアクションへ展開し、久志の攻撃と魔物の反撃が交差したことを見せる。
- 👁 visual_focus: 青い甲殻の犬型魔物がコンクリートに似た床へ爪を立てて横滑りし、久志の革靴のすぐ横に白い削れ跡が走る
- 🎬 cut_type: match_action
- → link_to_next: 床を削る音を止め、打撃が入った手応えのコマへ移る。
- 📜 narration: 「二つ、競合ベンダーの相見積もり対応。」
- 📏 bubble_budget: count=1, max_chars=24, type=narration_box
- ⬜ negative_space: 床面の削れ跡の上には文字を置かず、奥の柱影にナレーション枠を逃がす。
- ⚠️ render_risk: medium

**panel #4** [imp=2, beat=1/hook, scene=ep1-s1]
- 🎯 purpose: 警棒の先が甲殻の継ぎ目へ入った感触だけに集中し、読者に打撃の痛さと音を脳内補完させる間を作る。
- 🔄 change_from_prev: 横滑りの速度を止め、接触部位だけの静かな小コマに圧縮する。
- 👁 visual_focus: 警棒の先端が青い甲殻の首裏の継ぎ目にめり込み、久志の指が白くなるほど握り込まれている
- 🎬 cut_type: scale_jump
- → link_to_next: この手応えをきっかけに、会議の議題ではなく敵HPの数字が浮かぶ。
- 📜 narration: 「ごり、と嫌な音がした。」
- 📏 bubble_budget: count=1, max_chars=12, type=narration_box
- ⬜ negative_space: ほぼ白い床面を広めに残し、短い擬音またはナレーションを小さく置ける余白。
- ⚠️ render_risk: high

**panel #5** [imp=3, beat=1/hook, scene=ep1-s1]
- 🎯 purpose: 久志の表情を寄りで見せ、恐怖ではなく計算が前面に出る瞬間を読者に理解させる。
- 🔄 change_from_prev: 手応えから顔へ切り替え、身体感覚が思考の切替スイッチになったことを示す。
- 👁 visual_focus: 汗を一筋だけ流す久志の横顔。眼鏡の奥の目が魔物ではなく、見えない表計算セルを見ているように細くなる
- 🎬 cut_type: graphic_match
- → link_to_next: 顔の横に無機質なステータス風UIが浮かぶ次コマへ接続する。
- 📜 narration: 「頭の中の議題は、四つ目に進まなかった。」
- 📏 bubble_budget: count=1, max_chars=22, type=narration_box
- ⬜ negative_space: 顔の右側に細い白余白。次コマのUI表現と視線方向がつながるよう空ける。

**panel #6** [imp=4, beat=1/hook, scene=ep1-s1]
- 🎯 purpose: 敵HPとドロップ相場が営業見積もりのような矩形UIで浮かぶことを見せ、冒険ではなく査定として戦っている主人公像を確定させる。
- 🔄 change_from_prev: 久志の顔の内面から、彼の視界そのものへ引いて、数字が現実に重なって見える異能めいた演出へ移る。
- 👁 visual_focus: 久志の肩越しに、青い犬型魔物の上へ無機質な矩形UIが重なる。HP六十前後、次の一撃、ドロップ相場二万円前後の枠だけを画像内では空白として確保
- 🎬 cut_type: reveal_pull
- → link_to_next: 二万円という金額を次ページ頭で生活費の欲へ落とし込む。
- 📜 narration: 「代わりに、別のものが浮かんだ。」
- 📏 bubble_budget: count=2, max_chars=55, type=mixed
- ⬜ negative_space: 魔物の頭上から右上に、SVGでステータスUIを重ねるための大きな矩形空白。画像内に文字は描かない。
- 🔃 turn: page_end / strength=3
- ⚠️ render_risk: medium

> 🎬 **page_end_hook**: 敵の価値が二万円前後だと視覚化され、読者に『なぜ生活費の数字で戦っているのか』をめくらせる。


---

## P2 [action] ◀ left — target 6 panels — turn_strength=3

> 🪝 **page_open_hook**: 前ページ末の二万円UIを、洗濯機の頭金という生活感へ即座に接続する。

| # | imp | shot | NF | char | location | text | risk |
|---|---|---|---|---|---|---|---|
| 7 | 3 | wide/panel_square | page_open | 鴨下 久志 | 八潮リフト一階層・地下… | [N]二万円。 | low |
| 8 | 3 | hands/panel_portrait | inform | 鴨下 久志 | 八潮リフト一階層・地下… | [N]ドラム式洗濯機の、頭金になる金額だ。 | medium |
| 9 | 1 | wide/panel_landscape | silence | 鴨下 久志 | 八潮リフト一階層・地下… | (silent) | low |
| 10 | 4 | full_body/panel_portrait | beat_button | 鴨下 久志 | 八潮リフト一階層・地下… | [N]左足で床を掴んだ。 | medium |
| 11 | 3 | side/panel_landscape | inform | 鴨下 久志 | 八潮リフト一階層・地下… | [N]一撃目で、犬は横にもんどりうった。 | high |
| 12 | 3 | over_shoulder/panel_tall | reveal | 鴨下 久志 | 八潮リフト一階層・地下… | [N]半分。俺の見積もりが当たっていた。 | medium |

**panel #7** [imp=3, beat=1/hook, scene=ep1-s1]
- 🎯 purpose: 前ページのドロップ相場を、久志にとっては冒険報酬ではなく家計の一項目であると受け直す。
- 🔄 change_from_prev: 敵の情報UIから、久志の足元に置かれた日常品へ視点を落とし、数字の意味を生活に接続する。
- 👁 visual_focus: 地下駐車場の床に置かれたコンビニのブラックコーヒー缶、畳んだスーツ上着、革靴。奥で青い魔物が低く身構える
- 🎬 cut_type: graphic_match
- → link_to_next: 洗濯機の頭金という具体物を示すため、スマホの家計スクショ想起へつなげる。
- 📜 narration: 「二万円。」
- 📏 bubble_budget: count=1, max_chars=8, type=narration_box
- ⬜ negative_space: 床の白い照り返し部分に短いナレーションを孤立させる。コーヒー缶と上着は文字で隠さない。
- 🔃 turn: page_open / strength=2

**panel #8** [imp=3, beat=1/hook, scene=ep1-s1]
- 🎯 purpose: 二万円の意味を生活用品へ落とし、読者に久志の動機が英雄願望ではなく家計の不足であると理解させる。
- 🔄 change_from_prev: 足元の日常品から、スマホ画面を想起させる矩形空白へ移り、生活の数字をより具体化する。
- 👁 visual_focus: 久志の左手がポケットのスマホに触れかけ、画面には家計簿アプリや洗濯機積立を重ねられる空の矩形だけが白く残る
- 🎬 cut_type: scale_jump
- → link_to_next: 生活の数字を確認した久志が、恐怖より計算精度へ意識を戻す。
- 📜 narration: 「ドラム式洗濯機の、頭金になる金額だ。」
- 📏 bubble_budget: count=1, max_chars=24, type=narration_box
- ⬜ negative_space: スマホ画面は完全に無地で描き、SVGで家計簿スクショ風UIを後載せできるようにする。
- ⚠️ render_risk: medium

**panel #9** [imp=1, beat=1/hook, scene=ep1-s1]
- 🎯 purpose: 文字を消し、久志が一拍だけ床を見つめる無音を置くことで、二万円が彼の判断を変える重さを読者に感じさせる。
- 🔄 change_from_prev: スマホと家計の具体情報から、無言の全身ショットへ引き、判断前の空白を作る。
- 👁 visual_focus: 広い地下駐車場にぽつんと立つ久志。白く飛んだ蛍光灯の帯が画面の半分以上を占め、青い魔物だけが低い影で動かない
- 🎬 cut_type: scale_jump
- → link_to_next: 無音のあと、久志が戦闘姿勢へ戻る動きでテンポを再加速する。
- 📏 bubble_budget: count=0, max_chars=0, type=narration_box
- ⬜ negative_space: 50%以上を白い蛍光灯の反射と空床にし、完全無音の余白として使う。

**panel #10** [imp=4, beat=1/hook, scene=ep1-s1]
- 🎯 purpose: 久志が受け身ではなく自分の判断で踏み込む瞬間を見せ、営業係長の計算が戦闘行動へ変わったことを示す。
- 🔄 change_from_prev: 無音の停止から、足元の踏み込みで一気に運動へ戻す。
- 👁 visual_focus: 革靴の左足が床を掴むように沈み、まくった袖と乱れたネクタイの久志が警棒を構え直す
- 🎬 cut_type: match_action
- → link_to_next: 踏み込みの勢いを一撃目の結果へつなぐ。
- 📜 narration: 「左足で床を掴んだ。」
- 📏 bubble_budget: count=1, max_chars=12, type=narration_box
- ⬜ negative_space: 踏み込みの軌跡上は空け、下端または柱影に短いナレーションのみ。
- ⚠️ render_risk: medium

**panel #11** [imp=3, beat=1/hook, scene=ep1-s1]
- 🎯 purpose: 久志の攻撃が有効だったことを明確にし、彼の計算が単なる思い込みではないと読者に納得させる。
- 🔄 change_from_prev: 踏み込みから打撃結果へ動作を継続し、ページ内の戦闘リズムを保つ。
- 👁 visual_focus: 警棒を振り抜いた久志の横で、青い犬型魔物が床を転がり、コンクリートに似た面へ爪痕と粉塵を残す
- 🎬 cut_type: match_action
- → link_to_next: 敵の残HP表示により、見積もりが当たっていると久志が気づく。
- 📜 narration: 「一撃目で、犬は横にもんどりうった。」
- 📏 bubble_budget: count=1, max_chars=24, type=narration_box
- ⬜ negative_space: 粉塵のない上部にナレーション枠。魔物の軌道線と重ねない。
- ⚠️ render_risk: high

**panel #12** [imp=3, beat=1/hook, scene=ep1-s1]
- 🎯 purpose: 残HPが六十前後と出ることで、久志の見積もり能力と営業的な執着を強く印象づけ、次beatの時間巻き戻しへ入る理由を作る。
- 🔄 change_from_prev: 打撃の物理結果から、再び現代風UIと久志の内面へ戻り、戦闘の本質が数字合わせであると締める。
- 👁 visual_focus: 久志の肩越しに半身を起こす青い犬型魔物。頭上に残HP用の空矩形UIが浮かび、久志の手元は次の二撃目へ静かに上がり始めている
- 🎬 cut_type: reveal_pull
- → link_to_next: 次beatで『なぜこの男が毎朝ダンジョンに来るようになったのか』を説明する回想へ移れる。
- 📜 narration: 「半分。俺の見積もりが当たっていた。」
- 📏 bubble_budget: count=2, max_chars=34, type=mixed
- ⬜ negative_space: 魔物の頭上にSVGステータスUI用の横長矩形余白。画面下の久志の肩周りに短いナレーション枠。
- 🔃 turn: page_end / strength=3
- ⚠️ render_risk: medium

> 🎬 **page_end_hook**: 二撃目を振り下ろす直前で止め、次beatの時間巻き戻しへつなぐ余韻と疑問を残す。


---

## P3 [establishing] ▶ right (RTL開き側) — target 4 panels — turn_strength=3

> 🪝 **page_open_hook**: 前ページ末の『二撃目を振り下ろす直前』の動きを、警棒の軌道だけ残して時間が止まり、その線が通勤電車のレールへ変わる形で三ヶ月前へ巻き戻す。

| # | imp | shot | NF | char | location | text | risk |
|---|---|---|---|---|---|---|---|
| 13 | 3 | hands/panel_landscape | pause | 鴨下 久志 | 八潮リフト一階層・地下… | [N]ここで少し、時間を巻き戻させてほしい。 | medium |
| 14 | 4 | birds_eye/panel_landscape | establishing | 鴨下 久志 | 品川駅港南口から八潮橋… | [N]火曜日だった。いつもどおり品川に着いて、いつもどおり港南口の階段を下りた。 | low |
| 15 | 3 | full_body/panel_portrait | emote | 鴨下 久志 | 品川駅港南口から八潮橋… | [N]俺は鴨下久志、三十四歳。都内の中堅SIerで営業係長をやっている。 | low |
| 16 | 3 | wide/panel_landscape | reveal | 鴨下 久志 | 品川駅港南口から八潮橋… | [N]その日だけ、八潮橋の手前に、オレンジ色のバリケードとのぼりが一本立ってい… | low |

**panel #13** [imp=3, beat=2/inciting_incident, scene=ep1-s2]
- 🎯 purpose: 前beatの戦闘の熱を止め、読者に『なぜこの会社員がここにいるのか』という問いを残したまま回想へ入る。
- 🔄 change_from_prev: 動作のクライマックスから完全停止へ落とし、時間の向きを反転させる。
- 👁 visual_focus: 宙で止まった警棒、まくったワイシャツ袖、コンクリート床に伸びる硬い影。
- 🎬 cut_type: match_action
- → link_to_next: 警棒の斜線を電車のレールや階段の流れに graphic_match させ、通勤風景へ接続する。
- 📜 narration: 「ここで少し、時間を巻き戻させてほしい。」
- 📏 bubble_budget: count=1, max_chars=24, type=narration_box
- 🔃 turn: page_open / strength=2
- ⚠️ render_risk: medium

**panel #14** [imp=4, beat=2/inciting_incident, scene=ep1-s2]
- 🎯 purpose: 現代日本の日常密度を提示し、以後のダンジョン異物感を受け止める基準を作る。
- 🔄 change_from_prev: 地下駐車場の無音から、駅前の通勤客と都市ノイズへ大きく転換する。
- 👁 visual_focus: 品川の高層ビル、駅階段、スーツ姿の人流、その端にまだ目立たないオレンジ色。
- 🎬 cut_type: time_skip
- → link_to_next: 人流の向かう先に小さくオレンジ色を置き、視線を誘導する。
- 📜 narration: 「火曜日だった。いつもどおり品川に着いて、いつもどおり港南口の階段を下りた。」
- 📏 bubble_budget: count=1, max_chars=42, type=narration_box
- 👥 multi_char: distant

**panel #15** [imp=3, beat=2/inciting_incident, scene=ep1-s2]
- 🎯 purpose: 主人公を『数字とルーティンで安心する会社員』として読者に定着させる。
- 🔄 change_from_prev: 群衆の俯瞰から久志個人へ寄り、世界より人物像へ焦点を移す。
- 👁 visual_focus: 七三寄りのビジネスショート、くたびれた革靴、同じ棚のパンが透けるコンビニ袋。
- 🎬 cut_type: scale_jump
- → link_to_next: 手元のコンビニ袋から、道端の仮設設備へ視線を流す。
- 📜 narration: 「俺は鴨下久志、三十四歳。都内の中堅SIerで営業係長をやっている。」
- 📏 bubble_budget: count=1, max_chars=36, type=narration_box

**panel #16** [imp=3, beat=2/inciting_incident, scene=ep1-s2]
- 🎯 purpose: beatのkey_visualとして、日常の端に現れたダンジョン入口を初提示する。
- 🔄 change_from_prev: 人物紹介から、人物の生活圏に食い込む非日常の物体へ焦点を移す。
- 👁 visual_focus: 都市背景の灰色に対して浮くオレンジ色のバリケード、文字なしののぼり、雑居ビル入口の暗い口。
- 🎬 cut_type: reveal_pull
- → link_to_next: のぼりの空白を次ページで標識情報として読ませる。
- 📜 narration: 「その日だけ、八潮橋の手前に、オレンジ色のバリケードとのぼりが一本立っていた。」
- 📏 bubble_budget: count=1, max_chars=38, type=narration_box
- ⬜ negative_space: のぼりとバリケード掲示面にSVG用の縦長空白を確保。画像内文字は描かない。
- 🔃 turn: page_end / strength=3
- 👥 multi_char: distant

> 🎬 **page_end_hook**: 通勤客の流れの端に、八潮リフトの仮設設備だけが異物として浮かび、久志がそれを日常の一部として処理してしまう。


---

## P4 [dialogue] ◀ left — target 4 panels — turn_strength=2

> 🪝 **page_open_hook**: 前ページ末で見えたのぼりの文字情報を、ページ頭で久志の視線が事務的に読み取る。

| # | imp | shot | NF | char | location | text | risk |
|---|---|---|---|---|---|---|---|
| 17 | 3 | over_shoulder/panel_portrait | inform | 鴨下 久志 | 品川駅港南口から八潮橋… | [N]難易度EからD。新規冒険者歓迎。 | low |
| 18 | 2 | face_close/panel_square | contrast | 鴨下 久志 | 品川駅港南口から八潮橋… | [N]ああ、また増えたのか、と思っただけだった。 | low |
| 19 | 3 | wide/panel_landscape | inform | - | 品川駅港南口から八潮橋… | [N]都内でダンジョンが出現するようになって三年。入口は、地下鉄の工事現場と見… | low |
| 20 | 3 | side/panel_landscape | contrast | 鴨下 久志/西園寺 | 品川駅港南口から八潮橋… | [N]同期の西園寺は、そう断じていた。 / 西園寺「一過性のバブルだろ」 | medium |

**panel #17** [imp=3, beat=2/inciting_incident, scene=ep1-s2]
- 🎯 purpose: 八潮リフトが公的に管理されたダンジョンであることを、看板UIの空枠で示す。
- 🔄 change_from_prev: 遠景の異物から、久志が読み取る行政・募集情報へ寄る。
- 👁 visual_focus: のぼり、仮設掲示、オレンジの脚立バリケード、奥に続く雑居ビルの入口。
- 🎬 cut_type: scale_jump
- → link_to_next: 久志の反応の薄さを次の小さな独白で受ける。
- 📜 narration: 「難易度EからD。新規冒険者歓迎。」
- 📏 bubble_budget: count=1, max_chars=18, type=narration_box
- ⬜ negative_space: のぼり中央と掲示紙にSVGテキスト用の空白。危険警告風の小枠も確保。
- 🔃 turn: page_open / strength=1

**panel #18** [imp=2, beat=2/inciting_incident, scene=ep1-s2]
- 🎯 purpose: 読者の『異常だ』という感覚と久志の『日常だ』という感覚をぶつける。
- 🔄 change_from_prev: 公的な看板情報から、久志の温度の低い内面へ切り返す。
- 👁 visual_focus: 眠そうな目、整った七三、反応の薄い口元、背後にぼけたオレンジバリケード。
- 🎬 cut_type: shot_reverse
- → link_to_next: 久志の無関心を社会全体の慣れへ広げる。
- 📜 narration: 「ああ、また増えたのか、と思っただけだった。」
- 📏 bubble_budget: count=1, max_chars=20, type=thought

**panel #19** [imp=3, beat=2/inciting_incident, scene=ep1-s2]
- 🎯 purpose: 現代都市とダンジョンが重なった世界観を、説明過多にせず街の風景で定着させる。
- 🔄 change_from_prev: 久志個人の反応から、都市全体の慣れへ視野を広げる。
- 👁 visual_focus: 工事現場風の仮囲い、通勤バス、ビル谷間、規制線、警備灯。
- 🎬 cut_type: scale_jump
- → link_to_next: その慣れに対する西園寺の過去発言へ切り替える。
- 📜 narration: 「都内でダンジョンが出現するようになって三年。入口は、地下鉄の工事現場と見分けがつかなくなっていた。」
- 📏 bubble_budget: count=1, max_chars=46, type=narration_box
- ⬜ negative_space: ニュース速報や行政告知風の小さな掲示枠を背景に複数確保。文字はSVG重ね。
- 👥 multi_char: distant

**panel #20** [imp=3, beat=2/inciting_incident, scene=ep1-s2]
- 🎯 purpose: 西園寺の価値判断を提示し、次ページで市場価値として反証される前振りを作る。
- 🔄 change_from_prev: 街の説明から、人間関係と価値観の対立へ切り替える。
- 👁 visual_focus: オールバック寄りショートの西園寺の横顔、久志の反応の薄い横顔、間に入る通勤客の流れ。
- 🎬 cut_type: smash_cut
- → link_to_next: 『バブル』の言葉を、電力・建材・保険の実務描写で崩す。
- 📜 narration: 「同期の西園寺は、そう断じていた。」
- 💬 西園寺 (normal): 「一過性のバブルだろ」
- 📏 bubble_budget: count=2, max_chars=34, type=mixed
- 🔃 turn: page_end / strength=2
- ⚠️ render_risk: medium
- 👥 multi_char: split_panel

> 🎬 **page_end_hook**: 西園寺の『バブル』という切り捨てが、社会インフラ化の実例であっさり否定される。


---

## P5 [reveal] ▶ right (RTL開き側) — target 4 panels — turn_strength=3

> 🪝 **page_open_hook**: 西園寺の『バブル』発言を受け、実際には魔石・素材・保険が生活インフラに組み込まれていることを連続カットで見せる。

| # | imp | shot | NF | char | location | text | risk |
|---|---|---|---|---|---|---|---|
| 21 | 3 | wide/panel_landscape | inform | - | 品川駅港南口から八潮橋… | [N]だが、電力会社が魔石を買い取り、建材メーカーが甲殻素材を仕入れ始めた。 | low |
| 22 | 3 | hands/panel_square | inform | 鴨下 久志 | 品川駅港南口から八潮橋… | [N]損保会社がダンジョン特約を売り出した時点で、少なくとも俺の生きている間は… | medium |
| 23 | 2 | wide/panel_landscape | pause | 鴨下 久志 | 品川駅港南口から八潮橋… | [N]俺がそのビルに立ち寄ったのは、出現から三日後の金曜日だ。 | low |
| 24 | 4 | hands/panel_portrait | beat_button | 鴨下 久志 | 品川駅港南口から八潮橋… | [N]Eランク登録者募集中。当日発行可。手数料、五百円。 | medium |

**panel #21** [imp=3, beat=2/inciting_incident, scene=ep1-s2]
- 🎯 purpose: 魔石が宝物ではなく市場価値を持つ伏線を、現代産業の絵で示す。
- 🔄 change_from_prev: 西園寺の主観的な断定から、社会実装された客観的な実例へ反転する。
- 👁 visual_focus: トラックの荷台に積まれるコンテナ、魔石用の無地ケース、建材サンプル風の甲殻板。
- 🎬 cut_type: contrast
- → link_to_next: 金銭と契約の話を、保険商品とスマホ画面へ接続する。
- 📜 narration: 「だが、電力会社が魔石を買い取り、建材メーカーが甲殻素材を仕入れ始めた。」
- 📏 bubble_budget: count=1, max_chars=42, type=narration_box
- ⬜ negative_space: コンテナ側面と納品票にSVG用の空欄。会社名や数値は画像内に描かない。
- 🔃 turn: page_open / strength=1
- 👥 multi_char: distant

**panel #22** [imp=3, beat=2/inciting_incident, scene=ep1-s2]
- 🎯 purpose: ダンジョンが制度とリスク計算に組み込まれたことを、保険パンフとスマホUIで見せる。
- 🔄 change_from_prev: 産業物流の外側から、久志が手元で確認できる生活情報へ寄る。
- 👁 visual_focus: スマホ画面、保険パンフ、革靴のつま先、駅前の舗装。
- 🎬 cut_type: scale_jump
- → link_to_next: 手元の数字感覚を、金曜日に立ち寄る具体的な動機へつなげる。
- 📜 narration: 「損保会社がダンジョン特約を売り出した時点で、少なくとも俺の生きている間は消えそうにない。」
- 📏 bubble_budget: count=1, max_chars=50, type=narration_box
- ⬜ negative_space: スマホ画面とパンフ見出しにSVG用矩形枠を確保。画面内文字は描かない。
- ⚠️ render_risk: medium

**panel #23** [imp=2, beat=2/inciting_incident, scene=ep1-s2]
- 🎯 purpose: 火曜の発見から金曜の行動へ時間を進め、久志が入口へ近づく心理的段差を作る。
- 🔄 change_from_prev: 社会説明から、久志自身が初めてルートを変える行動へ移る。
- 👁 visual_focus: 雑居ビル入口前で足を止める久志、通勤路から一歩外れた革靴、朝の硬い光。
- 🎬 cut_type: time_skip
- → link_to_next: のぼり横の小さな紙へ視線を落とし、五百円の現実感を強調する。
- 📜 narration: 「俺がそのビルに立ち寄ったのは、出現から三日後の金曜日だ。」
- 📏 bubble_budget: count=1, max_chars=30, type=narration_box

**panel #24** [imp=4, beat=2/inciting_incident, scene=ep1-s2]
- 🎯 purpose: 久志の価値判断が『恐怖』ではなく『見積もれる金額』へ向く瞬間を作る。
- 🔄 change_from_prev: 入口前の迷いから、具体的な金額に意識が吸い寄せられる停止へ変える。
- 👁 visual_focus: のぼり横の小さな貼り紙、久志の指先、くたびれた財布の端。
- 🎬 cut_type: scale_jump
- → link_to_next: 次ページで、五百円をきっかけに足が地下へ向く。
- 📜 narration: 「Eランク登録者募集中。当日発行可。手数料、五百円。」
- 📏 bubble_budget: count=1, max_chars=28, type=narration_box
- ⬜ negative_space: 貼り紙全面をSVGテキスト用に白く空ける。五百円表示は後乗せ。
- 🔃 turn: page_end / strength=3
- ⚠️ render_risk: medium

> 🎬 **page_end_hook**: のぼり横の『手数料五百円』が、久志にとって危険よりも具体的な数字として刺さる。


---

## P6 [aftermath] ◀ left — target 4 panels — turn_strength=3

> 🪝 **page_open_hook**: 前ページ末の『五百円』を受け、久志の中で危険な非日常が安い行政手続きの顔に変わる。

| # | imp | shot | NF | char | location | text | risk |
|---|---|---|---|---|---|---|---|
| 25 | 3 | face_close/panel_square | emote | 鴨下 久志 | 品川駅港南口から八潮橋… | [N]その五百円が、やけにリアルだった。 | low |
| 26 | 2 | hands/panel_landscape | pause | 鴨下 久志 | 品川駅港南口から八潮橋… | [N]五百円でできる手続きが、この世にまだあるのか。 | medium |
| 27 | 3 | wide/panel_landscape | contrast | 鴨下 久志 | 品川駅港南口から八潮橋… | [N]朝から胃が痛かった。月曜の役員報告を控えた見積もりは、まだペンディングの… | low |
| 28 | 4 | over_shoulder/panel_tall | beat_button | 鴨下 久志 | 品川駅港南口から八潮橋… | [N]見学するだけのつもりだった。ほんとうに、それだけのつもりだった。 | low |

**panel #25** [imp=3, beat=2/inciting_incident, scene=ep1-s2]
- 🎯 purpose: 久志の異常な合理性を感情として見せ、ダンジョンへ入る動機を生活費の尺度に落とす。
- 🔄 change_from_prev: 貼り紙の金額から、久志の内面の引っかかりへ寄る。
- 👁 visual_focus: 久志の無表情に近い目元、眼鏡に映る白い貼り紙、額の薄い疲労。
- 🎬 cut_type: shot_reverse
- → link_to_next: 表情を隠すように視線を下げ、足元の地下入口へつなぐ。
- 📜 narration: 「その五百円が、やけにリアルだった。」
- 📏 bubble_budget: count=1, max_chars=18, type=thought
- 🔃 turn: page_open / strength=1

**panel #26** [imp=2, beat=2/inciting_incident, scene=ep1-s2]
- 🎯 purpose: 顔ではなく手元で、久志の生活感と金銭感覚を間接的に見せる。
- 🔄 change_from_prev: 顔の反応から、財布と硬貨という具体物へ視点を落とす。
- 👁 visual_focus: 五百円玉、レシートの束、会社員らしい革財布、貼り紙の端。
- 🎬 cut_type: scale_jump
- → link_to_next: 硬貨の丸さを地下へ降りる丸い誘導灯や階段の暗がりへ graphic_match させる。
- 📜 narration: 「五百円でできる手続きが、この世にまだあるのか。」
- 📏 bubble_budget: count=1, max_chars=22, type=thought
- ⚠️ render_risk: medium

**panel #27** [imp=3, beat=2/inciting_incident, scene=ep1-s2]
- 🎯 purpose: 会社の見積もりストレスと、五百円で始まるダンジョン手続きを対比させる。
- 🔄 change_from_prev: 硬貨の小さな現実から、仕事の圧迫感を背負った身体全体へ戻す。
- 👁 visual_focus: 地下へ下りる階段の暗がり、背後の高層ビル、久志の丸めた肩。
- 🎬 cut_type: graphic_match
- → link_to_next: 久志がカードを受け取る未来の予感へつなげ、次beatの受付描写を準備する。
- 📜 narration: 「朝から胃が痛かった。月曜の役員報告を控えた見積もりは、まだペンディングのままだった。」
- 📏 bubble_budget: count=1, max_chars=48, type=narration_box

**panel #28** [imp=4, beat=2/inciting_incident, scene=ep1-s2]
- 🎯 purpose: このbeatを『通勤路にある入口』から『久志が入る入口』へ変化させ、次beatの受付・登録へ引きを作る。
- 🔄 change_from_prev: 仕事から逃げたい外的圧力が、実際に地下へ向く一歩に変わる。
- 👁 visual_focus: 久志の背中、地下へ続く階段、蛍光灯の白、オレンジバリケードの影。
- 🎬 cut_type: reveal_pull
- → link_to_next: 次beatで八潮リフト受付・管理カウンターに入り、Eランク登録手続きへ進む。
- 📜 narration: 「見学するだけのつもりだった。ほんとうに、それだけのつもりだった。」
- 📏 bubble_budget: count=1, max_chars=34, type=narration_box
- ⬜ negative_space: 階段上部にナレーション枠用の白い余白。地下側は文字なしで不穏に残す。
- 🔃 turn: page_end / strength=3

> 🎬 **page_end_hook**: 久志は見学だけのつもりでカードを尻ポケットに入れ、地下へ続く入口を見下ろす。次beatの受付・一階層突入へつなぐ。


---

## P7 [establishing] ▶ right (RTL開き側) — target 5 panels — turn_strength=2

> 🪝 **page_open_hook**: 前ページ末で久志が地下へ続く入口を見下ろした流れを受け、視線の先が生活感のある受付カウンターへ着地する。

| # | imp | shot | NF | char | location | text | risk |
|---|---|---|---|---|---|---|---|
| 29 | 3 | wide/panel_landscape | establishing | 鴨下 久志/神楽坂 | 八潮リフト受付・管理カ… | [N]地下に下りると、そこは銀行窓口みたいな場所だった。 | medium |
| 30 | 3 | hands/panel_square | inform | 鴨下 久志/神楽坂 | 八潮リフト受付・管理カ… | 神楽坂「免許証、お願いします」 | medium |
| 31 | 2 | face_close/panel_portrait | emote | 鴨下 久志 | 八潮リフト受付・管理カ… | [N]五百円でできる手続きが、この世にまだあるのか。 | low |
| 32 | 3 | over_shoulder/panel_landscape | inform | 鴨下 久志/神楽坂 | 八潮リフト受付・管理カ… | 神楽坂「ここに署名を」 | medium |
| 33 | 4 | hands/panel_square | beat_button | 鴨下 久志/神楽坂 | 八潮リフト受付・管理カ… | [N]発行まで、十五分。 | medium |

**panel #29** [imp=3, beat=3/rising, scene=ep1-s3]
- 🎯 purpose: ダンジョン入口なのに区役所的な受付であることを示し、現代日常と異世界リスクの落差を作る。
- 🔄 change_from_prev: 入口を見下ろす不安から、実際には生活感のある受付へ移り、危険の輪郭が薄まる。
- 👁 visual_focus: 番号札、料金表、蛍光灯、銀行窓口風のカウンター越しに座る神楽坂
- 🎬 cut_type: reveal_pull
- → link_to_next: 神楽坂の事務的な案内に視線を寄せる。
- 📜 narration: 「地下に下りると、そこは銀行窓口みたいな場所だった。」
- 📏 bubble_budget: count=1, max_chars=28, type=narration_box
- ⬜ negative_space: 上部に小さなナレーション枠用の白場。料金表や掲示物の文字はSVGで後置き。
- 🔃 turn: page_open / strength=1
- ⚠️ render_risk: medium
- 👥 multi_char: distant

**panel #30** [imp=3, beat=3/rising, scene=ep1-s3]
- 🎯 purpose: 登録が特別な儀式ではなく、免許証提出で済む軽い手続きだと見せる。
- 🔄 change_from_prev: 場の全体像から、久志の手元の迷いへ焦点が絞られる。
- 👁 visual_focus: 免許証を差し出す久志の手、カウンター上のタブレット、五百円硬貨
- 🎬 cut_type: scale_jump
- → link_to_next: タブレット署名へ事務処理が進む。
- 💬 神楽坂 (normal): 「免許証、お願いします」
- 📏 bubble_budget: count=1, max_chars=14, type=dialogue
- ⬜ negative_space: タブレット画面は無地の矩形で残し、署名欄や登録UIはSVG重ね。
- ⚠️ render_risk: medium

**panel #31** [imp=2, beat=3/rising, scene=ep1-s3]
- 🎯 purpose: 久志の価値判断が冒険心ではなく家計感覚で動いていることを明確にする。
- 🔄 change_from_prev: 事務処理の外側から、久志の内面の計算へ入る。
- 👁 visual_focus: 久志の眼鏡奥の目、頬の汗、背景にぼける五百円表示
- 🎬 cut_type: scale_jump
- → link_to_next: 安さに納得してしまった久志が署名へ進む。
- 📜 narration: 「五百円でできる手続きが、この世にまだあるのか。」
- 📏 bubble_budget: count=1, max_chars=24, type=thought
- ⬜ negative_space: 顔の横に小さな独白用の白場。背景掲示の文字は描き込まない。

**panel #32** [imp=3, beat=3/rising, scene=ep1-s3]
- 🎯 purpose: 署名によって久志が引き返せる境界を越える瞬間を描く。
- 🔄 change_from_prev: 内面の逡巡から、具体的な署名行為へ戻る。
- 👁 visual_focus: タブレットに触れる久志の人差し指、横に置かれた五百円硬貨
- 🎬 cut_type: match_action
- → link_to_next: 署名後、登録カードが発行される。
- 💬 神楽坂 (normal): 「ここに署名を」
- 📏 bubble_budget: count=1, max_chars=8, type=dialogue
- ⬜ negative_space: タブレット画面は矩形枠のみ。署名線や注意文はSVG重ね。
- ⚠️ render_risk: medium

**panel #33** [imp=4, beat=3/rising, scene=ep1-s3]
- 🎯 purpose: 登録の軽さを締め、危険への心理的ハードルが下がったことを示す。
- 🔄 change_from_prev: 署名という能動的行為から、カードを受け取る受動的な結果へ変わる。
- 👁 visual_focus: 神楽坂が差し出す小さなEランクカードと、受け取る直前で止まる久志の手
- 🎬 cut_type: graphic_match
- → link_to_next: カードを受け取った久志に、神楽坂が一階層のルールを説明する。
- 📜 narration: 「発行まで、十五分。」
- 📏 bubble_budget: count=1, max_chars=10, type=narration_box
- ⬜ negative_space: カード表面のランク表示は空欄で残し、SVGでEランク表記を重ねる。
- 🔃 turn: page_end / strength=2
- ⚠️ render_risk: medium

> 🎬 **page_end_hook**: 五百円という日常的な金額が、危険な登録手続きの軽さを際立たせて次ページへ送る。


---

## P8 [dialogue] ◀ left — target 4 panels — turn_strength=3

> 🪝 **page_open_hook**: 前ページ末で差し出されたカードを受け取り、神楽坂の説明が事務的な軽さのまま危険領域へ踏み込ませる。

| # | imp | shot | NF | char | location | text | risk |
|---|---|---|---|---|---|---|---|
| 34 | 3 | over_shoulder/panel_landscape | inform | 鴨下 久志/神楽坂 | 八潮リフト受付・管理カ… | 神楽坂「鴨下さん、Eランクは一階層までです」 | medium |
| 35 | 2 | hands/panel_square | pause | 鴨下 久志 | 八潮リフト受付・管理カ… | [N]一階層まで。見学だけなら、問題ない。 | low |
| 36 | 3 | side/panel_landscape | contrast | 鴨下 久志/神楽坂 | 八潮リフト受付・管理カ… | 神楽坂「一階層は弱いです。軍手と懐中電灯で大丈夫ですよ」 | medium |
| 37 | 4 | wide/panel_tall | beat_button | 鴨下 久志 | 八潮リフト受付・管理カ… | [N]俺はその日、本当に見学だけのつもりだった。 | low |

**panel #34** [imp=3, beat=3/rising, scene=ep1-s3]
- 🎯 purpose: Eランクは一階層までという伏線を明示し、後のD級相当出現への違和感を仕込む。
- 🔄 change_from_prev: 登録完了の結果から、入場制限というルール説明へ移る。
- 👁 visual_focus: 神楽坂の手元の説明資料、カウンターに置かれたEランクカード
- 🎬 cut_type: match_action
- → link_to_next: 久志の反応で制限の重みが薄まる。
- 💬 神楽坂 (normal): 「鴨下さん、Eランクは一階層までです」
- 📏 bubble_budget: count=1, max_chars=22, type=dialogue
- ⬜ negative_space: 説明資料とカードの文字要素は空白矩形で、SVGにてランク制限を後置き。
- 🔃 turn: page_open / strength=1
- ⚠️ render_risk: medium

**panel #35** [imp=2, beat=3/rising, scene=ep1-s3]
- 🎯 purpose: 久志の自己弁明を置き、危険に踏み込む心理的ハードルの低さを作る。
- 🔄 change_from_prev: 神楽坂の外部説明から、久志の内心の言い訳へ沈む。
- 👁 visual_focus: カードを握る手と、その下で小さく曲がるスーツの裾
- 🎬 cut_type: scale_jump
- → link_to_next: 神楽坂の軽い例示がさらに背中を押す。
- 📜 narration: 「一階層まで。見学だけなら、問題ない。」
- 📏 bubble_budget: count=1, max_chars=22, type=thought
- ⬜ negative_space: 手元周辺に独白用の白場。カードの文字はSVG後置き。

**panel #36** [imp=3, beat=3/rising, scene=ep1-s3]
- 🎯 purpose: ダンジョン攻略を軍手と懐中電灯という生活用品へ落とし込み、現代ダンジョンの異物感を強める。
- 🔄 change_from_prev: 久志の静かな自己弁明に対し、神楽坂の軽い説明が危険をさらに小さく見せる。
- 👁 visual_focus: 神楽坂の柔らかい営業スマイル、カウンター脇の軍手と懐中電灯の実物見本
- 🎬 cut_type: shot_reverse
- → link_to_next: 久志の視線が受付奥の入口へ動く。
- 💬 神楽坂 (normal): 「一階層は弱いです。軍手と懐中電灯で大丈夫ですよ」
- 📏 bubble_budget: count=1, max_chars=30, type=dialogue
- ⬜ negative_space: 掲示物と注意書きは文字なしの枠のみ。吹き出しは上部に配置。
- ⚠️ render_risk: medium

**panel #37** [imp=4, beat=3/rising, scene=ep1-s3]
- 🎯 purpose: 『見学だけ』という言い訳をページ末に置き、次ページの一階層突入への引きを作る。
- 🔄 change_from_prev: 会話の軽さから、受付奥に口を開ける入口の存在感へ切り替わる。
- 👁 visual_focus: 受付奥の無機質なゲート、足元へ伸びる蛍光灯の影、久志の背中
- 🎬 cut_type: reveal_pull
- → link_to_next: 次ページでカードを尻ポケットに入れてゲートへ進む。
- 📜 narration: 「俺はその日、本当に見学だけのつもりだった。」
- 📏 bubble_budget: count=1, max_chars=24, type=narration_box
- ⬜ negative_space: ゲート上の警告表示は空枠。SVGで注意表示を重ねるため中央上部を空ける。
- 🔃 turn: page_end / strength=3

> 🎬 **page_end_hook**: 『一階層まで』というルールを示した直後に、地下へ続くゲートを見せて次ページの侵入へ繋ぐ。


---

## P9 [reveal] ▶ right (RTL開き側) — target 5 panels — turn_strength=3

> 🪝 **page_open_hook**: 前ページ末の『見学だけ』を受け、久志がカードをしまう日常動作から実際の入場へ進む。

| # | imp | shot | NF | char | location | text | risk |
|---|---|---|---|---|---|---|---|
| 38 | 2 | hands/panel_square | pause | 鴨下 久志 | 八潮リフト受付・管理カ… | [N]カードを尻ポケットに入れた。 | low |
| 39 | 3 | full_body/panel_landscape | emote | 鴨下 久志 | 八潮リフト受付・管理カ… | 鴨下 久志「見学だけなら」 | low |
| 40 | 4 | wide/panel_tall | silence | 鴨下 久志 | 八潮リフト一階層・地下… | (silent) | low |
| 41 | 2 | side/panel_square | contrast | 鴨下 久志 | 八潮リフト一階層・地下… | [N]想像していた洞窟では、なかった。 | low |
| 42 | 3 | wide/panel_landscape | reveal | 鴨下 久志 | 八潮リフト一階層・地下… | [N]遠くの柱の陰に、緑色の影が座り込んでいた。 | low |

**panel #38** [imp=2, beat=3/rising, scene=ep1-s3]
- 🎯 purpose: 日常動作で入場直前の間を作り、危険への境界越えを小さく見せる。
- 🔄 change_from_prev: 入口を見つめる背中から、カードをしまう手元の生活感へ寄る。
- 👁 visual_focus: 尻ポケットへ滑り込むEランクカード、スーツの生地、革靴のつま先
- 🎬 cut_type: scale_jump
- → link_to_next: 足元が受付の床から一階層へ向かう通路へ進む。
- 📜 narration: 「カードを尻ポケットに入れた。」
- 📏 bubble_budget: count=1, max_chars=14, type=narration_box
- ⬜ negative_space: カード表面の文字はSVG後置き。手元周辺は白場多め。
- 🔃 turn: page_open / strength=1

**panel #39** [imp=3, beat=3/rising, scene=ep1-s3]
- 🎯 purpose: 自己弁明を台詞化し、久志が能動的に入口へ進む転換点を作る。
- 🔄 change_from_prev: カードをしまう無言の動作から、足を進める小さな決断へ変わる。
- 👁 visual_focus: 受付の明るい床から暗い通路へ一歩踏み出す久志の全身
- 🎬 cut_type: match_action
- → link_to_next: 入口の暗さと受付の明るさの対比へ繋ぐ。
- 💬 鴨下 久志 (whisper): 「見学だけなら」
- 📏 bubble_budget: count=1, max_chars=8, type=whisper
- ⬜ negative_space: 足元と通路奥を広く残し、効果音や小声吹き出しを後置き可能にする。

**panel #40** [imp=4, beat=3/rising, scene=ep1-s3]
- 🎯 purpose: 場所転換の最初のコマとして一階層の全体像を確立し、日常パートとの視覚コントラストを作る。
- 🔄 change_from_prev: 受付の明るい事務空間から、音が反響する広大な地下駐車場型エリアへ場面が切り替わる。
- 👁 visual_focus: だだっ広いコンクリート床、蛍光灯、柱列、受付光を背負う小さな久志
- 🎬 cut_type: smash_cut
- → link_to_next: 久志の視線が遠くの柱陰へ吸い寄せられる。
- 📏 bubble_budget: count=0, max_chars=0, type=dialogue
- ⬜ negative_space: 50%以上を白と薄トーンの床面にし、無音の余白として使う。

**panel #41** [imp=2, beat=3/rising, scene=ep1-s3]
- 🎯 purpose: 現代建築と異空間の混在を久志の認識として提示し、ジャンルの視覚軸を定着させる。
- 🔄 change_from_prev: 無音の全景から、久志の観察と思考へ戻る。
- 👁 visual_focus: 久志の横顔、蛍光灯に照らされたコンクリート床、奥だけ微妙に歪む壁面
- 🎬 cut_type: scale_jump
- → link_to_next: 観察の先に、柱陰の異物が入ってくる。
- 📜 narration: 「想像していた洞窟では、なかった。」
- 📏 bubble_budget: count=1, max_chars=18, type=narration_box
- ⬜ negative_space: 壁面の案内表示は文字なし。ナレーション枠を上部に小さく配置。

**panel #42** [imp=3, beat=3/rising, scene=ep1-s3]
- 🎯 purpose: 一階層突入の到達点として初遭遇の影を見せ、次beatの接近と戦闘へ引き渡す。
- 🔄 change_from_prev: 空間観察から、明確な異物の発見へ物語が進む。
- 👁 visual_focus: 柱陰に小さく座る緑色のシルエット、手前で止まる久志の革靴、長く伸びる蛍光灯の影
- 🎬 cut_type: reveal_pull
- → link_to_next: 次beatで久志が影へ向かって歩き出す。
- 📜 narration: 「遠くの柱の陰に、緑色の影が座り込んでいた。」
- 📏 bubble_budget: count=1, max_chars=24, type=narration_box
- ⬜ negative_space: 柱陰の影は詳細を描かず、次beat用に正体を隠す。ナレーション枠は床面の白場へ配置。
- 🔃 turn: page_end / strength=3
- 👥 multi_char: silhouette

> 🎬 **page_end_hook**: 一階層が洞窟ではなく地下駐車場型空間だと明かし、遠い柱陰の影で次beatの初遭遇へ繋ぐ。


---

## P10 [establishing] ◀ left — target 4 panels — turn_strength=3

> 🪝 **page_open_hook**: 前ページ末の『遠い柱陰の影』を受け、柱の陰にいた緑色の小さな魔物へ久志が近づく。地下駐車場型の一階層だと改めて見せる。

| # | imp | shot | NF | char | location | text | risk |
|---|---|---|---|---|---|---|---|
| 43 | 3 | wide/panel_landscape | establishing | 鴨下 久志 | 八潮リフト一階層・地下… | [N]一階層は、洞窟ではなかった。 | low |
| 44 | 2 | side/panel_square | inform | 鴨下 久志 | 八潮リフト一階層・地下… | [N]近づくと、そいつはちゃんと嫌な顔で俺を見上げた。 | medium |
| 45 | 2 | hands/panel_portrait | pause | 鴨下 久志 | 八潮リフト一階層・地下… | [N]尻ポケットの傘を抜いた。 | medium |
| 46 | 4 | over_shoulder/panel_landscape | reveal | 鴨下 久志 | 八潮リフト一階層・地下… | [N]頭の上に、数字が浮かんだ気がした。 | medium |

**panel #43** [imp=3, beat=4/turn, scene=ep1-s4]
- 🎯 purpose: 地下駐車場のような異空間を提示し、前beatの影へ久志が踏み込む距離感を作る。
- 🔄 change_from_prev: 柱陰の不穏な影から、久志がその正体を確かめに行く行動へ移る。
- 👁 visual_focus: 蛍光灯が等間隔に並ぶコンクリート床、柱の影、スーツ姿で折り畳み傘を握る久志の背中
- 🎬 cut_type: reveal_pull
- → link_to_next: 広い空間の奥にいる小さな異物へ視線を誘導する。
- 📜 narration: 「一階層は、洞窟ではなかった。」
- 📏 bubble_budget: count=1, max_chars=18, type=narration_box
- 🔃 turn: page_open / strength=2
- 👥 multi_char: distant

**panel #44** [imp=2, beat=4/turn, scene=ep1-s4]
- 🎯 purpose: 初遭遇の相手が強大な怪物ではなく、座り込んだ小型の敵だと示して期待を外す。
- 🔄 change_from_prev: 遠景の影が、久志の足元の小さな敵として具体化する。
- 👁 visual_focus: 久志の革靴、床に座る小さな緑の影、傘の先端
- 🎬 cut_type: scale_jump
- → link_to_next: 敵の頭上に久志だけが読む数字を出す準備をする。
- 📜 narration: 「近づくと、そいつはちゃんと嫌な顔で俺を見上げた。」
- 📏 bubble_budget: count=1, max_chars=24, type=narration_box
- ⚠️ render_risk: medium

**panel #45** [imp=2, beat=4/turn, scene=ep1-s4]
- 🎯 purpose: 久志の感情を顔ではなく手元で見せ、戦闘前の間を置く。
- 🔄 change_from_prev: 敵を見る受け身から、久志が自分の道具を選ぶ能動へ変わる。
- 👁 visual_focus: スラックスの尻ポケットから抜かれる折り畳み傘、少し汗ばんだ指
- 🎬 cut_type: match_action
- → link_to_next: 傘を武器として構え、頭上の見積もり表示へ繋げる。
- 📜 narration: 「尻ポケットの傘を抜いた。」
- 📏 bubble_budget: count=1, max_chars=12, type=narration_box
- ⚠️ render_risk: medium

**panel #46** [imp=4, beat=4/turn, scene=ep1-s4]
- 🎯 purpose: 久志だけが読める推定HPと報酬相場の表示を、このbeatの核となる能力として定着させる。
- 🔄 change_from_prev: 物理的な傘の準備から、久志の認識内に現れる現代風UIへ飛ぶ。
- 👁 visual_focus: 敵の頭上に重ねる矩形UI用の余白、久志の肩越し、薄暗い柱列
- 🎬 cut_type: graphic_match
- → link_to_next: 表示された安い相場が、実際の戦闘を小さな検証に変える。
- 📜 narration: 「頭の上に、数字が浮かんだ気がした。」
- 📏 bubble_budget: count=1, max_chars=30, type=narration_box
- ⬜ negative_space: 敵の頭上にSVGで《推定HP 十二前後／報酬相場 四百五十円》を置くための白い矩形UI領域を確保。画像内には文字を描かない。
- 🔃 turn: page_end / strength=3
- ⚠️ render_risk: medium

> 🎬 **page_end_hook**: 久志だけに見える見積もり表示が浮かび、恐怖より計算が先に立つ。


---

## P11 [action] ▶ right (RTL開き側) — target 4 panels — turn_strength=3

> 🪝 **page_open_hook**: 前ページ末の見積もり表示を受け、久志は『倒せるか』ではなく『四百五十円になるか』の検証として動き出す。

| # | imp | shot | NF | char | location | text | risk |
|---|---|---|---|---|---|---|---|
| 47 | 3 | side/panel_landscape | inform | 鴨下 久志 | 八潮リフト一階層・地下… | [N]一回目。 | high |
| 48 | 1 | full_body/panel_square | silence | 鴨下 久志 | 八潮リフト一階層・地下… | (silent) | low |
| 49 | 3 | birds_eye/panel_tall | contrast | 鴨下 久志 | 八潮リフト一階層・地下… | [N]二回目で、距離が分かった。 | high |
| 50 | 4 | hands/panel_landscape | beat_button | 鴨下 久志 | 八潮リフト一階層・地下… | [N]三回目で、軽い音がした。 | high |

**panel #47** [imp=3, beat=4/turn, scene=ep1-s4]
- 🎯 purpose: 初撃を派手な英雄的攻撃ではなく、試し打ちのように見せる。
- 🔄 change_from_prev: 見積もりを読む静止から、傘を振り下ろす行動へ移る。
- 👁 visual_focus: 折り畳み傘の軌道、床に伸びる久志の影、地下駐車場の白線
- 🎬 cut_type: match_action
- → link_to_next: 当たりの軽さが、次の反応の間を生む。
- 📜 narration: 「一回目。」
- 📏 bubble_budget: count=1, max_chars=5, type=narration_box
- 🔃 turn: page_open / strength=1
- ⚠️ render_risk: high

**panel #48** [imp=1, beat=4/turn, scene=ep1-s4]
- 🎯 purpose: 初撃後の無音を置き、恐怖でも高揚でもない久志の空白を読ませる。
- 🔄 change_from_prev: 動きの線から、音の消えた硬い床と久志の姿勢へ落とす。
- 👁 visual_focus: 傘を持ったまま固まる久志、広すぎる空間、白く抜けた床面
- 🎬 cut_type: contrast
- → link_to_next: 間を挟んだことで二撃目が作業の反復に見える。
- 📏 bubble_budget: count=0, max_chars=0
- ⬜ negative_space: 50%以上を床の白い余白にして、完全無音の間を作る。

**panel #49** [imp=3, beat=4/turn, scene=ep1-s4]
- 🎯 purpose: 久志が戦闘を身体で覚えるより、距離と回数の計算として処理していることを見せる。
- 🔄 change_from_prev: 無音の硬直から、上から見た作業的な反復へ切り替わる。
- 👁 visual_focus: 白線をまたぐ革靴、傘の届く範囲、床に落ちる二つの影
- 🎬 cut_type: scale_jump
- → link_to_next: 三回目に向けて、検証が完了する予感を作る。
- 📜 narration: 「二回目で、距離が分かった。」
- 📏 bubble_budget: count=1, max_chars=14, type=narration_box
- ⚠️ render_risk: high

**panel #50** [imp=4, beat=4/turn, scene=ep1-s4]
- 🎯 purpose: 初討伐の瞬間を、爆発ではなく『ぽん』という小さな結果音で締める。
- 🔄 change_from_prev: 距離を測る反復から、検証結果が出る瞬間へ進む。
- 👁 visual_focus: 傘の先、消えかける小さな影、床に落ちようとする灰色の粒
- 🎬 cut_type: match_action
- → link_to_next: 敵が消えた後に残る小石へ視線を落とす。
- 📜 narration: 「三回目で、軽い音がした。」
- 📏 bubble_budget: count=1, max_chars=15, type=narration_box
- 🔃 turn: page_end / strength=3
- ⚠️ render_risk: high

> 🎬 **page_end_hook**: 三撃目で敵が消え、床に何かが転がる直前でめくらせる。


---

## P12 [reveal] ◀ left — target 4 panels — turn_strength=3

> 🪝 **page_open_hook**: 前ページ末の軽い討伐音に対し、派手な戦利品ではなく親指の先ほどの灰色の石が現れる。

| # | imp | shot | NF | char | location | text | risk |
|---|---|---|---|---|---|---|---|
| 51 | 3 | hands/panel_square | reveal | 鴨下 久志 | 八潮リフト一階層・地下… | [N]床に、親指の先くらいの灰色の石が転がった。 | low |
| 52 | 2 | hands/panel_portrait | pause | 鴨下 久志 | 八潮リフト一階層・地下… | (silent) | medium |
| 53 | 4 | hands/panel_landscape | reveal | 鴨下 久志 | 八潮リフト一階層・地下… | [N]通知が来た。 | medium |
| 54 | 3 | face_close/panel_portrait | beat_button | 鴨下 久志 | 八潮リフト一階層・地下… | [N]四百五十円で見積もったのに、二十円安い。 | low |

**panel #51** [imp=3, beat=4/turn, scene=ep1-s4]
- 🎯 purpose: 初ドロップを地味な灰色の石として見せ、後の青い魔石との対比を準備する。
- 🔄 change_from_prev: 消える敵の動きから、床に残った小さな物体へ焦点が落ちる。
- 👁 visual_focus: コンクリート床に転がる灰色の小石、久志の革靴のつま先
- 🎬 cut_type: scale_jump
- → link_to_next: 久志が戦利品ではなく査定対象としてスマホへ意識を移す。
- 📜 narration: 「床に、親指の先くらいの灰色の石が転がった。」
- 📏 bubble_budget: count=1, max_chars=24, type=narration_box
- 🔃 turn: page_open / strength=2

**panel #52** [imp=2, beat=4/turn, scene=ep1-s4]
- 🎯 purpose: スマホを出すまでの小さな間で、久志にとって重要なのは討伐ではなく査定だと示す。
- 🔄 change_from_prev: 床の石を見る視線から、尻ポケットのスマホへ手が動く。
- 👁 visual_focus: 片手の折り畳み傘、もう片手で取り出すスマホ、灰色の石は足元に小さく残る
- 🎬 cut_type: match_action
- → link_to_next: 通知画面の白い光へカットを繋ぐ。
- 📏 bubble_budget: count=0, max_chars=0
- ⚠️ render_risk: medium

**panel #53** [imp=4, beat=4/turn, scene=ep1-s4]
- 🎯 purpose: スマホ通知で魔石の査定額を提示し、現代UIとダンジョン報酬を融合させる。
- 🔄 change_from_prev: スマホを取り出す動作から、画面の情報そのものへ寄る。
- 👁 visual_focus: 暗い地下空間の中で白く光るスマホ画面、足元の灰色の小石
- 🎬 cut_type: scale_jump
- → link_to_next: 表示額と頭の中の見積もりの差を、久志の反応で回収する。
- 📜 narration: 「通知が来た。」
- 📏 bubble_budget: count=1, max_chars=8, type=narration_box
- ⬜ negative_space: スマホ画面にSVGで《魔石（E級・一般）／四百三十円》を配置。画面内文字は生成しない。
- ⚠️ render_risk: medium

**panel #54** [imp=3, beat=4/turn, scene=ep1-s4]
- 🎯 purpose: このbeatの核心として、久志の最初の感想が『二十円のズレ』だったと確定させる。
- 🔄 change_from_prev: スマホ画面の客観情報から、久志の異様に生活的な内面へ移る。
- 👁 visual_focus: スマホの白い光を受けた久志の無表情に近い顔、眉間だけがわずかに寄る
- 🎬 cut_type: shot_reverse
- → link_to_next: ダンジョンを毎朝検証できる収益案件として見る思考へ繋げる。
- 📜 narration: 「四百五十円で見積もったのに、二十円安い。」
- 📏 bubble_budget: count=1, max_chars=22, type=thought
- 🔃 turn: page_end / strength=3

> 🎬 **page_end_hook**: 通知額が見積もりより二十円安いと分かり、久志の感想が恐怖からずれる。


---

## P13 [aftermath] ▶ right (RTL開き側) — target 4 panels — turn_strength=3

> 🪝 **page_open_hook**: 前ページ末の『二十円安い』という感想を受け、久志の中で恐怖や達成感が後景へ退く。

| # | imp | shot | NF | char | location | text | risk |
|---|---|---|---|---|---|---|---|
| 55 | 3 | wide/panel_landscape | emote | 鴨下 久志 | 八潮リフト一階層・地下… | [N]ダンジョンが怖いとも、俺が強いとも思わなかった。 | low |
| 56 | 2 | hands/panel_square | contrast | 鴨下 久志 | 八潮リフト一階層・地下… | [N]誤差は、二十円。 | medium |
| 57 | 4 | side/panel_portrait | beat_button | 鴨下 久志 | 八潮リフト一階層・地下… | [N]営業として、気に入らなかった。 | low |
| 58 | 3 | wide/panel_landscape | cutaway | 鴨下 久志 | 八潮リフト一階層・地下… | [N]翌週の月曜から、俺は八潮リフトに毎朝寄るようになった。 | low |

**panel #55** [imp=3, beat=4/turn, scene=ep1-s4]
- 🎯 purpose: 久志の感情の不在を広い空間で見せ、一般的な覚醒譚から外す。
- 🔄 change_from_prev: 顔の小さな不満から、地下駐車場全体にぽつんと立つ孤独な姿へ引く。
- 👁 visual_focus: 広大な床に一人立つ久志、足元の小石、遠くで反響する蛍光灯
- 🎬 cut_type: scale_jump
- → link_to_next: 彼の感情の代わりに数字が残ることを示す。
- 📜 narration: 「ダンジョンが怖いとも、俺が強いとも思わなかった。」
- 📏 bubble_budget: count=1, max_chars=28, type=thought
- 🔃 turn: page_open / strength=1

**panel #56** [imp=2, beat=4/turn, scene=ep1-s4]
- 🎯 purpose: 魔物を倒した現実より、査定差額だけが久志の中で拡大していることを視覚化する。
- 🔄 change_from_prev: 広い空間の余韻から、スマホと灰色の石という小さな数字の世界へ戻る。
- 👁 visual_focus: スマホ、灰色の魔石、久志の親指、白く空けたUI用余白
- 🎬 cut_type: graphic_match
- → link_to_next: この誤差を詰めたいという動機が、継続の理由に変わる。
- 📜 narration: 「誤差は、二十円。」
- 📏 bubble_budget: count=1, max_chars=10, type=thought
- ⬜ negative_space: スマホ画面と周囲にSVGで査定額と差額メモを重ねられる余白を確保。画像内文字は描かない。
- ⚠️ render_risk: medium

**panel #57** [imp=4, beat=4/turn, scene=ep1-s4]
- 🎯 purpose: 久志がダンジョン攻略へ向かう理由を、冒険心ではなく営業的な精度への執着として定義する。
- 🔄 change_from_prev: 差額という情報から、久志の行動原理そのものへ踏み込む。
- 👁 visual_focus: 傘を畳み直す久志の横顔、まくれていないワイシャツ袖、床の灰色の魔石
- 🎬 cut_type: shot_reverse
- → link_to_next: 翌週からの習慣化を自然に受け入れさせる。
- 📜 narration: 「営業として、気に入らなかった。」
- 📏 bubble_budget: count=1, max_chars=14, type=thought

**panel #58** [imp=3, beat=4/turn, scene=ep1-s4]
- 🎯 purpose: 初討伐を単発イベントで終わらせず、毎朝の副業ルーティンへ反転させて次beatへ渡す。
- 🔄 change_from_prev: 個人の納得から、時間が進んで習慣化する未来の絵へ移る。
- 👁 visual_focus: 地下駐車場型エリアの出口方向へ歩く久志の小さな背中、片手のスマホ、片手の折り畳み傘
- 🎬 cut_type: time_skip
- → link_to_next: 次beatの三ヶ月後、完全にルーティン化した朝へ繋ぐ。
- 📜 narration: 「翌週の月曜から、俺は八潮リフトに毎朝寄るようになった。」
- 📏 bubble_budget: count=1, max_chars=30, type=narration_box
- 🔃 turn: page_end / strength=3

> 🎬 **page_end_hook**: 翌週月曜から毎朝寄る習慣へ転じ、次beatの三ヶ月後のルーティンに繋ぐ。


---

## P14 [establishing] ◀ left — target 6 panels — turn_strength=2

> 🪝 **page_open_hook**: 前beat末の『翌週月曜から毎朝寄る習慣』を受け、三ヶ月後の同じ朝・同じ地下駐車場型エリアへ時間を飛ばす。

| # | imp | shot | NF | char | location | text | risk |
|---|---|---|---|---|---|---|---|
| 59 | 3 | wide/panel_landscape | establishing | 鴨下 久志 | 八潮リフト一階層・地下… | [N]三ヶ月後。俺の朝は、完全にルーティン化した。 | low |
| 60 | 2 | hands/panel_square | inform | 鴨下 久志 | 八潮リフト一階層・地下… | [N]袖をまくる。ネクタイをしまう。警棒を伸ばす。 | medium |
| 61 | 3 | side/panel_landscape | contrast | 鴨下 久志 | 八潮リフト一階層・地下… | [N]ゴブリン二匹で八百二十円。 | medium |
| 62 | 2 | hands/panel_portrait | emote | 鴨下 久志 | 八潮リフト一階層・地下… | [N]コーヒー代を引くと、純益六百二十円。 | medium |
| 63 | 2 | wide/panel_square | cutaway | 神楽坂 | 八潮リフト受付・管理カ… | [N]神楽坂さんは、毎朝同じマグカップにほうじ茶を注いでいる。 | low |
| 64 | 3 | birds_eye/panel_landscape | beat_button | 鴨下 久志 | 八潮リフト一階層・地下… | [N]月換算、一万二千円。昼飯代だ。 | low |

**panel #59** [imp=3, beat=5/rising, scene=ep1-s5]
- 🎯 purpose: 地下駐車場型ダンジョンが、久志にとって通勤前の固定ルートになったことを一目で示す。
- 🔄 change_from_prev: 前beatの習慣化予告から時間を飛ばし、実際に反復された朝の風景へ着地する。
- 👁 visual_focus: 蛍光灯が並ぶ広いコンクリート空間、柱番号、遠くを歩く久志の小さな背中。
- 🎬 cut_type: time_skip
- → link_to_next: 久志の身支度へ寄って、日常化の具体物を積み上げる。
- 📜 narration: 「三ヶ月後。俺の朝は、完全にルーティン化した。」
- 📏 bubble_budget: count=1, max_chars=24, type=narration_box
- 🔃 turn: page_open / strength=1

**panel #60** [imp=2, beat=5/rising, scene=ep1-s5]
- 🎯 purpose: 久志が冒険者ではなく出勤前の作業員のように準備していることを見せる。
- 🔄 change_from_prev: 引きの空間から手元へ寄り、ルーティンの身体化を具体化する。
- 👁 visual_focus: まくったワイシャツ袖、第二ボタンに押し込まれたネクタイ、樹脂製伸縮警棒。
- 🎬 cut_type: scale_jump
- → link_to_next: 準備物と収支計算をつなげる。
- 📜 narration: 「袖をまくる。ネクタイをしまう。警棒を伸ばす。」
- 📏 bubble_budget: count=1, max_chars=22, type=narration_box
- ⚠️ render_risk: medium

**panel #61** [imp=3, beat=5/rising, scene=ep1-s5]
- 🎯 purpose: 戦闘を派手な冒険ではなく、朝の小遣い稼ぎとして処理している笑いを出す。
- 🔄 change_from_prev: 静かな準備から、慣れた一撃の動作へテンポを上げる。
- 👁 visual_focus: 久志の警棒が画面外の小型影を弾き、床に小さな灰色魔石が転がる瞬間。
- 🎬 cut_type: match_action
- → link_to_next: 倒した結果をスマホの数字へ接続する。
- 📜 narration: 「ゴブリン二匹で八百二十円。」
- 📏 bubble_budget: count=1, max_chars=16, type=narration_box
- ⚠️ render_risk: medium

**panel #62** [imp=2, beat=5/rising, scene=ep1-s5]
- 🎯 purpose: 久志の感情が勝利ではなく収支の整合性に向いていることを示す。
- 🔄 change_from_prev: 動きのある戦闘から、スマホ画面と指先の静止へ落とす。
- 👁 visual_focus: スマホの家計簿風画面、灰色魔石、缶コーヒーのレシート。
- 🎬 cut_type: scale_jump
- → link_to_next: 日額から月額へ、生活費の尺度に変換する。
- 📜 narration: 「コーヒー代を引くと、純益六百二十円。」
- 📏 bubble_budget: count=1, max_chars=18, type=narration_box
- ⬜ negative_space: スマホ画面部分は白い矩形余白を確保し、金額表示はSVGで重ねる。
- ⚠️ render_risk: medium

**panel #63** [imp=2, beat=5/rising, scene=ep1-s5]
- 🎯 purpose: 神楽坂と管理カウンターを反復モチーフとして置き、後の着信の重みを仕込む。
- 🔄 change_from_prev: スマホの数字から受付の生活感へ切り返し、ダンジョンが制度化されている空気を補強する。
- 👁 visual_focus: 銀行窓口風カウンター、低いシニヨンの神楽坂、湯気の立つ同じマグカップ。
- 🎬 cut_type: smash_cut
- → link_to_next: 同じ時間帯の利用者という反復へ広げる。
- 📜 narration: 「神楽坂さんは、毎朝同じマグカップにほうじ茶を注いでいる。」
- 📏 bubble_budget: count=1, max_chars=28, type=narration_box

**panel #64** [imp=3, beat=5/rising, scene=ep1-s5]
- 🎯 purpose: 三ヶ月のルーティンを『昼飯代』という生活スケールに落としてページを締める。
- 🔄 change_from_prev: 受付の反復から久志の収支表へ戻し、整った日常の完成形を提示する。
- 👁 visual_focus: 柱の足元に置かれた缶コーヒー、スマホの月次計算、整然と並ぶ灰色魔石。
- 🎬 cut_type: graphic_match
- → link_to_next: 完璧に整った数字が、次ページで狂う。
- 📜 narration: 「月換算、一万二千円。昼飯代だ。」
- 📏 bubble_budget: count=1, max_chars=18, type=narration_box
- ⬜ negative_space: スマホ画面は空の矩形で確保し、月換算の数字はSVGで重ねる。
- 🔃 turn: page_end / strength=2

> 🎬 **page_end_hook**: ルーティンの収益計算が整いすぎているほど、次ページの異常が際立つ。


---

## P15 [reveal] ▶ right (RTL開き側) — target 6 panels — turn_strength=4

> 🪝 **page_open_hook**: 前ページ末の整った月次収支を受け、その数字の積み重ねが今朝だけ崩れる。

| # | imp | shot | NF | char | location | text | risk |
|---|---|---|---|---|---|---|---|
| 65 | 4 | wide/panel_landscape | reveal | 鴨下 久志 | 八潮リフト一階層・地下… | [N]その数字の積み重ねが、今朝、狂った。 | low |
| 66 | 3 | side/panel_portrait | inform | 鴨下 久志 | 八潮リフト一階層・地下… | [N]青みがかった甲殻。犬のような頭。ゴブリンの倍はある。 | medium |
| 67 | 2 | face_close/panel_square | emote | 鴨下 久志 | 八潮リフト一階層・地下… | [N]警棒では足りない。 | medium |
| 68 | 3 | hands/panel_landscape | cutaway | 鴨下 美香 | - | 鴨下 美香「洗濯機、そろそろ考えたい」 | low |
| 69 | 2 | hands/panel_square | pause | 鴨下 久志 | 八潮リフト一階層・地下… | [N]一番安いドラム式で十八万。今の副業収入では、一年半。 | medium |
| 70 | 3 | over_shoulder/panel_tall | reveal | 鴨下 久志 | 八潮リフト一階層・地下… | [N]推定ドロップ相場、二万円前後。 | medium |

**panel #65** [imp=4, beat=5/rising, scene=ep1-s5]
- 🎯 purpose: ルーティンの破綻を宣言し、奥の壁際に未知の影を置く。
- 🔄 change_from_prev: 整った収支の締めから、同じ場所に生じた異物へ反転する。
- 👁 visual_focus: 広い駐車場空間の奥、柱の陰でうずくまる青黒い影。
- 🎬 cut_type: reveal_pull
- → link_to_next: 影の正体へ段階的に寄る。
- 📜 narration: 「その数字の積み重ねが、今朝、狂った。」
- 📏 bubble_budget: count=1, max_chars=18, type=narration_box
- 🔃 turn: page_open / strength=2

**panel #66** [imp=3, beat=5/rising, scene=ep1-s5]
- 🎯 purpose: 未知の魔物を具体化し、E級の反復と違うサイズ感を示す。
- 🔄 change_from_prev: 遠い影から形状が読める距離まで寄る。
- 👁 visual_focus: 青い犬型魔物の甲殻、コンクリート床に食い込む爪、久志の足元との距離。
- 🎬 cut_type: scale_jump
- → link_to_next: 久志の見積もり能力が起動する。
- 📜 narration: 「青みがかった甲殻。犬のような頭。ゴブリンの倍はある。」
- 📏 bubble_budget: count=1, max_chars=28, type=narration_box
- ⚠️ render_risk: medium

**panel #67** [imp=2, beat=5/rising, scene=ep1-s5]
- 🎯 purpose: 危険を感情ではなく不足項目として認識する久志の特異性を見せる。
- 🔄 change_from_prev: 魔物の外見から久志の内的計算へ切り替える。
- 👁 visual_focus: 久志の目に薄く映る矩形UI風の数値枠、汗のない表情。
- 🎬 cut_type: shot_reverse
- → link_to_next: スマホの通知記憶と家計の不足へ接続する。
- 📜 narration: 「警棒では足りない。」
- 📏 bubble_budget: count=1, max_chars=10, type=thought
- ⬜ negative_space: 久志の視界上に半透明の矩形UI枠を空け、数値はSVGで重ねる。
- ⚠️ render_risk: medium

**panel #68** [imp=3, beat=5/rising, scene=ep1-s5]
- 🎯 purpose: 昨日夜のLINEと家計簿スクショを挿入し、二万円の意味を生活費へ結びつける。
- 🔄 change_from_prev: 危険な魔物の前から、スマホ上の日常会話へスマッシュカットする。
- 👁 visual_focus: スマホ画面、家計簿アプリのスクショ枠、赤丸だけが見える余白。
- 🎬 cut_type: smash_cut
- → link_to_next: 不足額の赤丸を久志の判断材料にする。
- 💬 鴨下 美香 (normal): 「洗濯機、そろそろ考えたい」
- 📏 bubble_budget: count=1, max_chars=18, type=dialogue
- ⬜ negative_space: LINE風画面と家計簿スクショは白枠で予約し、本文・赤字注記はSVG重ね。

**panel #69** [imp=2, beat=5/rising, scene=ep1-s5]
- 🎯 purpose: アクション前に生活費の重みで間を作り、久志の判断を読者に待たせる。
- 🔄 change_from_prev: スマホ上の相談から、久志の指が警棒を握り直す現場へ戻る。
- 👁 visual_focus: 警棒を握る手、スマホ画面の暗転、遠くの青い影のぼけ。
- 🎬 cut_type: graphic_match
- → link_to_next: 二万円という見積もりの衝撃を開示する。
- 📜 narration: 「一番安いドラム式で十八万。今の副業収入では、一年半。」
- 📏 bubble_budget: count=1, max_chars=30, type=narration_box
- ⚠️ render_risk: medium

**panel #70** [imp=3, beat=5/rising, scene=ep1-s5]
- 🎯 purpose: 青い魔物を狩る理由となる二万円をページ末で提示する。
- 🔄 change_from_prev: 生活費の不足から、目の前の魔物の査定額へ数字を接続する。
- 👁 visual_focus: 久志越しに青い犬型魔物、視界に浮かぶ現代風UIの査定枠。
- 🎬 cut_type: reveal_pull
- → link_to_next: ルールの曖昧さを確認し、戦う判断へ進む。
- 📜 narration: 「推定ドロップ相場、二万円前後。」
- 📏 bubble_budget: count=1, max_chars=18, type=thought
- ⬜ negative_space: 魔物の上部に矩形UI用の余白を確保し、推定HP・相場表示はSVG重ね。
- 🔃 turn: page_end / strength=4
- ⚠️ render_risk: medium

> 🎬 **page_end_hook**: 見たことのない青い魔物と二万円の相場を露出し、久志の判断を次ページへ引っ張る。


---

## P16 [dialogue] ◀ left — target 5 panels — turn_strength=3

> 🪝 **page_open_hook**: 前ページ末の二万円を受け、久志は危険性ではなく規約の穴を確認し始める。

| # | imp | shot | NF | char | location | text | risk |
|---|---|---|---|---|---|---|---|
| 71 | 2 | face_close/panel_square | inform | 鴨下 久志 | 八潮リフト一階層・地下… | [N]Eランクは一階層までしか入れない。 | low |
| 72 | 3 | wide/panel_landscape | pause | 鴨下 久志 | 八潮リフト一階層・地下… | [N]でも、一階層で出会った魔物を狩ることまでは、禁止されていない。はずだ。 | low |
| 73 | 2 | side/panel_square | cutaway | 神楽坂/鴨下 久志 | 八潮リフト受付・管理カ… | 神楽坂「剣は免許がいるけど、護身具ならセーフです」 | medium |
| 74 | 1 | hands/panel_portrait | silence | 鴨下 久志 | 八潮リフト一階層・地下… | (silent) | low |
| 75 | 4 | wide/panel_tall | beat_button | 鴨下 久志 | 八潮リフト一階層・地下… | [N]俺はコーヒーの缶を床に置き、スーツの上着を柱の足元に畳んだ。 | medium |

**panel #71** [imp=2, beat=5/rising, scene=ep1-s5]
- 🎯 purpose: 久志が戦闘本能ではなく、ルール確認から判断していることを示す。
- 🔄 change_from_prev: 二万円の誘惑から、資格と階層制限の現実へ引き戻す。
- 👁 visual_focus: 久志の横顔、脳裏に浮く登録カードと一階層表示の矩形枠。
- 🎬 cut_type: scale_jump
- → link_to_next: 禁止されていないはず、という危うい解釈へ進む。
- 📜 narration: 「Eランクは一階層までしか入れない。」
- 📏 bubble_budget: count=1, max_chars=18, type=narration_box
- ⬜ negative_space: 登録カード風の小さな矩形UI枠を空け、階層制限文はSVG重ね。
- 🔃 turn: page_open / strength=1

**panel #72** [imp=3, beat=5/rising, scene=ep1-s5]
- 🎯 purpose: 後の管理事務所からの電話につながる曖昧な解釈を明確に仕込む。
- 🔄 change_from_prev: 規約の確定事項から、久志の都合のいい解釈へずらす。
- 👁 visual_focus: 久志と青い魔物の間に広い白い床、距離だけが静かに詰まっていない構図。
- 🎬 cut_type: scale_jump
- → link_to_next: 神楽坂の過去の説明を思い出し、判断材料を補強する。
- 📜 narration: 「でも、一階層で出会った魔物を狩ることまでは、禁止されていない。はずだ。」
- 📏 bubble_budget: count=1, max_chars=34, type=thought

**panel #73** [imp=2, beat=5/rising, scene=ep1-s5]
- 🎯 purpose: 神楽坂の説明を回想として差し込み、現代制度とダンジョン戦闘のズレを見せる。
- 🔄 change_from_prev: 久志の内心から、受付で交わされた生活感ある会話へ切り替える。
- 👁 visual_focus: 管理カウンター、書類、神楽坂のマグカップ、久志の登録カード。
- 🎬 cut_type: smash_cut
- → link_to_next: 回想の軽さと現場の危険を対比する。
- 💬 神楽坂 (normal): 「剣は免許がいるけど、護身具ならセーフです」
- 📏 bubble_budget: count=1, max_chars=24, type=dialogue
- ⚠️ render_risk: medium

**panel #74** [imp=1, beat=5/rising, scene=ep1-s5]
- 🎯 purpose: 戦う判断の前に完全な間を置き、読者に久志の迷いを補完させる。
- 🔄 change_from_prev: 回想の会話音から、現場の無音へ落とす。
- 👁 visual_focus: 久志の手、少しへこんだ缶コーヒー、白く広い床面。
- 🎬 cut_type: smash_cut
- → link_to_next: 缶コーヒーを置く小さな動作が、決断として読めるようにする。
- 📏 bubble_budget: count=0, max_chars=0, type=narration_box

**panel #75** [imp=4, beat=5/rising, scene=ep1-s5]
- 🎯 purpose: 戦闘開始前の決断を、生活用品を置く動作で静かに確定させる。
- 🔄 change_from_prev: 無音の迷いから、具体的な準備動作で戦う側へ進む。
- 👁 visual_focus: 柱の足元に畳まれたスーツ上着、缶コーヒー、奥の青い犬型魔物。
- 🎬 cut_type: match_action
- → link_to_next: 警棒を握り直し、魔物の突進へつなげる。
- 📜 narration: 「俺はコーヒーの缶を床に置き、スーツの上着を柱の足元に畳んだ。」
- 📏 bubble_budget: count=1, max_chars=34, type=narration_box
- 🔃 turn: page_end / strength=3
- ⚠️ render_risk: medium

> 🎬 **page_end_hook**: 逃げるか戦うかの迷いが、缶コーヒーを置く動作で決断へ傾く。


---

## P17 [action] ▶ right (RTL開き側) — target 6 panels — turn_strength=4

> 🪝 **page_open_hook**: 前ページ末の畳まれたスーツ上着を受け、久志は会社員の外皮を置いたまま警棒を握る。

| # | imp | shot | NF | char | location | text | risk |
|---|---|---|---|---|---|---|---|
| 76 | 2 | hands/panel_landscape | inform | 鴨下 久志 | 八潮リフト一階層・地下… | [N]ネクタイは、もう外してある。 | medium |
| 77 | 4 | full_body/panel_portrait | beat_button | 鴨下 久志 | 八潮リフト一階層・地下… | [N]警棒を両手で握り直した。 | medium |
| 78 | 3 | side/panel_landscape | contrast | - | 八潮リフト一階層・地下… | [N]犬が、喉の奥で低く唸った。 | medium |
| 79 | 2 | face_close/panel_square | emote | 鴨下 久志 | 八潮リフト一階層・地下… | [N]その二秒で、午後二時の役員打ち合わせを思い出した。 | medium |
| 80 | 2 | over_shoulder/panel_square | cutaway | 鴨下 美香/鴨下 久志 | - | 鴨下 美香「早く帰ってきてね」 | low |
| 81 | 3 | hands/panel_tall | beat_button | 鴨下 久志 | 八潮リフト一階層・地下… | [N]俺は、左足で床を掴んだ。 | high |

**panel #76** [imp=2, beat=5/rising, scene=ep1-s5]
- 🎯 purpose: 通勤者の記号を外し、戦闘の身体へ切り替わる入口を作る。
- 🔄 change_from_prev: 畳んだ上着から、警棒を握る手元へ続ける。
- 👁 visual_focus: 床に置かれたネクタイ、まくった袖、警棒を持つ両手。
- 🎬 cut_type: match_action
- → link_to_next: 両手で握り直す動作へ連続させる。
- 📜 narration: 「ネクタイは、もう外してある。」
- 📏 bubble_budget: count=1, max_chars=14, type=narration_box
- 🔃 turn: page_open / strength=1
- ⚠️ render_risk: medium

**panel #77** [imp=4, beat=5/rising, scene=ep1-s5]
- 🎯 purpose: 戦闘開始の姿勢を久志単独の決め画として置く。
- 🔄 change_from_prev: 小物の準備から全身の構えへ広げる。
- 👁 visual_focus: ワイシャツ姿の久志、両手の警棒、背後の柱と畳んだ上着。
- 🎬 cut_type: scale_jump
- → link_to_next: 魔物側の反応へ切り返す。
- 📜 narration: 「警棒を両手で握り直した。」
- 📏 bubble_budget: count=1, max_chars=14, type=narration_box
- ⚠️ render_risk: medium

**panel #78** [imp=3, beat=5/rising, scene=ep1-s5]
- 🎯 purpose: 久志の静かな決断に対して、魔物の生物的な威圧をぶつける。
- 🔄 change_from_prev: 人間の構えから魔物側の低い視点へ切り替える。
- 👁 visual_focus: 青い甲殻の犬型魔物の低い姿勢、床に立つ爪痕、濃い影。
- 🎬 cut_type: shot_reverse
- → link_to_next: 突進の二秒間に久志の思考を圧縮する。
- 📜 narration: 「犬が、喉の奥で低く唸った。」
- 📏 bubble_budget: count=1, max_chars=14, type=narration_box
- ⚠️ render_risk: medium

**panel #79** [imp=2, beat=5/rising, scene=ep1-s5]
- 🎯 purpose: 恐怖の瞬間にも会社の予定が浮かぶことで、日常と戦闘を衝突させる。
- 🔄 change_from_prev: 魔物の外的な動きから、久志の内側の時間圧縮へ入る。
- 👁 visual_focus: 久志の目、薄く重なる会議資料風の矩形、背景で流れる青い影。
- 🎬 cut_type: scale_jump
- → link_to_next: 美香の言葉も同時に重なり、戦う理由を締める。
- 📜 narration: 「その二秒で、午後二時の役員打ち合わせを思い出した。」
- 📏 bubble_budget: count=1, max_chars=26, type=thought
- ⬜ negative_space: 会議メモ風の矩形枠を薄く確保し、議題文はSVG重ね。
- ⚠️ render_risk: medium

**panel #80** [imp=2, beat=5/rising, scene=ep1-s5]
- 🎯 purpose: 美香の言葉を記憶として挟み、久志の戦う理由を単なる欲ではなく生活維持にする。
- 🔄 change_from_prev: 会議の記憶から家庭の記憶へ、同じ二秒内で思考を跳ばす。
- 👁 visual_focus: 玄関灯のような白い余白、美香の肩までのボブのシルエット、手前に久志の背中。
- 🎬 cut_type: graphic_match
- → link_to_next: 現場の足元へ戻し、身体の反応でページを締める。
- 💬 鴨下 美香 (normal): 「早く帰ってきてね」
- 📏 bubble_budget: count=1, max_chars=10, type=dialogue
- 👥 multi_char: silhouette

**panel #81** [imp=3, beat=5/rising, scene=ep1-s5]
- 🎯 purpose: 初撃直前の身体反応でbeatを締め、次beatの戦闘へ強く渡す。
- 🔄 change_from_prev: 記憶の中の声から、現場の足元と重心へ戻る。
- 👁 visual_focus: 革靴の左足がコンクリートに似た床を踏み込み、奥から青い影が突進してくる。
- 🎬 cut_type: smash_cut
- → link_to_next: 次beatで青い魔物との初撃が始まる。
- 📜 narration: 「俺は、左足で床を掴んだ。」
- 📏 bubble_budget: count=1, max_chars=14, type=narration_box
- 🔃 turn: page_end / strength=4
- ⚠️ render_risk: high

> 🎬 **page_end_hook**: 青い魔物が駆け出し、久志が床を掴むところで次beatの初撃へ渡す。


---

## P18 [action] ◀ left — target 5 panels — turn_strength=3

> 🪝 **page_open_hook**: 前ページ末の『青い魔物が駆け出し、久志が床を掴む』動作をそのまま受け、踏み込みの反動から初撃へつなぐ。

| # | imp | shot | NF | char | location | text | risk |
|---|---|---|---|---|---|---|---|
| 82 | 3 | hands/panel_landscape | establishing | 鴨下 久志 | 八潮リフト一階層・地下… | [N]左足で、床を掴む。 | medium |
| 83 | 4 | side/panel_tall | contrast | 鴨下 久志 | 八潮リフト一階層・地下… | [N]午後二時の議題は、三つ目で止まった。 | high |
| 84 | 2 | hands/panel_square | pause | 鴨下 久志 | 八潮リフト一階層・地下… | (silent) | high |
| 85 | 3 | wide/panel_landscape | inform | 鴨下 久志 | 八潮リフト一階層・地下… | (silent) | medium |
| 86 | 3 | over_shoulder/panel_portrait | reveal | 鴨下 久志 | 八潮リフト一階層・地下… | [N]半分。俺の見積もりが、当たっていた。 | medium |

**panel #82** [imp=3, beat=6/climax, scene=ep1-s1]
- 🎯 purpose: 前beatの踏み込みを受け、革靴・コンクリート床・蛍光灯の地下駐車場感で現代ダンジョンの戦闘空間を再確立する。
- 🔄 change_from_prev: 駆け出す魔物を見ていた状態から、久志の足元の反応へ寄り、読者に攻防の始点を体感させる。
- 👁 visual_focus: 床を噛む革靴、まくったワイシャツ袖の端、奥に流れる青い影
- 🎬 cut_type: match_action
- → link_to_next: 踏み込みの力が警棒の振り下ろしへ流れる。
- 📜 narration: 「左足で、床を掴む。」
- 📏 bubble_budget: count=1, max_chars=14, type=narration_box
- 🔃 turn: page_open / strength=2
- ⚠️ render_risk: medium

**panel #83** [imp=4, beat=6/climax, scene=ep1-s1]
- 🎯 purpose: 役員会議の内的ナレーションと警棒の物理的な落下を重ね、日常の数字が戦闘に変換される瞬間を見せる。
- 🔄 change_from_prev: 足元の始動から全身の振り下ろしへスケールを広げ、攻撃の速度を上げる。
- 👁 visual_focus: 蛍光灯の斜光を横切る警棒、青い甲殻の首筋、久志の畳まれたスーツ上着が遠くに小さく見える
- 🎬 cut_type: scale_jump
- → link_to_next: 警棒が甲殻の継ぎ目に入った感触へ寄る。
- 📜 narration: 「午後二時の議題は、三つ目で止まった。」
- 📏 bubble_budget: count=1, max_chars=24, type=narration_box
- ⚠️ render_risk: high

**panel #84** [imp=2, beat=6/climax, scene=ep1-s1]
- 🎯 purpose: 接触そのものを描き込みすぎず、警棒の先端と甲殻の隙間だけで『入った』感触を作る。
- 🔄 change_from_prev: 大きな振りから小さな接触点へ急に絞り、読者の体感を一瞬止める。
- 👁 visual_focus: 警棒の先端が青い甲殻の継ぎ目に沈む一点、周囲は白く抜いた無音の余白
- 🎬 cut_type: scale_jump
- → link_to_next: 魔物が横へ崩れる動きに移る。
- 📏 bubble_budget: count=0, max_chars=0
- ⬜ negative_space: 接触点の周囲を広く白く抜き、効果音を置かない余白を確保
- ⚠️ render_risk: high

**panel #85** [imp=3, beat=6/climax, scene=ep1-s1]
- 🎯 purpose: 青い魔物が横にもんどりうつ結果を見せ、初撃が有効だったことを視覚的に確定する。
- 🔄 change_from_prev: 接触の静止から魔物の横転へ動きを解放し、空間の広さと反響を戻す。
- 👁 visual_focus: 地下駐車場風の床を滑る青い影、柱の蛍光灯、距離を取る久志の革靴
- 🎬 cut_type: match_action
- → link_to_next: 起き上がる魔物の上に残HPのUIが浮かぶ。
- 📏 bubble_budget: count=0, max_chars=0
- ⚠️ render_risk: medium

**panel #86** [imp=3, beat=6/climax, scene=ep1-s1]
- 🎯 purpose: 《残り六十前後》の現代UI風表示で、冒頭のHP表示伏線を戦闘能力として回収する。
- 🔄 change_from_prev: 魔物の転倒結果から、久志だけが見ている数字の意味へ焦点を移す。
- 👁 visual_focus: 起き上がる青い魔物の頭上に重ねる矩形UI用の空間、手前で震える警棒の柄
- 🎬 cut_type: reveal_pull
- → link_to_next: 数字の確信が、久志自身の震えの理由へ掘り下げられる。
- 📜 narration: 「半分。俺の見積もりが、当たっていた。」
- 📏 bubble_budget: count=1, max_chars=24, type=thought
- ⬜ negative_space: 魔物頭上にSVGで《残り六十前後》を置く矩形UI空枠を確保
- 🔃 turn: page_end / strength=3
- ⚠️ render_risk: medium

> 🎬 **page_end_hook**: 一撃で半分削れた数字が、恐怖ではなく計算精度への震えを呼び起こす。


---

## P19 [reveal] ▶ right (RTL開き側) — target 5 panels — turn_strength=3

> 🪝 **page_open_hook**: 前ページ末の《残り六十前後》を受け、数字を見た久志の震えの正体へ入る。

| # | imp | shot | NF | char | location | text | risk |
|---|---|---|---|---|---|---|---|
| 87 | 2 | hands/panel_square | emote | 鴨下 久志 | 八潮リフト一階層・地下… | [N]怖いからじゃない。 | low |
| 88 | 4 | wide/panel_landscape | reveal | 鴨下 久志 | 八潮リフト一階層・地下… | [N]三ヶ月間、俺はずっと数えていた。 | medium |
| 89 | 3 | full_body/panel_portrait | contrast | 鴨下 久志 | 八潮リフト一階層・地下… | (silent) | medium |
| 90 | 3 | side/panel_tall | beat_button | 鴨下 久志 | 八潮リフト一階層・地下… | [N]二撃目を、振り下ろした。 | high |
| 91 | 2 | wide/panel_square | silence | 鴨下 久志 | 八潮リフト一階層・地下… | [N]今度は、ぽん、と鳴った。 | low |

**panel #87** [imp=2, beat=6/climax, scene=ep1-s1]
- 🎯 purpose: 顔ではなく手元で感情を描き、恐怖ではない震えを読者に考えさせる。
- 🔄 change_from_prev: 敵と数字の情報から、久志の身体反応へ寄って内面の問いに切り替える。
- 👁 visual_focus: 警棒を握る指の震え、袖口の汗、床に落ちた蛍光灯の白い反射
- 🎬 cut_type: scale_jump
- → link_to_next: 震えの理由が三ヶ月の習慣へ接続する。
- 📜 narration: 「怖いからじゃない。」
- 📏 bubble_budget: count=1, max_chars=10, type=thought
- 🔃 turn: page_open / strength=2

**panel #88** [imp=4, beat=6/climax, scene=ep1-s1]
- 🎯 purpose: ゴブリン、灰色の魔石、スマホ査定額の記憶を背景の小さなフレームとして重ね、才能の発露を説明でなく構図で示す。
- 🔄 change_from_prev: 手の震えから、三ヶ月分の反復イメージへ時間感覚を広げる。
- 👁 visual_focus: 地下駐車場の奥へ続く柱列に、灰色の魔石とスマホ査定画面の小さな回想フレームが浮かぶ
- 🎬 cut_type: graphic_match
- → link_to_next: 積算された数字が現在の魔物へ戻り、二撃目の判断になる。
- 📜 narration: 「三ヶ月間、俺はずっと数えていた。」
- 📏 bubble_budget: count=1, max_chars=18, type=narration_box
- ⬜ negative_space: 回想フレーム内のスマホ画面は空白にし、査定額UIはSVGで後載せ
- ⚠️ render_risk: medium

**panel #89** [imp=3, beat=6/climax, scene=ep1-s1]
- 🎯 purpose: 内面の気づきからすぐ戦闘へ戻し、営業の計算が身体動作へ直結する快感を作る。
- 🔄 change_from_prev: 回想的な横長の静けさから、縦方向の踏み込みで現在時制へ戻る。
- 👁 visual_focus: 袖をまくった久志が体重を乗せ直す全身、床に残る一撃目の滑走痕
- 🎬 cut_type: smash_cut
- → link_to_next: 警棒の軌道を大ゴマの決め画へ渡す。
- 📏 bubble_budget: count=0, max_chars=0
- ⚠️ render_risk: medium

**panel #90** [imp=3, beat=6/climax, scene=ep1-s1]
- 🎯 purpose: key_visualとして、革靴を手前に大きく置き、奥の青い首筋へ警棒が落ちる瞬間を見せ場にする。
- 🔄 change_from_prev: 踏み込み準備から決定的な打撃瞬間へ進み、ページの主コマとして山場を作る。
- 👁 visual_focus: 手前の革靴、奥へ伸びる警棒の斜線、青い甲殻の首筋を切る強い斜光
- 🎬 cut_type: match_action
- → link_to_next: 打撃音ではなく場違いな消滅音へ落差を作る。
- 📜 narration: 「二撃目を、振り下ろした。」
- 📏 bubble_budget: count=1, max_chars=14, type=narration_box
- ⚠️ render_risk: high

**panel #91** [imp=2, beat=6/climax, scene=ep1-s6]
- 🎯 purpose: 決め打撃の直後を白く抜き、消滅の軽さと地下空間の静けさで余韻を作る。
- 🔄 change_from_prev: 高密度の打撃画から、魔物が消えた後の空白へ急転し、勝利の実感を遅らせる。
- 👁 visual_focus: 広い白い床、消えかける青い粒子、遠くに小さく立つ久志
- 🎬 cut_type: contrast
- → link_to_next: 空いた床に青い魔石だけが残る。
- 📜 narration: 「今度は、ぽん、と鳴った。」
- 📏 bubble_budget: count=1, max_chars=10, type=narration_box
- ⬜ negative_space: 画面の半分以上を白い床と余白にして、消滅後の無音を優先
- 🔃 turn: page_end / strength=3

> 🎬 **page_end_hook**: 二撃目の直後、『ぽん』という場違いに軽い結果音で戦闘が終わる。


---

## P20 [cliffhanger] ◀ left — target 5 panels — turn_strength=4

> 🪝 **page_open_hook**: 前ページ末の空白を受け、何も残らないはずの床に青い希少魔石が現れる。

| # | imp | shot | NF | char | location | text | risk |
|---|---|---|---|---|---|---|---|
| 92 | 3 | birds_eye/panel_landscape | reveal | 鴨下 久志 | 八潮リフト一階層・地下… | (silent) | low |
| 93 | 2 | face_close/panel_square | emote | 鴨下 久志 | 八潮リフト一階層・地下… | [N]二万円。 | low |
| 94 | 3 | hands/panel_portrait | inform | 鴨下 久志 | 八潮リフト一階層・地下… | [N]査定中。三ヶ月で、一度も見たことがない。 | medium |
| 95 | 2 | hands/panel_landscape | contrast | 鴨下 久志 | 八潮リフト一階層・地下… | (silent) | medium |
| 96 | 4 | over_shoulder/panel_tall | beat_button | 鴨下 久志 | 八潮リフト一階層・地下… | [N]俺は、まだ電話に出ていない。 | medium |

**panel #92** [imp=3, beat=6/climax, scene=ep1-s6]
- 🎯 purpose: 親指大の灰色魔石との対比で、五百円玉ほどの青い魔石が異常値であることを示す。
- 🔄 change_from_prev: 消滅後の空白から、床に残った具体物へ視線を落とし、戦闘の報酬へ移る。
- 👁 visual_focus: コンクリートに似た床の中央で光る五百円玉大の青い石、比較対象として遠くに落ちた缶コーヒー
- 🎬 cut_type: reveal_pull
- → link_to_next: 青い光の異質さがスマホ通知へつながる。
- 📏 bubble_budget: count=0, max_chars=0
- 🔃 turn: page_open / strength=2

**panel #93** [imp=2, beat=6/climax, scene=ep1-s6]
- 🎯 purpose: 青い石の価値が冒険の成果ではなく洗濯機の頭金として刺さる久志の人間味を出す。
- 🔄 change_from_prev: 魔石の物理的な輝きから、久志の頭の中の金額へ寄る。
- 👁 visual_focus: 汗の残る久志の横顔、瞳に小さく映る青い光、背景に畳んだスーツ上着
- 🎬 cut_type: scale_jump
- → link_to_next: 期待した査定通知が、通常とは違う挙動で裏切られる。
- 📜 narration: 「二万円。」
- 📏 bubble_budget: count=1, max_chars=6, type=thought

**panel #94** [imp=3, beat=6/climax, scene=ep1-s6]
- 🎯 purpose: スマホ査定画面をSVG用の空枠として見せ、通常通知と違う『査定中』を事件化する。
- 🔄 change_from_prev: 内面の金額期待から、スマホ画面の無機質な保留へ落とし込む。
- 👁 visual_focus: 久志の手の中のスマホ、画面上部に査定アプリの矩形UI用余白、背後で青い石がぼけて光る
- 🎬 cut_type: graphic_match
- → link_to_next: アプリ通知ではない別の震動が入る。
- 📜 narration: 「査定中。三ヶ月で、一度も見たことがない。」
- 📏 bubble_budget: count=1, max_chars=28, type=narration_box
- ⬜ negative_space: スマホ画面内は白い矩形のまま残し、《魔石（D級・希少）／査定中》はSVGで配置
- ⚠️ render_risk: medium

**panel #95** [imp=2, beat=6/climax, scene=ep1-s6]
- 🎯 purpose: 査定アプリの静止した画面から、ポケット内の電話着信という別レイヤーの異常へ切り替える。
- 🔄 change_from_prev: スマホ画面の停止から、身体に伝わる震動へ感覚を移す。
- 👁 visual_focus: 久志のズボンポケットで震えるスマホ、床の青い石、横に置かれた缶コーヒーと畳んだスーツ
- 🎬 cut_type: smash_cut
- → link_to_next: 画面に神楽坂の発信者名が出て、日常が崩れる引きになる。
- 📏 bubble_budget: count=0, max_chars=0
- ⚠️ render_risk: medium

**panel #96** [imp=4, beat=6/climax, scene=ep1-s6]
- 🎯 purpose: 神楽坂から初めての着信を見せ、青いD級希少魔石の異常と管理事務所の介入を結びつけて次beatへ引く。
- 🔄 change_from_prev: ポケット内の震動からスマホ画面の発信者名へ明示し、危険の正体を個人名にする。
- 👁 visual_focus: スマホ画面の着信UI用余白、発信者名を置く上部、足元で光る青い石、背景に地下駐車場の空白
- 🎬 cut_type: reveal_pull
- → link_to_next: 次beatで電話に出るか、管理事務所側の事情へ切り返せる。
- 📜 narration: 「俺は、まだ電話に出ていない。」
- 📏 bubble_budget: count=1, max_chars=18, type=narration_box
- ⬜ negative_space: スマホ画面は無地の明るい矩形で確保し、『八潮リフト管理事務所 神楽坂』の着信名はSVGで後載せ
- 🔃 turn: page_end / strength=4
- ⚠️ render_risk: medium

> 🎬 **page_end_hook**: 青い石と鳴り続ける着信が並び、電話に出る前で話を止める。


---

## P21 [reveal] ▶ right (RTL開き側) — target 6 panels — turn_strength=3

> 🪝 **page_open_hook**: 前ページ末の『青い石と鳴り続ける着信』を受け、まず着信音ではなく足元の青い魔石の異常な光から入る。

| # | imp | shot | NF | char | location | text | risk |
|---|---|---|---|---|---|---|---|
| 97 | 3 | wide/panel_landscape | establishing | 鴨下 久志 | 八潮リフト一階層・地下… | (silent) | low |
| 98 | 2 | hands/panel_square | pause | 鴨下 久志 | 八潮リフト一階層・地下… | [N]親指大では、ない。 | medium |
| 99 | 4 | over_shoulder/panel_portrait | reveal | 鴨下 久志 | 八潮リフト一階層・地下… | [N]三ヶ月で、一度も見たことのない表示だった。 | medium |
| 100 | 2 | side/panel_landscape | emote | 鴨下 久志 | 八潮リフト一階層・地下… | (silent) | low |
| 101 | 3 | hands/panel_square | cutaway | 鴨下 久志/鴨下 美香 | 八潮リフト一階層・地下… | [N]午後二時。洗濯機。役員報告。 | medium |
| 102 | 3 | hands/panel_tall | beat_button | 鴨下 久志 | 八潮リフト一階層・地下… | [N]今度は、通知ではない。 | low |

**panel #97** [imp=3, beat=7/cliffhanger, scene=ep1-s6]
- 🎯 purpose: 青い魔物の戦闘後から査定異常へ移る場を確立し、地下駐車場型ダンジョンの冷たい空気を再提示する。
- 🔄 change_from_prev: 戦闘の動きから、広い床に音だけが残る静止へ落とす。
- 👁 visual_focus: 蛍光灯が並ぶ無人のコンクリート空間、床に落ちた青い魔石、遠くで肩を上下させる久志。
- 🎬 cut_type: reveal_pull
- → link_to_next: 視線を床の青い魔石へ絞っていく。
- 📏 bubble_budget: count=0, max_chars=0, type=narration_box
- 🔃 turn: page_open / strength=1

**panel #98** [imp=2, beat=7/cliffhanger, scene=ep1-s6]
- 🎯 purpose: 通常の灰色魔石と違うサイズ・色を、手元の間で読者に認識させる。
- 🔄 change_from_prev: 引きの空間から、手と石だけの小さな違和感へ寄る。
- 👁 visual_focus: 久志の汚れた指先が、五百円玉ほどの青い魔石の手前で止まっている。
- 🎬 cut_type: scale_jump
- → link_to_next: スマホ査定画面へ視線を移す。
- 📜 narration: 「親指大では、ない。」
- 📏 bubble_budget: count=1, max_chars=10, type=narration_box
- ⚠️ render_risk: medium

**panel #99** [imp=4, beat=7/cliffhanger, scene=ep1-s6]
- 🎯 purpose: 通常なら即時査定されるはずの魔石が『査定中』になる異常を提示する。
- 🔄 change_from_prev: 物理的な石の違和感から、スマホUI上の手続き異常へ反転する。
- 👁 visual_focus: スマホ画面の査定アプリ枠、背後で青く光る床、久志の肩越しの硬い視線。
- 🎬 cut_type: graphic_match
- → link_to_next: 金額不明が、久志の生活上の数字へ波及していく。
- 📜 narration: 「三ヶ月で、一度も見たことのない表示だった。」
- 📏 bubble_budget: count=1, max_chars=24, type=narration_box
- ⬜ negative_space: スマホ画面内に査定結果用の白い矩形UI領域を広く空ける。文字はSVGで『魔石（D級・希少）／査定中……』を重ねる想定。
- ⚠️ render_risk: medium

**panel #100** [imp=2, beat=7/cliffhanger, scene=ep1-s6]
- 🎯 purpose: 主人公の恐怖が冒険者的なものではなく、数字が確定しない不安であることを表情と姿勢で見せる。
- 🔄 change_from_prev: スマホ画面の情報から、情報を受けた久志の内面へ切り返す。
- 👁 visual_focus: まくったワイシャツ袖、緩んだネクタイ、スマホを持つ手の微かな震え。
- 🎬 cut_type: shot_reverse
- → link_to_next: 彼の頭の中に、午後の予定と家計の数字が流れ込む。
- 📏 bubble_budget: count=0, max_chars=0, type=thought

**panel #101** [imp=3, beat=7/cliffhanger, scene=ep1-s6]
- 🎯 purpose: 美香の洗濯機と会社の打ち合わせを、久志の頭内の小さな数字として差し込み、日常との落差を作る。
- 🔄 change_from_prev: 久志の顔から、スマホ内の家計・予定の断片へ切り替えて内面を可視化する。
- 👁 visual_focus: スマホ画面に重ねる家計簿アプリ枠とLINE風の空欄、端に置かれた缶コーヒー。
- 🎬 cut_type: smash_cut
- → link_to_next: 現実のスマホが再び震え、回想ではない異常へ戻る。
- 📜 narration: 「午後二時。洗濯機。役員報告。」
- 📏 bubble_budget: count=1, max_chars=18, type=narration_box
- ⬜ negative_space: スマホ内に家計簿・メッセージ風UIの空白枠を確保。美香本人は写真やアイコン風の小さな無文字枠で処理し、文字はSVG重ね。
- ⚠️ render_risk: medium
- 👥 multi_char: split_panel

**panel #102** [imp=3, beat=7/cliffhanger, scene=ep1-s6]
- 🎯 purpose: 査定異常の次に、管理側からの直接接触が始まる予兆をページ末で作る。
- 🔄 change_from_prev: 頭内の数字から、ポケットの現実的な震動へ一気に戻す。
- 👁 visual_focus: ズボンのポケット内で光るスマホの輪郭、床に反射する青い魔石の光。
- 🎬 cut_type: graphic_match
- → link_to_next: 次ページ頭で着信名を明かす。
- 📜 narration: 「今度は、通知ではない。」
- 📏 bubble_budget: count=1, max_chars=12, type=narration_box
- ⬜ negative_space: スマホ画面はまだ見せず、発光だけ。着信名の文字領域は次ページに温存する。
- 🔃 turn: page_end / strength=3

> 🎬 **page_end_hook**: 査定アプリの通知ではない震動が来て、電話の着信だと分かる直前でめくらせる。


---

## P22 [cliffhanger] ◀ left — target 6 panels — turn_strength=5

> 🪝 **page_open_hook**: 前ページ末の『通知ではない震動』への答えとして、電話の着信名をページ頭で明かす。

| # | imp | shot | NF | char | location | text | risk |
|---|---|---|---|---|---|---|---|
| 103 | 3 | over_shoulder/panel_portrait | reveal | 鴨下 久志/神楽坂 | 八潮リフト一階層・地下… | [N]向こうから掛かってきたことは、一度もない。 | medium |
| 104 | 2 | face_close/panel_square | emote | 鴨下 久志 | 八潮リフト一階層・地下… | (silent) | low |
| 105 | 3 | wide/panel_landscape | contrast | 鴨下 久志 | 八潮リフト一階層・地下… | [N]昨日までの朝は、小さな数字でできていた。 | low |
| 106 | 1 | hands/panel_square | silence | - | 八潮リフト一階層・地下… | (silent) | low |
| 107 | 2 | side/panel_landscape | pause | 鴨下 久志 | 八潮リフト一階層・地下… | [N]俺は、まだ出ていない。 | low |
| 108 | 5 | side/page | beat_button | 鴨下 久志/神楽坂 | 八潮リフト一階層・地下… | (silent) | medium |

**panel #103** [imp=3, beat=7/cliffhanger, scene=ep1-s6]
- 🎯 purpose: 管理事務所の神楽坂から初めて電話が来た事実を明かし、異常が制度側にも検知されたことを示す。
- 🔄 change_from_prev: 正体不明の震動から、具体的な発信者名の表示へ答えを出す。
- 👁 visual_focus: スマホの着信画面、発信者名用の大きな空白、画面端に映る久志の固まった親指。
- 🎬 cut_type: reveal_pull
- → link_to_next: 久志が出るか出ないかの判断停止へ移る。
- 📜 narration: 「向こうから掛かってきたことは、一度もない。」
- 📏 bubble_budget: count=1, max_chars=24, type=narration_box
- ⬜ negative_space: スマホ画面中央に着信名『八潮リフト管理事務所　神楽坂』をSVGで重ねるための無文字領域を確保。
- 🔃 turn: page_open / strength=2
- ⚠️ render_risk: medium

**panel #104** [imp=2, beat=7/cliffhanger, scene=ep1-s6]
- 🎯 purpose: 電話に出ない一瞬を感情の山にし、主人公が未知のリスクを初めて『数字で処理できない』ものとして見ていることを示す。
- 🔄 change_from_prev: 着信名の情報から、情報を受けた久志の停止へ寄る。
- 👁 visual_focus: 汗の残る久志の横顔、目だけがスマホから床へ落ちていく。
- 🎬 cut_type: shot_reverse
- → link_to_next: 彼の足元の現物、青い魔石へ視線を下ろす。
- 📏 bubble_budget: count=0, max_chars=0, type=thought

**panel #105** [imp=3, beat=7/cliffhanger, scene=ep1-s6]
- 🎯 purpose: 缶コーヒー、スーツ上着、地下駐車場の現代性を置き直し、青い魔石の非日常と対比させる。
- 🔄 change_from_prev: 顔の硬直から、日常の小物が残る足元の引き画へ広げる。
- 👁 visual_focus: 畳んだスーツ上着、缶コーヒー、警棒、青い魔石が同じ床面に並ぶ構図。
- 🎬 cut_type: scale_jump
- → link_to_next: 小物の地味さから、青い魔石の内部の動きへ反転する。
- 📜 narration: 「昨日までの朝は、小さな数字でできていた。」
- 📏 bubble_budget: count=1, max_chars=20, type=narration_box

**panel #106** [imp=1, beat=7/cliffhanger, scene=ep1-s6]
- 🎯 purpose: 青い魔石が通常の灰色魔石と違い、ただの換金物ではないと無音で示す。
- 🔄 change_from_prev: 生活感のある床の並びから、青い光だけの異質さへ絞り込む。
- 👁 visual_focus: 暗い床に置かれた青い魔石の内部を、光点が右から左へ移動する。
- 🎬 cut_type: scale_jump
- → link_to_next: スマホの着信音と青い光を同時に重ねる最終画へ準備する。
- 📏 bubble_budget: count=0, max_chars=0, type=narration_box

**panel #107** [imp=2, beat=7/cliffhanger, scene=ep1-s6]
- 🎯 purpose: 最終コマ前に行動しない選択を置き、電話に出る一歩の重さを最大化する。
- 🔄 change_from_prev: 無人の石から、動けない久志の全身へ戻して判断停止を見せる。
- 👁 visual_focus: 片手にスマホ、足元に青い魔石、背景に蛍光灯の反復が伸びる久志の立ち姿。
- 🎬 cut_type: match_action
- → link_to_next: 青い魔石と着信名を一枚に重ね、話末の引きにする。
- 📜 narration: 「俺は、まだ出ていない。」
- 📏 bubble_budget: count=1, max_chars=12, type=narration_box

**panel #108** [imp=5, beat=7/cliffhanger, scene=ep1-s6]
- 🎯 purpose: D級相当の青い魔石が一階層に現れ、査定直後に管理事務所から電話が来た謎を一枚で回収し、次話への強い不安と期待を残す。
- 🔄 change_from_prev: 久志単独の迷いから、青い魔石と着信名を同一画面に置いて『普通の副業ではない』事態へ確定させる。
- 👁 visual_focus: 極端な低い視点で大きく映る青い魔石、奥でぼやけて光るスマホの着信画面、さらに奥に立ち尽くす久志のシルエット。
- 🎬 cut_type: reveal_pull
- 📏 bubble_budget: count=0, max_chars=0, type=narration_box
- ⬜ negative_space: スマホ画面の発信者名領域を背景ボケ内に確保し、SVGで『八潮リフト管理事務所　神楽坂』を重ねる。画像内文字は描かない。
- 🔃 turn: episode_end / strength=5
- ⚠️ render_risk: medium

> 🎬 **page_end_hook**: 久志が電話に出ないまま、青い魔石と神楽坂からの着信が同じ画面内で鳴り続ける。
