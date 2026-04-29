/**
 * サブジャンル別タイポグラフィ・配色パターン
 *
 * features.json (alphapolis fantasy top 47) の Vision 分析から抽出した
 * 売れ筋ラノベ表紙のサブジャンル別パターン。gpt-image プロンプト構築時に
 * このパターンを英語で文字列化して埋め込む。
 *
 * 構造はプロンプト埋込用のフリー文章中心。色名・フォント感を明確にし、
 * gpt-image が「商業ラノベ表紙風」を再現しやすい記述にしてある。
 */

export type Subgenre =
  | "isekai_tensei_male"
  | "villainess"
  | "royal_palace"
  | "slowlife"
  | "cooking"
  | "beast_companion"
  | "tsuiho_zamaa"
  | "reincarnation_animal"
  | "dungeon"
  | "other";

export type TypographySpec = {
  /** タイトルロゴの英語スタイル指示 */
  titleLogoStyle: string;
  /** メイン色相（タイトル文字色の方向性） */
  titleColorMain: string;
  /** タイトル位置 */
  titlePosition: "top" | "center" | "bottom";
  /** 全体の色味 */
  paletteMood: string;
  /** アートスタイル */
  artStyle: string;
  /** 装飾（販促ステッカーや装飾ラインなど） */
  decoration: string;
};

const SUBGENRE_SPECS: Record<Subgenre, TypographySpec> = {
  isekai_tensei_male: {
    titleLogoStyle:
      "Bold Japanese light novel logo design with strong outline (white border + dark drop shadow), slightly tilted dynamic feel, masculine sharp edges, hint of metallic or magical gradient inside the strokes",
    titleColorMain: "high-saturation red, gold, or deep blue with white outline",
    titlePosition: "top",
    paletteMood: "vivid saturated colors, dramatic lighting, magical accents (purple/blue glow)",
    artStyle: "modern anime light novel illustration, clean digital painting with strong character focus",
    decoration:
      "small decorative ornament lines flanking the title, optional small subtitle band below the title, optional callout sticker (bottom-right or top-right corner) — DO NOT invent fake sales numbers or hype phrases unless explicitly provided",
  },
  villainess: {
    titleLogoStyle:
      "Elegant Japanese mincho (serif) logo with refined thin strokes, possibly vertical-feeling layout, ornate letterforms with flourishes, gold/dark-red accent fills, sophisticated calligraphic touches",
    titleColorMain: "deep red, burgundy, gold, or ivory with thin outline",
    titlePosition: "top",
    paletteMood:
      "rich deep palette of crimson, gold, dark purple and ivory; baroque chiaroscuro lighting at twilight",
    artStyle: "anime light novel illustration with painterly polish, romantic gothic atmosphere",
    decoration:
      "decorative rose / floral / filigree ornament around title, often a horizontal divider line, sometimes a thin gold frame around title block",
  },
  royal_palace: {
    titleLogoStyle:
      "Elegant mincho or refined serif logo with gold/silver metallic gradient fills and crisp outlines, regal feel",
    titleColorMain: "gold, silver, white, or deep navy",
    titlePosition: "top",
    paletteMood: "regal palette of gold, navy, ivory, deep purple; soft palace interior lighting",
    artStyle: "anime light novel illustration, ornate court setting, fine detailing on costume and architecture",
    decoration: "crown-like or laurel ornament accents around the title, occasional frame motif",
  },
  slowlife: {
    titleLogoStyle:
      "Soft rounded logo design (maru-go style), gentle thick strokes, friendly cute feel, warm gradient inside letters, white/cream outline",
    titleColorMain: "warm orange, brown, cream, or soft green",
    titlePosition: "top",
    paletteMood: "warm pastel palette of orange, cream, soft green, sky blue; sunlit cozy atmosphere",
    artStyle: "warm anime watercolor / soft pastel light novel illustration, cheerful relaxed mood",
    decoration: "small leaf / sparkle / star ornaments, friendly subtitle band below title",
  },
  cooking: {
    titleLogoStyle:
      "Playful chunky rounded logo with 3D depth (slight extruded shadow), warm orange/yellow fills, white outline + dark shadow, appetizing feel",
    titleColorMain: "vivid orange, yellow, or warm red with white outline",
    titlePosition: "top",
    paletteMood:
      "warm vivid palette of orange, yellow, cream and brown; appetizing food highlights and steam",
    artStyle: "cheerful anime light novel illustration, food and ingredients prominently rendered",
    decoration:
      "small food / utensil / steam motifs near the title, friendly subtitle band, optional small callout sticker",
  },
  beast_companion: {
    titleLogoStyle:
      "Friendly rounded or moderately bold logo design with white outline, gentle gradient (warm or pastel), often with cute paw / leaf / sparkle accents in or around the letters",
    titleColorMain: "warm orange, soft pink, sky blue, or cream",
    titlePosition: "top",
    paletteMood: "bright saturated palette with green/blue/orange; cheerful outdoor lighting",
    artStyle: "anime light novel illustration emphasizing the cute companion creature next to the protagonist",
    decoration: "small paw print / leaf / star ornaments around the title, friendly subtitle band",
  },
  tsuiho_zamaa: {
    titleLogoStyle:
      "Bold dramatic logo with strong outline, slight metallic / magical gradient, optional crack or shatter effect for the 'reversal' theme",
    titleColorMain: "deep red, gold, or icy blue with white outline",
    titlePosition: "top",
    paletteMood: "dramatic palette of crimson, gold, deep blue; tense atmospheric lighting",
    artStyle: "anime light novel illustration with strong dramatic posing of the protagonist",
    decoration: "decorative ornament lines flanking the title, sometimes a horizontal divider",
  },
  reincarnation_animal: {
    titleLogoStyle:
      "Cute round / chibi-friendly logo with thick strokes, white outline, warm pastel fills, playful feel",
    titleColorMain: "warm pastel orange, pink, or cream",
    titlePosition: "top",
    paletteMood: "soft pastel palette, gentle warm light, lots of green / nature accents",
    artStyle: "cute chibi-leaning anime illustration with the small reincarnated creature as focal point",
    decoration: "small star / heart / paw ornaments, friendly subtitle band",
  },
  dungeon: {
    titleLogoStyle:
      "Bold sharp logo with strong outline, metallic / stone-textured gradient, slight tilt for action feel",
    titleColorMain: "deep blue, silver, or amber with white outline",
    titlePosition: "top",
    paletteMood: "dark moody palette of stone gray, deep blue, amber torchlight; underground atmosphere",
    artStyle: "anime light novel illustration with action posing, dungeon / labyrinth backdrop",
    decoration: "small sword / shield / rune ornaments, optional horizontal divider line",
  },
  other: {
    titleLogoStyle:
      "Modern Japanese light novel logo design with white outline, soft drop shadow, gentle gradient inside the letters",
    titleColorMain: "color appropriate to the story mood, with white outline",
    titlePosition: "top",
    paletteMood: "balanced palette appropriate to the story",
    artStyle: "modern anime light novel illustration",
    decoration: "small ornament accents around the title, optional subtitle band",
  },
};

export function getTypographySpec(subgenre: Subgenre): TypographySpec {
  return SUBGENRE_SPECS[subgenre] ?? SUBGENRE_SPECS.other;
}

/** ジャンル文字列（DBの genre 値）から最も近いサブジャンルを推定する */
export function inferSubgenreFromGenre(genre: string, title?: string): Subgenre {
  const t = (title ?? "").toLowerCase();
  const g = genre.toLowerCase();

  // タイトルキーワード優先（より具体）
  if (/(悪役令嬢|公爵令嬢|聖女|王女|姫|王宮|宮廷)/.test(title ?? "")) {
    if (/悪役令嬢/.test(title!)) return "villainess";
    return "royal_palace";
  }
  if (/(料理|ごはん|キッチン|レシピ|パティシエ|食堂|レストラン)/.test(title ?? "")) {
    return "cooking";
  }
  if (/(もふもふ|ふもふ|従魔|テイマー|ペット|愛犬|聖獣|神獣|子ドラゴン|ドラゴン娘)/.test(title ?? "")) {
    return "beast_companion";
  }
  if (/(スローライフ|のんびり|辺境|薬師|畑|農場|料理長)/.test(title ?? "")) {
    return "slowlife";
  }
  if (/(追放|ざまあ|捨て|断罪|裏切り)/.test(title ?? "")) {
    return "tsuiho_zamaa";
  }
  if (/(ダンジョン|迷宮|地下)/.test(title ?? "")) {
    return "dungeon";
  }
  if (/(転生.*動物|動物.*転生|スライム|犬になった|猫になった)/.test(title ?? "")) {
    return "reincarnation_animal";
  }

  // ジャンル値ベース
  if (g.includes("villainess")) return "villainess";
  if (g.includes("slowlife")) return "slowlife";
  if (g.includes("tsuiho")) return "tsuiho_zamaa";
  if (g.includes("isekai_tensei_cheat") || g.includes("isekai")) return "isekai_tensei_male";

  return "other";
}
