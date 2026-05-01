/**
 * Week 0 Pilot 拡張: 既存 page-01.png に吹き出し SVG を焼き込んで
 * page-01-with-bubbles.png を生成する。
 *
 * 手順:
 *   1. 5コマ分の吹き出し (ナレーション/モノローグ) をページ座標で定義
 *   2. buildBubbleOverlaySvg() でページ大の SVG を構築
 *   3. sharp で page-01.png に SVG レイヤーを composite
 *   4. page-01-with-bubbles.png として別ファイル出力
 *
 * 実行: npx tsx scripts/manga/feasibility-week0/pilot-page-bubbles.ts
 */

import "../_env";
import path from "path";
import sharp from "sharp";

import {
  buildBubbleOverlaySvg,
  type SvgBubble,
} from "@/lib/manga/bubble/svg-overlay";
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
const OUTPUT_PNG = path.join(PILOT_DIR, "page-01-with-bubbles.png");

const W = PAGE_DIMENSIONS.width; // 1748
const H = PAGE_DIMENSIONS.height; // 2480

/**
 * 吹き出し定義 (ページ座標)
 *
 * standard_3tier_5 のslot矩形:
 *   s1: { x: 24,  y: 24,   w: 1700, h: 708  }  上段 wide
 *   s2: { x: 886, y: 756,  w: 838,  h: 826  }  中段右 (hands)
 *   s3: { x: 24,  y: 756,  w: 838,  h: 826  }  中段左 (face)
 *   s4: { x: 886, y: 1606, w: 838,  h: 850  }  下段右 (onigiri)
 *   s5: { x: 24,  y: 1606, w: 838,  h: 850  }  下段左 (window)
 *
 * RTL 読み順: s1 → s2 → s3 → s4 → s5
 */
const BUBBLES: SvgBubble[] = [
  // s1: ナレーション (上段右上に縦長で配置、独白の語り出し)
  {
    reading_order: 1,
    bubble_type: "narration",
    text: "俺の朝は、蛍光灯の下から始まる。",
    position: {
      x: 1340,
      y: 60,
      width: 360,
      height: 130,
    },
  },

  // s2: モノローグ (中段右上、narration boxで独白)
  {
    reading_order: 2,
    bubble_type: "narration",
    text: "データを埋める。意味も知らずに。",
    position: {
      x: 906,
      y: 776,
      width: 280,
      height: 150,
    },
  },

  // s3: 思考 (中段左上、cloud thought)
  {
    reading_order: 3,
    bubble_type: "thought",
    text: "またこの顔か。",
    position: {
      x: 80,
      y: 776,
      width: 220,
      height: 110,
    },
  },

  // s4: モノローグ (下段右上)
  {
    reading_order: 4,
    bubble_type: "narration",
    text: "100円。今日も、これで。",
    position: {
      x: 906,
      y: 1626,
      width: 260,
      height: 130,
    },
  },

  // s5: モノローグ (下段左上、独白の締め)
  {
    reading_order: 5,
    bubble_type: "narration",
    text: "世界は、俺なしで回る。",
    position: {
      x: 60,
      y: 1626,
      width: 280,
      height: 130,
    },
  },
];

async function main(): Promise<void> {
  console.log(`[bubbles] input  = ${INPUT_PNG}`);
  console.log(`[bubbles] output = ${OUTPUT_PNG}`);
  console.log(`[bubbles] page   = ${W}x${H}, bubbles=${BUBBLES.length}`);

  // 1. SVG 構築 (ページ全体サイズ)
  const svgString = buildBubbleOverlaySvg({
    panelWidth: W,
    panelHeight: H,
    bubbles: BUBBLES,
  });

  // 2. sharp で input PNG に SVG を composite
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
    `[bubbles] DONE → ${OUTPUT_PNG} (${((Date.now() - startedAt) / 1000).toFixed(2)}s)`
  );
}

main().catch((err) => {
  console.error("[bubbles] FAILED:", err);
  process.exit(1);
});
