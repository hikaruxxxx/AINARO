/**
 * 表紙画像のタイトル合成テンプレート集
 *
 * SVG生成方針:
 * librsvg（sharp が内部利用）は外部フォントの解決が不安定なため、
 * opentype.js でTTFを直接読み込み、文字を <path> 要素に変換する。
 * これにより環境差分（macOS/Linux）に依存せず、常に同じフォントで描画できる。
 *
 * フォントは public/fonts/ 配下のTTFファイルを使用:
 * - 明朝: NotoSerifJP-Bold.ttf
 * - ゴシック: NotoSansJP-Bold.ttf
 * - 丸ゴ: MPLUSRounded1c-Bold.ttf
 */

import opentype from "opentype.js";
import * as path from "path";

const W = 1024;
const H = 1536;

// === フォントローダー（モジュールキャッシュで1回だけ読み込む） ===

export type FontFamily = "serif" | "sans" | "round";

const FONT_FILES: Record<FontFamily, string> = {
  serif: "NotoSerifJP-Bold.ttf",
  sans: "NotoSansJP-Bold.ttf",
  round: "MPLUSRounded1c-Bold.ttf",
};

const fontCache: Partial<Record<FontFamily, opentype.Font>> = {};

/** TTFファイルのパスを解決（プロジェクトルート/public/fonts/） */
function getFontPath(fileName: string): string {
  // Node.js環境では process.cwd() ベースで解決（Next.jsのAPI Route, scripts どちらでも動く）
  return path.join(process.cwd(), "public", "fonts", fileName);
}

function loadFont(family: FontFamily): opentype.Font {
  if (!fontCache[family]) {
    fontCache[family] = opentype.loadSync(getFontPath(FONT_FILES[family]));
  }
  return fontCache[family]!;
}

/**
 * 文字列をSVG <path> 要素として描画する
 * @param text 描画する文字列
 * @param x 描画開始のX座標
 * @param y ベースラインのY座標
 * @param fontSize フォントサイズ（px）
 * @param family フォントファミリー
 * @param options 描画オプション
 * @returns <path> 要素のSVG文字列
 */
function renderTextPath(
  text: string,
  x: number,
  y: number,
  fontSize: number,
  family: FontFamily,
  options: {
    align?: "left" | "center" | "right";
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
  } = {}
): string {
  const font = loadFont(family);
  const { align = "left", fill = "white", stroke, strokeWidth } = options;

  // 中央寄せ・右寄せ用にテキスト幅を計算
  let drawX = x;
  if (align === "center" || align === "right") {
    const width = font.getAdvanceWidth(text, fontSize);
    if (align === "center") drawX = x - width / 2;
    else drawX = x - width;
  }

  const fontPath = font.getPath(text, drawX, y, fontSize);
  const d = fontPath.toPathData(2); // 小数2桁精度

  const strokeAttr = stroke
    ? ` stroke="${stroke}" stroke-width="${strokeWidth ?? 1}" stroke-linejoin="round"`
    : "";

  return `<path d="${d}" fill="${fill}"${strokeAttr}/>`;
}

// === ユーティリティ ===

// タイトル長から自動でフォントサイズを決める
function autoFontSize(text: string, max = 110, min = 60): number {
  const len = text.length;
  if (len <= 6) return max;
  if (len <= 10) return Math.round(max * 0.85);
  if (len <= 14) return Math.round(max * 0.7);
  return Math.max(min, Math.round((max * 10) / len));
}

// テキストを最大文字数で折り返し
function wrap(text: string, maxLen: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const ch of text) {
    cur += ch;
    if (cur.length >= maxLen) {
      lines.push(cur);
      cur = "";
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export type CoverData = {
  title: string;
  subtitle?: string | null;
  author?: string | null;
  /** タイトル・キャプションに使うフォントファミリー（省略時は serif） */
  font?: FontFamily;
};

// === テンプレート1: 上部横書き + 影（汎用） ===
export function templateTopHorizontal(d: CoverData): string {
  const titleSize = autoFontSize(d.title, 110);
  const family = d.font ?? "serif";

  const titlePath = renderTextPath(d.title, W / 2, H * 0.18, titleSize, family, {
    align: "center",
    fill: "white",
    stroke: "rgba(0,0,0,0.7)",
    strokeWidth: 3,
  });

  const subtitlePath = d.subtitle
    ? renderTextPath(d.subtitle, W / 2, H * 0.25, 40, family, {
        align: "center",
        fill: "white",
      })
    : "";

  const authorPath = d.author
    ? renderTextPath(d.author, W / 2, H * 0.95, 42, family, {
        align: "center",
        fill: "white",
      })
    : "";

  return `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="topShade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(0,0,0,0.65)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </linearGradient>
    <linearGradient id="botShade" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stop-color="rgba(0,0,0,0.7)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${W}" height="${H * 0.32}" fill="url(#topShade)"/>
  <rect x="0" y="${H * 0.82}" width="${W}" height="${H * 0.18}" fill="url(#botShade)"/>
  ${titlePath}
  ${subtitlePath}
  ${authorPath}
</svg>`;
}

// === テンプレート2: 縦書き右寄せ（和風） ===
export function templateVerticalRight(d: CoverData): string {
  const charSize = 90;
  const startY = H * 0.08;
  const titleX = W * 0.88;
  const family = d.font ?? "serif";

  // 縦書きは1文字ずつ描画（path化）
  const titleChars = d.title
    .split("")
    .map((c, i) =>
      renderTextPath(c, titleX, startY + (i + 1) * charSize, charSize, family, {
        align: "center",
        fill: "white",
        stroke: "rgba(0,0,0,0.8)",
        strokeWidth: 3,
      })
    )
    .join("\n");

  const subChars = d.subtitle
    ? d.subtitle
        .split("")
        .map((c, i) =>
          renderTextPath(c, W * 0.78, startY + 60 + (i + 1) * 50, 42, family, {
            align: "center",
            fill: "white",
            stroke: "rgba(0,0,0,0.7)",
            strokeWidth: 1,
          })
        )
        .join("\n")
    : "";

  const authorPath = d.author
    ? renderTextPath(d.author, W * 0.5, H * 0.96, 40, family, {
        align: "center",
        fill: "white",
        stroke: "rgba(0,0,0,0.6)",
        strokeWidth: 1,
      })
    : "";

  return `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="rightShade" x1="1" y1="0" x2="0" y2="0">
      <stop offset="0%" stop-color="rgba(0,0,0,0.65)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </linearGradient>
  </defs>
  <rect x="${W * 0.65}" y="0" width="${W * 0.35}" height="${H}" fill="url(#rightShade)"/>
  ${titleChars}
  ${subChars}
  ${authorPath}
</svg>`;
}

// === テンプレート3: 下部カラー帯（少女向け書籍風） ===
export function templateBottomBand(
  d: CoverData,
  accentColor = "#c2185b"
): string {
  const lines =
    d.title.length > 10 ? wrap(d.title, Math.ceil(d.title.length / 2)) : [d.title];
  const lineSize = lines.length === 1 ? 100 : 80;
  const bandTop = H * 0.62;
  const bandHeight = H * 0.38;
  const family = d.font ?? "serif";

  const titlePaths = lines
    .map((l, i) =>
      renderTextPath(
        l,
        W / 2,
        bandTop + 100 + i * (lineSize + 10),
        lineSize,
        family,
        { align: "center", fill: "white" }
      )
    )
    .join("\n");

  const subtitlePath = d.subtitle
    ? renderTextPath(
        d.subtitle,
        W / 2,
        bandTop + 100 + lines.length * (lineSize + 10) + 20,
        42,
        family,
        { align: "center", fill: "white" }
      )
    : "";

  const authorPath = d.author
    ? renderTextPath(`著／${d.author}`, W / 2, H * 0.96, 38, family, {
        align: "center",
        fill: "white",
      })
    : "";

  return `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="${bandTop}" width="${W}" height="${bandHeight}" fill="${accentColor}" opacity="0.92"/>
  <rect x="0" y="${bandTop - 8}" width="${W}" height="8" fill="white" opacity="0.9"/>
  ${titlePaths}
  ${subtitlePath}
  ${authorPath}
</svg>`;
}

// === テンプレート4: 中央フレーム（額装風） ===
export function templateCenterFrame(d: CoverData): string {
  const titleSize = autoFontSize(d.title, 95);
  const cy = H * 0.5;
  const family = d.font ?? "serif";

  const titlePath = renderTextPath(d.title, W / 2, cy - 30, titleSize, family, {
    align: "center",
    fill: "white",
  });

  const subtitlePath = d.subtitle
    ? renderTextPath(d.subtitle, W / 2, cy + 50, 40, family, {
        align: "center",
        fill: "white",
      })
    : "";

  const authorPath = d.author
    ? renderTextPath(d.author, W / 2, cy + 130, 36, family, {
        align: "center",
        fill: "white",
      })
    : "";

  return `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect x="${W * 0.08}" y="${cy - 180}" width="${W * 0.84}" height="360" fill="rgba(0,0,0,0.55)"/>
  <rect x="${W * 0.08}" y="${cy - 180}" width="${W * 0.84}" height="360" fill="none" stroke="white" stroke-width="3" opacity="0.9"/>
  <rect x="${W * 0.09}" y="${cy - 178}" width="${W * 0.82}" height="356" fill="none" stroke="white" stroke-width="1" opacity="0.6"/>
  ${titlePath}
  ${subtitlePath}
  ${authorPath}
</svg>`;
}

// === ジャンル別: 風景プロンプト + テンプレート + フォント ===
type GenreConfig = {
  /** Pollinations.aiに渡す英語プロンプト（風景・キャラなし） */
  scenePrompt: string;
  /** SVG生成関数 */
  template: (d: CoverData) => string;
  /** ジャンル既定のフォントファミリー */
  font: FontFamily;
};

export const GENRE_CONFIGS: Record<string, GenreConfig> = {
  fantasy: {
    scenePrompt:
      "ancient stone castle on a mountain at sunset, magical glowing crystals, mystical forest, dramatic clouds, fantasy landscape, no people, no text, cinematic digital painting",
    template: templateCenterFrame,
    font: "serif",
  },
  romance: {
    scenePrompt:
      "cherry blossom park at sunset, soft pastel colors, dreamy atmosphere, falling petals, beautiful empty bench, no people, no text, romantic landscape illustration",
    template: (d) => templateBottomBand(d, "#e94e77"),
    font: "round",
  },
  villainess: {
    scenePrompt:
      "elegant rose garden in a victorian palace at dusk, red roses, marble fountain, ornate balcony, no people, no text, gothic romance landscape, detailed illustration",
    template: (d) => templateBottomBand(d, "#8b1538"),
    font: "round",
  },
  horror: {
    scenePrompt:
      "abandoned japanese school hallway at midnight, flickering lights, mist, unsettling atmosphere, dark cinematic, no people, no text, horror landscape",
    template: templateTopHorizontal,
    font: "serif",
  },
  mystery: {
    scenePrompt:
      "rainy noir city alley at night, vintage street lamps, wet pavement reflections, fog, no people, no text, mystery noir landscape illustration",
    template: templateCenterFrame,
    font: "serif",
  },
  scifi: {
    scenePrompt:
      "futuristic cyberpunk city skyline at night, neon lights, flying cars, holographic billboards, no people, no text, sci-fi landscape digital art",
    template: templateCenterFrame,
    font: "sans",
  },
  drama: {
    scenePrompt:
      "tokyo city skyline at sunset from a rooftop, warm orange light, distant buildings, melancholic atmosphere, no people, no text, urban landscape illustration",
    template: templateTopHorizontal,
    font: "serif",
  },
  comedy: {
    scenePrompt:
      "bright sunny school courtyard with cherry blossoms, blue sky, white clouds, cheerful atmosphere, no people, no text, slice of life landscape illustration",
    template: (d) => templateBottomBand(d, "#f9a826"),
    font: "sans",
  },
  action: {
    scenePrompt:
      "dramatic battlefield at dusk, smoke and fire, ruined urban street, intense atmosphere, no people, no text, action landscape digital painting",
    template: (d) => templateBottomBand(d, "#1a1a1a"),
    font: "sans",
  },
  other: {
    scenePrompt:
      "dramatic mystical landscape at golden hour, beautiful sky, no people, no text, cinematic illustration",
    template: templateTopHorizontal,
    font: "serif",
  },
};

/** ジャンル文字列から設定を取得（未知ジャンルはotherにフォールバック） */
export function getGenreConfig(genre: string): GenreConfig {
  return GENRE_CONFIGS[genre] ?? GENRE_CONFIGS.other;
}
