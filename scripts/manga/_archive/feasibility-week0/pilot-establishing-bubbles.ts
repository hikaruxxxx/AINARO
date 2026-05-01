/**
 * establishing-pilot/page-01.png に見本準拠の吹き出しを焼き込む。
 *
 * 改訂方針 (kindle-test-1 c_0008-c_0024 を再精読した結果):
 *   - 角丸長方形バブルが90% (楕円・雲型は補助のみ廃止)
 *   - 縦書きが完全標準 (横書きは UI panel/スマホ画面/動画画面の中だけ)
 *   - 細ゴシック書体 (明朝廃止)
 *   - 1ページ 10-20個の高密度
 *   - ナレーションBOX 4個並列で世界観説明 (panel 1 上に重ねる)
 *   - キャラ紹介ボックス: 主人公 panel の下中央に細枠3行
 *
 * panel構成 (big_top_5):
 *   s1: 上段大ゴマ - YouTube動画UI (パネル外側上に世界観ナレーション4個並列)
 *   s2: 中段右 - ニュース速報スマホ
 *   s3: 中段左 - 街俯瞰 + 通行人会話
 *   s4: 下段右 - D級証カード + キャラ紹介ボックス
 *   s5: 下段左 - 主人公シルエット + 主人公独白
 *
 * 出力: data/manga/feasibility-week0/pilot/establishing-pilot/page-01-with-bubbles.png
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
  "establishing-pilot"
);
const INPUT_PNG = path.join(PILOT_DIR, "page-01.png");
const OUTPUT_PNG = path.join(PILOT_DIR, "page-01-with-bubbles.png");

const W = PAGE_DIMENSIONS.width; // 1748
const H = PAGE_DIMENSIONS.height; // 2480

const FONT_GOTHIC =
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
// 縦書きテキスト (右列起点、列は左へ進む)
// ============================================================
type VTextOpts = {
  text: string;
  rightX: number;
  topY: number;
  fontSize: number;
  fill?: string;
  fontWeight?: number;
};

function buildVerticalText(opts: VTextOpts): {
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
    fontWeight = 400,
  } = opts;
  const lineGap = Math.round(fontSize * 0.12);
  const charStep = fontSize + lineGap;
  const colGap = Math.round(fontSize * 0.35);
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
      const charY = topY + (i + 1) * charStep - lineGap;
      parts.push(
        `<text x="${colX}" y="${charY}" font-family='${FONT_GOTHIC}' font-size="${fontSize}" font-weight="${fontWeight}" fill="${fill}" text-anchor="middle" dominant-baseline="alphabetic">${escapeXml(ch)}</text>`
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
// 角丸長方形バブル (縦書き) — 商業漫画の標準形
// ============================================================
type RectBubbleOpts = {
  text: string; // \n で改行 (列分割)
  cx: number;
  cy: number;
  fontSize?: number;
  padding?: number;
  /** 尻尾の先端 */
  tail?: { x: number; y: number };
  /** 余分な強調 (太字感) */
  bold?: boolean;
};

function buildRectBubble(opts: RectBubbleOpts): string {
  const fontSize = opts.fontSize ?? 26;
  const padding = opts.padding ?? 16;
  const fontWeight = opts.bold ? 700 : 500;

  const cols = opts.text.split("\n");
  const lineGap = Math.round(fontSize * 0.12);
  const charStep = fontSize + lineGap;
  const colGap = Math.round(fontSize * 0.35);
  const colStep = fontSize + colGap;
  const maxLen = Math.max(...cols.map((c) => c.length));

  const innerW = cols.length * colStep;
  const innerH = maxLen * charStep;

  const totalW = innerW + padding * 2;
  const totalH = innerH + padding * 2;

  const x = opts.cx - totalW / 2;
  const y = opts.cy - totalH / 2;
  const cornerR = Math.min(totalW, totalH) * 0.18;

  const rect = `<rect x="${x}" y="${y}" width="${totalW}" height="${totalH}" rx="${cornerR}" ry="${cornerR}" fill="#ffffff" stroke="#0a0a0a" stroke-width="3" />`;

  let tail = "";
  if (opts.tail) {
    const baseY = y + totalH;
    const baseX = opts.cx;
    const baseLX = baseX - 10;
    const baseRX = baseX + 10;
    tail = `<polygon points="${baseLX},${baseY} ${baseRX},${baseY} ${opts.tail.x},${opts.tail.y}" fill="#ffffff" stroke="#0a0a0a" stroke-width="3" />`;
  }

  // 縦書き (内部余白に収まるように)
  const textRightX = opts.cx + innerW / 2 - colStep / 2;
  const textTopY = opts.cy - innerH / 2;
  const v = buildVerticalText({
    text: opts.text,
    rightX: textRightX,
    topY: textTopY,
    fontSize,
    fontWeight,
  });

  return `<g data-bubble-type="rect">${rect}${tail}${v.svg}</g>`;
}

// ============================================================
// ナレーションBOX (横書き、薄背景、細枠) — 並列配置可
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
  const fontSize = opts.fontSize ?? 22;
  const rect = `<rect x="${opts.x}" y="${opts.y}" width="${opts.width}" height="${opts.height}" fill="#fafafa" stroke="#0a0a0a" stroke-width="1.8" />`;
  const cx = opts.x + opts.width / 2;
  const cy = opts.y + opts.height / 2;
  const text = `<text x="${cx}" y="${cy}" font-family='${FONT_GOTHIC}' font-size="${fontSize}" font-weight="500" fill="#0a0a0a" text-anchor="middle" dominant-baseline="middle">${escapeXml(opts.text)}</text>`;
  return `<g data-bubble-type="narration">${rect}${text}</g>`;
}

// ============================================================
// キャラ紹介ボックス (細枠、3行、画面下中央)
// ============================================================
type IntroBoxOpts = {
  x: number;
  y: number;
  width: number;
  height: number;
  lines: string[];
  fontSize?: number;
};

function buildIntroBox(opts: IntroBoxOpts): string {
  const fontSize = opts.fontSize ?? 22;
  const lineHeight = fontSize + 8;
  const padding = 12;

  const rect = `<rect x="${opts.x}" y="${opts.y}" width="${opts.width}" height="${opts.height}" fill="#ffffff" stroke="#0a0a0a" stroke-width="1.5" />`;

  const totalText = opts.lines.length * lineHeight;
  const startY = opts.y + (opts.height - totalText) / 2 + fontSize;

  const tags = opts.lines
    .map((ln, i) => {
      const ty = startY + i * lineHeight;
      return `<text x="${opts.x + padding}" y="${ty}" font-family='${FONT_GOTHIC}' font-size="${fontSize}" font-weight="500" fill="#0a0a0a">${escapeXml(ln)}</text>`;
    })
    .join("");

  return `<g data-bubble-type="intro_box">${rect}${tags}</g>`;
}

// ============================================================
// SFX (panel 内に焼かなかった分の補助。今回は基本 panel に描画させる方針なので最小限)
// ============================================================
type SfxOpts = {
  text: string;
  cx: number;
  cy: number;
  fontSize?: number;
  rotation?: number;
};

function buildSfx(opts: SfxOpts): string {
  const fontSize = opts.fontSize ?? 56;
  const rotation = opts.rotation ?? -8;
  const stroke = Math.max(3, Math.round(fontSize * 0.08));

  return `<g transform="translate(${opts.cx} ${opts.cy}) rotate(${rotation})">
    <text x="0" y="0" font-family='${FONT_GOTHIC}' font-size="${fontSize}" font-weight="900" fill="#0a0a0a" stroke="#ffffff" stroke-width="${stroke}" paint-order="stroke fill" text-anchor="middle" dominant-baseline="middle">${escapeXml(opts.text)}</text>
  </g>`;
}

// ============================================================
// レイアウト定義 (big_top_5 slot 矩形)
//   s1: { x: 24,  y: 24,   w: 1700, h: 1180 }  上段大ゴマ
//   s2: { x: 886, y: 1228, w: 838,  h: 590  }  中段右 (news)
//   s3: { x: 24,  y: 1228, w: 838,  h: 590  }  中段左 (street)
//   s4: { x: 886, y: 1842, w: 838,  h: 614  }  下段右 (D card)
//   s5: { x: 24,  y: 1842, w: 838,  h: 614  }  下段左 (silhouette)
// ============================================================

const elements: string[] = [];

// --- panel 1 上段: ナレーションBOX 4個並列 (上端に重ねる、世界観説明) ---
const NARR_TOP_Y = 50;
const NARR_H = 56;
const NARR_GAP = 12;
const NARR_PANEL_X = 60;
const NARR_PANEL_W = 1628;
const NARR_W = (NARR_PANEL_W - NARR_GAP * 3) / 4;

const narrations = [
  "2014年 ダンボン世界各地に出現",
  "政府認可制度が導入された",
  "今や日本では D攻略は人気職業",
  "彼らの月収はサラリーマンの3倍",
];
narrations.forEach((text, i) => {
  elements.push(
    buildNarrationBox({
      text,
      x: NARR_PANEL_X + i * (NARR_W + NARR_GAP),
      y: NARR_TOP_Y,
      width: NARR_W,
      height: NARR_H,
      fontSize: 18,
    })
  );
});

// --- panel 1 内 (動画 panel 右下): 視聴者数キャプション風の薄ナレ ---
elements.push(
  buildNarrationBox({
    text: "再生回数 1,200万回",
    x: 1100,
    y: 1100,
    width: 320,
    height: 50,
    fontSize: 18,
  })
);

// --- panel 2 中段右 (news flash phone): ナレ風キャプション 1個 ---
elements.push(
  buildNarrationBox({
    text: "速報 — 新宿に第48ダンジョン",
    x: 920,
    y: 1248,
    width: 360,
    height: 50,
    fontSize: 18,
  })
);

// --- panel 3 中段左 (street): 通行人会話 (角丸長方形 縦書き) + 主人公独白 ---
elements.push(
  buildRectBubble({
    text: "攻略動画で\n年収一億って",
    cx: 200,
    cy: 1320,
    fontSize: 22,
    padding: 14,
    tail: { x: 280, y: 1430 },
  })
);
elements.push(
  buildRectBubble({
    text: "マジ?",
    cx: 360,
    cy: 1380,
    fontSize: 22,
    padding: 14,
    tail: { x: 320, y: 1450 },
  })
);
// 主人公独白 (画面外側、余白部に小さく) — このパネルにはまだ顔は出ないので心の声扱いではなく地の文寄せ
elements.push(
  buildRectBubble({
    text: "同じ\"D\"なのに",
    cx: 540,
    cy: 1500,
    fontSize: 24,
    padding: 14,
  })
);
elements.push(
  buildRectBubble({
    text: "住む世界が違う",
    cx: 720,
    cy: 1700,
    fontSize: 24,
    padding: 14,
  })
);

// --- panel 4 下段右 (D card): キャラ紹介ボックス (画面下中央) ---
elements.push(
  buildIntroBox({
    x: 1300,
    y: 2360,
    width: 380,
    height: 100,
    lines: [
      "立花 陸 (たちばな りく)",
      "24歳 / D級探索者",
      "苦手なコト 出世",
    ],
    fontSize: 18,
  })
);

// --- panel 5 下段左 (silhouette): 主人公独白 連続2個 (角丸長方形 縦書き、焦り) ---
elements.push(
  buildRectBubble({
    text: "今日も\n地下に潜るか",
    cx: 180,
    cy: 1920,
    fontSize: 22,
    padding: 14,
  })
);
elements.push(
  buildRectBubble({
    text: "家賃の前に",
    cx: 320,
    cy: 2240,
    fontSize: 22,
    padding: 14,
  })
);

// 環境SFX (補助、panel に描かれてない場合のフォールバック)
elements.push(
  buildSfx({
    text: "ザワ…",
    cx: 600,
    cy: 2380,
    fontSize: 44,
    rotation: -7,
  })
);

// ============================================================
// 出力
// ============================================================

const svgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${elements.join("")}</svg>`;

async function main(): Promise<void> {
  console.log(`[est-bubbles] input  = ${INPUT_PNG}`);
  console.log(`[est-bubbles] output = ${OUTPUT_PNG}`);
  console.log(`[est-bubbles] elements=${elements.length}`);

  const startedAt = Date.now();
  await sharp(INPUT_PNG)
    .composite([{ input: Buffer.from(svgString), top: 0, left: 0 }])
    .png()
    .toFile(OUTPUT_PNG);

  console.log(
    `[est-bubbles] DONE → ${OUTPUT_PNG} (${((Date.now() - startedAt) / 1000).toFixed(2)}s)`
  );
}

main().catch((err) => {
  console.error("[est-bubbles] FAILED:", err);
  process.exit(1);
});
