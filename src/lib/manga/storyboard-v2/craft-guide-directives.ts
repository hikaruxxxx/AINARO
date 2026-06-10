/**
 * Manga Craft Guide Directives — manga_craft_guide.md v2 のうち
 * panel単位で機械化可能なルールを TypeScript 定数化したもの。
 *
 * 設計根拠:
 *   - Plan: /Users/hikarumori/.claude/plans/groovy-wishing-castle.md WX-3
 *   - 元ガイド: docs/strategy/manga_craft_guide.md (kindle-test-1 全156p精読 v2)
 *   - 目的: storyboard-extractor.ts の systemContext に注入し、
 *           生成された storyboard が craft 準拠になるよう誘導
 *
 * 設計方針:
 *   - 80+作法のうち「panel単位で LLM に明示できる定型ルール」だけ抽出
 *   - 章構成・キャラ造形・パターンA-E は plot-template / volume-plot 側に振り分け
 *   - tone_profile (light_recovery / hellmode) に応じて推奨度を切り替える
 *   - genre 別の追加 directive (現代ダンジョン/異世界転生/領地経営) も差し込み可
 */

import type {
  CharacterEntryV2,
  DensityProfile,
  DungeonModernSubtype,
  NarrationStyleGuideV2,
  NavFullSpecV2,
  TextQualityLexiconV2,
  ToneProfile,
} from "../schemas-v2";

type TextQualityDirectiveInputs = {
  worldLexicon?: TextQualityLexiconV2;
  narrationStyleGuide?: NarrationStyleGuideV2;
  navFullSpec?: NavFullSpecV2;
  characters?: CharacterEntryV2[];
};

/**
 * 全 storyboard 生成で共通に使う panel craft directives。
 * 個別の tone/genre 切替は buildCraftGuideDirectives() で組み立てる。
 */
export const PANEL_CRAFT_RULES = {
  /** 温度差ペア (友人爆発 vs 主人公冷静) */
  temperatureContrastPair:
    "1ページに1回以上、隣接panel で『感情爆発キャラ vs 冷静主人公』の温度差を作る (例: 友人/相棒の興奮表情 ⇔ 主人公の無表情)",

  /** マスコット軽 vs 主人公重 */
  mascotProtagonistContrast:
    "マスコット/相棒の軽い台詞 ⇔ 主人公の深刻表情を同panel内で対比させる (例: マスコット『☆』『♪』⇔ 主人公『...』)",

  /** 顔以外の部位で感情 */
  faceFreeEmotion:
    "緊迫場面では顔のクローズアップだけでなく、足/手/背中のクローズアップで間接的に感情を語らせる (例: 浮いた足=危機、握りしめた手=決意)",

  /** 派手 vs 地味のギャップ (expectation vs reality) */
  expectationRealityGap:
    "1ページに1回、『期待 (魔物との死闘・財宝)』vs『現実 (時給100円・小銭)』のギャップを作る。読者の予想と主人公の現実の落差で笑いと共感を作る",

  /** MINIMALISM_DIRECTIVE: 50%以上ピュアホワイト panel */
  minimalismPureWhite:
    "各ページに少なくとも1 panel は背景の50%以上をピュアホワイトにする (silence_panel = A評価の根拠、Asano/Urasawa参照)",

  /** silence_panel 配置原則 */
  silencePanelPlacement:
    "感情のピーク (主人公の決意/驚愕/喪失) では1 panel を silence (台詞・SFX全空) にする。雑音を消すことで感情を強調",

  /** 高密度フォーカル */
  denseFocalPoint:
    "各ページに少なくとも1 panel は描き込みを増やしてフォーカルポイントを作る (大コマ・establishing・必殺技解放)",

  /** ナレーション禁則 */
  narrationMinimal:
    "ナレーション枠を多用しない。世界観・設定説明はキャラ同士の何気ない会話で伝える (会話で世界観説明)。ナレーション専用枠は1page あたり 0-1 個まで",

  /** 主人公の独白 (雲型) */
  protagonistMonologueCloud:
    "主人公の独白は雲型吹き出し (実線でない、点線/破線/透過枠) で配置。ほぼ毎ページ1回以上 (light_recovery では2-3回/話に抑制)",

  /** ステータス画面 panel */
  statusWindowChapterTransition:
    "章末・章頭で必ず1回はステータス画面 panel を更新表示する (level/HP/skills の更新)",

  /** SNS/動画 panel */
  snsBroadcastPanel:
    "主人公の社会的影響を示す重要場面では SNS/動画/ニュース速報の矩形フレームを panel に挿入 (Twitter/X 風レイアウト、再生数表記)",

  /** アイテム説明枠 */
  itemDescriptionCard:
    "新規アイテム/スキル登場時は灰色背景の矩形枠で『名前 + 効果 + 価格』を別レイヤー記述",

  /** キャラ紹介ボックス */
  characterIntroBox:
    "重要キャラの初登場時に四角枠で『名前 + 属性 + 短い特徴』を1回掲載 (1巻あたり5-8回が目安)",

  /** 場所転換の establishing 必須 */
  locationChangeEstablishing:
    "場所が変わったら、新シーンの最初の panel は必ずロケ全体の引き (establishing) で『ここはどこ』を読者に示す",

  /** 戦闘の動作分割 */
  combatActionSplit:
    "戦闘の1動作は3-5 panel に分割: (1) 構え/接近 → (2) 中間動作 → (3) 命中の決定的瞬間 (大コマ) → (4) 結果+効果音 → (5) 主人公表情/敵リアクション",
} as const;

/** panel連結パターン15種 (manga_craft_guide.md より) */
export const PANEL_CONNECTION_PATTERNS = [
  // 物語駆動の繋ぎ
  "establishing → 主人公 → 主人公感情 (場面転換、章頭)",
  "全体 → 個 → 反応 (新キャラ/新場所登場)",
  "気付き → 状況 → ピンチ深刻化 (3段階深掘り、緊張)",
  "expectation → reality (期待 → 現実落差)",
  "会話A → 会話B → 結論 (シンプルな会話シーン)",
  "アクション → 効果音 → 結果 (戦闘の動作分割)",
  "アイテム → 説明枠 → リアクション (アイテム解析)",
  "問題提示 → 検討 → 決断 (主人公の動き出し)",
  "ステータス画面 → 主人公独白 → 行動 (レベルアップ後の意気込み)",
  "電話シーン → 反応 → 決意 (キャラ間の距離感)",
  // 視覚的繋ぎ
  "大コマ → 連続小コマ (ピーク → 散発)",
  "連続小コマ → 大コマ (積み重ね → 爆発)",
  "クローズアップ連鎖 (顔 → 手 → 別キャラ顔)",
  "シルエット → クリア (謎 → 解明)",
  "静 → 動 (smash cut: 日常 → 異変)",
] as const;

/** light_recovery 型で特に重視する追加 directive */
const LIGHT_RECOVERY_ADDITIONAL_DIRECTIVES = [
  "【light_recovery 必須】1話に1回以上『小報酬/生活感/相棒との温度』beat を配置 (recovery_cadence 軸)",
  "【light_recovery 必須】1話に1回以上、相棒/家族との温かい会話 panel を配置 (sidekick_presence 軸)",
  "【light_recovery 必須】1話に1回以上、軽い場面/ギャグ呼吸 panel を配置 (comedic_density 軸)",
  "【light_recovery 推奨】食事/服装/街並み描写の panel を増やす (S3食事/S4服装/S7建築 の軽い充実が生活感を生む)",
  "【light_recovery 禁則】1話で『主人公の心の傷の独白』が3回を超えないこと (重い独白は完読率を下げる)",
  "【light_recovery 禁則】『初期敵が主人公をいじめる/見下す』panel を作らない (likability 軸を損なう)",
] as const;

/** hellmode 型で特に重視する追加 directive */
const HELLMODE_ADDITIONAL_DIRECTIVES = [
  "【hellmode 推奨】主人公の前世の執着を独白で示す panel を1話に2-3回配置",
  "【hellmode 推奨】ステータス画面 panel と主人公の最適化思考独白を組み合わせる",
  "【hellmode 推奨】緊張・葛藤の3段階深掘り panel を章ごとに1回作る",
] as const;

/** ジャンル別の追加 directive (modern_dungeon は subtype 分岐で別管理) */
const GENRE_DIRECTIVES: Record<string, string[]> = {
  battle_dungeon: [
    "【battle_dungeon】ダンジョンの神秘性を establishing 大コマで示す",
    "【battle_dungeon】戦闘の動作分割を厳守 (5 panel = 構え→中間→決定打→結果→反応)",
    "【battle_dungeon】弱点描写を戦闘前 or 中盤で明示 (例: 『弱点は顎の』のような台詞 or アイテム説明枠)",
  ],
  isekai_tensei_cheat: [
    "【isekai_tensei_cheat】前世知識の活用シーンは『気付き → 試行 → 効果』の3 panel パターンで",
    "【isekai_tensei_cheat】チートスキルの使用は決定打 panel で大コマ + 効果音爆発",
  ],
  isekai_slowlife: [
    "【isekai_slowlife】生活感 panel (食事/家事/会話) を主軸に。戦闘 panel は最小限",
    "【isekai_slowlife】街並み/季節/天候の establishing で温度を作る",
  ],
};

type SubtypeDirectives = Record<DungeonModernSubtype, string[]>;

export const MODERN_DUNGEON_SUBTYPE_DIRECTIVES: SubtypeDirectives = {
  external_social: [
    "【modern_dungeon/external_social】SNS/配信/ニュース panel を 1 巻 5-10 回配置",
    "【modern_dungeon/external_social】SNS 前後に主人公のスマホ視聴 panel を置く",
    "【modern_dungeon/external_social】ステータス画面は章末/章頭の簡素 1 panel 更新",
    "【modern_dungeon/external_social】制服/コンビニ/スマホと魔物/ダンジョンを併置",
    "【modern_dungeon/external_social】1 巻終盤 cliffhanger で海外探索者をシルエット初登場",
    "【modern_dungeon/external_social】章扉は 1 ページ全面、主人公全身+マスコット+ロゴ",
    "【modern_dungeon/external_social】主人公は制服のまま戦闘、装備切替演出は最小限",
  ],
  gacha_ui: [
    "【modern_dungeon/gacha_ui】SNS panel は使わず、rarity と数値で社会的価値を示す",
    "【modern_dungeon/gacha_ui】ステータスは 2 ページ全面、スキル一覧+rarity+New",
    "【modern_dungeon/gacha_ui】数値 before/after は矢印付きで「121 (←115)」",
    "【modern_dungeon/gacha_ui】ガチャ pull は見開き+「ジャララ」「キラッ」+斜め文字",
    "【modern_dungeon/gacha_ui】1回/10回ガチャ button と skill icon grid を UI として描く",
    "【modern_dungeon/gacha_ui】制服↔甲冑の装備切替 panel で現代/異世界境界を可視化",
    "【modern_dungeon/gacha_ui】各話冒頭は「第N話」小枠+同ページ establishing",
    "【modern_dungeon/gacha_ui】1 巻冒頭は opening establishing 見開き、ナレ 4-5 個可",
    "【modern_dungeon/gacha_ui】巻末 cliffhanger は海外でなくタイム制ミッション提示",
  ],
  hybrid: [
    "【modern_dungeon/hybrid】SNS 外部反応と gacha UI 作法を半量ずつ併用",
    "【modern_dungeon/hybrid】SNS は要所のみ、重要成長は rarity/数値 UI で補強",
    "【modern_dungeon/hybrid】生成難易度が高いため Phase A では採用理由を明示",
  ],
};

function isModernDungeonGenre(genre: string | undefined): boolean {
  return genre === "modern_dungeon" || genre === "modern-dungeon" || genre === "dungeon-modern";
}

function resolveModernDungeonSubtype(
  subtype: string | undefined,
): DungeonModernSubtype {
  if (
    subtype === "external_social" ||
    subtype === "gacha_ui" ||
    subtype === "hybrid"
  ) {
    return subtype;
  }
  return "external_social";
}

/**
 * tone_profile / genre に応じた craft directives 文字列を構築。
 * storyboard-extractor.ts の systemContext に注入する。
 *
 * @param toneProfile bible.meta.tone_profile (任意、未指定なら共通ルールのみ)
 * @param genre bible.meta.genre (任意、未指定ならジャンル別 directive をスキップ)
 * @param subtype bible.meta.subtype (modern_dungeon の genre 内サブタイプ)
 */
export function buildCraftGuideDirectives(
  toneProfile?: ToneProfile,
  genre?: string,
  subtype?: string,
  textQuality?: TextQualityDirectiveInputs,
  densityProfile?: DensityProfile,
): string {
  const lines: string[] = [];

  lines.push("## Manga Craft Directives (panel単位で必ず守ること)");
  lines.push("");
  lines.push(
    "出典: docs/strategy/manga_craft_guide.md (kindle-test-1 全156p精読 v2)",
  );
  lines.push(
    "目的: 商業ラノベコミカライズ品質 (B-→A-) の達成。完読率最適化。",
  );
  lines.push("");

  lines.push("### 共通 panel craft ルール");
  for (const rule of Object.values(PANEL_CRAFT_RULES)) {
    lines.push(`- ${rule}`);
  }
  lines.push("");

  lines.push("### panel 連結パターン (15種、適切に使い分ける)");
  for (const [i, pattern] of PANEL_CONNECTION_PATTERNS.entries()) {
    lines.push(`${i + 1}. ${pattern}`);
  }
  lines.push("");

  // tone_profile に応じた追加 directive
  if (toneProfile) {
    const isLightRecovery = toneProfile.darkness < 0.5;
    const isHellmode = toneProfile.darkness >= 0.7;
    if (isLightRecovery) {
      lines.push(
        "### tone_profile = light_recovery (Phase A 標準) の追加 directive",
      );
      for (const d of LIGHT_RECOVERY_ADDITIONAL_DIRECTIVES) {
        lines.push(`- ${d}`);
      }
      lines.push("");
    } else if (isHellmode) {
      lines.push("### tone_profile = hellmode (高分散枠) の追加 directive");
      for (const d of HELLMODE_ADDITIONAL_DIRECTIVES) {
        lines.push(`- ${d}`);
      }
      lines.push("");
    }
    // 中間帯 (0.5 <= darkness < 0.7) は共通ルールのみ
  }

  // ジャンル別の追加 directive
  if (isModernDungeonGenre(genre)) {
    const sub = resolveModernDungeonSubtype(subtype);
    lines.push(`### modern_dungeon/${sub} の追加 directive`);
    for (const d of MODERN_DUNGEON_SUBTYPE_DIRECTIVES[sub]) {
      lines.push(`- ${d}`);
    }
    lines.push("");
  } else if (genre && GENRE_DIRECTIVES[genre]) {
    lines.push(`### ジャンル別 directive (${genre})`);
    for (const d of GENRE_DIRECTIVES[genre]) {
      lines.push(`- ${d}`);
    }
    lines.push("");
  }

  const hasLexicon = Boolean(textQuality?.worldLexicon);
  const hasNarrationStyleGuide = Boolean(textQuality?.narrationStyleGuide);
  const hasNavFullSpec = Boolean(textQuality?.navFullSpec);
  const speechStyleCharacters = textQuality?.characters?.filter((c) => c.speech_style) ?? [];
  if (
    hasLexicon ||
    hasNarrationStyleGuide ||
    hasNavFullSpec ||
    speechStyleCharacters.length > 0
  ) {
    lines.push("### text quality directives (bible optional sections)");
    if (hasLexicon) {
      lines.push(
        "- RULE TX-1 (lexicon strict): bible.world.lexicon.forbidden_terms_global に含まれる語彙を panel.dialogue / monologue / narration に出現させてはならない。違反箇所は再生成対象。",
      );
      const forbidden = textQuality?.worldLexicon?.forbidden_terms_global ?? [];
      if (forbidden.length > 0) {
        lines.push(`  禁止語リスト: ${forbidden.join(" / ")}`);
      }
    }
    if (hasNarrationStyleGuide) {
      lines.push(
        "- RULE TX-2 (p1 opening): page_role === \"opening_hook\" の最初の panel では bible.narration_style_guide.p1_opening_directive_specific を強制適用。max_lines / max_chars_per_line / must_avoid を厳守。",
      );
      const rejected =
        textQuality?.narrationStyleGuide?.p1_opening_directive_specific
          ?.rejected_pattern_examples ?? [];
      if (rejected.length > 0) {
        lines.push(`  rejected_pattern_examples は生成した時点で失敗扱い: ${rejected.join(" / ")}`);
      }
    }
    if (hasNavFullSpec) {
      lines.push(
        "- RULE TX-3 (nav voice): bible.nav_full_spec.voice_persona.default_tone に従い、ナビ発話は「敬体・事務的」を default、巻別 emotional_range_per_volume の例外指定がある場合のみ感情表出を許可。",
      );
      const tone = textQuality?.navFullSpec?.voice_persona?.default_tone;
      if (tone) lines.push(`  ナビ default_tone: ${tone}`);
    }
    if (speechStyleCharacters.length > 0) {
      lines.push(
        "- RULE TX-4 (speech style): bible.characters[*].speech_style が存在するキャラの dialogue / monologue は speech_style.first_person / register / ban_phrases を厳守。",
      );
      lines.push(
        `  speech_style 対象: ${speechStyleCharacters.map((c) => `${c.id} (${c.name})`).join(" / ")}`,
      );
    }
    lines.push("");
  }

  if (densityProfile) {
    const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
    lines.push(`## DENSITY POLICY (from ${densityProfile.genre}.json)`);
    lines.push(`- detailed_bg target: ${percent(densityProfile.policy.detailed_bg_target_ratio)} per panel`);
    lines.push(`- atmospheric_fade target: ${percent(densityProfile.policy.atmospheric_fade_target_ratio)}`);
    lines.push(`- solid color target: ${percent(densityProfile.policy.solid_color_target_ratio)}`);
    lines.push(`- max detailed_bg per page: ${densityProfile.policy.max_detailed_bg_per_page}`);
    lines.push(
      `- require atmospheric or tone each page: ${densityProfile.policy.require_atmospheric_or_tone_each_page}`,
    );
    lines.push("- Apply this as a statistical target, not as reference-image copying.");
    lines.push("");
  }

  return lines.join("\n");
}
