# a07-modern-dungeon Vol.1 表紙コンセプト

**確定日**: 2026-05-06 (Codex KDP 統一案 採用案E)
**作品**: 「Fランクの俺にだけ聞こえる」 第1巻
**目標**: KU 棚で「Fランク × 俺だけナビ × 世界最速無双」が1秒で読める表紙

---

## 採用案: 「FランクID破壊型」

### コンセプト

主人公の「F ランク認定」という社会的烙印を表紙の中心に据え、その背後に「青い HUD = 俺だけが見えているナビ」を配置することで、**「底辺認定された主人公が、誰にも見えない最短ルートを知っている」** という1巻のコア約束を一目で伝える。

ガチャ系の派手なアイテム絵やドラゴン討伐絵ではなく、**情報チート** を前面化することで、同型ヒット (世界最速のレベルアップ / ガチャに給料全部 / ハズレスキル「逃げる」/ レベルガチャ) との視覚的差別化を作る。

### 視覚要素

| 要素 | 配置 | サイズ感 | 役割 |
|---|---|---|---|
| **主人公レン** | 中央正面、上半身 | 表紙の60% | 視線誘導の起点。冷静で諦めた目つき、しかし口元に微かな決意 |
| **黒フード** | レンの上半身を覆う | 視線を顔に集中 | 底辺探索者の匿名性 + ダークヒーロー的記号 |
| **「F RANK」ID** | 胸元、バッジ風 | 表紙の15-20% | 視線が必ず止まる白抜き文字。ID カード/バッジ風で社会制度の象徴 |
| **青HUD「EXP ×2.4」** | レンの後ろ斜め上 | 表紙の8-10% | ナビ独占情報の数値化、サムネで読める |
| **青HUD「FASTEST ROUTE」** | レンの後ろ斜め下 | 表紙の6-8% | 「世界最速」を英文 HUD で記号化 |
| **暗いビル群** | 背景上部 | 表紙の25% | 新宿都心のダンジョン世界観 |
| **青いダンジョンゲート** | 背景下部 | 表紙の20% | 現代ダンジョン記号 (魔法陣/結界系) |
| **HUD グリッド線** | 背景全体に薄く | 全面 | サイバー感、「画面越しに見ている」演出 |

### 配色

- **base**: 白黒 (manga_bw_seinen_urban 系統、純黒/純白/グレースケール)
- **accent**: 青 (HUD のみ、発光、#1A8FFF 〜 #5BB8FF レンジ)
- **highlight**: 白抜き (Fランク文字、最大コントラスト)
- **禁則**: 朱/赤/緑/黄など他の有彩色は一切入れない (青の純度を守る)

### 棚での視認性根拠

KU 棚 (Amazon サムネ ~150x200px) で:
- **第一視認** (0.3秒): 「F RANK」白抜きと胸元バッジ → 「Fランクの主人公」と即理解
- **第二視認** (1秒): 「EXP ×2.4」「FASTEST ROUTE」青 HUD → 「世界最速の数値チート」と理解
- **第三視認** (3秒): タイトル「Fランクの俺にだけ聞こえる」+ 副題 → 全約束が完了

### 同型ヒットとの差別化

| 競合 | 表紙の主視覚 | a07 の差別化 |
|---|---|---|
| 世界最速のレベルアップ | 主人公単独の力強いポーズ | **「F RANK」バッジで社会的烙印を前面化** |
| ガチャに給料全部 | ガチャ画面/カード絵 | **情報チート (HUD) で売る** |
| ハズレスキル「逃げる」 | 主人公単独のクール顔 | **冷静顔 + 決意の口元 (受動→能動転換)** |
| レベルガチャ | カード/ダンジョンゲート | **青 HUD グリッドで「俺だけ見えている」演出** |

---

## gpt-image-2 生成プロンプト要件

### 基本パラメータ

- **aspect**: B6 KDP 表紙比率 1748×2480 (350dpi)
- **style preset**: `manga_bw_seinen_urban` + 青発光アクセントのみ
- **negative prompts**: ガチャカード / ドラゴン / 派手な装備 / 派手な必殺技エフェクト / 朱や赤の有彩色

### 詳細プロンプト (英語、gpt-image-2 用)

```
Manga book cover, B6 portrait orientation 1748x2480 px, monochrome seinen urban manga style.

Subject: A young Japanese man in his early 20s wearing a black hooded jacket, frontal upper-body composition, calm and resigned expression with a subtle determined edge in his closed mouth. His chest is dominated by a large white-cutout "F RANK" ID badge, prominent like a card pinned to his chest, taking ~15-20% of the cover height.

Background: Dark Tokyo skyline (Shinjuku-like skyscrapers in silhouette) at the top, a glowing blue dungeon gate with magical circle motif at the bottom. Faint cyber HUD grid lines overlay the entire background.

Foreground HUD elements (cyan-blue glow only, no other colors):
- Upper right: "EXP ×2.4" in bold sans-serif
- Lower right: "FASTEST ROUTE" in thinner sans-serif
- HUD frame brackets at the corners

Color: Pure monochrome (black/white/grayscale) for the character and background, with cyan-blue (#1A8FFF to #5BB8FF) accents ONLY on the HUD elements and the dungeon gate glow. NO red, no yellow, no green, no orange.

Mood: Cold determination, urban isolation, secret information, social rebellion against rank-based class system.

Composition: Rule of thirds, character's eyes at upper third intersection, F RANK badge at center of frame for instant recognizability at thumbnail size (150x200px on Amazon).

Avoid: Gacha cards, dragons, action poses, flashy weapons, magical attacks, harem girls, multiple characters, complex backgrounds, any non-blue color accents.
```

### 生成パス

1. ChatGPT Pro $200/月枠の Codex CLI image_gen 経由 (memory: project_chatgpt_pro_image_gen.md)
2. 生成後 KDP 表紙仕様 (B6 350dpi、5mm bleed、背幅含む) に Python/sharp で組版 → cover.pdf
3. preflight で DPI / 寸法 / bleed 確認
4. 不採用案 (「俺だけナビHUD型」「Sランク灯里対比型」) も保管 (data/manga/works/a07-modern-dungeon/kdp/_alternates/)

### 表紙3案並行生成の推奨

KU 棚での「FランクID破壊型」効果を A/B 検証するため、Phase Y WY-7 で:
- 採用案: FランクID破壊型 (本文ベース)
- 比較案A: 俺だけナビHUD型 (片目アップ + ナビ UI)
- 比較案B: Sランク灯里対比型 (主人公 + ヒロイン構図)

3案を並行生成 → ops console から人間判定 → 採用版で出版。

---

## 不採用案の参考保存

### 案2「俺だけナビHUD型」(rejected)

| 視覚要素 | 配色 |
|---|---|
| レンの片目アップ + 視界に重なるナビ UI + ダンジョンゲート + 経験値バー急上昇 | 黒/白/グレー + サイバー青、瞳と HUD だけ高コントラスト |

**rejected 理由**: 「俺だけ見えている」構図は強いが、サムネで顔のディテールが潰れる懸念。「FランクID」の社会的烙印インパクトが弱まる。

### 案3「Sランク灯里対比型」(rejected)

| 視覚要素 | 配色 |
|---|---|
| 手前にFランクのレン、奥に朱の制服の灯里、中央に青いゲートと公社ステータス画面 | モノクロ都市、灯里側に朱のワンポイント、レン側に青HUD |

**rejected 理由**: キャラ関係の引きが強い (漫画らしい) が、Vol.1 では「主人公単独の覚醒物語」として売る方が KU 棚で約束が明確。Vol.2-3 で関係性を強化する設計と整合させる。

---

## Vol.2 以降の表紙展開 (申し送り)

| Vol | 表紙テイスト | 巻末引きパターンと整合 |
|---|---|---|
| Vol.1 | FランクID破壊型 (本文書) | ナビ消滅リスク型 |
| Vol.2 | レンの後ろにナビ少女シルエット (姿が初めて見える) | 記録更新バレ型 |
| Vol.3 | レン + 灯里対比 (案3 を後追い) | 幼馴染照合型 |
| Vol.4-6 | 階層拡大 (ダンジョン深層) | ナビ新条件開示型 |
| Vol.7-9 | スキル覚醒シーン | ガチャ未開封暴発型 |
| Vol.10-12 | 大規模イベント | 制度交渉序章 |
| Vol.13 | レン + ナビ二人並び (完結) | ランク制度書き換え |

すべてに共通: 黒/白/青の色彩統一 → シリーズ棚で並んだ時のブランド一貫性
