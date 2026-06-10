# a07-modern-dungeon Vol.1 表紙画像生成プロンプト最終版

**生成日**: 2026-05-06 (Codex MCP 最終化)
**対象**: ChatGPT Pro Codex CLI image_gen 経由 (memory: project_chatgpt_pro_image_gen.md)
**出力**: B6 KDP 表紙、1748x2480 px (trim)、bleed 含み 1843x2587 px (5mm)

---

## 採用案: 「FランクID破壊型」最終 prompt

```text
Create a commercial Japanese manga book cover for B6 KDP, portrait composition, final crop target 1748x2480 px, with extra bleed-safe artwork around all edges. Monochrome urban seinen manga style: crisp black ink, grayscale screentone shadows, high contrast, clean facial linework, cinematic rim lighting. Use only cyan-blue glowing accents for HUD and dungeon light; no other accent colors.

Main subject: Ren, a young Japanese man in his early 20s, lean build, wearing a plain black hooded jacket, front-facing upper-body pose. He is not posing heroically; he stands still with cold restraint, tired sharp eyes, closed mouth, and a small trace of determination. Avoid making him look like any existing anime or game character. No mask, no oversized cloak, no fantasy armor, no sword.

The chest area must contain a large readable ID badge, centered and dominant, about 18-22% of the cover height. The badge is black with thick white border and huge bold white sans-serif text: "F RANK". Make the letters extremely large, simple, and readable even at 150x200 thumbnail size. Keep the badge clean, flat, and high contrast.

Behind Ren: dark modern Tokyo/Shinjuku-like skyscraper silhouettes, a cyan-blue glowing dungeon gate at the lower background, faint perspective grid lines, scanner brackets, and transparent HUD panels. Upper right HUD text: "EXP x2.4" in bold cyan-white sans-serif, large enough to read at thumbnail size. Lower right HUD text: "FASTEST ROUTE", thinner but still legible. Leave top and lower title-safe zones with strong contrast and no busy detail for later Japanese title typography.

Lighting: blue backlight from the dungeon gate, white face rim light, deep black hoodie shadows. Mood: social rejection, secret navigation, fastest-route rebellion.

Negative prompt: no dragons, no monsters as main subject, no gacha cards, no harem, no sexualized body, no gore, no blood, no school uniform, no guns, no copyrighted character likeness, no famous franchise costume, no trademark-like logos, no Solo Leveling style imitation, no red/yellow/green/orange accents, no unreadable tiny text, no cluttered UI, no photorealism.
```

---

## 比較案2「俺だけナビHUD型」prompt

```text
Create a commercial Japanese manga book cover for B6 KDP, portrait composition, final crop target 1748x2480 px, with bleed-safe artwork. Monochrome urban seinen manga style with crisp black ink, grayscale screentone, sharp eye rendering, and only cyan-blue glowing HUD accents.

Main visual: extreme close-up of Ren's face, a young Japanese man in his early 20s wearing a plain black hood. Show one eye very large on the left-center of the cover, with the rest of his face fading into black hoodie shadow. His expression is calm, analytical, and isolated, as if he alone can see hidden information. Do not copy any existing anime, game, or manga character design; keep his face original, grounded, and modern.

Overlay the viewpoint with a transparent navigation HUD visible only to him. The HUD must feel like it is projected across his eye and vision: cyan-blue scanner lines, route arrows, small map nodes, targeting brackets, and a rising experience bar. The largest readable HUD text must be "EXP x2.4", placed in the upper right quadrant, bold cyan-white sans-serif, high contrast, readable at 150x200 thumbnail size. Secondary HUD text: "FASTEST ROUTE" near the lower right, still clear but smaller. Include a small "F RANK" label as a status tag near the lower left, but do not let it dominate more than the eye.

Background inside the HUD: a dark modern dungeon entrance, black Tokyo skyscraper silhouettes, blue gate glow, abstract route line cutting through the darkness. Leave clean dark negative space for later Japanese title typography.

Lighting: hard white highlight on the eye, cyan reflection in the iris, blue edge light from HUD, deep black shadows. Mood: secret system voice, private information advantage, fastest calculation.

Negative prompt: no copyrighted likeness, no famous franchise UI, no Solo Leveling imitation, no VR headset, no mecha visor, no red warning UI, no rainbow neon, no sexualized content, no blood, no gore, no monsters in foreground, no dragons, no weapons, no cluttered illegible microtext, no photorealistic face.
```

---

## 比較案3「Sランク灯里対比型」prompt

```text
Create a commercial Japanese manga book cover for B6 KDP, portrait composition, final crop target 1748x2480 px, with bleed-safe artwork. Monochrome urban seinen manga style, sharp black ink, grayscale screentone, clean character silhouettes, cinematic blue HUD lighting. Use cyan-blue as the primary accent. Allow only one restrained vermilion-red accent on Akari's uniform, not across the whole image.

Two-character contrast composition. Foreground right: Ren, young Japanese man in his early 20s, lean build, plain black hooded jacket, calm tired eyes, restrained determination. His chest or hand area should show a readable black-and-white "F RANK" ID badge, bold white sans-serif letters, large enough to remain visible at thumbnail size but slightly smaller than in the adopted cover. Background left, slightly elevated and farther away: Akari, young Japanese woman, elite S-rank explorer presence, composed posture, wearing a clean modern public-agency combat uniform with a small vermilion-red accent panel. She must look original, not like any existing anime heroine; no revealing outfit, no sexualized pose.

Between them: a glowing cyan-blue dungeon gate and a transparent public-agency status screen. The HUD should show the contrast between social rank and hidden route. Upper right HUD text must read "EXP x2.4" in bold cyan-white sans-serif, readable at 150x200 thumbnail size. Add secondary text "FASTEST ROUTE" near the gate path. Keep all English HUD text simple and large.

Background: dark Tokyo/Shinjuku-like skyline, clean vertical silhouettes, faint grid lines and route arrows. Leave high-contrast dark space for later Japanese title typography.

Lighting: blue gate backlight separating both characters, white rim light on faces, deep black urban shadows. Mood: F-rank vs S-rank gap, childhood-distance tension, hidden reversal.

Negative prompt: no copyrighted character likeness, no trademark logos, no school-uniform fetish framing, no sexualized pose, no blood, no gore, no harem composition, no dragon, no giant monster, no flashy weapon attack, no red-dominant palette, no cluttered tiny text, no Solo Leveling style imitation.
```

---

## オペレーション手順

### 1. 3案を並行生成

各 prompt を `prompts/a07-cover-{id}.txt` に保存し、Codex CLI に image_gen 投入:

```bash
# 採用案
codex exec --sandbox workspace-write --cd /Users/hikarumori/Developer/AINARO -
# stdin に: image_gen で a07-cover-prompt.md の「採用案」prompt を1枚生成、
# 保存先: data/manga/works/a07-modern-dungeon/kdp/_alternates/a07-cover-id-destroy-v01.png
```

同様に比較案2/3 も別ファイル名で生成。

### 2. 文字レイヤーの再合成 (重要)

**画像生成の文字 (F RANK / EXP x2.4 / FASTEST ROUTE) は潰れやすい**ため、最終版では画像生成のフレームに文字を別レイヤーで再合成する方が安全:

```bash
# Codex 生成 PNG (文字なし or 文字あり) を base に
# sharp/canvas で文字を上書き、ベクター品質で潰れない形に
```

### 3. KDP 寸法に組版

```bash
sharp で 1024x1536 の生成画像 → 1843x2587 (5mm bleed) にリサイズ + crop
→ data/manga/works/a07-modern-dungeon/kdp/inputs/cover-front.png
```

### 4. L13 KDP package で PDF 化

```bash
npx tsx scripts/manga/layers/L13-kdp.ts \
  --slug a07-modern-dungeon \
  --volume 1 \
  --episodes 1,2,3,4,5,6,7,8,9,10 \
  --cover-front data/manga/works/a07-modern-dungeon/kdp/inputs/cover-front.png \
  --cover-back data/manga/works/a07-modern-dungeon/kdp/inputs/cover-back.png
```

### 5. 失敗時のリトライ

- seed 指定可能なら seed を変更
- 不可なら v02/v03 として再生成
- prompt は一度に全部変えず1点ずつ調整:
  - 文字が潰れる → "larger flat vector-like typography"
  - 色が増える → "cyan-blue only, all other colors grayscale"
  - 既存IP類似 → "original face, no franchise costume"

### 6. 150x200px 縮小 A/B 判定

3案を 150x200 にダウンサンプル → 「F RANK」「EXP x2.4」が読めるものだけ A/B 判定に回す。

---

## 追加成果物の仕様

| 要素 | 寸法 (px) | 備考 |
|---|---|---|
| 表紙 front (trim) | 1748x2480 | B6 KDP 350dpi |
| 表紙 front (bleed) | 1843x2587 | 5mm bleed |
| 裏表紙 back (bleed) | 1843x2587 | あらすじ + 著者/レーベル + バーコード placeholder |
| full cover PDF | 裏 + 背 + 表 | 背幅 200p × 0.0795mm = 15.9mm 目安 |
| 背表紙 (spine) | テキスト可 (200p想定) | Vol.1 は 200p 想定なので OK |

⚠️ **注意**: 現行 [cover-composer.ts](../../src/lib/manga/publish-v2/kdp/cover-composer.ts) は背表紙テキスト未描画。Vol.1 で背表紙テキスト入れる場合は実装 or 外部組版が必要。

⚠️ **bleed の不一致**: リポジトリ実装は 3mm 基準、本ドキュメントは 5mm。最終照合要 (KDPテンプレで mm 実寸確認)。

---

## 商標 / IP 類似チェック (生成前)

| 項目 | 評価 | 対応 |
|---|---|---|
| `F RANK` 表記 | 低リスク | 一般的なランク表記。ただし Solo Leveling との連想を避けるため、IDバッジ/公社制度/ナビHUDを前面化して差分を作る |
| `EXP ×2.4` 数値 | 低リスク | 既存 IP 固有語ではない。独自フックとして有効 |
| 黒フード主人公 | 中リスク | 汎用記号だが「黒コート・青オーラ・影兵士・片手武器」の組み合わせ (Solo Leveling 連想) は避ける。普通の現代フード + ID バッジ + 無武器 + 情報チート構図に固定 |

詳細な商標チェック (J-PlatPat / USPTO TESS / Amazon) は Console「商標 / IP チェック」view (Phase X WX-5) から実施。

---

## 生成前にユーザーに確認すべき事項 (Codex 推奨)

1. **表紙内の英字 (F RANK / EXP x2.4 / FASTEST ROUTE)** を画像生成文字のまま使うか、後工程で確実なベクター文字として焼き直すか
2. **bleed を 1843x2587 (5mm) で固定するか**、KDPテンプレに合わせて mm 基準で再計算するか
3. **背表紙テキストを Vol.1 から入れる場合**、現行 L13 の未実装部分を先に直すか、外部組版で対応するか

---

## 関連文書

- 表紙コンセプト詳細 (案1〜3): [docs/strategy/a07-cover-concept.md](a07-cover-concept.md)
- KDP 統一案: [data/eval/a07-quality-improve/codex-kdp-pack.md](../../data/eval/a07-quality-improve/codex-kdp-pack.md)
- KDP 入稿テンプレ: [data/manga/works/a07-modern-dungeon/kdp/kdp-input.md](../../data/manga/works/a07-modern-dungeon/kdp/kdp-input.md)
- KDP 運用ガードレール: [kdp_account_safety.md](kdp_account_safety.md)
