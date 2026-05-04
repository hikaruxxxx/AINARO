/**
 * L10 Bubble Overlay v2 — vertical Japanese typesetter
 *
 * 入力: 1ページ render PNG + storyboard.page.panels[*].dialogue/monologue/narration/sfx
 * 出力: 1ページ overlay 済み PNG (texts + bubbles 合成済み)
 *
 * 縦書き (right-to-left columns, top-to-bottom)、SVG経由の overlay。
 * sharp で SVG を render → PNG composite。
 *
 * MVP: 禁則処理 / ルビ / 縦中横 は最低限のみ (`!!`/`!?` の縦中横、句読点位置調整)。
 *
 * Phase A は「セリフが画面に乗る」レベルでよい。Phase B 以降に typeset 強化。
 */
import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  EpisodeStoryboardV2,
  PagePlanV2,
  PanelV2,
  PagePlanPanel,
  StoryboardPageV2,
} from "../schemas-v2";

const FONT_FAMILY_DIALOGUE = "'Hiragino Mincho ProN', 'YuMincho', 'Noto Serif JP', serif";
const FONT_FAMILY_NARRATION = "'Hiragino Sans', 'YuGothic', 'Noto Sans JP', sans-serif";
const FONT_FAMILY_SFX = "'Hiragino Sans', 'YuGothic', sans-serif";

type RectXYWH = { x: number; y: number; w: number; h: number };

type LaidoutText = {
  kind: "dialogue" | "monologue" | "narration" | "sfx";
  text: string;
  rect: RectXYWH;
  fontSize: number;
  /** 吹き出し尻尾の方向 (キャラ中心点) */
  tail?: { x: number; y: number };
};

/** 縦書き列に変換 (`!!` `!?` を縦中横の1列分として扱う) */
function splitToVerticalColumns(text: string, charsPerColumn: number): string[] {
  // 縦中横変換: !! → ‼, !? → ⁉
  const t = text.replace(/!!/g, "‼").replace(/!\?/g, "⁉").replace(/\?\?/g, "⁇");
  const cols: string[] = [];
  let cur = "";
  for (const ch of t) {
    cur += ch;
    if (cur.length >= charsPerColumn) {
      cols.push(cur);
      cur = "";
    }
  }
  if (cur.length > 0) cols.push(cur);
  return cols;
}

/** 1 panel 内の rect 内に bubble を縦書き配置 (右上から左下へ列を進める) */
function layoutPanelBubbles(args: {
  panel: PanelV2;
  panelRect: RectXYWH;
}): LaidoutText[] {
  const out: LaidoutText[] = [];
  const padding = 16;

  // 配置領域を panel rect 内 (上端〜下端の余白を作る)
  let cursorRight = args.panelRect.x + args.panelRect.w - padding;
  const top = args.panelRect.y + padding;
  const bottom = args.panelRect.y + args.panelRect.h - padding;
  const usableH = bottom - top;

  const placeBubble = (
    text: string,
    kind: LaidoutText["kind"],
    fontSize: number
  ): boolean => {
    const charsPerCol = Math.max(4, Math.floor(usableH / fontSize));
    const cols = splitToVerticalColumns(text, charsPerCol);
    const widthNeeded = cols.length * fontSize * 1.4 + padding * 2;
    if (cursorRight - widthNeeded < args.panelRect.x + padding) return false; // 溢れ
    const rect: RectXYWH = {
      x: cursorRight - widthNeeded,
      y: top,
      w: widthNeeded,
      h: Math.min(usableH, cols[0].length * fontSize * 1.2 + padding * 2),
    };
    out.push({ kind, text, rect, fontSize });
    cursorRight = rect.x - 12;
    return true;
  };

  // 優先度: dialogue > monologue > narration > sfx
  for (const d of args.panel.dialogue) {
    if (!placeBubble(d.text, "dialogue", 28)) break;
  }
  for (const m of args.panel.monologue) {
    if (!placeBubble(m.text, "monologue", 26)) break;
  }
  for (const n of args.panel.narration) {
    if (!placeBubble(n, "narration", 24)) break;
  }
  for (const s of args.panel.sfx) {
    if (!placeBubble(s, "sfx", 36)) break;
  }
  return out;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** 1 つの縦書きテキストブロックを SVG で描く */
function renderVerticalBubbleSvg(t: LaidoutText): string {
  const padding = 12;
  const cols = splitToVerticalColumns(t.text, Math.max(4, Math.floor((t.rect.h - padding * 2) / t.fontSize)));

  const fontFamily =
    t.kind === "dialogue" || t.kind === "monologue"
      ? FONT_FAMILY_DIALOGUE
      : t.kind === "sfx"
      ? FONT_FAMILY_SFX
      : FONT_FAMILY_NARRATION;

  const isBubble = t.kind === "dialogue" || t.kind === "monologue";
  const isCloud = t.kind === "monologue";
  const isBox = t.kind === "narration";
  const isSfx = t.kind === "sfx";

  let bgShape = "";
  if (isBubble) {
    if (isCloud) {
      bgShape = `<ellipse cx="${t.rect.w / 2}" cy="${t.rect.h / 2}" rx="${t.rect.w / 2 - 4}" ry="${t.rect.h / 2 - 4}" fill="white" stroke="black" stroke-width="2"/>`;
    } else {
      bgShape = `<rect x="2" y="2" width="${t.rect.w - 4}" height="${t.rect.h - 4}" rx="20" ry="20" fill="white" stroke="black" stroke-width="3"/>`;
    }
  } else if (isBox) {
    bgShape = `<rect x="2" y="2" width="${t.rect.w - 4}" height="${t.rect.h - 4}" fill="white" stroke="black" stroke-width="2"/>`;
  }

  const colWidth = t.fontSize * 1.4;
  const colsSvg = cols
    .map((col, ci) => {
      // 右から左へ列配置
      const x = t.rect.w - padding - ci * colWidth - colWidth / 2;
      const charsSvg = col
        .split("")
        .map((ch, i) => {
          const y = padding + (i + 1) * t.fontSize;
          return `<text x="${x}" y="${y}" font-family="${fontFamily}" font-size="${t.fontSize}" text-anchor="middle" fill="black"${isSfx ? ' font-weight="bold" stroke="white" stroke-width="2" paint-order="stroke"' : ""}>${escapeXml(ch)}</text>`;
        })
        .join("");
      return charsSvg;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${t.rect.w}" height="${t.rect.h}">${bgShape}${colsSvg}</svg>`;
}

export async function overlayPageBubbles(args: {
  pageRenderPath: string;
  storyboardPage: StoryboardPageV2;
  pagePlanPage: PagePlanV2["pages"][number];
  outputPath: string;
}): Promise<{ overlaid: number; skipped: number }> {
  const meta = await sharp(args.pageRenderPath).metadata();
  const pageW = meta.width ?? 1748;
  const pageH = meta.height ?? 2480;

  const sbPanelById = new Map(args.storyboardPage.panels.map((p) => [p.panel_id, p]));

  const composites: sharp.OverlayOptions[] = [];
  let overlaid = 0; let skipped = 0;

  for (const pp of args.pagePlanPage.panels) {
    const sb = sbPanelById.get(pp.panel_id);
    if (!sb) continue;

    const layouts = layoutPanelBubbles({
      panel: sb,
      panelRect: pp.rect,
    });
    if (layouts.length === 0) { skipped++; continue; }

    for (const t of layouts) {
      const svg = renderVerticalBubbleSvg(t);
      composites.push({
        input: Buffer.from(svg),
        top: Math.round(t.rect.y),
        left: Math.round(t.rect.x),
      });
      overlaid++;
    }
  }

  await sharp(args.pageRenderPath)
    .composite(composites)
    .png()
    .toFile(args.outputPath);

  return { overlaid, skipped };
}
