/**
 * Week 0 Pilot 拡張 v2: 漫画作法 v2 準拠の吹き出し+SFX+キャラ紹介ボックスを page-01.png に焼き込む。
 *
 * v1 (pilot-page-bubbles.ts) はナレーション禁則違反・SFX欠如・横書きで完全に作法違反だった。
 * v2 では manga_craft_guide.md に従い:
 *   - 主人公独白は雲型 (thought)、縦書き
 *   - SFX (オノマトペ) を panel 内に手描き風太字で配置
 *   - キャラ紹介ボックス (s1) を四角枠で実装
 *   - 同僚会話バブル (s1) で会話による世界観説明
 *   - ナレーションBOX は1個だけ (s5)
 *   - 派手 vs 地味ギャップ: 派遣→ダンジョン要素を独白で繋ぐ
 *
 * 出力: data/manga/feasibility-week0/pilot/page-composite-pilot/page-01-with-bubbles-v2.png
 *
 * 実行: npx tsx scripts/manga/feasibility-week0/pilot-page-bubbles-v2.ts
 */

import "../_env";
import path from "path";
import sharp from "sharp";

import { PAGE_DIMENSIONS } from "@/lib/manga/page-director/types";

const REPO_ROOT = process.env.AINARO_REPO_ROOT ?? process.cwd();
const PILOT_DIR = path.join(
  REPO_ROOT,
  "data",
  "manga",
  "feasibility-week0",
  "pilot",
  "page-composite-pilot"
);
const INPUT_PNG = path.join(PILOT_DIR, "page-01.png");
const OUTPUT_PNG = path.join(PILOT_DIR, "page-01-with-bubbles-v2.png");

const W = PAGE_DIMENSIONS.width; // 1748
const H = PAGE_DIMENSIONS.height; // 2480

const FONT_JP =
  '"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", "MS Mincho", serif';
const FONT_JP_GOTHIC =
  '"Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans JP", "MS Gothic", sans-serif';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ============================================================
// 縦書きテキスト builder
// 仕様: \n で列分割。右列が先頭 (右→左に列が進む)。
// ============================================================
type VerticalTextOpts = {
  text: string; // "データ入力で日給1万\nダンジョンの薬草と同じだな"
  /** 右端列の中心X (列はここから左へ進む) */
  rightX: number;
  /** 上端Y (1文字目の上端、padding込みでない) */
  topY: number;
  fontSize: number;
  fill?: string;
  fontFamily?: string;
  fontWeight?: number;
};

function buildVerticalText(opts: VerticalTextOpts): {
  svg: string;
  width: number;
  height: number;
} {
  const {
    text,
    rightX,
    topY,
    fontSize,
    fill = "#0a0a0a",
    fontFamily = FONT_JP,
    fontWeight = 500,
  } = opts;
  const lineGap = Math.round(fontSize * 0.18);
  const charStep = fontSize + lineGap;
  const colGap = Math.round(fontSize * 0.4);
  const colStep = fontSize + colGap;

  const cols = text.split("\n");
  const parts: string[] = [];
  let maxLen = 0;
  for (let colIdx = 0; colIdx < cols.length; colIdx++) {
    const col = cols[colIdx];
    if (col.length > maxLen) maxLen = col.length;
    const colX = rightX - colIdx * colStep;
    for (let i = 0; i < col.length; i++) {
      const ch = col[i];
      const charY = topY + (i + 1) * charStep - lineGap; // 1文字目を topY 直下に
      parts.push(
        `<text x="${colX}" y="${charY}" font-family='${fontFamily}' font-size="${fontSize}" font-weight="${fontWeight}" fill="${fill}" text-anchor="middle" dominant-baseline="alphabetic">${escapeXml(ch)}</text>`
      );
    }
  }
  return {
    svg: parts.join(""),
    width: cols.length * colStep,
    height: maxLen * charStep,
  };
}

// ============================================================
// 雲型独白 (thought, 縦書き)
// 仕様: 雲のラフ楕円 + 内部に縦書きテキスト
// ============================================================
type ThoughtBubbleOpts = {
  text: string;
  /** 中心X */
  cx: number;
  /** 中心Y */
  cy: number;
  fontSize?: number;
  /** padding (テキスト周囲、px) */
  padding?: number;
};

function buildThoughtBubble(opts: ThoughtBubbleOpts): string {
  const fontSize = opts.fontSize ?? 32;
  const padding = opts.padding ?? 24;

  const cols = opts.text.split("\n");
  const lineGap = Math.round(fontSize * 0.18);
  const charStep = fontSize + lineGap;
  const colGap = Math.round(fontSize * 0.4);
  const colStep = fontSize + colGap;
  const maxLen = Math.max(...cols.map((c) => c.length));

  const innerW = cols.length * colStep;
  const innerH = maxLen * charStep;

  const totalW = innerW + padding * 2;
  const totalH = innerH + padding * 2;

  const rx = totalW / 2;
  const ry = totalH / 2;

  // 雲のラフ楕円 (波打つ輪郭)
  const lobes = 14;
  const points: string[] = [];
  for (let i = 0; i < lobes; i++) {
    const t = (i / lobes) * Math.PI * 2;
    const wobble = i % 2 === 0 ? 1.0 : 0.85;
    const px = opts.cx + Math.cos(t) * rx * wobble;
    const py = opts.cy + Math.sin(t) * ry * wobble;
    points.push(`${px.toFixed(1)},${py.toFixed(1)}`);
  }
  const cloudPath = `M ${points[0]} ${points
    .slice(1)
    .map((p) => `L ${p}`)
    .join(" ")} Z`;

  // 雲の輪郭 (実線でない感を出すため stroke-dasharray は使わず、雲lobeでうねらせる)
  const cloud = `<path d="${cloudPath}" fill="#ffffff" stroke="#0a0a0a" stroke-width="2.5" stroke-linejoin="round" />`;

  // 縦書きテキスト (右列から)
  const textRightX = opts.cx + innerW / 2 - colStep / 2;
  const textTopY = opts.cy - innerH / 2;
  const v = buildVerticalText({
    text: opts.text,
    rightX: textRightX,
    topY: textTopY,
    fontSize,
    fill: "#0a0a0a",
    fontFamily: FONT_JP,
    fontWeight: 500,
  });

  return `<g data-bubble-type="thought">${cloud}${v.svg}</g>`;
}

// ============================================================
// 普通の会話バブル (横書き、楕円形)
// ============================================================
type SpeechBubbleOpts = {
  text: string; // 横書き、改行は \n
  cx: number;
  cy: number;
  width: number;
  height: number;
  fontSize?: number;
  /** 尻尾の先端 (話者方向) */
  tail?: { x: number; y: number };
};

function buildSpeechBubble(opts: SpeechBubbleOpts): string {
  const fontSize = opts.fontSize ?? 24;
  const { cx, cy, width, height } = opts;
  const x = cx - width / 2;
  const y = cy - height / 2;
  const rx = width / 2;
  const ry = height / 2;

  const ellipse = `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#ffffff" stroke="#0a0a0a" stroke-width="2.5" />`;

  let tail = "";
  if (opts.tail) {
    const baseY = cy + ry - 4;
    const baseLX = cx - 12;
    const baseRX = cx + 12;
    tail = `<polygon points="${baseLX},${baseY} ${baseRX},${baseY} ${opts.tail.x},${opts.tail.y}" fill="#ffffff" stroke="#0a0a0a" stroke-width="2.5" />`;
  }

  // テキスト中央寄せ (1行ずつ)
  const lines = opts.text.split("\n");
  const lineHeight = fontSize + 6;
  const startY = cy - ((lines.length - 1) * lineHeight) / 2;
  const textTags = lines
    .map((ln, i) => {
      const ty = startY + i * lineHeight;
      return `<text x="${cx}" y="${ty}" font-family='${FONT_JP_GOTHIC}' font-size="${fontSize}" font-weight="500" fill="#0a0a0a" text-anchor="middle" dominant-baseline="middle">${escapeXml(ln)}</text>`;
    })
    .join("");

  return `<g data-bubble-type="normal">${ellipse}${tail}${textTags}</g>`;
}

// ============================================================
// SFX (オノマトペ) — 手描き風太字、白縁取り、傾き
// ============================================================
type SfxOpts = {
  text: string;
  /** 中心X */
  cx: number;
  /** 中心Y */
  cy: number;
  fontSize?: number;
  /** 回転角 (deg、デフォルト -8) */
  rotation?: number;
  /** 太さ */
  fontWeight?: number;
};

function buildSfx(opts: SfxOpts): string {
  const fontSize = opts.fontSize ?? 80;
  const rotation = opts.rotation ?? -8;
  const fontWeight = opts.fontWeight ?? 900;
  const stroke = Math.max(4, Math.round(fontSize * 0.1));

  return `<g transform="translate(${opts.cx} ${opts.cy}) rotate(${rotation})">
    <text x="0" y="0" font-family='${FONT_JP}' font-size="${fontSize}" font-weight="${fontWeight}" fill="#0a0a0a" stroke="#ffffff" stroke-width="${stroke}" paint-order="stroke fill" text-anchor="middle" dominant-baseline="middle">${escapeXml(opts.text)}</text>
  </g>`;
}

// ============================================================
// キャラ紹介ボックス (四角枠 + 複数行)
// ============================================================
type IntroBoxOpts = {
  /** 左上 */
  x: number;
  y: number;
  width: number;
  height: number;
  lines: string[];
  fontSize?: number;
};

function buildIntroBox(opts: IntroBoxOpts): string {
  const fontSize = opts.fontSize ?? 26;
  const lineHeight = fontSize + 8;
  const padding = 14;

  const rect = `<rect x="${opts.x}" y="${opts.y}" width="${opts.width}" height="${opts.height}" fill="#ffffff" stroke="#0a0a0a" stroke-width="2" />`;

  const totalText = opts.lines.length * lineHeight;
  const startY = opts.y + (opts.height - totalText) / 2 + fontSize;

  const tags = opts.lines
    .map((ln, i) => {
      const ty = startY + i * lineHeight;
      return `<text x="${opts.x + padding}" y="${ty}" font-family='${FONT_JP_GOTHIC}' font-size="${fontSize}" font-weight="500" fill="#0a0a0a">${escapeXml(ln)}</text>`;
    })
    .join("");

  return `<g data-bubble-type="intro_box">${rect}${tags}</g>`;
}

// ============================================================
// ナレーションBOX (細い四角、横書き、1行)
// ============================================================
type NarrationOpts = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
};

function buildNarrationBox(opts: NarrationOpts): string {
  const fontSize = opts.fontSize ?? 24;
  const rect = `<rect x="${opts.x}" y="${opts.y}" width="${opts.width}" height="${opts.height}" fill="#fafafa" stroke="#0a0a0a" stroke-width="2" />`;
  const cx = opts.x + opts.width / 2;
  const cy = opts.y + opts.height / 2;
  const text = `<text x="${cx}" y="${cy}" font-family='${FONT_JP_GOTHIC}' font-size="${fontSize}" font-weight="600" fill="#0a0a0a" text-anchor="middle" dominant-baseline="middle">${escapeXml(opts.text)}</text>`;
  return `<g data-bubble-type="narration">${rect}${text}</g>`;
}

// ============================================================
// レイアウト定義 (作法 v2 準拠)
// slot 矩形:
//   s1: { x: 24,  y: 24,   w: 1700, h: 708  }  上段 wide
//   s2: { x: 886, y: 756,  w: 838,  h: 826  }  中段右 (hands)
//   s3: { x: 24,  y: 756,  w: 838,  h: 826  }  中段左 (face)
//   s4: { x: 886, y: 1606, w: 838,  h: 850  }  下段右 (onigiri)
//   s5: { x: 24,  y: 1606, w: 838,  h: 850  }  下段左 (window)
// ============================================================

const elements: string[] = [];

// --- s1: キャラ紹介ボックス + 同僚会話バブル + 環境SFX ---
elements.push(
  buildIntroBox({
    x: 1380,
    y: 60,
    width: 320,
    height: 200,
    lines: ["立花 陸  (たちばな りく)", "24歳 / 派遣社員", "副業: D級ダンジョン探索者", "月収10万 (薬草採取)"],
    fontSize: 22,
  })
);

elements.push(
  buildSpeechBubble({
    text: "派遣はラクで\nいいよな〜",
    cx: 320,
    cy: 250,
    width: 200,
    height: 90,
    fontSize: 22,
    tail: { x: 360, y: 340 },
  })
);

elements.push(
  buildSfx({
    text: "ガヤガヤ…",
    cx: 1100,
    cy: 660,
    fontSize: 56,
    rotation: -6,
  })
);

// --- s2: SFX「カタ…カタ…」+ 主人公独白 (雲型 縦書き) ---
elements.push(
  buildSfx({
    text: "カタ…カタ…",
    cx: 1450,
    cy: 1480,
    fontSize: 70,
    rotation: -10,
  })
);

elements.push(
  buildThoughtBubble({
    text: "データ入力で\n日給一万",
    cx: 1010,
    cy: 880,
    fontSize: 28,
    padding: 18,
  })
);

elements.push(
  buildThoughtBubble({
    text: "薬草採取と\n同じだな",
    cx: 1180,
    cy: 1100,
    fontSize: 28,
    padding: 18,
  })
);

// --- s3: 主人公独白 (雲型 縦書き) 連続2個 = 焦り ---
elements.push(
  buildThoughtBubble({
    text: "来月の家賃",
    cx: 700,
    cy: 870,
    fontSize: 30,
    padding: 18,
  })
);

elements.push(
  buildThoughtBubble({
    text: "足りない",
    cx: 600,
    cy: 1080,
    fontSize: 30,
    padding: 18,
  })
);

// --- s4: SFX「カサ…」+ 主人公独白 (雲型) ---
elements.push(
  buildSfx({
    text: "カサ…",
    cx: 1480,
    cy: 1750,
    fontSize: 64,
    rotation: -7,
  })
);

elements.push(
  buildThoughtBubble({
    text: "これと水で\n十分だ",
    cx: 1010,
    cy: 1750,
    fontSize: 28,
    padding: 18,
  })
);

elements.push(
  buildThoughtBubble({
    text: "装備の予算は\n千五百円",
    cx: 1180,
    cy: 2010,
    fontSize: 26,
    padding: 16,
  })
);

// --- s5: ナレーションBOX (1個許容) + 主人公独白 + 環境SFX ---
elements.push(
  buildNarrationBox({
    text: "2024年 東京  ダンジョン化10年目",
    x: 60,
    y: 1640,
    width: 540,
    height: 60,
    fontSize: 24,
  })
);

elements.push(
  buildThoughtBubble({
    text: "俺は今日も\n地下へ潜る",
    cx: 460,
    cy: 1820,
    fontSize: 30,
    padding: 18,
  })
);

elements.push(
  buildSfx({
    text: "ザワ…",
    cx: 280,
    cy: 2330,
    fontSize: 56,
    rotation: -8,
  })
);

// ============================================================
// SVG 全体を構築 → sharp で焼き込み
// ============================================================

const svgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${elements.join("")}</svg>`;

async function main(): Promise<void> {
  console.log(`[bubbles-v2] input  = ${INPUT_PNG}`);
  console.log(`[bubbles-v2] output = ${OUTPUT_PNG}`);
  console.log(`[bubbles-v2] elements=${elements.length}`);

  const startedAt = Date.now();
  await sharp(INPUT_PNG)
    .composite([
      {
        input: Buffer.from(svgString),
        top: 0,
        left: 0,
      },
    ])
    .png()
    .toFile(OUTPUT_PNG);

  console.log(
    `[bubbles-v2] DONE → ${OUTPUT_PNG} (${((Date.now() - startedAt) / 1000).toFixed(2)}s)`
  );
}

main().catch((err) => {
  console.error("[bubbles-v2] FAILED:", err);
  process.exit(1);
});
