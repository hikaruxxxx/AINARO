# テキスト品質パック → パイプライン統合計画

## 背景

2026-05-06、a07-modern-dungeon の P1 (1ページ目) が画像化された際、以下のテキストが商業漫画のオープニングとして弱いと検出された:

- dialogue: 「ナビ、最短ルートを出せ。」 — 現代スマホナビ感、命令口調がレンの理系気質と乖離
- narration: 「これは、Fランクの俺が世界記録を塗り替える三十秒前。」 — 説明調、「世界記録」が陸上競技的でダンジョン文脈と乖離
- monologue: 「世界記録なんて、俺には一生関係ない。」 — 同様の lexicon 違反

これに対し、bible (`data/manga/works/a07-modern-dungeon/bible/snapshot.v2.json`) に **テキスト品質パック** として4セクションを追加した:

1. `world.lexicon` (用語辞書、forbidden_terms_global / p1_opening_directive 含む)
2. `narration_style_guide` (top-level、独白文体・p1_opening_directive_specific 含む)
3. `nav_full_spec` (top-level、ナビ対話プロトコル・anti_pattern_dialogue 含む)
4. `characters[*].speech_style` (現状レンのみ、他6キャラ追加予定)

**しかし grep 調査の結果、これら4セクションは現行パイプラインに 0 接続** であり、後段の storyboard / text 生成時に Codex prompt へ流し込まれていない。本計画はその統合を行う。

## 改修対象ファイル

### 1. [storyboard-extractor.ts](../../../src/lib/manga/storyboard-v2/storyboard-extractor.ts) (L4)

**現状**: `BibleSnapshotV2` から `style_directives`, `visual_motifs`, `characters`, `locations` を Codex prompt の `materials` にシリアライズしている。

**改修**: `materials` に以下のフィールドを追加。

```typescript
const materials = {
  // ... 既存フィールド
  world_lexicon: bible.world.lexicon ?? null,
  narration_style_guide: bible.narration_style_guide ?? null,
  nav_full_spec: bible.nav_full_spec ?? null,
  character_speech_styles: bible.characters
    .filter(c => c.speech_style)
    .map(c => ({ id: c.id, role: c.role, speech_style: c.speech_style })),
};
```

**注入位置**: Codex extractStructuredJson 呼び出しの system / developer instructions と user prompt の両方。特に dialogue / narration / monologue / sfx を生成する panel の prompt セクションで、以下を strict directive として明示:

- `forbidden_terms_global` を**禁止語リスト**として宣言
- `p1_opening_directive` を 1ページ目専用ガード**として強制
- `narration_style_guide.p1_opening_directive_specific` の rejected_pattern_examples を「これらのパターンを生成した場合は失敗扱い」と教示
- `nav_full_spec.canonical_disclosure_lines_vol_1` をナビ発話の anchor として例示
- `nav_full_spec.anti_pattern_dialogue` を絶対禁止例として明示
- `character_speech_styles[].speech_style` を該当キャラの dialogue / monologue 生成時の文体ガードとして注入

### 2. [craft-guide-directives.ts](../../../src/lib/manga/storyboard-v2/craft-guide-directives.ts) (L4 補助)

**現状**: panel craft rules を Codex prompt に注入。

**改修**: 以下の rule を追加 (bible に lexicon 等が存在する場合のみ条件付き発動)。

```
RULE TX-1 (lexicon strict): bible.world.lexicon.forbidden_terms_global に含まれる語彙を panel.dialogue / monologue / narration に出現させてはならない。違反箇所は再生成対象。
RULE TX-2 (p1 opening): page_role === "opening_hook" の最初の panel では bible.narration_style_guide.p1_opening_directive_specific を強制適用。max_lines / max_chars_per_line / must_avoid を厳守。
RULE TX-3 (nav voice): bible.nav_full_spec.voice_persona.default_tone に従い、ナビ発話は「敬体・事務的」を default、巻別 emotional_range_per_volume の例外指定がある場合のみ感情表出を許可。
RULE TX-4 (speech style): bible.characters[*].speech_style が存在するキャラの dialogue / monologue は speech_style.first_person / register / ban_phrases を厳守。
```

### 3. [prompt-composer-v2.ts](../../../src/lib/manga/render-v2/prompt-composer-v2.ts) (L9 render)

**現状**: `BibleSnapshotV2` を受け取り、`characterRefDescription()` / `locationDescription()` / `styleHeader()` でビジュアル prompt を構築。

**改修**: in-panel テキスト (画像内焼き込みの dialogue / narration / sfx) を image generation prompt に含める前に、以下のチェックを行う。

```typescript
function validatePanelText(panel: StoryboardPanel, bible: BibleSnapshotV2): ValidationResult {
  const forbidden = bible.world.lexicon?.forbidden_terms_global ?? [];
  for (const dialogue of panel.dialogue) {
    for (const term of forbidden) {
      if (dialogue.text.includes(extractKeyword(term))) {
        return { ok: false, reason: `forbidden term: ${term}` };
      }
    }
  }
  // narration / monologue 同様
  return { ok: true };
}
```

違反検出時は warning を出して storyboard 修正を促す (現行 L4 で fix される想定)。

## 推奨される実装順

1. **L4 storyboard-extractor.ts**: materials への追加 (一次対策、最も効果大)
2. **L4 craft-guide-directives.ts**: 4 rule の追加 (二次対策、Codex 側の自己制約強化)
3. **L9 prompt-composer-v2.ts**: validatePanelText 実装 (三次対策、フェイルセーフ)

## 検証手順

1. 改修後、a07-modern-dungeon ep01 storyboard を再生成 (`npx tsx scripts/manga/pipeline.ts --slug a07-modern-dungeon --episode 1 --layer L4`)
2. 生成された storyboard.json で 1ページ目の dialogue / narration / monologue に lexicon 違反が含まれていないことを確認
3. 並行して、生成された P1 画像化結果がユーザにとって改善したテキストになっているか目視確認

## 既存 _opening_alts proposal との関係

`data/manga/works/a07-modern-dungeon/episodes/ep01/_opening_alts/proposals-2026-05-06.json` の `proposals[0]` (P4_splash_pullback パターン) は 2026-05-06 09:51 生成で、bible 更新前なので lexicon 違反テキストを 3 箇所含む。

- 短期対策: 該当 JSON を bible 準拠に手動修正 (本計画と同時実施)
- 長期対策: パイプライン改修後に proposal を再生成

## ファイル参照

- Bible 拡充内容: `data/manga/works/a07-modern-dungeon/bible/snapshot.v2.json` の `world.lexicon` / `narration_style_guide` / `nav_full_spec` / `characters[0].speech_style`
- 検証仕様 (関連): [docs/strategy/manga_bible_validation_spec.md](../../strategy/manga_bible_validation_spec.md)
- パイプライン SSoT: [docs/plans/manga/pipeline-v2.md](pipeline-v2.md)

## 改訂履歴

- 2026-05-06: 初版作成。Explore agent 調査で 4 セクションがパイプラインに 0 接続と判明したため、統合計画を成文化。Codex 実装ターゲット。
