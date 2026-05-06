# 00. 大原則と分類軸 (Manga Craft v3 root)

このファイルは新構造の **頂点** に位置する。各場面別モジュール (`30_scenes/`) と
ジャンル別差分 (`40_genres/`) は、ここで定義する 3 軸 (階層 / 場面 / ジャンル) の
いずれかのタグを必ず帯びる。タグ無し作法を書かないこと。

---

## 大原則 (L0)

これに違反した時点で、他の作法をどれだけ守っても作品は **C 級以下** に落ちる。
storyboard-builder / F-2 page_one_shot のシステムプロンプトに常時注入する。

### L0-1: panel = 物語進行単位

漫画は「シーンを羅列するパンフレット」ではない。各 panel は次のいずれか **1 つだけ** を運ぶ:

- 読者を物語に引き込む 1 つの感情ビート
- 次の panel への期待を作る情報・不安・予兆
- 主人公の感情・気付き・モノローグの 1 つ

複数を 1 panel に詰めると、どれも伝わらない。

### L0-2: ナレーション禁則

世界観・設定説明はキャラ同士の何気ない会話 / 視覚 UI / マスコットの問いかけで伝える。
専用ナレーション枠は **1 ページあたり 0-1 個まで**。これを超える時点で「読ませる」
ではなく「説明する」漫画になり、読者が脱落する。

**例外**: 以下の場面ではナレーション枠を **3-5 個まで許容** する:

1. **opening establishing 2 ページ見開き** (1 巻冒頭の世界観確立) — 大コマ +
   ナレーション枠で世界の前提を一気に提示
2. **章扉直後の復帰 establishing** — 前話からの状況を簡潔に説明
3. **アイテム解析 / ステータス画面 panel** — UI 要素扱いなので別レイヤー (L0-2 適用外)

レベルガチャ Vol.1 spread 5 で確認: 大コマ + ナレーション 4 個で「ダンジョン
ナンバー 777 / アンラッキーホール / 出現から 7 年目」の世界観確立。本編途中で
これを真似ると説明過多になり離脱。**冒頭 2 ページに集中** させること。

### L0-3: RTL 読み順を panel 番号と位置で明示

日本の縦書き漫画は右上→左下に進む。LLM は何も指示しないと LTR で解釈し、
コマ順序を破綻させる ([feedback_rtl_reading_order_bug.md](../../../.claude/projects/-Users-hikarumori-Developer-AINARO/memory/feedback_rtl_reading_order_bug.md))。
storyboard では `panel#1 = upper-right`, `panel#2 = upper-left` のように
**panel 番号と位置を必ずペアで** 記述する。

### L0-4: 静と動のリズム

各ページに **少なくとも 1 panel は背景の 50% 以上ピュアホワイト** (silence_panel)、
**少なくとも 1 panel は描き込みを増やしてフォーカルポイント** を作る。
全 panel が等密度のページは「読めるが弱い」B 評価で頭打ちになる。

### L0-5: 場所転換時の establishing 必須

シーンが切れたら、新シーンの最初の panel は必ずロケ全体の引きで「ここはどこ」を
読者に示す。establishing を省略すると、読者は次の panel から再構築するため
集中力が削がれる。

---

## 3 軸の分類規約

### 軸 1: 階層 (tier) — 順守度の優先順位

| tier | 定義 | 違反した時の影響 | 例 |
|---|---|---|---|
| **L0** | 大原則 | 違反 = 即 C 級以下 | panel = 物語進行単位、ナレーション禁則、RTL 読み順 |
| **L1** | MUST | 欠ける = B 級以下確定 | silence_panel、MINIMALISM、場所転換 establishing |
| **L2** | SHOULD | あると A 級確率上昇、無くても B+ 出る | 温度差ペア、派手 vs 地味、顔以外の部位で感情、戦闘の動作分割 |
| **L3** | MAY | 個別演出・ジャンル色付け | ステータス画面 panel、アイテム説明枠、章扉 panel、SNS panel |

storyboard 注入時は **L0 + L1 + 該当場面の L2/L3** を default、初稿生成では L3 を
削減して注意散漫化を避ける。

### 軸 2: 場面 (scene-type) — どの種類のページか

ページがどの場面タイプかで、必要な作法セットが変わる。場面別モジュールは
`30_scenes/` 配下。

| scene_id | モジュール | 役割 |
|---|---|---|
| `chapter_opener` | `30_scenes/chapter_opener.md` | 章扉 (章番号・主人公全身・マスコット) |
| `establishing` | `30_scenes/establishing.md` | 場面導入・ロケ提示・場所転換 |
| `dialogue` | `30_scenes/dialogue.md` | 会話 + 会話で世界観説明 |
| `monologue` | `30_scenes/monologue.md` | 主人公独白 + 感情演出 |
| `item_analysis` | `30_scenes/item_analysis.md` | アイテム解析・ステータス画面 |
| `combat` | `30_scenes/combat.md` | 戦闘 (buildup / action / climax 3 段) |
| `social_reaction` | `30_scenes/social_reaction.md` | SNS・ニュース・配信反応 |
| `cliffhanger` | `30_scenes/cliffhanger.md` | 章末引き・時間転換 |

scene_id は storyboard-extractor.ts から参照される文字列識別子と揃える
(将来コード側で `loadCraftModule(scene_id)` を呼ぶための契約)。

### 軸 3: ジャンル (genre) — どこまで一般化していい作法か

| genre | 適用範囲 | 例 |
|---|---|---|
| `universal` | 全商業漫画共通 | RTL、silence_panel、ナレーション禁則、温度差ペア、戦闘の動作分割 |
| `dungeon-modern` | 現代ダンジョンもの | SNS/配信 panel、ステータス画面 UI、現代制服+異世界要素のコントラスト |
| `isekai-tensei-cheat` | 異世界転生チート系 | 前世知識の活用 panel、チート使用大コマ |
| `isekai-slowlife` | 異世界スローライフ系 | 生活感 panel 主軸、戦闘最小限 |
| `kindle-test-1-only` | 個別作品固有 | 缶詰ガチャ固有演出 (要除去候補) |

`kindle-test-1-only` タグが付いた要素は **2 冊目精読時に再評価** する。
他作品にも出れば `dungeon-modern` に昇格、出なければ削除候補。

---

## 機能タグ (補助軸)

メイン 3 軸とは別に、各要素は **機能** のタグも付与する (検索・分析用)。

| function | 内容 |
|---|---|
| `structure` | 章構成・page 密度・panel 連結 |
| `emotion` | 感情演出・独白・温度差 |
| `worldbuilding` | 設定説明・ステータス・アイテム |
| `decoration` | 章扉・SNS・視覚 UI |
| `mechanics` | 戦闘の動作分割・必殺技解放・弱点描写 |

---

## 各場面モジュールのフォーマット (テンプレート)

すべての `30_scenes/*.md` は以下の構造で書く:

```markdown
# {scene_name}

scene_id: `{scene_id}`
genres: `{universal | dungeon-modern | ...}`

## L0 参照 (このシーンで特に重要な原則)
- ...

## L1 MUST (欠けると B 級以下確定)
1. {作法名} — {実装} — {kindle-test-1 page参照}

## L2 SHOULD (A 級到達確率を上げる)
1. ...

## L3 MAY (個別演出)
1. ...

## 典型 panel 構成例
- panel 1 (upper-right): ...
- panel 2 (upper-left): ...

## 失敗パターン (やりがちなミス)
- ...

## 参考実例
- kindle-test-1: pXX-XX
- (kindle-vol-2 待ち)
```

「失敗パターン」と「参考実例」を必ず置く。2 冊目精読時に同じスロットへ追記する
ことで、ジャンル共通 vs 作品固有の切り分けが可視化される。

---

## storyboard-builder への注入規約

`src/lib/manga/storyboard-v2/craft-guide-directives.ts` の `buildCraftGuideDirectives()`
は将来、以下の引数を受ける形にリファクタする想定:

```typescript
buildCraftGuideDirectives({
  toneProfile,        // 既存 (light_recovery / hellmode)
  genre,              // 既存 (modern_dungeon 等)
  sceneType,          // 新規 (dialogue / combat / ...)
})
```

注入される文字列の構造:

1. **L0 大原則** (常時)
2. **L1 MUST 全要素** (常時)
3. **L2 SHOULD のうち sceneType 該当** (場面マッチ時)
4. **L3 MAY のうち sceneType 該当** (場面マッチ時、初稿生成では省略可)
5. **genre 別追加 directive** (genre マッチ時)
6. **toneProfile 別追加 directive** (light_recovery / hellmode の追記)

これにより 1 ページ生成プロンプトに乗るトークン量が ≈40-60% 削減される見込み。
注意散漫化と "戦闘指針が会話シーンに混入" 系のミスを抑制できる。

---

## v2 → v3 マッピング

旧 [`manga_craft_guide.md`](../manga_craft_guide.md) の各セクションは以下に再配置された:

| 旧 v2 セクション | 新 v3 配置先 |
|---|---|
| 大原則 (panel = 物語進行単位) | `00_principles.md` L0-1 |
| 1 巻全体の章構成 | `10_chapter_structure.md` |
| 各話の典型構造 | `10_chapter_structure.md` |
| キャラ造形パターン | `20_characters.md` |
| 1 ページ内の panel 構成 5 種 | `30_scenes/*.md` 各場面の典型 panel 構成例へ分散 |
| 視覚要素の作法 10 要素 | `30_scenes/` (item_analysis / status / monologue / chapter_opener / social_reaction) へ分散 |
| 感情演出の作法 8 要素 | `30_scenes/monologue.md` + `30_scenes/dialogue.md` |
| panel 連結パターン 15 種 | `00_principles.md` (連結原則) + 各場面モジュールへ分散 |
| 設定説明の作法 | `30_scenes/dialogue.md` (会話で世界観説明) + `30_scenes/item_analysis.md` |
| 場所/時間の転換作法 | `30_scenes/establishing.md` + `30_scenes/cliffhanger.md` |
| 戦闘シーンの作法 | `30_scenes/combat.md` |
| 1 ページの密度リズム | `10_chapter_structure.md` 末尾 |
| storyboard-builder への反映指針 | 各場面モジュールに分散 + 本ファイル末尾 |

旧 v2 ガイド本体はリンク参照保持のため当面は残す
([../manga_craft_guide.md](../manga_craft_guide.md) 参照)。
