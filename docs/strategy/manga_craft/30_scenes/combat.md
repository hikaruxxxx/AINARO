# 30. combat — 戦闘 (buildup / action / climax)

scene_id: `combat`
genres: `universal` (戦闘構造) + `dungeon-modern` `battle_dungeon` (装飾)
function: `mechanics` + `emotion`

戦闘シーンの作法。**buildup (接近・予兆) → action (動作分割) → climax (必殺技)**
の 3 段で組み立てる。各段の panel 構成と感情演出を本ファイルで一括管理する。

---

## L0 参照

- L0-1 (panel = 物語進行単位): 戦闘の 1 動作は **panel 単位で分割** する。
  「構え+中間動作+命中+結果」を 1 panel に詰めない
- L0-4 (静と動のリズム): 戦闘ページにも silence_panel を 1 つ入れる
  (構え panel が silence になる)

---

## 全体構造

戦闘 1 シーン = 3-5 ページ程度で以下を含む:

```
buildup (1-2 page)
  - 敵との対峙、構え、弱点描写、緊張
action (1-2 page)
  - 動作分割 3-5 panel
  - 効果音
climax (1 page)
  - 必殺技解放
  - 大コマ + エフェクト爆発
  - 主人公の覚醒表情
```

短い戦闘 (雑魚戦) は buildup と climax を省略可。長い戦闘 (ボス戦) は
buildup を 2-3 ページに引き伸ばす。

---

## L1 MUST

### 1. 動作の分割 (3-5 panel/動作)
1 つの動作は最低 3 panel、推奨 5 panel に分割する:

1. **構え or 接近** (panel 1)
2. **中間動作** (panel 2)
3. **命中の決定的瞬間** (panel 3, **大コマ**)
4. **結果・効果音** (panel 4)
5. **主人公表情 / 敵のリアクション** (panel 5)

これを省略して「主人公の攻撃 → 敵が倒れた」の 2 panel で済ませると、
読者は **アクションの実感** を持てない。

### 2. 効果音 (オノマトペ) 必須
動作・命中・結果に **必ず効果音を添える**:
- 「ガッ」(殴打)
- 「ドッ」(命中)
- 「ブシュ!」(切断)
- 「ヌルッ」(ぬめり)
- 「キン!」(警告・察知)

実装上は **ネーム段階で記録、F-2 page 生成では描かず、SVG 後付け** で重ねる
([feedback_manga_image_ingest.md](../../../.claude/projects/-Users-hikarumori-Developer-AINARO/memory/feedback_manga_image_ingest.md) 参照)。

### 3. RTL 順序の厳守
戦闘の動作分割は時系列が崩れると致命的。panel 番号と位置の対応を
storyboard で明示 ([feedback_rtl_reading_order_bug.md](../../../.claude/projects/-Users-hikarumori-Developer-AINARO/memory/feedback_rtl_reading_order_bug.md) 参照)。

---

## L2 SHOULD

### 1. 弱点描写
戦闘前 or 中盤で「弱点は ○○ の」のような明示で読者に **バトルロジック** を
伝える。これがないと、必殺技の「効いた / 効かなかった」が読者に伝わらない。

例:
- アイテム説明枠で弱点を提示
- 仲間の台詞「弱点は顎の…」で口頭で
- マスコットの解説「魔物 X の防御は背面が薄いよ☆」

### 2. 必殺技解放 = 大コマ
climax の必殺技は **ページの 50% 以上を占める大コマ** で表現。
エフェクト爆発・シルエットの強敵 → 主人公の覚醒姿。

例 (kindle-test-1 page_0154):
- 「2 時間に 1 回きりのとっておき」
- 「魔法」
- 「解放」
- (大コマ・主人公の必殺技)

### 3. buildup での silence_panel
戦闘前の構え panel は silence にすると緊張感が増す。
- 主人公の横顔クローズアップ
- 効果音・台詞なし
- 背景 60% 以上ピュアホワイト

### 4. 主人公の表情で勝敗を予告
- buildup: 厳しい表情・眼光
- action: 集中・無表情
- climax: 覚醒・解放感
- 戦闘後: 安堵 or 疲労

### 5. 敵のリアクションで強さを示す
強敵戦では敵側のリアクションも 1 panel 確保:
- 「これは…!?」(驚愕)
- 仲間敵の反応「あいつ、強くなってる…」
- 表情の崩れ (余裕 → 焦り)

---

## L3 MAY

### 1. 戦闘 SNS 反応
戦闘後に SNS / 配信 / ニュース速報で「○○が魔物を倒した」が拡散する panel。
`30_scenes/social_reaction.md` と組み合わせる。

### 2. ステータス画面更新
戦闘終了 → ステータス画面 panel 更新 (レベルアップ表示)。
`30_scenes/item_analysis.md` のステータス画面と整合。

### 3. 戦闘内会話
仲間との戦闘中の声掛け。「援護する!」「先に行け!」など。
ただし会話に時間を取られると緊張感が薄れるので、短い吹き出し連続で。

### 4. シルエット → クリアの変換
強敵を最初シルエットで提示 → 必殺技で照らされてクリアに見える、の演出。
panel 連結パターン 14 (シルエット → クリア)。

---

## 典型 panel 構成例

### パターン A: 短い戦闘 (1 ページで完結, 5-6 panel)
- panel 1 (upper-right, 大コマ): 主人公構え + 敵対峙の引き
- panel 2 (upper-left, 中ゴマ): 中間動作 (踏み込み)
- panel 3 (middle, 大コマ): 命中の決定的瞬間 + 効果音「ドッ!」
- panel 4 (middle-right, 中ゴマ): 結果 (敵が倒れる)
- panel 5 (bottom-left, 中ゴマ): 主人公の表情・独白
- panel 6 (bottom-right, 引き): 戦闘後の引き

### パターン B: ボス戦 buildup ページ
- panel 1 (upper, 大コマ): ボス登場の establishing (シルエット)
- panel 2 (middle-right): 主人公の構え (silence_panel・60% ピュアホワイト)
- panel 3 (middle-left): 仲間の解説台詞「弱点は顎の…」
- panel 4 (bottom-right): 主人公独白「やるしかない」(雲型)
- panel 5 (bottom-left): 敵の余裕の笑み

### パターン C: ボス戦 climax ページ
- panel 1 (upper-right, 中ゴマ): 主人公の覚醒表情
- panel 2 (large, ページの 60%, 大コマ): 必殺技解放 + エフェクト爆発
  + 効果音「解放!」「ドオオオオ!!」
- panel 3 (bottom, 引き): 結果 (敵がシルエット → 倒れる)

### パターン D: 戦闘後の余韻
- panel 1 (大コマ・引き): 戦闘跡地の establishing
- panel 2 (中ゴマ): 仲間の安堵
- panel 3 (中ゴマ): 主人公独白 (雲型)
- panel 4 (中ゴマ): SNS / ニュース速報 panel (任意)
- panel 5 (中ゴマ・引き): 次への展開

---

## 失敗パターン

- **動作 2 panel 圧縮**: 「攻撃する → 倒れた」では実感が伝わらない。
  最低 3 panel、推奨 5 panel
- **効果音なし**: 効果音省略は L1 違反。SVG 後付け前提でもネーム段階で記録
- **必殺技を中ゴマで**: climax の必殺技は **必ずページの 50% 以上の大コマ**。
  中ゴマで終わるとカタルシスが消える
- **弱点不明のままボス戦**: 読者は "ロジック不明な攻撃" を見せられて消化不良
- **戦闘ページに silence_panel なし**: 全 panel が動的だと目が疲れる。
  buildup の構え panel を silence にする
- **戦闘内会話過多**: 仲間との会話で 5 panel 使うと緊張感が消える。短い吹き出し
  連続で

---

## 参考実例

### subtype: external_social (kindle-test-1)

- **kindle-test-1 page_0150-0154**: 第 5 話最終戦闘 = ボス戦 climax の典型
- **kindle-test-1 page_0154**: 「2 時間に 1 回きりのとっておき」「魔法」「解放」
  + 大コマ必殺技

### subtype: gacha_ui (レベルガチャ Vol.1, 2026-05-06 確認)

- **レベルガチャ Vol.1 spread 5** (opening establishing): 主人公とスライムの
  初戦闘を 2 ページ見開きで提示。LEFT page = ナレーション + 主人公全身大コマ、
  RIGHT page = 戦闘 panel 3 つ「シュ-」「96 匹ッ!!」「フ"ンッ」 = 動作 3 分割
- **レベルガチャ Vol.1 spread 44** (中盤ゴブリン戦): 動作分割 4-5 panel/page を
  見開き 2 ページに広げて配置。RIGHT 側に対峙〜反撃 4 panel、LEFT 側に
  ドロップアイテム UI + 鑑定スキル発動 + 主人公 confidence
  - 対峙 panel と決定打 panel を別ページに割る **2 ページ見開き戦闘** パターン
  - 効果音オノマトペは「シュッ」「ギイッ!?」「パシュンッ」「!?」「ガッ」 = kindle-test-1 と類似
  - ドロップアイテム UI は **ribbon 型** (リボン状の枠 + 「ドロップアイテム」+ 「鉄のナイフ×1」)
    = kindle-test-1 の灰色矩形 + 異なる演出スタイル
  - 戦闘後の **鑑定スキル発動** = 主人公の手翳し + 「鑑定」!! 効果音 = 戦闘 → アイテム解析へのスムーズ移行

### 共通発見 (universal 確定)

- 動作分割 3-5 panel は kindle-test-1 / レベルガチャ 共通 = **dungeon-modern 共通の必須作法**
- 効果音オノマトペの頻度・スタイルも共通
- 弱点描写の明示は両作品で確認 (universal タグ強化)

### 差分 (subtype 別)

| 要素 | external_social | gacha_ui |
|---|---|---|
| 戦闘ページ単位 | 1 ページ完結が多い | 2 ページ見開き多用 |
| ドロップ UI | 灰色矩形 | ribbon 型 |
| 戦闘 → アイテム解析の繋ぎ | 戦闘終了 → ステータス画面 | 戦闘終了 → 鑑定スキル → ドロップ UI |
| 必殺技の頻度 | 1 巻に 1-2 回 | 雑魚戦でも装備差で押す (派手な必殺技は少ない) |

---

## storyboard-builder への注入

scene_type = `combat` の時 (universal):

```
- 戦闘の 1 動作は 3-5 panel に分割
  (1) 構え/接近 → (2) 中間動作 → (3) 命中の決定的瞬間 (大コマ) →
  (4) 結果+効果音 → (5) 主人公表情/敵リアクション
- 必殺技解放はページの 50% 以上の大コマで表現
- 効果音 (オノマトペ) を動作・命中・結果に必ず添える
  (画像生成では描かず、ネーム段階で記録、SVG 後付け前提)
- 弱点描写を戦闘前 or 中盤で明示 (台詞 or アイテム説明枠で)
- buildup の構え panel は silence_panel として 60% 以上ピュアホワイトに
- panel 番号と位置を必ずペアで記述 (RTL 順序維持のため)
- 主人公の表情を段階的に変化させる (buildup 厳しい → climax 解放)
```

`bible.subtype = gacha_ui` の場合追加で:

```
- 戦闘は **2 ページ見開きで表現** することを推奨。RIGHT 側 = 対峙〜反撃の動作分割、
  LEFT 側 = ドロップアイテム UI + 鑑定スキル発動 + 主人公 confidence
- ドロップアイテム UI は **ribbon 型** (リボン状の枠 + 「ドロップアイテム」+ 「アイテム名×個数」)
- 戦闘終了後の鑑定スキル発動 (手翳し + 「鑑定」!! 効果音) を panel に組込み、
  scene_type = item_analysis へのシームレスな繋ぎを作る
- 装備差 (甲冑 vs 雑魚) で押す戦闘が多く、必殺技の頻度は 1 巻に 0-1 回程度に抑制
```

戦闘ページが 3 枚連続するボス戦では、buildup / action / climax で
SHOULD の項目をそれぞれ強調する形でプロンプトを切り替える。
