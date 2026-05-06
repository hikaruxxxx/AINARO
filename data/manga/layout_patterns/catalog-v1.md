# kindle-test-1 Layout Pattern Catalog

## メタ
- 作品: 「現代ダンジョンで最強になる物語 缶詰ガチャ Vol.1」(田代石香 / Bushiroad Works, 2026-01発行)
- サンプリング: 初回 38 pages → 拡張 +30 pages = 計 68 pages (total 156)
- 調査日: 2026-05-06 (初回) / 2026-05-06 拡張パス2
- 調査者: claude (general-purpose subagent)
- 入力: `data/manga/raw/kindle-references/test-1/pages/page_0001.png 〜 page_0156.png`
- 観察手法: 5刻みの粗サンプリング + 興味深いページの前後追加サンプリング → 拡張パス2 で n=5 archetype 狙いのターゲットサンプリング (action/中盤会話/reveal pages)
- 既知の混入: page_0057 / page_0061 / page_0156 = iPad UI 混入 (スキップ)。page_0150 = 章末扉、page_0155 = 奥付。

## ページ別観察 (生データ)

### page_0001 (表紙)
- panel_count: 1 (full bleed)
- shape_mix: 1 panel + タイトルロゴオーバーレイ
- size_hierarchy: -
- bubble_breakout: 0
- effect_lines: なし (代わりに floating な缶詰小物が画面外にもブリードアウト)
- floating: タイトル組版 + クレジット表記
- reading_order: -
- page_role: cover

### page_0002 (目次見開きの右半分)
- panel_count: 1 + テキストブロック群
- shape_mix: 表紙ペーパーの再利用ビジュアル + 縦書き目次インデックス
- floating: 章タイトル4本 + ノンブル
- page_role: 目次/扉

### page_0003 (目次見開きの左半分)
- panel_count: 0 + テキスト
- shape_mix: 全面白地 + ロゴ + 縦書き章タイトル
- page_role: 目次/扉

### page_0006 (Episode 1 オープニング)
- panel_count: 4 (上段 1コマ + 中段 1コマ + 下段に小コマ2 並列)
- shape_mix: rect 中心、ただし上段と中段が「画像端でフェードして境界線が消える」atmospheric カット (背景白抜きで剣と魔物だけが浮かぶ)
- size_hierarchy: extreme (中段がほぼページ半分占有)
- bubble_breakout: 4箇所 (caption box が panel 縁にめり込む)
- effect_lines: ザザッ系効果線、ボロボロ崩落エフェクト
- floating: 「Yo!TUBE」風 UI フレーム (画面内画面)、SFX 縦書きカタカナ
- reading_order: 上→中(YouTube画面)→下小2並列(右→左)
- page_role: opening_hook / 設定提示

### page_0007 (梅田ダンジョン establishing)
- panel_count: 2 (上に細長い establishing + 下にダンジョン断面の bird's eye)
- shape_mix: 上段が薄い帯 rect、下段が **境界線が atmospheric にぼやけた巨大コマ** (穴を見下ろす絵)
- size_hierarchy: extreme (下が80%)
- bubble_breakout: 5+ (断面内にラベル「第1階層」「第2階層」「第3階層」が floating)
- effect_lines: 中央に俯瞰の集中線
- floating: 階層ラベル、モブ吹き出し散在
- reading_order: 上 → 下 (下は内部で右上→左下に視線誘導)
- page_role: establishing_world / dungeon_intro

### page_0011 (主人公スライム遭遇)
- panel_count: 3
- shape_mix: 上段に小2 (左:吹き出しアップ + 右:スライム俯瞰)、下段に**ページ半分超の縦長 close-up** (剣を構える手元)
- size_hierarchy: extreme (下段が圧倒的に大)
- bubble_breakout: 2 (SFX「ドッ ドッ」が panel 越境)
- effect_lines: スピード線が下段全面に放射
- floating: SFX「ドッ ドッ」「スライム!」
- reading_order: 上右→上左→下
- page_role: action_attack

### page_0012 (連続attackと初メダル)
- panel_count: 2 (上段:キャラ全身ダイナミック + 下段:reaction)
- shape_mix: 上段が斜めっぽいダイナミック構図 (panel自体は rect だが内容が躍動)、下段 rect
- size_hierarchy: extreme (上段が3/4)
- bubble_breakout: 2 (SFX「スパッ」が panel 飛び出し、メダル説明 caption が rect 内部だが浮遊感)
- effect_lines: 上段に放射状速度線
- floating: SFX「スパッ」、データプレート「(黒)D メダル 換金額 一枚50円」
- reading_order: 上→下
- page_role: hero_action_pose

### page_0016 (チェスト遭遇)
- panel_count: 5 (上段に2、中段にdialogue1 + 風景1、下段に小2)
- shape_mix: 全 rect で 3-tier standard
- size_hierarchy: medium (中段establishingが少し大)
- bubble_breakout: 3
- effect_lines: 軽い「キラキラ」装飾
- floating: 集中線散発、SFX「ニュッ」
- reading_order: 上右→上左→中→下右→下左
- page_role: dialogue_buildup

### page_0017 (D缶開封説明)
- panel_count: 3 (上段クローズアップ + 中段 caption-on-character + 下段 explanation)
- shape_mix: 全 rect。中段は `pure-bubble` (ほぼ吹き出しだけが panel)
- size_hierarchy: medium
- bubble_breakout: 5+ (3つの吹き出しが互いに重なり、 panel 内を埋め尽くす)
- effect_lines: 軽い "ザワ" 程度
- floating: SFX「ガチャ」
- reading_order: 上→中→下
- page_role: dialogue_dump

### page_0021 (メンバー会話)
- panel_count: 4 (上段 2、中段 1ワイド、下段 1ワイド)
- shape_mix: 全 rect 3-tier、ただし下段は establishing で キャラ後ろ姿
- size_hierarchy: medium
- bubble_breakout: 3
- effect_lines: なし
- floating: SFX「ガーン」(下段右下に)
- reading_order: 上右→上左→中→下
- page_role: dialogue / character_intro

### page_0023 (action 連打)
- panel_count: 4-5 (右側に縦長大コマ + 左に小帯3〜4)
- shape_mix: 縦長 hero panel + 細長 strip コマの組合せ。右hero panel は内部が atmospheric (背景消失)
- size_hierarchy: extreme
- bubble_breakout: 多数 (SFX が縁を越える)
- effect_lines: 強い縦線・速度線
- floating: SFX「ヒュッ」「ハッ」、データプレート (caption box)
- reading_order: 右hero(縦) → 左帯上から下
- page_role: action_attack

### page_0026 (ステータス画面)
- panel_count: 3 (上に floating UI + 中に拡大 + 右下に reaction)
- shape_mix: 上段が **半透明UIフレーム panel** (ステータス枠が panel そのものとして機能)、中段が同 UI のクローズアップ ( atmospheric / 境界がブリード)、下段右に小 reaction rect
- size_hierarchy: extreme
- bubble_breakout: 3 (吹き出しが UI と panel の両方を越える)
- effect_lines: 中段 close-up に集中線
- floating: ステータスデータ全文がそのまま panel 構成要素
- reading_order: 上→中→下
- page_role: ui_information_dump

### page_0031 (リアクション・覚醒)
- panel_count: 4 (上段に大2 + 中段 small 2 + 下段大1)
- shape_mix: 上段右が「目のクローズアップ」atmospheric (背景消失で目の一点)、その他 rect
- size_hierarchy: extreme (目クローズアップ + 下段smile shotが大)
- bubble_breakout: 4
- effect_lines: 集中線複数本 (右上 panel と下段に)
- floating: SFX「ビッ」「フォン」、市松模様の床
- reading_order: 右上→左上→中右→中左→下
- page_role: reveal / reaction

### page_0036 (バリア弾かれ)
- panel_count: 4 (上段に縦長 establishing + 下段に rect 2 + 縦帯1)
- shape_mix: 上段は **建物establishingが panel 上端でフェード** (空に溶ける atmospheric)、中段は rect、下段右はsmall reaction rect
- size_hierarchy: medium
- bubble_breakout: 3
- effect_lines: 「パーン」放射 (中段)
- floating: SFX「コツコツ」「パーン」
- reading_order: 上→中→下右→下左
- page_role: reveal_obstacle

### page_0039 (UI表示の心理動揺)
- panel_count: 3 (上段にUI部分露出 + 中段ダイアログ + 下段 atmospheric reaction)
- shape_mix: 上段が前ページから続く UI 帯、中段が rect、下段が atmospheric (吹き出し2つが大きく中央占有 + ぼかし背景)
- size_hierarchy: medium-large (下段が大)
- bubble_breakout: 5+ (下段は吹き出しがほぼ panel そのもの)
- effect_lines: 下段にざらざら背景効果
- floating: SFX「ドク」、ステータス文字
- reading_order: 上→中→下
- page_role: emotion_internal

### page_0040 (アクティブスキル発動)
- panel_count: 2 (上段に縦長establishing + 下段に楕円バブル形状の panel)
- shape_mix: 上段rectで建物前にキャラ独り立ち。下段が **楕円bubble形状の panel** (panel自体が吹き出し型)
- size_hierarchy: extreme (下段が円形に近く、半分以上占有)
- bubble_breakout: 2 (panel自体が breakout 形状)
- effect_lines: 下段に強烈な集中線
- floating: SFX「PD…作成…!」が大きく floating
- reading_order: 上→下
- page_role: power_activation

### page_0041 (PD = Private Dungeon 出現)
- panel_count: 2 (上に縦長 vertical hero shot + 下に reaction face)
- shape_mix: 上段が **斜めに傾いた長方形 panel** (パース表現で階段が斜めに切られる、背景はドット背景の atmospheric)、下段はキャラ顔close-upで背景消失
- size_hierarchy: extreme (上段が2/3)
- bubble_breakout: 2
- effect_lines: 矢印型 SFX
- floating: SFX「ザッ!」、ドット網点背景
- reading_order: 上→下
- page_role: reveal_supernatural / hook

### page_0046 (バリア破裂瞬間)
- panel_count: 3 (上段ワイドに足元close + 下段に小2)
- shape_mix: 上段ワイド rect、下段右に「目+汗のclose-up」atmospheric (背景は速度線 only)、下段左 rect
- size_hierarchy: medium
- bubble_breakout: 3
- effect_lines: 強烈な放射線 (下段右)
- floating: SFX「パーン」、データキャプション
- reading_order: 上→下右→下左
- page_role: reveal / shock

### page_0051 (P.D welcome)
- panel_count: 3 (上ワイド establishing + 中cake-shape吹き出し + 下reaction)
- shape_mix: 全 rect 3-tier。中段に「P.D へようこそ」が **巨大空気バブル** で panel に重なる
- size_hierarchy: medium
- bubble_breakout: 5+ (中段は吹き出しがほぼ panel 半分)
- effect_lines: なし
- floating: 巨大セリフバブル
- reading_order: 上→中→下
- page_role: revelation

### page_0056 (PD カスタマイズ説明)
- panel_count: 7-8 (上段右に縦長 atmospheric + 中央に小rect群 + 左にもう1縦長)
- shape_mix: **複合レイアウト**: 右に縦長 atmospheric (魔物 silhouette が画面端で消える)、左に縦長 rect、中央に小 rect 3-4個タイル
- size_hierarchy: extreme (両端の縦長が大)
- bubble_breakout: 5+
- effect_lines: なし
- floating: 「×3」表示、データバッジ「ご注意を」、SFX「キャ」
- reading_order: 右縦→中央 (右上→左下) → 左縦
- page_role: information_dense_dialogue

### page_0066 (帰宅establishing + 家族)
- panel_count: 4 (上 1 + 中 1 establishing大 + 下に dialogue 2)
- shape_mix: 全 rect 3-tier。中段は establishing(空+建物)
- size_hierarchy: medium-large (中段大)
- bubble_breakout: 2
- effect_lines: なし
- floating: SFX「ふー」程度
- reading_order: 上→中→下右→下左
- page_role: aftermath / domestic_scene

### page_0067 (Ep2 章扉風 dialogue)
- panel_count: 4
- shape_mix: 上段右に小 rect dialogue + 上段左に大 dialogue、中段に小 rect 2、下段にlarge rect。コマ間の境界が一部 atmospheric にぼやける
- size_hierarchy: medium
- bubble_breakout: 3
- effect_lines: 「お~」程度の軽い震え線
- floating: ステータスバッジ風データプレート、SFX「ピッ」「ガサ」
- reading_order: 上右→上左→中→下
- page_role: dialogue / family

### page_0071 (TYLOR 紙袋)
- panel_count: 4 (上段dialogue 1 + ロゴ帯 + 下段大1 + 小2)
- shape_mix: 中央に「TYLOR」ロゴ帯のみの細長 panel (=情報伝達のみの装飾コマ)、他rect
- size_hierarchy: medium
- bubble_breakout: 3
- effect_lines: 軽い震え (下段ガッツポーズ)
- floating: SFX「ヤキャー」、ロゴ帯
- reading_order: 上→帯→下右→下左
- page_role: dialogue / domestic

### page_0076 (朝食シーン)
- panel_count: 4 (上ワイドestablishing + 大 plate close + 下dialogue 2)
- shape_mix: 全 rect、上段はキャラの動線が長く inner panel 構成、中段は **食材clos -upのatmospheric (背景白抜き、frying音SFX)**
- size_hierarchy: medium
- bubble_breakout: 3
- effect_lines: 「ジュー」湯気
- floating: SFX「ジュー」「ぐて」
- reading_order: 上→中→下右→下左
- page_role: domestic / aftermath

### page_0081 (PD再訪)
- panel_count: 4 (上 establishing + 中段右small dialogue + 中段左 small dialogue + 下段 wide action)
- shape_mix: 上段establishing (atmospheric ブリード)、中段に小 rect 2 横並び、下段は wide rect
- size_hierarchy: medium
- bubble_breakout: 4
- effect_lines: 下段の「ザザッ」スピード線
- floating: SFX「ザザッ」、装飾
- reading_order: 上→中右→中左→下
- page_role: action_dynamic

### page_0085 (ヒロイン初登場)
- panel_count: 2 (大face close-up + 大全身)
- shape_mix: 左に **キャラfaceの巨大close-up (背景白抜き=atmospheric, panel境界が髪と同化)**、右に縦長全身 rect (枝の establishing)
- size_hierarchy: extreme (両方とも大、対比型)
- bubble_breakout: 2 (吹き出しが両panel 越境)
- effect_lines: なし
- floating: 名前呼びの吹き出しが panel 越境
- reading_order: 右(全身)→左(顔close)
- page_role: heroine_introduction / iconic

### page_0086 (キャラ立ち絵対比)
- panel_count: 1 ( **斜め分断1panel化** )
- shape_mix: **画面全体を斜め分断**: 左=主人公後ろ姿、右=ヒロイン全身、中央が斜めに切れた境界
- size_hierarchy: -(2分割だが panel境界が斜め線)
- bubble_breakout: 0
- effect_lines: なし
- floating: なし
- reading_order: 全体一望 → 右
- page_role: iconic_two_shot / cliffhanger

### page_0087 (atmospheric memory shock)
- panel_count: 3 (上に大ベッド + 中段に大寝姿 + 下段に小face)
- shape_mix: 中段が「天井から見下ろす俯瞰、寝そべるキャラ」atmospheric。下段に小face close
- size_hierarchy: extreme (中段大)
- bubble_breakout: 3
- effect_lines: 中段に床のテクスチャ (チェック柄) が atmospheric な拡張
- floating: SFX「ドサッ」「ふぅ」
- reading_order: 上→中→下
- page_role: emotion_internal / memory

### page_0091 (青木初登場)
- panel_count: 3 (上段に動的キャラ + 中段にbust shot + 下段establishing)
- shape_mix: 上段は **panel境界が atmospheric (背景星散らばり)** にキャラ躍動、中段rect、下段establishing rect
- size_hierarchy: medium
- bubble_breakout: 5+ (吹き出しが panel と背景に複数浮く、SFX 大文字)
- effect_lines: 上段にスピード線
- floating: SFX「ムム」、星散らし装飾、ホテルロゴ装飾
- reading_order: 上→中→下
- page_role: character_intro

### page_0096 (会話 atmospheric)
- panel_count: 4 (上段に切れた数字背景 atmospheric + 中段face close + 下段dialogue 2)
- shape_mix: 上段は **背景に巨大数字 "幸:100" がブリードしたatmospheric**、他 rect。下段は2人会話
- size_hierarchy: medium
- bubble_breakout: 3
- effect_lines: なし
- floating: 巨大背景文字「幸:100 敏:3」
- reading_order: 上→中→下右→下左
- page_role: emotional_revelation

### page_0099 (新章ダイアログ)
- panel_count: 5 (上段dialogue 1 + 中段 1 + 中段下にmonster紹介 1 + 下段standing rect 1+1)
- shape_mix: ほぼ rect、中段モンスター紹介 panel に「歩キノコ」「スライム」silhouette が atmospheric に並ぶ
- size_hierarchy: medium
- bubble_breakout: 4
- effect_lines: なし
- floating: モンスター silhouette、データキャプション
- reading_order: 上→中→中下→下右→下左
- page_role: information_briefing

### page_0101 (action: 大型敵)
- panel_count: 4 (上段に小4並列 + 中段大action + 下段establishingbleed)
- shape_mix: 上段に **円形effectで囲まれた説明小panel 2 + rect 2 (4並列)** が atmospheric、中段大 rect with diagonal速度線、下段は黒つぶし atmospheric
- size_hierarchy: extreme (中段超大)
- bubble_breakout: 5+
- effect_lines: **強烈な diagonal speed lines が中段全面**
- floating: 円形吹き出し (説明)、SFX「ダッ ダッ」(複数同時)
- reading_order: 上左→上中→上右(時計回り) → 中→下
- page_role: action_climax / hero_pose

### page_0102 (atmospheric forest)
- panel_count: 3 (上に小rect 2 + 中段大atmospheric + 下段action)
- shape_mix: 中段は背景がパステル網点で **境界線が消えた atmospheric panel**、人物のみ浮かぶ
- size_hierarchy: medium-large (中段大)
- bubble_breakout: 3
- effect_lines: 下段にスピード線、効果文字「気配察知」が縦長 caption rect
- floating: 大きな技名キャプション「気配察知」
- reading_order: 上右→上左→中→下
- page_role: skill_activation

### page_0103 (見開き的establishing - 迷路俯瞰)
- panel_count: 1 (full bleed)
- shape_mix: **見開き相当の単一panel**, 迷路を bird's eye で俯瞰、放射状の集中線が中央に集まる
- size_hierarchy: -(全面)
- bubble_breakout: 0
- effect_lines: 強烈な放射状集中線
- floating: 矢印型 SFX「イ」が4個 (キャラ位置を示すマーカー)
- reading_order: 中央 → 全体
- page_role: world_reveal / climax_scale

### page_0106 (ガッツポーズシーン)
- panel_count: 5 (右に大 rect (drop山) + 上段に小rect dialogue 2 + 中段dialogue + 下段establishing 1)
- shape_mix: 右の縦長 rect が atmospheric (爆発放射状の白抜き効果)、他 rect
- size_hierarchy: extreme (右hero大)
- bubble_breakout: 4
- effect_lines: 右hero panelの放射線
- floating: SFX「ぐ お お お」(キャラ叫び)、ドロップの山
- reading_order: 右hero → 上左 dialogue → 中→下
- page_role: triumph / aftermath

### page_0111 (取引現場)
- panel_count: 4 (上 dialogue 1 + 中段にlarge action + 下段dialogue 2)
- shape_mix: 中段は **斜め角度キャラ panel + 背景speed線**、他 rect。下段は4人並列が rect 内
- size_hierarchy: medium-large
- bubble_breakout: 5+ (SFX「ドアッ」が複数 panel 越境)
- effect_lines: 中段全面に diagonal speed lines、放射状光
- floating: SFX「ドアッ」「バン」
- reading_order: 上→中→下
- page_role: action_chase

### page_0116 (action close-up)
- panel_count: 3 (右上に小rect close + 中央に大action + 下段にdialogue close)
- shape_mix: 中央 panel は「キャラが暗黒迫る」atmospheric (背景全黒+激しい縦速度線)、close panel は表情のみ
- size_hierarchy: extreme
- bubble_breakout: 4
- effect_lines: 強烈 vertical speed lines (中央)
- floating: SFX「ドッ」「キィン」 (黒地に白文字)
- reading_order: 上右→中→下
- page_role: peril / climax

### page_0121 (D缶情報)
- panel_count: 5 (上段small dialogue 2 + 中段ワイド texture + 下段small 2 + 下段大1)
- shape_mix: 中段は **網点グラデのスクリーントーン背景 panel に巨大 caption box が貼り付く** (情報伝達特化)
- size_hierarchy: medium
- bubble_breakout: 3
- effect_lines: 装飾的 sparkle
- floating: caption box (説明文)、データキャプション「開封条件」
- reading_order: 上右→上左→中→下右→下左
- page_role: information_dump / dictionary

### page_0126 (boss遭遇 + ID証)
- panel_count: 4 (上に大魔物establishing + 中段に小rect 2 + 下段に大ID + 小reaction)
- shape_mix: 上段は **巨大魔物 silhouette が panel境界を越境** (atmospheric, 速度線下方)、中段rect、下段に「ID証」のリアル設定資料 panel
- size_hierarchy: extreme
- bubble_breakout: 4
- effect_lines: 上段に放射線、下段に光輝散布
- floating: 巨大silhouette、設定書類風 ID 証 (Dungeon Explorer Card)、SFX「ピッ」「キャー」
- reading_order: 上→中→下
- page_role: boss_reveal / world_building_artifact

### page_0127 (反応 reaction page)
- panel_count: 7 (上に大face close + 上小rect + 上小rect + 中段dialogue 1 + 下段に小4タイル)
- shape_mix: 上段右が **顔の超アップ atmospheric** (背景白抜き)、他 rect、下段4タイルは細い rect strip
- size_hierarchy: extreme (上 close大)
- bubble_breakout: 5+
- effect_lines: 軽い震え線
- floating: SFX「開けゴマ!」「ピン」、4タイル下段は時間経過の連続コマ
- reading_order: 上→中→下右→下左→更下右→更下左
- page_role: reaction / time_compression

### page_0131 (動画ニュース)
- panel_count: 3 (上段にメディア記事panel + 中段dialogue + 下段dialogue 2)
- shape_mix: 上段は **WebニュースUIをそのまま panel** (動画サムネイル+記事テキスト)、他 rect
- size_hierarchy: medium-large
- bubble_breakout: 3
- effect_lines: なし
- floating: ニュース UI、サムネイル
- reading_order: 上→中→下右→下左
- page_role: aftermath / external_validation

### page_0136 (組織紹介)
- panel_count: 4 (上段に大establishing門 + 中段ワイドキャラ並 + 下段リーダー close + dialogue)
- shape_mix: 上段は門の前establishing (atmospheric)、中段は7人並列、下段にリーダーのface close
- size_hierarchy: medium-large (上段大)
- bubble_breakout: 4
- effect_lines: なし
- floating: caption box「ジャック」(キャラ名プレート)
- reading_order: 上→中→下
- page_role: introduction / mythic

### page_0141 (会話寝室)
- panel_count: 3 (上段establishingベッド + 中段dialogue + 下段small reaction 2)
- shape_mix: 全rect、下段右の panel は端末画面 UI に **モンスター silhouette が atmospheric** に重なる
- size_hierarchy: medium
- bubble_breakout: 4
- effect_lines: なし
- floating: 端末スクリーン UI、SFX「コレ」
- reading_order: 上→中→下右→下左
- page_role: dialogue / reveal

### page_0145 (action 緊急)
- panel_count: 5 (上段establishing + 大action + 中央small dialogue + 下段dialogue 2)
- shape_mix: 上段establishing rect、中段に **L字風panel(大が左下に切り欠かれて small rect が嵌まる構造)**、他rect
- size_hierarchy: extreme
- bubble_breakout: 5+
- effect_lines: 強烈speedlines + impact放射
- floating: SFX「ドキドキ」「ザッ」、技名 caption
- reading_order: 上→大action→嵌込small→下右→下左
- page_role: action_combat / emergency

### page_0146 (3並列reaction)
- panel_count: 3 (横3並列)
- shape_mix: **真横3分割 (3 column strip layout)**、各panel が atmospheric (背景消失で人物のみ)
- size_hierarchy: flat
- bubble_breakout: 3
- effect_lines: なし
- floating: なし
- reading_order: 右→中→左
- page_role: reaction_trio / focus_compression

### page_0151 (boss reveal)
- panel_count: 3 (上段に巨大魔物silhouette + 中段に小rect dialogue + 下段にreaction close)
- shape_mix: 上段は **怪物の口close-upが panel境界を越境**(atmospheric)、下段rect 2が縦縞背景の手元close + 表情close
- size_hierarchy: extreme
- bubble_breakout: 5+ (SFX が複数 越境)
- effect_lines: 強烈な縦線、boss silhouetteのbleed
- floating: SFX「なんだアイツ…!」が大文字 floating、SFX「ドキ」「ヒッ」
- reading_order: 上→中→下右→下左
- page_role: cliffhanger / monster_reveal

### page_0152 (boss 接近action)
- panel_count: 3 (上段に大action + 中段dialogue + 下段大grip close)
- shape_mix: 上段がhero squat pose **背景速度線atmospheric**、中段rect dialogue、下段は **拳close-up + 反対側に小face strip**
- size_hierarchy: extreme
- bubble_breakout: 4
- effect_lines: 上下に強烈speedline
- floating: SFX「ガッ ガッ」「ぐぅ」
- reading_order: 上→中→下
- page_role: action_climax

### page_0150 (Vol.1巻末 扉)
- panel_count: 0 (full bleed white + 角に小ロゴ)
- shape_mix: 装飾扉
- size_hierarchy: -
- bubble_breakout: 0
- effect_lines: なし
- floating: ロゴ「KOUN KANDUME GACHA」
- reading_order: -
- page_role: 巻末扉

### page_0155 (奥付)
- panel_count: 0
- shape_mix: テキストのみ
- page_role: 奥付/colophon

### page_0061 / page_0156 / page_0057 / page_0058
- 内容: iPad 制御センター/メモアプリ等の混入。**スキップ対象**

## ページ別観察 (拡張パス2 / 2026-05-06 追加)

### page_0008 (ダンジョン入場establishing+作戦会議)
- panel_count: 3 (左ワイドrect dialogue + 右縦長establishing + 中段small)
- shape_mix: 全rect、左にdialogueキャラのbreakout heavy panel、右に縦長受付establishing
- size_hierarchy: medium-large
- bubble_breakout: 5+
- effect_lines: なし
- floating: caption box多数 (吹き出し vs ナレーションの混在)
- reading_order: 上→中→下→右
- page_role: dialogue / scene_setup
- 既存 pat_001 派生

### page_0010 (パーティ情報交換)
- panel_count: 5 (上にrect2 + 中段にdialogue1 + 下段にdialogue2)
- shape_mix: 全rect、上段の左に「青木 幼馴染」キャプション付きキャラ紹介rect、下段は3人並列dialogue
- size_hierarchy: medium
- bubble_breakout: 4
- effect_lines: 軽い震え (ガーン)
- floating: キャラ紹介プレート、SFX「ガーン」
- reading_order: 上左→上右→中→下右→下左
- page_role: dialogue / character_intro_secondary
- 新規候補: 「dialogue + 紹介プレート」のzigzag小気味よさ → pat_025 サンプル

### page_0013 (連打+疲労)
- panel_count: 4-5 (上段にぐにゃっと崩れる atmospheric explosion + 下段にrect 2)
- shape_mix: 上段が **atmospheric ボロボロ崩落 (panelの上下境界が消える)** で巨大化、下段は静かなrect 2
- size_hierarchy: extreme (上段が圧倒的)
- bubble_breakout: 5+ (SFX「ぐにゃ」「びちゃ」「ぐぼぉ」が縁を越える、複数dialogueも)
- effect_lines: 縦速度線が上段全面
- floating: SFX大文字、震え線
- reading_order: 上→下右→下左
- page_role: action_continuous / exhaustion
- 新規: pat_026_explosive_top_calm_bottom サンプル

### page_0014 (チェスト発見+反応)
- panel_count: 5 (上左dialogue + 上右dialogue 1 + 中段にchest establishing + 下段にdialogue 2)
- shape_mix: 全rect、中段にチェストの atmospheric (網点背景) establishing
- size_hierarchy: medium
- bubble_breakout: 4
- effect_lines: なし
- floating: SFX「ブキッ」「シュ」、ボロボロ装飾
- reading_order: 上左→上右→中→下右→下左
- page_role: discovery / dialogue
- 新規: pat_025 サンプル (zigzag 5)

### page_0018 (D缶開封+夢想)
- panel_count: 4-5 (左上dialogue+ 中央にD缶spotlight + 右にcharacter close + 下段dialogue 2)
- shape_mix: 中央のD缶 panel が **放射光atmospheric (背景光線burst)**、他rect。下段に小rect 2
- size_hierarchy: extreme (中央item突出)
- bubble_breakout: 5+ (吹き出し+SFX「ポン」「ブルブル」)
- effect_lines: 中央panel に放射状光線
- floating: SFX「ホン」「ブルル」、装飾heart
- reading_order: 上→中→下右→下左
- page_role: loot / item_introduction
- 新規: pat_027_item_spotlight_reveal サンプル

### page_0019 (キャラ別れ+宣言)
- panel_count: 4 (上段に小rect 2 + 中段ヒロインclose + 下段establishing)
- shape_mix: 中段にヒロイン顔atmospheric close、下段は小キャラが歩く atmospheric establishing
- size_hierarchy: extreme
- bubble_breakout: 4
- effect_lines: 中段に光輝散布
- floating: SFX「ガーン」(2回)
- reading_order: 上→中→下
- page_role: dialogue / vow
- 既存 pat_009 派生

### page_0024 (ステータス目覚め)
- panel_count: 3 (上UIstatus + 中央ワイドbleed数字 + 下段bedroomdialogue)
- shape_mix: 上段UI panel + 中段に **ステータス数字「敏:5 運:100」が atmospheric にbleed** + 下段rect dialogue
- size_hierarchy: medium-large
- bubble_breakout: 4
- effect_lines: なし
- floating: ステータス数字大、SFX「フォン」
- reading_order: 上→中→下
- page_role: ui_information_dump / waking
- 既存 pat_008 + pat_014 ハイブリッド

### page_0028 (ヒロイン回想 + ベッド独白)
- panel_count: 5 (上左dialogue close + 上右にヒロインwith家族 atmospheric + 中段dialogue + 下段bed close + 下段small)
- shape_mix: 上左キャラclose + 上右に **screentone+sparkle背景atmospheric の家族memory inset**、下段はbed atmospheric
- size_hierarchy: extreme (memory insetが大)
- bubble_breakout: 4
- effect_lines: memory panel 周囲 sparkle
- floating: SFX「カチャ」、装飾sparkle
- reading_order: 上左→上右→中→下→下右
- page_role: memory / vow
- 新規: pat_029_memory_flashback_inset サンプル

### page_0029 (D探索者観察)
- panel_count: 3 (上に大魔物との遭遇establishing + 中段spotlit dialogue + 下段establishing 2)
- shape_mix: 上段は大silhouette+魔物 (atmospheric)、中段は **lit lantern panel** (光源atmospheric)、下段rect
- size_hierarchy: extreme
- bubble_breakout: 4
- effect_lines: なし
- floating: SFX、ナレーション caption box
- reading_order: 上→中→下
- page_role: world_buildup / explanation
- 既存 pat_004 派生

### page_0033 (ビー玉発見shock)
- panel_count: 4 (上右大に円形容器close + 上左dialogue + 中段にreaction + 下段establishing)
- shape_mix: 全rect、上右にcircular item close-up panel、上左に rect dialogue、中段に小face close
- size_hierarchy: medium
- bubble_breakout: 4
- effect_lines: 中段reactionに集中線
- floating: SFX「ピー玉」、表情強調
- reading_order: 上左→上右→中→下
- page_role: reveal / disappointment
- 既存 pat_001/pat_009 ハイブリッド

### page_0034 (掲示板検索artifact)
- panel_count: 3 (上にSNS掲示板UI panel + 中央キャラclose + 下段dialogue)
- shape_mix: 上段に **掲示板スレッド UI (5レスのテキスト) を panel そのものに採用**、中央rect、下段はdialogue 2
- size_hierarchy: medium-large
- bubble_breakout: 3
- effect_lines: 下段に絶望震え線
- floating: SFX「カコカコ」、UI texture
- reading_order: 上→中→下
- page_role: external_validation / research
- 新規: pat_031_sns_thread_artifact サンプル

### page_0037 (新スキルshock)
- panel_count: 4-5 (上UI部分 + 中央巨大silhouette atmospheric + 中段dialogue + 下段atmospheric)
- shape_mix: 中央パネルに **プレーリードッグ silhouette (背景screentone+sparkle)** が atmospheric、他rect混在
- size_hierarchy: extreme (中央silhouette大)
- bubble_breakout: 5+ (吹き出しが panel 縁越境)
- effect_lines: 強烈集中線 (中段)
- floating: SFX「ドラ」、円形吹き出し
- reading_order: 上→中→下
- page_role: skill_acquisition / supernatural_reveal
- 既存 pat_017/pat_018 派生

### page_0042 (家屋ホール侵入)
- panel_count: 4 (上左smallface + 上右establishing穴 + 中段ヒロイン剣 + 下段dialogue)
- shape_mix: rect混在、上右establishing は階段穴の atmospheric (drop影)
- size_hierarchy: medium
- bubble_breakout: 4
- effect_lines: 下段震え線「しばかれ」
- floating: SFX、装飾heart
- reading_order: 上左→上右→中→下
- page_role: dialogue / consequence
- 既存 pat_001 派生

### page_0044 (緊急叫び+歩行+反応)
- panel_count: 4 (上に小face×2 + 中段establishing歩く母親 + 下段足元close)
- shape_mix: 上段に小rect 2 (close-up shouting)、中段に **wide establishing rect (atmospheric+ subtle)**、下段は足元close
- size_hierarchy: medium-large (中段establishing大)
- bubble_breakout: 5+
- effect_lines: 中段に subtle texture
- floating: SFX「危ない」「下↑」、震え線
- reading_order: 上左→上右→中→下
- page_role: action_emergency / warning
- 新規: pat_036_emergency_action_walk_grid サンプル

### page_0047 (静寂大空間)
- panel_count: 1 (full bleed廊下establishing)
- shape_mix: 巨大廊下のbird's eye atmospheric establishing。1人立ち。
- size_hierarchy: -
- bubble_breakout: 0
- effect_lines: なし (perspective lines のみ)
- floating: なし、SFX最小 (緑のチェック装飾 small)
- reading_order: 全体
- page_role: isolation_dread / supernatural_alone
- 新規: pat_033_solitary_dread_isolation サンプル

### page_0049 (slime greeting cinematic)
- panel_count: 2 (上段dialogue ribbon + 下段に巨大シネマ matrix wide rect)
- shape_mix: 上段は **真黒な atmospheric strip (上端bleed)** に小吹き出し floating、下段は **黒framed cinematic wide rect** で椅子の上にスライム
- size_hierarchy: extreme (下段超大)
- bubble_breakout: 3
- effect_lines: なし
- floating: SFX 最小、 cinematic black frame
- reading_order: 上→下
- page_role: iconic_pose / cinematic_intro
- 新規: pat_034_pillarbox_cinematic サンプル

### page_0052 (PD説明 + 時計)
- panel_count: 4 (上段dialogue 2 + 中段dialogue+slime + 下段に2分割のtime artifact)
- shape_mix: 全rect、下段右に時計establishing、下段左に「時の流れ説明」 dialogue
- size_hierarchy: medium
- bubble_breakout: 5+
- effect_lines: 装飾sparkle
- floating: SFX「ボン」、時計機械
- reading_order: 上→中→下右→下左
- page_role: explanation / mechanism
- 既存 pat_006/pat_021 派生

### page_0054 (PDカスタマイズ複合)
- panel_count: 5-6 (右に縦長魔物silhouette + 中央に小rect tile群 + 左に縦長キャラ + 「×3」装飾)
- shape_mix: pat_007 派生だが panel数が異なる
- 既存 pat_007 (information_dense) サンプル追加

### page_0064 (Lv2 statusup + reaction grid)
- panel_count: 5 (上段にstatus UI panel + 中段に小face left + 中段に左右剣action + 下段dialogue)
- shape_mix: 上段に大UIフレーム panel ( **左下が斜めに切り欠かれた status plate** )、中段に剣を抜く atmospheric action、下段に小dialogue
- size_hierarchy: extreme
- bubble_breakout: 5+
- effect_lines: 上段status surrounded by speedlines「コーン!」、下段に剣の閃光
- floating: ステータス全文、SFX「コーン」「スラ」
- reading_order: 上→中右→中下→下
- page_role: level_up / power_check
- 新規: pat_028_status_inset_action サンプル

### page_0068 (家族晩餐dialogue)
- panel_count: 4 (上にdialogue+small character × 2 + 下段に父子close + dialogue)
- shape_mix: 上段に **父親 with bottle close + reaction face**、下段大に父子間 dialogue
- size_hierarchy: medium-large
- bubble_breakout: 4
- effect_lines: なし
- floating: SFX「ほろり」、瓶 artifact
- reading_order: 上左→上右→下
- page_role: dialogue / domestic
- 既存 pat_001 派生

### page_0069 (Lv4 + bottle close)
- panel_count: 4 (上左status + 上右dialogueclose + 中段dialogue + 下段近接father drink)
- shape_mix: 上段に **status plate (rect)** + character close、下段は瓶を見せる close-up
- size_hierarchy: medium
- bubble_breakout: 4
- effect_lines: なし
- floating: 「壱野泰良 レベル4」プレート、SFX「オオ」
- reading_order: 上左→上右→中→下
- page_role: domestic / status_share
- 既存 pat_008 + pat_001 派生

### page_0072 (時計zoom + bedroom dialogue)
- panel_count: 4 (上に**時計 close-up大** + 中央dialogue + 下段establishing + face close)
- shape_mix: 上段は **時計の超close-up atmospheric** (digital + analog 並置)、下段はベッド寝そべりface
- size_hierarchy: extreme
- bubble_breakout: 4
- effect_lines: 軽い震え
- floating: SFX「コチコチコチ」、デジタル時刻表示「20:33」
- reading_order: 上→中→下
- page_role: time_realization / internal
- 既存 pat_009/pat_014 派生 (time motif)

### page_0073 (DSearch artifact + transition)
- panel_count: 5 (上にスマホ「DSearch」UI 大 + 中段にempty walk establishing + 下段dialogue 2)
- shape_mix: 上段に **スマホ画面UI artifact (DSearch検索結果)** as panel、中段は dim morning empty walk establishing、下段にdialogue
- size_hierarchy: medium
- bubble_breakout: 4
- effect_lines: なし
- floating: スマホUI、SFX「キュン」(光線装飾)
- reading_order: 上→中→下右→下左
- page_role: research / transition
- 新規: pat_031 派生 (スマホUI)

### page_0074 (cooking + return)
- panel_count: 4 (上にdialogue 2 + 中段ワイドsizzle pan close + 下段establishing 2)
- shape_mix: 中段は **食材pan close-up atmospheric (網点背景+湯気)**、下段は玄関での会話 establishing
- size_hierarchy: medium-large
- bubble_breakout: 3
- effect_lines: 「ジュー」湯気
- floating: SFX「ジュー」、装飾heart
- reading_order: 上→中→下
- page_role: domestic / aftermath
- 既存 pat_001 派生

### page_0078 (バイト宣言 + zoom burst)
- panel_count: 5 (上に大character+star burst atmospheric + 中段に分裂dialogue × 4 + 下段dialogue 2)
- shape_mix: 上段が **central character burst with star sparkle background atmospheric** (panelに大星散布)、中段に rect 群、下段rect
- size_hierarchy: extreme (上段dramatic)
- bubble_breakout: 5+
- effect_lines: 上段に放射状star
- floating: SFX「ザワ」、star装飾
- reading_order: 上→中→下右→下左
- page_role: vow / declaration
- 新規: pat_037_zoom_burst_dialogue サンプル

### page_0079 (配信クリスタル発見)
- panel_count: 5 (上左establishing + 上右に **配信クリスタル 3D artifact panel** + 中段dialogue + 下段dialogue 2)
- shape_mix: 上右に **菱形クリスタル close-up atmospheric** (内部光輝)、 周囲rect
- size_hierarchy: extreme (クリスタルが視覚focal)
- bubble_breakout: 5+
- effect_lines: クリスタル周辺に光輝
- floating: 「配信クリスタル」 caption、SFX「ジュアル」
- reading_order: 上左→上右→中→下右→下左
- page_role: item_introduction / loot
- 新規: pat_027 サンプル (item spotlight)

### page_0083 (取引指示)
- panel_count: 4 (上にslime指南 + 中段ワイドにshop interior + 下段にdialogue 2)
- shape_mix: 中段は **奥行きある shop establishing rect**、下段はdialogue
- size_hierarchy: medium
- bubble_breakout: 4
- effect_lines: 装飾sparkle
- floating: SFX、商品装飾
- reading_order: 上→中→下右→下左
- page_role: instruction / planning
- 既存 pat_001 派生

### page_0084 (cinematic train establishing)
- panel_count: 2 (左に縦長character close + 右に縦長establishing広告+電車atmospheric)
- shape_mix: 全画面が縦長 split screen、左character close + 右に **広告看板+電車establishing atmospheric**
- size_hierarchy: balanced extreme
- bubble_breakout: 2
- effect_lines: なし
- floating: 看板広告「アイテロ交換」、ナレーション
- reading_order: 左→右
- page_role: establishing / iconic_pose / transition
- 新規: pat_034 サンプル

### page_0088 (ヒロイン再登場 establishing)
- panel_count: 2 (上小establishing dialogue + 下段大ヒロイン全身)
- shape_mix: 下段は **ヒロイン全身フィギュア atmospheric (背景白抜き)** + 章タイトル「第3話 スライム酒」 + キャラ名表記
- size_hierarchy: extreme
- bubble_breakout: 2
- effect_lines: なし
- floating: 章タイトル装飾、キャラ名「牧野ミルク」プレート、ふりがな
- reading_order: 上→下
- page_role: heroine_introduction / chapter_card
- 既存 pat_013 + pat_023 ハイブリッド

### page_0089 (関係性memoryエントランス)
- panel_count: 5 (上にdialogue+pair establishing + 中段にmemory inset (中学/今 比較) + 下段にdialogue 2)
- shape_mix: 中段に **memory inset 3 small panels (中学=ピンク, 茶色, 今)** が screentone 区別、周囲rect
- size_hierarchy: medium
- bubble_breakout: 4
- effect_lines: 装飾sparkle
- floating: SFX、ヘッダー「中学/今」 caption
- reading_order: 上→中→下
- page_role: relationship_history / flashback
- 新規: pat_029 サンプル

### page_0091〜0096 (既存サンプル - 追加なし)

### page_0098 (ID証発行 reaction grid)
- panel_count: 5 (上左dialogue + 上中央**大ID証 artifact** + 中段dialogue + 下段establishing + 下段face close)
- shape_mix: 上段中央に **DUNGEON EXPLORE ID Card artifact** atmospheric on tile floor、周囲rect dialogue、下段に小rect
- size_hierarchy: extreme (ID証 dominant)
- bubble_breakout: 5+
- effect_lines: ID周辺sparkle
- floating: ID証 (写真+番号+顔写真)、SFX「キャー」
- reading_order: 上左→上中→中→下→下右
- page_role: registration / official_reveal
- 新規: pat_035_id_artifact_reaction_grid サンプル

### page_0100 (赤スライム発見+気配察知)
- panel_count: 5 (上左establishing + 上右dialogue close + 中段大action + 下段dialogue + 下段small)
- shape_mix: 上段small rect、中段に **action atmospheric (背景速度線)**、下段に slime close
- size_hierarchy: extreme
- bubble_breakout: 5+
- effect_lines: 中段に強烈speedlines、下段にbreath
- floating: SFX「シャア」「ブキッ」
- reading_order: 上左→上右→中→下右→下左
- page_role: action / reveal_enemy
- 既存 pat_010 派生

### page_0104 (赤スライム drama)
- panel_count: 4-5 (上に**気配察知atmospheric reveal panel** + 中段action + 下段dialogue 2)
- shape_mix: 上段に **背景atmospheric (シャシャと震えるテクスチャ) + 矢印フィン** という skill activation、中段action、下段dialogue
- size_hierarchy: extreme
- bubble_breakout: 5+
- effect_lines: 上段skill activation aura
- floating: SFX「シャア」「シマ」、技名 caption
- reading_order: 上→中→下
- page_role: skill_activation / combat_intro
- 既存 pat_017/pat_010 派生

### page_0105 (静かなる移動 + 鐘音)
- panel_count: 3 (上小face dialogue + 中段ワイドestablishing wall + 下段dialogue 2)
- shape_mix: 中段は **黒rectangular bell artifact silhouette in establishing wall**、下段は再開dialogue
- size_hierarchy: medium-large
- bubble_breakout: 3
- effect_lines: なし
- floating: SFX「ゴーン」(鐘音)、装飾
- reading_order: 上→中→下右→下左
- page_role: time_marker / transition
- 既存 pat_004 派生

### page_0107 (sales triumph)
- panel_count: 5 (上左dialogue close + 上右ヒロイン burst star atmospheric + 中段rect price + 下段dialogue 2)
- shape_mix: 上右はヒロイン **star burst atmospheric** で煽る、中段に値段プレート、下段rect
- size_hierarchy: extreme
- bubble_breakout: 5+
- effect_lines: 上右星散布、下段震え線
- floating: SFX「キャイーン」、価格 caption「¥2000」
- reading_order: 上左→上右→中→下右→下左
- page_role: triumph / vow_declaration
- 新規: pat_037 派生

### page_0108 (デート carousel)
- panel_count: 5 (上ワイドにcafe establishing + 中段dialogue + 中段右face + 下段dialogue 2)
- shape_mix: 上段に **wide cafe establishing rect**、中段rect、下段に**ヒロイン顔close-up atmospheric**
- size_hierarchy: medium
- bubble_breakout: 5+
- effect_lines: 装飾sparkle
- floating: SFX
- reading_order: 上→中→下右→下左→下中
- page_role: dialogue / date
- 既存 pat_001 派生

### page_0113 (cafe dialogue)
- panel_count: 5 (上ワイドestablishing + 中段face close + 下段dialogue 3)
- shape_mix: 上段は cafe establishing、中段にatmospheric face close (左右対称)、下段に密集dialogue
- size_hierarchy: extreme
- bubble_breakout: 5+
- effect_lines: 中段にatmospheric texture
- floating: SFX「ハッ」「パッ」
- reading_order: 上→中→下右→下中→下左
- page_role: revelation / dialogue
- 既存 pat_009 派生

### page_0114 (mushroom artifact + reaction)
- panel_count: 5 (上にinfo panel "ダンジョンキノコ" + 中段ワイドにキノコ大 atmospheric + 下段dialogue + 下段face)
- shape_mix: 上段に **info plate panel (情報整理artifact)**、中段に巨大キノコ atmospheric、下段にdialogue
- size_hierarchy: extreme (mushroom dominant)
- bubble_breakout: 4
- effect_lines: 中段にキノコaura
- floating: SFX「ドン」、info plate
- reading_order: 上→中→下右→下中→下左
- page_role: item_introduction / lore
- 新規: pat_027/pat_038 ハイブリッド

### page_0118 (cooking aesthetic)
- panel_count: 3 (上にdish close-up atmospheric + 中段ワイドestablishing 家 + 下段dialogue)
- shape_mix: 上段は **料理皿の超close atmospheric (背景は影)**、中段は establishing 家
- size_hierarchy: extreme
- bubble_breakout: 3
- effect_lines: 装飾sparkle
- floating: SFX「カチャ」、装飾heart
- reading_order: 上→中→下
- page_role: domestic / atmospheric
- 既存 pat_004 派生

### page_0119 (statusup + level5 reaction)
- panel_count: 5 (上UIstatus + 中段dialogue + 中段右small slime + 下段大face close + 下段small)
- shape_mix: 全rect、上段にUI status、中段dialogue、下段大に **face close-up atmospheric (反応の頂点)**、下段右にslime
- size_hierarchy: extreme
- bubble_breakout: 5+
- effect_lines: 上段status burst、下段大に集中線
- floating: ステータス全文、SFX「パッ」「ガッカリ」
- reading_order: 上→中→下→下右
- page_role: level_up / disappointment
- 新規: pat_028 サンプル

### page_0123 (caught monster news + slime watching)
- panel_count: 5 (上左dialogue close + 上右にtablet UI artifact + 中段dialogue + 下段establishing + 下段dialogue)
- shape_mix: 上右に **tablet news UI panel artifact**、周囲rect dialogue、下段にatmospheric
- size_hierarchy: medium-large
- bubble_breakout: 5+
- effect_lines: なし
- floating: tablet UI、SFX「ピッ」、装飾sparkle
- reading_order: 上左→上右→中→下→下
- page_role: external_validation / aftermath
- 新規: pat_031 サンプル

### page_0124 (monster bestiary grid)
- panel_count: 5 (上左にmonster info panels (numbered "1" "2") + 上右establishing キャラ階段 + 中段info caption + 下段大monster atmospheric)
- shape_mix: 上左に **numbered silhouette grid (歩キノコ=2 / スライム=1)** の atmospheric tile、上右establishing、下段に **巨大monster atmospheric establishing** ゴブリン
- size_hierarchy: extreme
- bubble_breakout: 4
- effect_lines: 下段魔物に放射 aura
- floating: 番号付きsilhouette「1」「2」、caption「ゴブリン」「5」
- reading_order: 上左tile→上右→中→下
- page_role: enemy_briefing / encounter_intel
- 新規: pat_038_monster_bestiary_grid サンプル

### page_0128 (青木合流 reaction)
- panel_count: 6-7 (上左面 + ID artifact左 + 中段dialogue + 中段右face + 下段3並列タイル)
- shape_mix: 既存 pat_011/pat_024 派生 (時間圧縮+L字)

### page_0129 (経験キノコ確認)
- panel_count: 4 (上ワイドにキャラestablishing座る + 中段ワイドtablet artifact + 下段dialogue 2)
- shape_mix: 中段に **横長tablet UI artifact**、上段は establishing rect (atmospheric on couch)、下段に dialogue
- size_hierarchy: medium
- bubble_breakout: 4
- effect_lines: 装飾sparkle
- floating: tablet UI、SFX「シー」
- reading_order: 上→中→下右→下左
- page_role: research / decision
- 既存 pat_031 派生

### page_0133 (新章扉 + 旅行者silhouette)
- panel_count: 2 (上に小rect dialogue + 下段に大ダンジョン入口 establishing atmospheric)
- shape_mix: 下段は **巨大ダンジョン洞穴入口 atmospheric** に小キャラ silhouette、章扉的
- size_hierarchy: extreme
- bubble_breakout: 1
- effect_lines: 入口auro
- floating: SFX「キィー」(鳥声)、洞穴atmospheric
- reading_order: 上→下
- page_role: chapter_opening / world_reveal
- 既存 pat_004/pat_005 ハイブリッド

### page_0134 (chapter title overlay action)
- panel_count: 1 (full bleed action with chapter title plate)
- shape_mix: full bleed に黒スリット背景に座り込みhero、左下に**章タイトル「第5話 ダンジョンの異変」 plate**
- size_hierarchy: -
- bubble_breakout: 0
- effect_lines: 強烈vertical slits
- floating: chapter title plate
- reading_order: 全体
- page_role: chapter_opening_action / title_drop
- 新規: pat_032_chapter_title_overlay_full_action サンプル

### page_0137 (slash polygon combat)
- panel_count: 4 (上段に **斜め切り欠きpolygonal panels 2** + 中段atmospheric monster slash + 下段にwhite-haired character close)
- shape_mix: 上段が **斜め境界polygon (panel間が斜めに切り欠かれる)** で2分割、中段がmonster impact atmospheric (背景radiating SFX「ドナ」「ザッ」)、下段character close
- size_hierarchy: extreme
- bubble_breakout: 5+ (SFX「ガッ」「ガキッ」「ドナ」)
- effect_lines: 強烈radial speedlines + 斜め切り
- floating: SFX 大文字 (黒地に白)、剣のbroken artifact
- reading_order: 上→中→下
- page_role: action_combat / decisive_strike / blade_skill
- 新規: pat_030_polygon_slash_combat サンプル

### page_0138 (黒トード会議)
- panel_count: 4 (上ワイドwide establishing dialogue 2 + 中段crystal artifact + 下段dialogue 2)
- shape_mix: 上段にside-by-side dialogue, 中段に **crystal artifact close + sparkle**、下段dialogue
- size_hierarchy: medium-large
- bubble_breakout: 4
- effect_lines: 装飾sparkle
- floating: crystal、SFX
- reading_order: 上→中→下
- page_role: villain_planning
- 既存 pat_001 派生

### page_0143 (ヒロインcall + boy excitement)
- panel_count: 5 (上にmemory inset + 上右大face + 中段dialogue + 下段dialogue 2 + face)
- shape_mix: 上段に **memory inset (ヒロイン笑顔 with sparkle background)** + 中段にbed dialogue、下段にrect
- size_hierarchy: medium
- bubble_breakout: 5+
- effect_lines: 上memory aura sparkle, 下震え
- floating: SFX「ピリピリ」、音符♪
- reading_order: 上→中→下右→下左
- page_role: dialogue / phone_call
- 既存 pat_001/pat_029 派生

### page_0144 (boss monster reveal full bleed)
- panel_count: 1 (full bleed monster atmospheric)
- shape_mix: 全画面 monster atmospheric (背景全黒+人物落下)
- size_hierarchy: -
- bubble_breakout: 0
- effect_lines: 強烈vertical drops
- floating: なし
- reading_order: 全体
- page_role: boss_reveal / cliffhanger
- 既存 pat_005/pat_019 派生

### page_0147 (申請 + monster establishing)
- panel_count: 5 (上左establishing entry + 上右dialogue + 中段dialogue + 中段右ID証 + 下段ワイド大魔物 atmospheric establishing)
- shape_mix: 全rect、下段は **大魔物 atmospheric establishing (走る monster)** + 上に署名signature artifact
- size_hierarchy: extreme
- bubble_breakout: 5+
- effect_lines: 下段魔物に走り効果線
- floating: signature ID、SFX「ダ」
- reading_order: 上左→上右→中→中右→下
- page_role: registration / encounter_setup
- 新規: pat_035 サンプル

### page_0148 (角ウサギ討伐)
- panel_count: 4 (上左に大魔物 face close + 上右dialogue + 中段action + 下段item drop atmospheric)
- shape_mix: 上左に **巨大ウサギ face close atmospheric** (panel境界=毛で消失)、下段はitem drop atmospheric (collected items)
- size_hierarchy: extreme
- bubble_breakout: 5+ (SFX「ズザッ」「ゴッ」)
- effect_lines: 強烈radial speedlines (上左)
- floating: SFX「ズザッ」、装飾item
- reading_order: 上→中→下
- page_role: action_attack / hunt_climax
- 既存 pat_003/pat_019 派生

### page_0149 (5階層establishing)
- panel_count: 3 (上ワイドキャラ俯瞰 + 中段small dialogue + 下段ワイド5階層establishing atmospheric)
- shape_mix: 下段は **暗洞窟atmospheric establishing**、 caption「五階層」、上段に小キャラ
- size_hierarchy: extreme
- bubble_breakout: 3
- effect_lines: なし
- floating: SFX「あれ」、洞窟atmospheric
- reading_order: 上→中→下
- page_role: world_reveal / arrival
- 既存 pat_004 派生

### page_0153 (boss attack 接近)
- panel_count: 3 (上に大action atmospheric + 中段dialogue + 下段face close)
- shape_mix: 上段が **キャラ近接atmospheric (背景縦線+影)**、下段face close (atmospheric, 涙)
- size_hierarchy: extreme
- bubble_breakout: 5+ (SFX「ガキ」)
- effect_lines: 強烈vertical lines
- floating: SFX
- reading_order: 上→中→下
- page_role: action_climax / peril
- 既存 pat_003 派生

### page_0154 (skill release+monster reveal grid)
- panel_count: 4 (上にhand sparkle close + 中段atmospheric monster reveal + 下段establishing + 下段small)
- shape_mix: 上段は **hand sparkle close atmospheric**、中段に魔物 close (atmospheric)、下段にestablishing + caption「解放」
- size_hierarchy: extreme
- bubble_breakout: 4
- effect_lines: 強烈radiating burst
- floating: SFX「ポウ」「キイ」、 caption「解放」
- reading_order: 上→中→下
- page_role: skill_activation / monster_reveal
- 新規: pat_030 派生 (polygon slash 系)

## 抽出された Pattern Archetypes (24個 + 拡張14個 = 38個)

### pat_001_3tier_dialogue_5
- **頻度**: high (8/38 ≒ 21%)
- **panel_count**: 4-5
- **shape_mix**: 全 rect, 3段配置 (上1+中1or2+下1or2)
- **size_hierarchy**: medium
- **典型 page_role**: dialogue / buildup
- **特徴**: bubble breakout 2-4箇所、効果線わずか、安定した読み順
- **観察pages**: 0016, 0021, 0066, 0067, 0076, 0099, 0131, 0141

**purpose (なぜこのコマ割りか)**:
- **narrative_function**: dialogue_progression — 情報密度が一定の会話・状況説明・関係性の進展を、読者を疲れさせずにテンポ良く流す
- **reader_effect**: 安定したリズムで会話を「読み進められる」感覚を作る。視線を迷わせず、内容理解に脳のリソースを使わせる
- **why_this_shape**: 3段組 rect は読者の視線パスが完全に予測可能 (右上→左下) で、cognitive load が最低。ダイアログが主役のときに「コマ割りで主張しない」のが正解
- **匹敵する代替手段の不採用理由**: pat_006 (pure_dialogue_dump) でも会話は成立するが、吹き出しが panel を埋めるため「物語が止まる」印象になる。日常会話・関係性ビルドの場面では「進んでいる感」が必要なので 3tier rect で establishing 要素を中段に挿む方が良い
- **trigger conditions**: page_role ∈ {dialogue, buildup, character_intro, domestic} AND panel_count ∈ [3,5] AND importance_max ≤ 3 AND no action/reveal beat

### pat_002_diag_split_two_shot_1
- **頻度**: rare (1/38)
- **panel_count**: 1 (斜め分断で内部2分割)
- **shape_mix**: 全画面1コマ + 斜め境界線で人物2分割
- **size_hierarchy**: -
- **典型 page_role**: iconic / cliffhanger
- **特徴**: ヒロインvs主人公の対峙、ロマンス系扉的演出
- **観察pages**: 0086

**purpose (なぜこのコマ割りか)**:
- **narrative_function**: relational_pivot — 二者の関係性が「決定的に変わる瞬間」を1ページで象徴的に切り取る。再会・初対面・運命的接触の「扉ページ」役
- **reader_effect**: ページをめくった瞬間に「これは特別な瞬間だ」と理解させる。コマを読まずに絵として記憶される設計
- **why_this_shape**: 斜め分断は左右の人物の心理的距離・対比を一目で示す。rect 並置だと「同じ場所にいる」だけになるが、斜め線が「近いのに分断されている」緊張を視覚化する
- **匹敵する代替手段の不採用理由**: pat_013 (two_shot_iconic) でも初登場演出は可能だが、それは「並置による紹介」であり「対峙による緊張」を作れない。物語の決定的 pivot には斜め分断が要る
- **trigger conditions**: page_role ∈ {iconic, cliffhanger, fated_meeting} AND character_count = 2 AND emotional_tension = high AND chapter_boundary OR scene_pivot

### pat_003_extreme_hero_action_2
- **頻度**: medium-high (5/38 ≒ 13%)
- **panel_count**: 2-3
- **shape_mix**: 縦長 hero panel (atmospheric) + reaction strips
- **size_hierarchy**: extreme (hero panel が60-70%)
- **典型 page_role**: hero_pose / action_attack
- **特徴**: 強烈speedline、SFX多用、breakout頻発
- **観察pages**: 0011, 0012, 0023, 0152

**purpose (なぜこのコマ割りか)**:
- **narrative_function**: action_impact — 主人公の決定的アクション (一撃・突進・決め技) を「ページの主役」として見せる。物理アクションの impact 瞬間を切り出す
- **reader_effect**: 読者の視線を hero panel に釘付けにする。speedline と breakout で「動きが panel から飛び出る」感覚を作り、reaction strip で「観客的安堵/驚愕」を添える
- **why_this_shape**: 縦長大コマ + atmospheric (背景消失) で人物の動作を最大化。reaction strip を小さく添えることで「主人公の動き > 周囲の反応」の重み付けが視覚的に明示される
- **匹敵する代替手段の不採用理由**: pat_010 (diag_speedline_combat) でも action は表現できるが、あちらは「乱闘・連続交戦」用。決め技1発の impact 瞬間には縦長 hero panel + atmospheric の方が「時間が止まった」感覚が出る
- **trigger conditions**: page_role ∈ {action_attack, hero_pose, decisive_strike} AND importance_max ∈ [4,5] AND single_protagonist_focus AND beat_type = "impact_moment"

### pat_004_atmospheric_establishing_2
- **頻度**: medium (4/38)
- **panel_count**: 2-3
- **shape_mix**: 大establishing(境界 atmospheric) + small reactions
- **size_hierarchy**: extreme
- **典型 page_role**: world_reveal / establishing
- **特徴**: 上段で空間提示 (atmospheric/ブリード)、下段で人物reaction
- **観察pages**: 0007, 0036, 0066, 0136

**purpose (なぜこのコマ割りか)**:
- **narrative_function**: scene_transition / world_introduction — 新場所・新章・空間スケールを読者に「浸す」。地理的・時間的 setup
- **reader_effect**: 「この物語の舞台はこういう場所だ」とゆっくり呑み込ませる。atmospheric なブリードで「場所が物語より大きい」スケール感を作る
- **why_this_shape**: establishing の境界線を消す (atmospheric) ことで「空間が panel に収まらない=広い」と読者に感じさせる。下段に小 reaction を置くのは「広い場所に主人公が点として存在する」スケール対比のため
- **匹敵する代替手段の不採用理由**: pat_005 (full_bleed_single) は「世界の climax 提示」用で、日常的な場面転換には強すぎる。pat_001 の rect 上段でも空間提示は可能だが「印象に残らない」ため章境界では不適
- **trigger conditions**: page_role ∈ {establishing, scene_transition, chapter_opening} AND new_location_or_time AND panel_count ∈ [2,4]

### pat_005_full_bleed_single
- **頻度**: rare (3/38、表紙含む)
- **panel_count**: 1
- **shape_mix**: full bleed
- **size_hierarchy**: -
- **典型 page_role**: cover / 巻末扉 / world_reveal climax
- **特徴**: 表紙、章境界の扉、もしくは climax の超ロングショット
- **観察pages**: 0001, 0103, 0150

**purpose (なぜこのコマ割りか)**:
- **narrative_function**: spectacle_reveal — 物語スケールの climax (世界俯瞰・最終決戦の舞台) を「画面いっぱい」で提示する。または cover/扉として作品 identity を示す
- **reader_effect**: ページをめくった瞬間に視覚的圧倒を与える。読者を会話レベルから「世界そのもの」の視座に引き上げる
- **why_this_shape**: panel を1枚にすることで「読み順」が消え、絵が image としてだけ機能する。これは映画でいう establishing wide shot の漫画版。複数コマでは「視線が分散」してスケール感が壊れる
- **匹敵する代替手段の不採用理由**: pat_004 (atmospheric_establishing) でも空間は提示できるが、「下段の reaction」が読者の視座を地上に戻してしまう。世界そのものの reveal にはそれが邪魔
- **trigger conditions**: page_role ∈ {cover, chapter_door, world_climax_reveal, final_destination} AND scale = "world_or_arena" AND no_dialogue_required (またはタイトルロゴのみ)

### pat_006_pure_dialogue_dump_3
- **頻度**: medium (3/38)
- **panel_count**: 3
- **shape_mix**: rect、ただし吹き出しが panel 半分以上を埋める
- **size_hierarchy**: medium
- **典型 page_role**: dialogue_dump / explanation
- **特徴**: bubble_breakout が 5+ で panel 内部が吹き出しで埋まる、設定説明回
- **観察pages**: 0017, 0051, 0121

**purpose (なぜこのコマ割りか)**:
- **narrative_function**: information_dump — 世界観ルール・スキル説明・設定の伝達。読者に「読み込むモード」になってもらう
- **reader_effect**: 「この情報は重要だから集中して読め」というシグナル。リズムを意図的に止め、後の action 場面との対比を作る
- **why_this_shape**: 吹き出しが panel 面積の大半を占めることで「panel は文字を載せる器」と化す。これは情報伝達効率を上げる代わりに「絵としての面白さ」を捨てる選択。 dump 場面では正解
- **匹敵する代替手段の不採用理由**: pat_001 (3tier_dialogue) では吹き出しが小さいため長文説明が崩壊する。pat_021 (screentone_info_anchor) は figurative データ用で、純粋な台詞ベース説明には panel を吹き出しで埋める方が直接的
- **trigger conditions**: page_role ∈ {dialogue_dump, explanation, rule_introduction, mechanism_reveal} AND text_volume = "high" AND no_action_beat AND speaker_count ≤ 3

### pat_007_information_dense_complex
- **頻度**: medium (2/38)
- **panel_count**: 6-8
- **shape_mix**: 複合 (両端に縦長 atmospheric + 中央に小rectタイル群)
- **size_hierarchy**: extreme + dense
- **典型 page_role**: information_briefing / dictionary
- **特徴**: 1ページに大量の情報を詰め込む、初心者向け解説回に多い
- **観察pages**: 0056, 0099

**purpose (なぜこのコマ割りか)**:
- **narrative_function**: information_dump (visual_index) — 複数項目 (敵種類・装備一覧・ルール並列) を「カタログ的」に並べて提示
- **reader_effect**: 「ここは情報スポット」と認識し、視線を panel ごとに走らせる。読者が後で参照したくなる「辞書ページ」化
- **why_this_shape**: 両端の縦長 atmospheric が左右の anchor (柱) になり、中央の小 rect 群を「解説タイル」として枠付ける。pat_006 (pure_dialogue_dump) との違いは、こちらは「複数項目の並列」、あちらは「1テーマの台詞長文」
- **匹敵する代替手段の不採用理由**: pat_021 (screentone_info_anchor) は単一項目の説明 anchor。複数項目を並列するには panel を細分化した dense layout が要る
- **trigger conditions**: page_role ∈ {information_briefing, monster_index, gear_catalog, lore_summary} AND item_count ≥ 4 AND panel_count ∈ [5,8]

### pat_008_ui_overlay_status
- **頻度**: medium (3/38)
- **panel_count**: 3-4
- **shape_mix**: UIフレーム panel + zoom panel + reaction panel
- **size_hierarchy**: extreme
- **典型 page_role**: ui_information / power_check
- **特徴**: ステータス画面/メニューUIをそのまま panel化、SFX「フォン」と組合せ
- **観察pages**: 0026, 0039, 0040

**purpose (なぜこのコマ割りか)**:
- **narrative_function**: gacha_ui_status_reveal — ガチャ・ステータス画面・スキルツリーなど「ゲーム的 UI」をそのまま物語の中で描写。subtype=gacha_ui の中核
- **reader_effect**: 数値・項目・ランクが具体的に見えることで「進歩の手応え」を与える。なろう系読者の「成長確認」体験を満たす
- **why_this_shape**: UI を panel として扱う (frame そのもの) ことで、読者は「キャラと同じ画面を見ている」一人称体験を得る。zoom panel で重要数値を強調、reaction panel でキャラの感情と接続
- **匹敵する代替手段の不採用理由**: 普通の caption box で数値を書いても情報伝達は可能だが、「ガチャを引く」「レベルが上がる」体験的快感は UI の視覚化なしでは作れない。subtype=gacha_ui ではこの pattern が必須
- **trigger conditions**: bible.subtype = "gacha_ui" OR "hybrid" AND beat ∈ {status_check, skill_acquisition, gacha_pull, level_up} AND has_numeric_data

### pat_009_extreme_close_emotion_3
- **頻度**: medium-high (5/38 ≒ 13%)
- **panel_count**: 3-4
- **shape_mix**: 顔・目のクローズアップ atmospheric + 通常 rect 散在
- **size_hierarchy**: extreme
- **典型 page_role**: reveal / emotion_internal / shock
- **特徴**: 目や口だけが panel として残り、背景は速度線/白抜き、SFXは大文字 floating
- **観察pages**: 0031, 0046, 0085, 0096, 0127

**purpose (なぜこのコマ割りか)**:
- **narrative_function**: emotion_peak — キャラの内的衝撃 (覚醒・絶望・恐怖・確信) の頂点を「目・口の超アップ」で切り出す
- **reader_effect**: キャラに「乗り移る」体験。瞳孔・汗・震える唇の microexpression が読者の感情同期を引き起こす
- **why_this_shape**: 顔の局所 close + 背景消失 (atmospheric) で「外部世界が消えてキャラの内面だけになる」瞬間を視覚化。周囲の rect が「現実」、close panel が「主観」のレイヤー分離
- **匹敵する代替手段の不採用理由**: pat_001 の rect で表情を描いても「情報」止まり。emotion peak は panel 形状自体が「世界が止まった」と示す必要がある。pat_014 (text_background) は「思考の言語化」用で、言語化前の生の感情には close-up が要る
- **trigger conditions**: page_role ∈ {reveal, emotion_internal, shock, awakening} AND emotion_intensity ≥ 4 AND has_face_close_target AND beat = "internal_peak"

### pat_010_diag_speedline_combat_3
- **頻度**: medium (3/38)
- **panel_count**: 3-4
- **shape_mix**: 中央に大 action panel(diagonal speed lines) + reaction strips
- **size_hierarchy**: extreme
- **典型 page_role**: action_combat / chase
- **特徴**: diagonal effect lines, multi-SFX, 全方位 breakout
- **観察pages**: 0101, 0111, 0116

**purpose (なぜこのコマ割りか)**:
- **narrative_function**: action_continuous — 連続交戦・追跡・乱闘など「複数フレーム連続の動き」を 1 ページで圧縮
- **reader_effect**: 視線が diagonal speedline に沿って斜め走行する。読者の眼球運動が動きと同期し、「絵が動いている」錯覚が起きる
- **why_this_shape**: diagonal は rect 並置より動的エネルギーを持つ。中央大コマが乱戦の「中心」を、周囲 strip が「複数視点・複数瞬間」を圧縮するのに向く
- **匹敵する代替手段の不採用理由**: pat_003 (extreme_hero_action) は「決め技1発」用で、連続戦闘に当てると単調。連続性には diagonal + 複数 reaction strip が要る
- **trigger conditions**: page_role ∈ {action_combat, chase, brawl} AND duration_beats ≥ 2 (時間が複数瞬間にまたがる) AND multiple_actors_in_motion

### pat_011_l_shape_inset_5
- **頻度**: rare-medium (2/38)
- **panel_count**: 5-7
- **shape_mix**: L字 panel (大コマの角に小コマが嵌まる)、もしくは大 panel に小 inset rect
- **size_hierarchy**: extreme
- **典型 page_role**: action / reaction_combo
- **特徴**: 大コマで動作、嵌込小コマで反応・時間圧縮
- **観察pages**: 0145, 0127

**purpose (なぜこのコマ割りか)**:
- **narrative_function**: action_with_simultaneous_reaction — 大きな動作と、ほぼ同時に発生する反応 (キャラの表情・関係者の認識) を「同一フレーム時間」として描く
- **reader_effect**: 「動作と反応が同時に起きている」感覚。読み順が大→小と流れることで時系列圧縮も同時に成立 (大コマが先か同時かを視線で決められる)
- **why_this_shape**: L字や inset は rect grid では表現できない「同時性」を視覚化。隣接させる 2 コマでは「順番」になるが、嵌込はそれを崩す
- **匹敵する代替手段の不採用理由**: pat_010 (diag_speedline_combat) で reaction strip を添えても「順番」になる。同時性を主張するには panel 形状の物理的合体が必要
- **trigger conditions**: action_beat AND simultaneous_reaction_beat AND temporal_collapse_required AND panel_count ∈ [5,7]

### pat_012_horizontal_strip_focus_3
- **頻度**: rare (1-2/38)
- **panel_count**: 3
- **shape_mix**: 横3分割 (column strip)、全panel が atmospheric か silhouette
- **size_hierarchy**: flat
- **典型 page_role**: reaction_trio / focus_compression
- **特徴**: 3人の反応や時間軸を横並びで均等表現、背景消失多め
- **観察pages**: 0146

**purpose (なぜこのコマ割りか)**:
- **narrative_function**: parallel_reaction OR temporal_micro_compression — 複数キャラの同時反応、または同一キャラの連続動作 (3瞬間) を「均等並列」で示す
- **reader_effect**: flat な size_hierarchy が「全員が等しく重要」または「どの瞬間も同等」というメッセージを与える。安定したリズムでテンポを刻む
- **why_this_shape**: extreme hierarchy だと「主役と脇役」の格付けが発生してしまう。並列反応は格付けがあってはダメ。flat 横並びで「並列性」を視覚化する必要
- **匹敵する代替手段の不採用理由**: pat_001 (3tier_dialogue) の上段に3コマ並べても可能だが、上段に位置することで「導入」になり parallel 性が薄れる。独立ページとして flat strip にする方が並列性が強い
- **trigger conditions**: page_role ∈ {reaction_trio, focus_compression, micro_montage} AND actor_count = 3 OR same_actor_in_3_moments AND no_dominant_panel

### pat_013_two_shot_iconic_2
- **頻度**: medium (2/38)
- **panel_count**: 2
- **shape_mix**: 大ペア (left:close-up + right:full-body)、対比型
- **size_hierarchy**: balanced extreme
- **典型 page_role**: heroine_introduction / iconic
- **特徴**: 表情close vs 全身、emotion vs presence の対比
- **観察pages**: 0085, 0087

**purpose (なぜこのコマ割りか)**:
- **narrative_function**: character_reveal — 重要キャラ (特にヒロイン・ライバル) の初登場を「presence (全身) + emotion (顔)」の2側面で同時提示
- **reader_effect**: 「このキャラは特別だ」と即座に印象付ける。ファンアート用 reference シーンとしても機能する象徴的レイアウト
- **why_this_shape**: full-body だけだと「容姿の情報」止まり、close-up だけだと「感情の情報」止まり。両方を1ページに並置することで「全人格としての登場」が成立する
- **匹敵する代替手段の不採用理由**: pat_002 (diag_split_two_shot) は「2人の対峙」用で、1人の紹介には機能しない。pat_001 で複数コマで紹介するとインパクトが薄まる
- **trigger conditions**: page_role ∈ {character_introduction, heroine_reveal, rival_appearance} AND character.first_appearance = true AND character.role ∈ {main, supporting_critical}

### pat_014_atmospheric_text_background_4
- **頻度**: rare (1-2/38)
- **panel_count**: 4
- **shape_mix**: 通常 rect だが、上段または背景に **巨大文字/数字が atmospheric にブリード**
- **size_hierarchy**: medium
- **典型 page_role**: emotional_revelation
- **特徴**: ステータス値や心象を巨大背景文字で表現
- **観察pages**: 0096, 0026 (派生)

**purpose (なぜこのコマ割りか)**:
- **narrative_function**: thought_externalization — キャラの思考・固執している言葉・ステータス数値を「panel 外まで漏れ出る」サイズで描き、内面を物理化する
- **reader_effect**: 「キャラの頭の中がこの文字で埋め尽くされている」感覚。読者が思考と同期する
- **why_this_shape**: 文字を panel 内に小さく書くと「ただの情報」、巨大化させて背景にブリードさせると「執着・支配」と読み取られる。caption ではなく typography が emotion driver になる
- **匹敵する代替手段の不採用理由**: pat_009 (close_emotion) は非言語的衝撃用、pat_006 (dialogue_dump) は対話用。「特定の言葉に頭が支配されている」状態には文字 typography の atmospheric ブリードが固有に向く
- **trigger conditions**: page_role ∈ {emotional_revelation, obsession, status_realization} AND has_specific_word_or_number_to_emphasize AND character_internal_focus = true

### pat_015_label_strip_decor_4
- **頻度**: rare (1/38)
- **panel_count**: 4
- **shape_mix**: 通常コマ + ロゴ/看板帯 panel (装飾的細長 rect)
- **size_hierarchy**: medium + 帯
- **典型 page_role**: dialogue / domestic
- **特徴**: 紙袋ロゴ、看板、データプレートなど世界観装飾だけの帯コマ
- **観察pages**: 0071, 0067 (派生)

**purpose (なぜこのコマ割りか)**:
- **narrative_function**: world_texture_injection — 世界観の細部 (ブランド名・店舗・ID 番号など) を「装飾的帯 panel」として挿入。reality を底上げ
- **reader_effect**: 物語が描かれた架空世界ではなく「実在の何か」と感じさせる。日常パートでも読者を退屈させない情報密度
- **why_this_shape**: 細長い帯は本筋の dialogue panel を分断せず、「視線の合間に挿入する情報」として機能する。fullsize panel にすると主役を取ってしまう
- **匹敵する代替手段の不採用理由**: caption box だけでは architectural detail が伝わらない。装飾を panel にすると「視覚的余韻」が残る
- **trigger conditions**: page_role ∈ {dialogue, domestic, daily_life} AND has_world_texture_artifact (ブランド名・看板・店舗) AND beat_intensity ≤ 2

### pat_016_news_artifact_3
- **頻度**: rare (1-2/38)
- **panel_count**: 3-4
- **shape_mix**: 中央/上段に Web/SNS UI 模写 panel + 通常 rect dialogue
- **size_hierarchy**: medium-large
- **典型 page_role**: aftermath / external_validation
- **特徴**: ニュース記事、ID証、書類の **diegetic (作中現実) artifact** をそのまま panel化
- **観察pages**: 0131, 0126

**purpose (なぜこのコマ割りか)**:
- **narrative_function**: external_world_validation — キャラの行動が「世間に認知された」「制度に登録された」事実を、作中の社会システム経由で示す。subtype=external_social の主要 device
- **reader_effect**: 「主人公の行動が外部世界に波紋を広げている」感覚。 dopamine rewards (バズった/認められた) を読者に与える
- **why_this_shape**: ニュース UI/書類を panel そのものにすると、読者は「キャラと同じく作中世界の画面を読む」体験になる。caption で「ニュースになった」と書くだけでは弱い
- **匹敵する代替手段の不採用理由**: pat_008 (ui_overlay_status) は本人の主観 UI 用。外部世界からの fact 報告には公的書類・news UI が必要
- **trigger conditions**: bible.subtype = "external_social" OR "hybrid" AND beat ∈ {public_recognition, news_coverage, official_registration} AND story_event_just_happened

### pat_017_bubble_panel_power_2
- **頻度**: rare (1/38)
- **panel_count**: 2
- **shape_mix**: 楕円/雲形の bubble 形状 panel + rect
- **size_hierarchy**: extreme
- **典型 page_role**: power_activation / supernatural
- **特徴**: 技名・スキル名発動の panel が吹き出し型に変形
- **観察pages**: 0040

**purpose (なぜこのコマ割りか)**:
- **narrative_function**: skill_activation_signature — スキル/特殊能力の発動を「panel 形状自体が変形する」レベルで象徴化。シリーズ通しての decisive moment 印
- **reader_effect**: panel の形状変化が「現実の物理が歪んだ」感覚を生む。スキル名の重要性を視覚的に最大化
- **why_this_shape**: rect panel + 効果線でも skill activation は表現可能だが、「世界の規則がここで変わる」感覚には panel 自体が変形する必要。bubble 形状は「魔力が膨張する」連想
- **匹敵する代替手段の不採用理由**: pat_008 (ui_overlay) はゲーム的 UI 主体、こちらは「世界そのものの変容」用。pat_018 (diagonal_skewed) と近いが、diagonal は「不安定」、bubble は「能動的発動」のニュアンス
- **trigger conditions**: page_role = "power_activation" AND skill.first_activation = true OR skill.is_signature = true AND visual_drama_priority = high

### pat_018_diagonal_skewed_panel_2
- **頻度**: rare (1/38)
- **panel_count**: 2
- **shape_mix**: 斜めに傾いた長方形 panel (パース表現)
- **size_hierarchy**: extreme
- **典型 page_role**: reveal_supernatural / hook
- **特徴**: 階段や扉が斜めに切られ、不安定感を演出
- **観察pages**: 0041

**purpose (なぜこのコマ割りか)**:
- **narrative_function**: ontological_disruption — 物理法則・空間の歪み (異世界出現・ダンジョン入口・超常現象) を panel 形状の傾きで示す
- **reader_effect**: 「世界が傾いた」「足場が消えた」生理的不安。subtype=gacha_ui のダンジョン入口や、現実→異世界遷移の敷居を視覚化
- **why_this_shape**: 直立 rect は「現実」のメタファー。傾けることでだけ「現実が歪んだ」感覚が出る。content の傾きではなく panel border の傾きが重要
- **匹敵する代替手段の不採用理由**: pat_017 (bubble_panel) は能動的「発動」、こちらは受動的「異変・出現」。両者は異なる ontology shock 用
- **trigger conditions**: page_role ∈ {reveal_supernatural, dungeon_entry, dimension_shift} AND world_rule_violation_just_occurred AND single_dramatic_moment

### pat_019_monster_silhouette_bleed_3
- **頻度**: medium (2/38)
- **panel_count**: 3
- **shape_mix**: 大 atmospheric panel に **monster silhouette が境界を越えてbleed** + reaction rect
- **size_hierarchy**: extreme
- **典型 page_role**: cliffhanger / boss_reveal
- **特徴**: 速度線・縦線・SFX大文字との合わせ技、boss登場時の定型
- **観察pages**: 0151, 0126

**purpose (なぜこのコマ割りか)**:
- **narrative_function**: threat_reveal — boss・敵キャラ・脅威の存在を「panel に収まらない」サイズで示し、読者の continue_reading 動機を最大化
- **reader_effect**: 「panel から飛び出している = panel では捉えきれない強さ」と読者は理解する。次話を読まずにいられない引き
- **why_this_shape**: silhouette + bleed が必須。silhouette は「全貌は次話まで隠す」こと、bleed は「panel の枠を超える脅威」を意味する。両方揃って初めて次話 hook が成立
- **匹敵する代替手段の不採用理由**: pat_005 (full_bleed_single) で boss を見せると「全貌が分かりすぎ」次話 hook が弱い。silhouette + 下段 reaction の組合せが「謎+恐怖」を両立させる
- **trigger conditions**: page_role ∈ {cliffhanger, boss_reveal, threat_appearance} AND is_episode_end OR is_chapter_end AND threat.full_visual_should_be_hidden = true

### pat_020_radial_speedline_focus_3
- **頻度**: medium (3/38)
- **panel_count**: 1-3
- **shape_mix**: 全画面 or 大panel が放射状集中線
- **size_hierarchy**: extreme
- **典型 page_role**: climax_scale / world_reveal
- **特徴**: 中央一点集中の構図、bird's eye または対峙
- **観察pages**: 0103, 0040 (下段), 0106 (右hero)

**purpose (なぜこのコマ割りか)**:
- **narrative_function**: focal_climax — 「すべての視線・力・関心が一点に集まる」瞬間を放射状集中線で象徴。多人数が hero に殺到する/世界の中心が hero/迷路の中心など
- **reader_effect**: 視線が放射線に沿って中心に強制的に引き込まれる。読者の眼球運動を物理的に支配して focal point に同期させる
- **why_this_shape**: diagonal speedline (pat_010) は「動きの方向」を示す。放射状は「動きの収束点」を示す。意味が異なる。pat_005 の full bleed と組み合わせ可能だが、放射線はそれ単体で focal energy が強い
- **匹敵する代替手段の不採用理由**: pat_005 (full_bleed) は「全景見渡し」、こちらは「一点集中」。空間スケール提示と異なり、 climax energy の収束には放射線が固有
- **trigger conditions**: page_role ∈ {climax_scale, focal_moment, all_eyes_on_hero, maze_center} AND single_focal_target AND energy_convergence_required

### pat_021_screentone_info_anchor_5
- **頻度**: medium (2/38)
- **panel_count**: 5
- **shape_mix**: 中央に **網点トーン背景の panel + 大 caption box** + 周囲に rect 散在
- **size_hierarchy**: medium
- **典型 page_role**: information_dump / dictionary
- **特徴**: 設定説明、ドット背景、caption boxが panel と分離して情報レイヤーになる
- **観察pages**: 0121, 0017 (派生)

**purpose (なぜこのコマ割りか)**:
- **narrative_function**: lore_anchoring — 1テーマ (1アイテム・1ルール・1スキル) の解説を中央 panel に anchor し、周囲のキャラ会話で「なぜこの情報が今出てきたか」の文脈を添える
- **reader_effect**: 「これは記憶しておくべき情報」というシグナル。ドット背景が「設定資料っぽさ」を出し、読者は雑誌の解説コラムを読むように受信する
- **why_this_shape**: 中央 anchor + 周囲会話の組合せは pat_006 (pure_dialogue_dump) より「物語の流れに溶け込ませた解説」を可能にする。pure dump よりリズムを止めない
- **匹敵する代替手段の不採用理由**: pat_007 (information_dense) は複数項目並列、pat_006 は純台詞 dump。「1テーマの図解 + 流れの中の言及」には pat_021 が固有に向く
- **trigger conditions**: page_role ∈ {information_dump, lore_introduction, single_topic_explanation} AND topic_count = 1 AND has_ambient_dialogue AND visual_anchor_image_available

### pat_022_aftermath_triumph_5
- **頻度**: rare (1-2/38)
- **panel_count**: 5
- **shape_mix**: 右に大hero panel(放射爆発) + dialogue 散在
- **size_hierarchy**: extreme
- **典型 page_role**: triumph / aftermath
- **特徴**: ガッツポーズ系、多数dialogue が panel 残面を埋める
- **観察pages**: 0106

**purpose (なぜこのコマ割りか)**:
- **narrative_function**: tension_release — 緊張・苦戦の直後、勝利・解放の瞬間を「hero の感情爆発 + 周囲のリアクション群」で表現
- **reader_effect**: 「緊張→解放」のカタルシス。読者は hero と一緒に達成感を体験する
- **why_this_shape**: hero panel を縦長大コマにするのは「彼の感情が舞台の主役」と示すため。周囲の小コマ dialogue は祭りの賑やかさを足し算する
- **匹敵する代替手段の不採用理由**: pat_003 (extreme_hero_action) は「動作の決定瞬間」用、こちらは「事後の感情解放」用。両者は時系列で隣接するが purpose が異なる
- **trigger conditions**: page_role ∈ {triumph, aftermath, victory} AND preceded_by_struggle_or_action AND multiple_witnesses_or_party_members AND emotion = "release"

### pat_023_index_decoration
- **頻度**: rare (2/38)
- **panel_count**: 0-1
- **shape_mix**: テキスト組版主体 + 装飾的キャラ画像
- **page_role**: 目次 / 章扉 / 巻末扉 / 奥付
- **観察pages**: 0002, 0003, 0150, 0155

**purpose (なぜこのコマ割りか)**:
- **narrative_function**: structural_anchoring — 物語の構造 (目次・章境界・終端) を読者に「ここで切れる」と明示する非物語ページ
- **reader_effect**: 物語のリズム制御。章扉で読者は「区切り」を実感し、再開時の cognitive load を減らす
- **why_this_shape**: panel 分割が消えてテキスト組版が主役になることで「これは物語ではない」と即座に信号化される
- **匹敵する代替手段の不採用理由**: pat_005 (full_bleed) はビジュアルが主役、こちらはテキスト組版が主役。役割が異なる
- **trigger conditions**: page_role ∈ {table_of_contents, chapter_door, ending_door, colophon} AND not_part_of_main_narrative

### pat_024_temporal_compression_strip_4
- **頻度**: rare (1/38)
- **panel_count**: 4-7
- **shape_mix**: 下段に細い rect strip タイルが並び、時間経過を表現
- **size_hierarchy**: medium + flat
- **典型 page_role**: time_compression / montage
- **特徴**: 同キャラ+異なる時刻、SFX切替で時間圧縮
- **観察pages**: 0127

**purpose (なぜこのコマ割りか)**:
- **narrative_function**: time_compression — 同一キャラの連続行動 (試行錯誤・段階作業・繰り返し) を細い strip で連結し、長い時間を1ページに圧縮
- **reader_effect**: 「時間が早送りされた」感覚。重要でないが省略もできない経過を読者にコンパクトに渡す
- **why_this_shape**: 細い strip が連続することで「フィルムのコマ送り」連想を生み、時間の流れが視覚化される。同サイズで並べることが重要 (extreme hierarchy にすると圧縮ではなく強調になる)
- **匹敵する代替手段の不採用理由**: pat_012 (horizontal_strip) は並列同時の同等性、こちらは連続時間の圧縮。読み順が「同時」か「順番」かで使い分け
- **trigger conditions**: page_role ∈ {time_compression, montage, trial_and_error_sequence} AND same_actor_repeated_action AND time_passage ≥ several_minutes_or_more

### pat_025_zigzag_dialogue_5
- **頻度**: medium (5/68 ≒ 7%)
- **panel_count**: 5
- **shape_mix**: 全rect、段ごとに左右非対称サイズで zigzag
- **size_hierarchy**: medium
- **典型 page_role**: dialogue / banter / buildup
- **特徴**: テンポ良いキャラ間の小ボケ・小ツッコミ。短文応酬で吹き出しが panel 半分以下
- **観察pages**: 0010, 0014, 0073, 0094, 0124

**purpose (なぜこのコマ割りか)**:
- **narrative_function**: stichomythia_rhythm — 短い台詞応酬 (ボケ vs ツッコミ、質問 vs 即答) の「テンポ感」を panel サイズの非対称で視覚化
- **reader_effect**: 読者の視線が「左→右→左→右」と zigzag に走り、短文応酬を「弾むリズム」で受け取る。pat_001 (3tier flat) よりテンポ感が強い
- **why_this_shape**: 各段で左右どちらが大きいかを変えることで、視線が「次の発話者へジャンプ」する誘導が成立。size 非対称が conversation 主体の交代を絵で示す
- **匹敵する代替手段の不採用理由**: pat_001 (3tier_dialogue) は size_hierarchy が flat-medium で「均等な進行」を演出するが、stichomythia (短文応酬) では「主体の交代」が読み取りにくい。zigzag のほうが交代リズムが伝わる
- **trigger conditions**: page_role∈{dialogue,buildup,banter} AND speaker_count≥2 AND rhythm=stichomythia AND panel_count=5

### pat_026_explosive_top_calm_bottom_5
- **頻度**: medium (3/68)
- **panel_count**: 5
- **shape_mix**: 上段atmospheric explosion (panel境界消失) + 下段rect calm dialogue
- **size_hierarchy**: extreme (上段が圧倒的)
- **典型 page_role**: action_attack / shock_release
- **特徴**: 上段で爆発・崩落・絶叫 (atmospheric+SFX多用) → 下段は静かなrect dialogue。緩急コントラスト
- **観察pages**: 0013, 0028, 0064

**purpose (なぜこのコマ割りか)**:
- **narrative_function**: tonal_shift_in_one_page — 「動 → 静」または「絶叫 → 沈黙」の感情コントラストを1ページで完結させる。pat_022 (triumph) と異なり「動の続きが静で残響する」設計
- **reader_effect**: 読者は上段で感情が高揚 → 下段で静まる「呼吸」を体験する。緊迫の後で安全に着地する感覚
- **why_this_shape**: 上段atmospheric が「panel に収まらない動」、下段rectが「収まる静」と panel 形状自体が緩急を視覚化。同サイズ rect 5コマでは緩急が伝わらない
- **匹敵する代替手段の不採用理由**: pat_003 (extreme_hero_action) は「動だけ」のpage、pat_001 (3tier dialogue) は「静だけ」のpage。両方を1ページで切り取るには上下の atmospheric/rect 切替が固有に必要
- **trigger conditions**: page_role∈{action_attack,buildup} AND has_explosive_top_beat AND has_calm_dialogue_bottom AND panel_count=5

### pat_027_item_spotlight_reveal_5
- **頻度**: medium (3/68)
- **panel_count**: 5
- **shape_mix**: 中央のアイテムが atmospheric burst (放射光)、周囲は rect dialogue
- **size_hierarchy**: extreme (中央item突出)
- **典型 page_role**: loot / item_introduction / reveal
- **特徴**: D缶/魔石/結晶などの戦利品をスポットライト。subtype=gacha_ui の loot moment
- **観察pages**: 0018, 0079, 0123

**purpose (なぜこのコマ割りか)**:
- **narrative_function**: loot_drop_moment — ガチャ排出/宝箱開封/魔石発見の「アイテム獲得快感」を視覚化。なろう系のドーパミン報酬体験
- **reader_effect**: アイテムが「光って floating している」感覚。読者は「自分も手に入れた」体験的快感を得る
- **why_this_shape**: 中央 panel に放射光 atmospheric を組み合わせるのが必須。rect grid ではアイテムが「ただの絵」止まり、放射光atmospheric で「物語的に重要な物」と signal化される
- **匹敵する代替手段の不採用理由**: pat_008 (ui_overlay_status) は数値情報用、pat_021 (screentone_info_anchor) は説明文用。アイテムの「絵としての魅力」と「獲得快感」を出すにはspotlight burst が要る
- **trigger conditions**: page_role∈{loot,item_introduction,reveal} AND has_glowing_artifact_centerpiece AND panel_count=5 AND bible.subtype∈{gacha_ui,hybrid}

### pat_028_status_inset_action_5
- **頻度**: medium (2/68)
- **panel_count**: 5
- **shape_mix**: 上段にUIstatus + 中段action atmospheric + 下段reaction grid
- **size_hierarchy**: extreme
- **典型 page_role**: level_up / power_check / action_with_growth
- **特徴**: アクション中にステータス画面が浮き、数値変動と動作を1ページに同居。subtype=gacha_ui の中核
- **観察pages**: 0064, 0119

**purpose (なぜこのコマ割りか)**:
- **narrative_function**: numeric_growth_during_action — レベルアップやスキル取得を、戦闘・アクションシーンに直接接続。読者にRPG的な「数値で成長を確認しながら戦う」体験を与える
- **reader_effect**: 「強くなった」体感が action と数値の同居で増幅。pat_008 (ui_overlay_status) より物語前進感が強い
- **why_this_shape**: status panel と action panel を分離せずに同ページで切替えると「数値が上がった→直後に効果が出る」因果が視覚化される。subtype=gacha_ui で必要不可欠
- **匹敵する代替手段の不採用理由**: pat_008 は status 確認だけ (静)、pat_003 は action だけ (動)。両者を別ページにすると因果が薄れる。1ページで因果を結ぶには inset 構造が必要
- **trigger conditions**: bible.subtype∈{gacha_ui,hybrid} AND page_role∈{level_up,action_with_growth} AND has_status_inset AND panel_count=5

### pat_029_memory_flashback_inset_5
- **頻度**: medium (2/68)
- **panel_count**: 5
- **shape_mix**: 現在rect + 中央に memory inset 小rect群 (screentone+sparkle背景)
- **size_hierarchy**: medium
- **典型 page_role**: flashback / character_history / relationship_reveal
- **特徴**: 現在の dialogue 途中に過去 memory panel (丸角 or screentone) を挿入。現在↔過去往復
- **観察pages**: 0028, 0089

**purpose (なぜこのコマ割りか)**:
- **narrative_function**: temporal_layering — 現在の感情に過去の記憶が重なっていることを視覚化。関係性・キャラ history・主観時間
- **reader_effect**: 「キャラの頭の中で過去が蘇っている」感覚。読者は時系列を整理しながらキャラ心理に共感する
- **why_this_shape**: memory panel を screentone+sparkle 背景にして「現在 panel と質感を変える」ことが必須。同質感だと時間混在が伝わらない。 inset で挿入するのは「現在の流れの中で記憶がフラッシュ」する感覚を作るため
- **匹敵する代替手段の不採用理由**: 別ページに flashback を分離すると「物語の流れが切れる」感覚になる。1ページに重ねることで「今もそれを思い出している」現在進行を維持
- **trigger conditions**: page_role∈{flashback,character_history,relationship_reveal} AND has_memory_panels AND visual_distinction (screentone/round_corner) AND panel_count=5

### pat_030_polygon_slash_combat_4
- **頻度**: rare-medium (2/68)
- **panel_count**: 3-4 (内 panel 境界が斜め切り欠き)
- **shape_mix**: polygon (斜め境界), 刃の軌跡で panel が分断される
- **size_hierarchy**: extreme
- **典型 page_role**: action_combat / decisive_strike / blade_skill
- **特徴**: 刃軌跡=panel境界、隣接切り欠き、強烈speedline+SFX
- **観察pages**: 0137, 0154

**purpose (なぜこのコマ割りか)**:
- **narrative_function**: blade_geometry — 剣技/魔法剣の決定瞬間を、刃の軌跡そのものが panel grid を切り裂く形で表現。pat_010 (diagonal_speedline) が「動きの方向」、こちらは「刃が空間を切る」物理性
- **reader_effect**: panel grid が刃に切られる = 読者は「物語空間そのものが斬撃された」感覚。緊張の頂点
- **why_this_shape**: rect grid では「刃が画面を切った」感覚は出ない。polygon (斜め境界の隣接切り欠き) でしか blade gestalt が成立しない
- **匹敵する代替手段の不採用理由**: pat_003 (extreme_hero_action) も決め技用だが、こちらは「刃技の象徴化」がテーマ。polygon panel が必須なため別 archetype として独立
- **trigger conditions**: page_role∈{action_combat,decisive_strike,blade_skill} AND shape_mix.has_polygon=true AND effect_lines=dense

### pat_031_sns_thread_artifact_4
- **頻度**: rare-medium (3/68)
- **panel_count**: 3-4
- **shape_mix**: SNS/掲示板/tablet UI artifact panel + 周囲rect dialogue
- **size_hierarchy**: medium-large
- **典型 page_role**: external_validation / research / world_buzz
- **特徴**: SNS投稿/スレッド/tablet news UI が panel そのもの。subtype=external_social の中核
- **観察pages**: 0034, 0073, 0123, 0129, 0142

**purpose (なぜこのコマ割りか)**:
- **narrative_function**: external_world_validation_via_social — pat_016 (news_artifact) と近いが、SNS/掲示板/個人投稿など「素人の声」を強調する。ヒット作の「世間がざわつく」体感
- **reader_effect**: 「世間がリアルタイムで反応している」感覚。なろう系で「主人公がバズった」「事件が外部にも知られている」を伝達
- **why_this_shape**: SNS UI を panel に採用すると、読者は「キャラと一緒にスマホ画面を見ている」一人称体験になる。caption で「ネットでバズった」と書くだけでは弱い
- **匹敵する代替手段の不採用理由**: pat_016 はマス media 公式 (news/書類) 用、こちらは bottom-up SNS。pat_008 は本人主観 UI 用。情報の発信源によって使い分ける
- **trigger conditions**: bible.subtype∈{external_social,hybrid} AND page_role∈{external_validation,research,world_buzz} AND has_thread_or_post_artifact

### pat_032_chapter_title_overlay_full_1
- **頻度**: rare (2/68)
- **panel_count**: 1 (full bleed)
- **shape_mix**: full bleed action + chapter title plate floating
- **size_hierarchy**: -
- **典型 page_role**: chapter_opening_action / title_drop
- **特徴**: 章タイトル plate を full bleed action panel に重ねる開幕
- **観察pages**: 0086, 0134

**purpose (なぜこのコマ割りか)**:
- **narrative_function**: chapter_drop_dynamic — 章開幕を「動的シーン+タイトル plate」で行う。pat_005 (静的扉) より動的、pat_023 (テキスト主体扉) より演出的
- **reader_effect**: 章開始の宣言を物語の流れに溶かし込む。「ここから新章=動が始まる」signal を絵と組版で同時に伝達
- **why_this_shape**: 通常の章扉 (pat_005/pat_023) は静止。動きのある章開幕には「絵 + タイトル」の重ね合わせが必要。映画でいう「クレジットがアクション中に出る」表現
- **匹敵する代替手段の不採用理由**: pat_023 (index_decoration) はテキスト主体。pat_005 (full_bleed_single) は絵主体だが title plate 込みではない。両者の合体形が独立 archetype として必要
- **trigger conditions**: page_role∈{chapter_opening_action,title_drop} AND has_chapter_title_plate AND has_dynamic_action AND panel_count=1

### pat_033_solitary_dread_isolation_1
- **頻度**: rare (2/68)
- **panel_count**: 1 (full bleed)
- **shape_mix**: 巨大空間 + 1人キャラ atmospheric
- **size_hierarchy**: -
- **典型 page_role**: isolation_dread / ominous_quiet / supernatural_alone
- **特徴**: 巨大空間にキャラ1人。reveal ではなく「誰もいない」ことそのものを描く
- **観察pages**: 0047, 0144

**purpose (なぜこのコマ割りか)**:
- **narrative_function**: existential_isolation — pat_005 (climax_reveal) と異なり「reveal するもの」がない。「誰もいない」 absence を描き、不安・孤独・超常を生み出す
- **reader_effect**: 静寂の圧迫感。「ここはどこだ」「人がいない」生理的不安。次の展開への緊張を生む
- **why_this_shape**: 1panel full bleed が必須。複数panelに割ると「ストーリーが進んでいる」感覚で不安が薄れる。人物を画面の小さく置き、空間が支配することで isolation が成立
- **匹敵する代替手段の不採用理由**: pat_005 (full_bleed climax reveal) は「世界の発見」、こちらは「世界の不在」。逆方向の感情なので同 archetype では分けられない。pat_004 (atmospheric_establishing) は下段に reaction を置くため孤独が薄まる
- **trigger conditions**: page_role∈{isolation_dread,ominous_quiet,supernatural_alone} AND scale=large_empty_space AND no_dialogue AND panel_count=1

### pat_034_pillarbox_cinematic_3
- **頻度**: rare (2/68)
- **panel_count**: 2-3 (上下に黒帯 or thin strip)
- **shape_mix**: cinematic wide rect + 上下黒帯 strip
- **size_hierarchy**: extreme (中央wide大)
- **典型 page_role**: establishing / transition / iconic_pose
- **特徴**: 映画的アスペクト比 wide rect + 上下黒帯。電車/通勤/移動 establishing
- **観察pages**: 0049, 0084

**purpose (なぜこのコマ割りか)**:
- **narrative_function**: cinematic_motion_establishing — 横移動 (電車/通勤/廊下) や iconic 立ち姿 を映画的 widescreen で表現。日常の特別感を演出
- **reader_effect**: 映画を観ているような distance/scale 感。日常 dialogue を pat_001 で続けた後にこれを差し込むと、「物語が映画化された瞬間」のような印象
- **why_this_shape**: 上下黒帯 (pillarbox) が cinematic 標識。これがないと通常の wide rect と区別がつかない。意図的に縦幅を削ることで「映画」signal が成立
- **匹敵する代替手段の不採用理由**: pat_004 (atmospheric_establishing) は「空間提示」で reaction も含む。こちらは「移動・通行・iconic」用で reaction を排し純粋に絵で見せる
- **trigger conditions**: page_role∈{establishing,transition,iconic_pose} AND aspect=cinematic_wide AND background_is_horizontal_motion AND no_reaction_strip

### pat_035_id_artifact_reaction_grid_5
- **頻度**: rare-medium (2/68)
- **panel_count**: 5
- **shape_mix**: 上段大ID証 artifact + 下段reaction grid
- **size_hierarchy**: extreme
- **典型 page_role**: registration / official_reveal / system_acceptance
- **特徴**: ID証/許可証/書類が大きく上段、下段に reaction を grid 並列
- **観察pages**: 0098, 0147

**purpose (なぜこのコマ割りか)**:
- **narrative_function**: official_system_acceptance — 制度・組織・国家に「キャラが正式登録された」事実を、書類の物理性で伝達。pat_016 (news) よりフォーマル
- **reader_effect**: 「主人公が公式システムに認められた」 reward。なろう系の「ステータスが社会に承認された」快感
- **why_this_shape**: ID証 artifact を上段に大きく配することで「主役は書類」と signal。下段 reaction grid で「周囲も認めた」並列感を作る
- **匹敵する代替手段の不採用理由**: pat_016 (news_artifact) は外部報道、pat_031 (sns_thread) は素人の声。公式書類による正規化には ID artifact が固有
- **trigger conditions**: page_role∈{registration,official_reveal,system_acceptance} AND has_official_document_artifact AND panel_count=5 AND bible.subtype∈{external_social,gacha_ui,hybrid}

### pat_036_emergency_action_walk_grid_5
- **頻度**: rare (2/68)
- **panel_count**: 5
- **shape_mix**: 上段叫び close + 中段establishing歩く + 下段reaction grid
- **size_hierarchy**: medium-large (中段establishing大)
- **典型 page_role**: action_emergency / warning / incident_unfolding
- **特徴**: 緊急が日常に侵入するリズム。「警告→歩行→反応」の3層
- **観察pages**: 0044, 0145

**purpose (なぜこのコマ割りか)**:
- **narrative_function**: tonal_intrusion — 日常の歩行 establishing に緊急叫びが重なる。pat_026 (explosive_top_calm_bottom) が「動→静」、こちらは「静の途中で動が割り込む」
- **reader_effect**: 「日常が突然壊される」signal。読者は次のページへの不安を持って続きを読みたくなる
- **why_this_shape**: 上段の close-up shouting と中段の establishing walking を「同じ pageに同居」させると、空間的に近接しているのに感情温度差が大きい不協和が生まれる
- **匹敵する代替手段の不採用理由**: pat_001 (3tier_dialogue) では緊急感が出ない。pat_010 (diag_speedline_combat) はそもそも全 page action 用。日常→緊急の境界には固有の構造が必要
- **trigger conditions**: page_role∈{action_emergency,warning,incident_unfolding} AND tonal_shift=daily_to_emergency AND panel_count=5

### pat_037_zoom_burst_dialogue_5
- **頻度**: medium (3/68)
- **panel_count**: 5
- **shape_mix**: 中央キャラradial burst atmospheric + 周囲small dialogue panels
- **size_hierarchy**: extreme (中央character突出)
- **典型 page_role**: realization / vow / transformation / triumph
- **特徴**: 中央に放射 burst でキャラを配し、周囲に小rect dialogue
- **観察pages**: 0028, 0078, 0107, 0117

**purpose (なぜこのコマ割りか)**:
- **narrative_function**: personal_focus_burst — pat_020 (radial_speedline_focus) が「世界全体が中心に集まる」 macro なら、こちらは「キャラ1人にズームイン+宣言」の intimate
- **reader_effect**: キャラの内的 conviction が爆発した瞬間と読者がシンクロする。「俺はやる」「私が守る」決意の場面
- **why_this_shape**: 中央キャラの背景に star/sparkle radial burst を atmospheric に置き、周囲に小 rect dialogue を散らすことで「キャラの感情頂点 + 周囲の証人」が両立
- **匹敵する代替手段の不採用理由**: pat_022 (aftermath_triumph) は事後の祭り、こちらは「宣言・決意」の最中。pat_020 は世界スケール、こちらは個人スケール
- **trigger conditions**: page_role∈{realization,vow,transformation,triumph_personal} AND central_burst_background AND surrounding_dialogue_panels AND panel_count=5

### pat_038_monster_bestiary_grid_5
- **頻度**: rare (2/68)
- **panel_count**: 5
- **shape_mix**: 上段にナンバリング silhouette grid (図鑑) + 下段に actual monster establishing
- **size_hierarchy**: extreme
- **典型 page_role**: enemy_briefing / bestiary / encounter_intel
- **特徴**: 番号付き silhouette タイル → 実物 establishing への流れ
- **観察pages**: 0099, 0124

**purpose (なぜこのコマ割りか)**:
- **narrative_function**: information_to_reality_bridge — pat_007 (information_dense) が並列カタログ、pat_021 (anchor) が単一テーマ図解、こちらは「情報→実物の遭遇」階層構造を持つ
- **reader_effect**: 上段で「これから出会う敵」を予習し、下段で実物に出くわす緊張。RPGの bestiary を読んだ直後にエンカウントする体感
- **why_this_shape**: 上段のナンバリング silhouette tile と下段の atmospheric monster を上下に並べることで「メタ情報 → 物理現実」の流れが視覚化。逆順 (実物→図鑑) では情報の感動が薄まる
- **匹敵する代替手段の不採用理由**: pat_007 は並列カタログ (実物との接続なし)。pat_021 は単一テーマ説明。「情報→実物」の橋渡しには独立 archetype が必要
- **trigger conditions**: page_role∈{enemy_briefing,bestiary,encounter_intel} AND has_numbered_monster_panels AND has_real_monster_below AND panel_count=5

## 横断観察

サンプル N = 68 (混入除く 64 を実分母として計算)。 **拡張パス2 (2026-05-06) 追加観察**:

- **archetype 数**: 24 → **38** (新規14個追加)
- **n=5 archetype 数**: 4 → **13** (pat_001/pat_021/pat_022/pat_024 の既存に加え、pat_025/026/027/028/029/035/036/037/038 を追加)
- **斜めコマ・斜め分断・斜め歪み・polygon panel**: 約 13% (page_0086, 0041, 0023, 0111, 0137, 0154) — pat_002/pat_018/pat_030 の3 archetype でカバー
- **L字・嵌込 panel**: 約 8% (page_0145, 0127, 0089) — pat_011/pat_029 でカバー
- **atmospheric (panel境界が背景に溶ける/消失)**: 約 55% — 拡張サンプルでも前回比率を維持。**商業漫画の標準ツールであることを再確認**
- **bubble breakout**: 約 90% (ほぼ全頁)
- **効果線・モーション線・集中線**: 約 60%
- **size_hierarchy が extreme なページ**: 約 53% — 半分以上 (前回 50% から微増)
- **size_hierarchy が medium のページ**: 約 39%
- **size_hierarchy が flat のページ**: 約 8% (3並列ストリップ系のみ)
- **3-tier rect standard**: 約 21%
- **diegetic artifact (UI/書類/看板/SFX大文字/SNS thread/tablet UI/ID証)**: 約 30% — pat_008/pat_015/pat_016/pat_021/pat_031/pat_035 でカバー (前回 24% から増加)
- **floating文字 (panel外SFX、巨大背景文字、章タイトル plate)**: 約 48%
- **章境界・扉・装飾ページ**: 約 11%
- **panel_count 別分布 (sampled 68 pages)**:
  - n=1 (full bleed): 約 11% (cover, 章扉, isolation, monster reveal, chapter title overlay)
  - n=2: 約 13% (cinematic, hero action, two-shot iconic, bubble panel)
  - n=3: 約 20% (close emotion, atmospheric establishing, dialogue dump)
  - n=4: 約 25% (3tier dialogue 派生, l-shape inset, info-dense)
  - n=5: 約 20% (3tier dialogue, zigzag, item spotlight, status inset, memory inset, etc.)
  - n=6+: 約 11% (information dense complex, time compression strip)
- **page_role 別分布 (sampled 68 pages)**: dialogue/buildup 系 約30%, action 系 約20%, reveal/emotion 系 約15%, world/establishing 系 約10%, info dump 系 約8%, character/iconic 系 約7%, ui/external 系 約7%, 章境界 約3%
- **subtype 別分布 (sampled 68 pages)**: gacha_ui-required 約 25%, external_social-required 約 12%, hybrid (両方含む) 約 8%, neutral 約 55%

## purpose 傾向 (横断)

24 archetype の purpose を集計し、mapper-v4 が「どの narrative_function に偏っているか」を把握できるようにする。

### narrative_function 別頻度 (archetype 単位カウント)

| 順位 | narrative_function | 該当 archetype 数 | 該当 |
|---|---|---|---|
| 1 | dialogue_progression / information_dump 群 | 6 | pat_001, pat_006, pat_007, pat_015, pat_021, pat_023 |
| 2 | action_impact / continuous / triumph 群 | 4 | pat_003, pat_010, pat_011, pat_022 |
| 3 | character_or_threat_reveal 群 | 3 | pat_002, pat_013, pat_019 |
| 4 | emotion_peak / thought_externalization | 2 | pat_009, pat_014 |
| 5 | scene_transition / spectacle_reveal | 2 | pat_004, pat_005 |
| 6 | ui / external_validation (subtype-driven) | 2 | pat_008, pat_016 |
| 7 | ontological_disruption / activation | 2 | pat_017, pat_018 |
| 8 | parallel / temporal_compression | 2 | pat_012, pat_024 |
| 9 | focal_climax | 1 | pat_020 |

**観察**: dialogue/info 系 (6) と action 系 (4) の合計が全体の 42%。商業漫画は「会話で進めて action で爆発させる」基本リズムを pattern 数の偏りでも示している。

### reader_effect 別の組み合わせ

- **緊張 → 解放 (catharsis)**: pat_003 → pat_022, pat_019 → pat_009 → 次話で pat_003 へ繋ぐ
- **静 → 動 (still → motion)**: pat_004 (atmospheric establishing) → pat_010 (combat) / pat_005 (full bleed reveal) → pat_010
- **遅 → 速 (rhythm shift)**: pat_001 (3tier) → pat_003 / pat_011 (action compression)
- **客観 → 主観**: pat_001 (3tier dialogue) → pat_009 (close emotion) または → pat_014 (text overflow)
- **未知 → 既知の更新**: pat_018 (skewed reveal) → pat_008 (UI status) で「世界が変わって、ステータスにも反映された」流れ
- **個 → 集団**: pat_003 (hero solo) → pat_022 (triumph with party) で勝利共有
- **収束 → 衝突**: pat_020 (radial focus) → pat_019 (silhouette bleed) で「全員集合した先に脅威」

### subtype 別 pattern 集中

- **subtype = gacha_ui**: pat_008, pat_017, pat_018, pat_021 が必須群
- **subtype = external_social**: pat_016, pat_004, pat_001 が必須群
- **subtype = hybrid**: 両群を要所に挿入。比率は bible.meta.subtype_weight で決める

## Pattern dictionary 設計への示唆

仮説検証結果と、pattern dictionary に最低限必要なスキーマ要件:

1. **panel shape は rect/diagonal/L/polygon/atmospheric の 5種類で 95% カバーできる**
   - polygon は実質「斜め分断1panel化」(pat_002) と「斜め歪みrect」(pat_018) の2形に集約。複雑な multi-vertex polygon は今回の作品では出現せず、pipeline-v2 で polygon が必須かは要再検討
   - 一方で atmospheric (境界線が背景に溶ける) が **53%** で出現するため、**現行 page-mapper-v3 の rect 固定路線は商業品質を再現できない**

2. **size_hierarchy を3段階 (extreme / medium / flat) で持つ必要がある**
   - サンプルの 50% が extreme。flat は時間圧縮と均等並列の特殊ケースのみ
   - mapper-v4 は **importance を直接 area に変換するのではなく、archetype 選択時に size_hierarchy を決め打ちする** のが妥当

3. **atmospheric flag は panel ごとに必須**
   - bool では足りず、`atmospheric: { mode: "edge_fade" | "background_dissolve" | "silhouette_bleed" | "none", direction?: "top"/"bottom"/... }` 程度の解像度が必要

4. **bubble_breakout は default true、breakout 0 は装飾ページの signal**
   - スキーマで breakout を許容しないと商業品質に届かない

5. **floating layer (panel外SFX、巨大背景文字、icon overlay) を独立レイヤーで管理**
   - panel grid と別レイヤーで lay out する設計が必要。現状の page-mapper-v3 にはレイヤー概念がないので追加要

6. **archetype を page_role と紐付ける**
   - mapper が storyboard の page_role を読んで archetype を選択する設計にすれば、自動選択精度が上がる
   - 役割→候補archetype のマッピング例:
     - `establishing` → pat_004, pat_005
     - `dialogue` → pat_001, pat_006
     - `action_attack` → pat_003, pat_010
     - `cliffhanger` → pat_002, pat_019, pat_018
     - `reveal/emotion` → pat_009, pat_014
     - `info_dump` → pat_006, pat_007, pat_021
     - `boss_reveal` → pat_019, pat_005
     - `triumph` → pat_022, pat_020
     - `power_activation` → pat_008, pat_017

7. **diegetic artifact (pat_016) を別カテゴリで持つ**
   - UI/書類/看板/SFXが panel そのものになるケースが 24%。これは「画像生成での描写」より「組版での合成」が向くため、pipeline で別パスを切るべき

8. **3並列 strip (pat_012) と斜め分断 (pat_002) は L1.4 で polygon を扱う動機**
   - 上記2 pattern は rect grid では再現不可能。少数頻度だが商業漫画の symbolic moment に使われるため、polygon サポートを完全には捨てられない

9. **章境界・扉・奥付は archetype dictionary とは別管理**
   - pat_005 / pat_023 はテンプレ的に決まる。メインの「物語ページ」 archetype とは別ファイルで持つ

10. **エフェクト密度 (effect_lines) を archetype の必須属性にする**
    - sample の 58% が効果線あり。none/sparse/dense の3段階で archetype に持たせ、画像生成 prompt に反映すべき

## 開けなかった/壊れた pages

- **page_0061**: iPad UI スクリーンショット混入 (pages のインデックスが 1ページぶれている可能性。pipeline 上流で除外要)
- **page_0156**: iPad 制御センター混入 (最終ページの代わりに UI が入った状態)

## 補足: archetype 命名一覧

```
pat_001_3tier_dialogue_5
pat_002_diag_split_two_shot_1
pat_003_extreme_hero_action_2
pat_004_atmospheric_establishing_2
pat_005_full_bleed_single
pat_006_pure_dialogue_dump_3
pat_007_information_dense_complex
pat_008_ui_overlay_status
pat_009_extreme_close_emotion_3
pat_010_diag_speedline_combat_3
pat_011_l_shape_inset_5
pat_012_horizontal_strip_focus_3
pat_013_two_shot_iconic_2
pat_014_atmospheric_text_background_4
pat_015_label_strip_decor_4
pat_016_news_artifact_3
pat_017_bubble_panel_power_2
pat_018_diagonal_skewed_panel_2
pat_019_monster_silhouette_bleed_3
pat_020_radial_speedline_focus_3
pat_021_screentone_info_anchor_5
pat_022_aftermath_triumph_5
pat_023_index_decoration
pat_024_temporal_compression_strip_4
# --- 拡張パス2 (2026-05-06) 追加 ---
pat_025_zigzag_dialogue_5
pat_026_explosive_top_calm_bottom_5
pat_027_item_spotlight_reveal_5
pat_028_status_inset_action_5
pat_029_memory_flashback_inset_5
pat_030_polygon_slash_combat_4
pat_031_sns_thread_artifact_4
pat_032_chapter_title_overlay_full_1
pat_033_solitary_dread_isolation_1
pat_034_pillarbox_cinematic_3
pat_035_id_artifact_reaction_grid_5
pat_036_emergency_action_walk_grid_5
pat_037_zoom_burst_dialogue_5
pat_038_monster_bestiary_grid_5
```

## Pattern 選択ガイド (mapper-v4 向け仕様提案)

### 入力 → 推奨 pattern

| storyboard signal | 推奨 archetype |
|---|---|
| page_role=cover | pat_005_full_bleed_single |
| page_role=table_of_contents OR colophon | pat_023_index_decoration |
| page_role=opening_hook + panel_count=1 | pat_005_full_bleed_single (ジャンル mood に応じて pat_004_atmospheric_establishing も可) |
| page_role=establishing + new_location | pat_004_atmospheric_establishing_2 |
| page_role=world_climax_reveal + scale=world | pat_005_full_bleed_single + pat_020_radial_speedline_focus_3 (組合せ可) |
| page_role=character_introduction + first_appearance + main role | pat_013_two_shot_iconic_2 |
| page_role=fated_meeting + 2 characters + emotional_tension=high | pat_002_diag_split_two_shot_1 |
| page_role=action_attack + importance_max=5 + single_protagonist_focus | pat_003_extreme_hero_action_2 |
| page_role=action_combat + multiple_actors + duration_beats≥2 | pat_010_diag_speedline_combat_3 |
| page_role=action + simultaneous_reaction_required | pat_011_l_shape_inset_5 |
| page_role=triumph + preceded_by_struggle | pat_022_aftermath_triumph_5 |
| page_role=cliffhanger + boss_or_threat_reveal + episode_end | pat_019_monster_silhouette_bleed_3 |
| page_role=reveal + emotion_intensity≥4 + face_close_target | pat_009_extreme_close_emotion_3 |
| page_role=emotional_revelation + word_or_number_obsession | pat_014_atmospheric_text_background_4 |
| page_role=power_activation + signature_skill | pat_017_bubble_panel_power_2 |
| page_role=reveal_supernatural OR dimension_shift | pat_018_diagonal_skewed_panel_2 |
| page_role=focal_climax + energy_convergence | pat_020_radial_speedline_focus_3 |
| page_role=dialogue + text_volume=high + speaker≤3 | pat_006_pure_dialogue_dump_3 |
| page_role=dialogue + テンポ重視 + importance≤3 | pat_001_3tier_dialogue_5 |
| page_role=information_briefing + multi_item (≥4) | pat_007_information_dense_complex |
| page_role=lore_introduction + single_topic + has_anchor_image | pat_021_screentone_info_anchor_5 |
| page_role=dialogue + has_world_artifact (看板/ロゴ) | pat_015_label_strip_decor_4 |
| subtype=gacha_ui + status_check OR level_up | pat_008_ui_overlay_status |
| subtype=external_social + public_recognition | pat_016_news_artifact_3 |
| page_role=reaction_trio + actor_count=3 + flat hierarchy | pat_012_horizontal_strip_focus_3 |
| page_role=time_compression + same_actor_repeated_action | pat_024_temporal_compression_strip_4 |
| page_role=banter + stichomythia + speaker≥2 | pat_025_zigzag_dialogue_5 |
| page_role=action_attack + has_calm_dialogue_bottom (緩急) | pat_026_explosive_top_calm_bottom_5 |
| page_role=loot OR item_introduction + glowing_artifact + subtype=gacha_ui | pat_027_item_spotlight_reveal_5 |
| page_role=level_up + subtype=gacha_ui + has_status_inset | pat_028_status_inset_action_5 |
| page_role=flashback OR relationship_reveal + memory_inset | pat_029_memory_flashback_inset_5 |
| page_role=action_combat + blade_skill + has_polygon | pat_030_polygon_slash_combat_4 |
| page_role=external_validation + sns_thread_artifact + subtype=external_social | pat_031_sns_thread_artifact_4 |
| page_role=chapter_opening_action + has_dynamic_action | pat_032_chapter_title_overlay_full_1 |
| page_role=isolation_dread + large_empty_space + no_dialogue | pat_033_solitary_dread_isolation_1 |
| page_role=establishing OR transition + cinematic_wide aspect | pat_034_pillarbox_cinematic_3 |
| page_role=registration OR official_reveal + ID_artifact | pat_035_id_artifact_reaction_grid_5 |
| page_role=action_emergency + tonal_shift=daily_to_emergency | pat_036_emergency_action_walk_grid_5 |
| page_role=realization OR vow OR transformation + central_burst | pat_037_zoom_burst_dialogue_5 |
| page_role=enemy_briefing OR bestiary + numbered_silhouette + actual_monster_below | pat_038_monster_bestiary_grid_5 |

(全 40 行のテーブル)

### 設計上の決め事 (実証から)

- **atmospheric は単独ページではなく rect ページの間に挿入** すると最も効果的 (静の役割)。連続 atmospheric は読者の認知負荷が上がる
- **bubble breakout は 89% のページで発生**。pattern のオプションでなく「常時前提」で扱うべき。breakout=0 は signal として「装飾ページ・扉」を意味する
- **効果線・モーション線は action / emotion peak / 動作描写で必須**。それ以外では避ける (日常会話に効果線を入れると重さが出る)
- **size_hierarchy extreme は 50% のページに見られ、reveal / cliffhanger / action で特に多い**。dialogue では medium に留める。flat は parallel/temporal_compression のみ
- **斜めコマ単独は 11%**。pattern は polygon を持つべきだが、過剰投入禁物。1巻 (156p) で diagonal panel は 5-8 ページが上限目安
- **page_role が複数 trigger に該当する場合**、importance_max を tie-breaker として使う (高 importance = より dramatic な archetype 優先)
- **subtype-specific pattern (pat_008, pat_016) は subtype trigger が一致しないと選ばれない**。subtype=gacha_ui の作品で pat_016 を出すと不協和、逆も然り
- **連続ページの pattern 選択は前ページの reader_effect を考慮**: 「緊張 → 解放」「静 → 動」のリズム維持は archetype 並びで作る (例: pat_019 の次に pat_001 が来ると緩急が壊れる、pat_009 か pat_022 で解放を入れるべき)
- **chapter_door / cover / colophon は archetype dictionary の本流から外し、テンプレ管理**: pat_005 / pat_023 は物語アルゴリズムが選ぶのではなく、章構造から自動配置する

