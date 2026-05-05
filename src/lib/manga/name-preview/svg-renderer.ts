/**
 * SVG ネームレンダラ
 *
 * page_plan + storyboard + bible からページ単位 SVG を生成する。
 * 純TS、外部依存なし。日本語テキストは system 系日本語フォントを指定。
 *
 * 出力 SVG は B6 比率 (1748×2480) を viewBox に持つ。
 * ブラウザでは container 幅にフィットさせる前提で width/height は付けない。
 *
 * 画像参照は HTTP server 上で work dir をルートに serve している前提で
 * 相対パス `../../../bible/refs/characters/{id}/face_front.png` を使う。
 * (SVG は episodes/ep{NN}/name/p{NN}.svg に置かれる)
 */
import type {
  BibleSnapshotV2,
  CharacterEntryV2,
  EpisodeStoryboardV2,
  PagePlanPage,
  PagePlanV2,
  PanelV2,
  StoryboardPageV2,
} from "../schemas-v2";
import { estimateBlocking, type EstimatedBlocking } from "./blocking-estimator";
import type { NameWarning } from "./types";

const PAGE_W = 1748;
const PAGE_H = 2480;

// 警告閾値
const DIALOGUE_OVERFLOW_CHARS = 60; // パネル内合計文字数 (台詞+モノローグ+ナレーション)
const PANEL_OVERCROWD = 7; // 1ページあたりのコマ数
const SHOT_REPETITION_RUN = 3; // 同一 shot_type が連続するコマ数

export type RenderPageInput = {
  slug: string;
  episode: number;
  pagePlanPage: PagePlanPage;
  storyboardPage: StoryboardPageV2;
  bible: BibleSnapshotV2;
  refsExists: (relPath: string) => boolean;
};

export type RenderPageResult = {
  svg: string;
  warnings: NameWarning[];
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function importanceStrokeWidth(importance: number): number {
  // 1: 細い, 5: 太い
  return 4 + (importance - 1) * 3; // 4..16
}

function importanceFill(importance: number): string {
  // 重要度に応じた背景濃度 (ネームの「大ゴマ」を視認しやすく)
  const alpha = 0.04 + (importance - 1) * 0.04; // 0.04..0.20
  return `rgba(20,20,30,${alpha.toFixed(2)})`;
}

function shotTypeLabel(shot: string): string {
  switch (shot) {
    case "close_up": return "CU";
    case "medium": return "MS";
    case "wide": return "WS";
    case "establishing": return "EST";
    default: return shot;
  }
}

function cameraLabel(cam: string): string {
  switch (cam) {
    case "eye_level": return "eye";
    case "low_angle": return "low";
    case "high_angle": return "high";
    case "over_shoulder": return "OTS";
    case "birds_eye": return "bird";
    default: return cam;
  }
}

function characterDisplayName(id: string, characters: CharacterEntryV2[]): string {
  const c = characters.find((x) => x.id === id);
  return c?.name ?? id;
}

/**
 * face_front.png が refs にあれば SVG href を返す、なければ null。
 * パスは name/p{NN}.svg からの相対 (work dir 起点で 3 階層上)。
 */
function characterFaceHref(
  characterId: string,
  refsExists: (relPath: string) => boolean
): string | null {
  // 内部判定用は work dir からの相対
  const fromWorkRoot = `bible/refs/characters/${characterId}/face_front.png`;
  if (!refsExists(fromWorkRoot)) return null;
  // SVG からの相対は ../../../{fromWorkRoot}
  // (svg: episodes/ep{NN}/name/pNN.svg → 3 階層上が work dir)
  return `../../../${encodeURI(fromWorkRoot)}`;
}

function detectWarnings(
  page: StoryboardPageV2,
  pagePlanPage: PagePlanPage,
  refsExists: (relPath: string) => boolean
): NameWarning[] {
  const warnings: NameWarning[] = [];

  // panel_overcrowd
  if (page.panels.length > PANEL_OVERCROWD) {
    warnings.push({
      page_no: page.page_no,
      kind: "panel_overcrowd",
      message: `コマ数 ${page.panels.length} (推奨上限 ${PANEL_OVERCROWD})`,
    });
  }

  // shot_repetition: reading_order 順に同一 shot_type が SHOT_REPETITION_RUN 個以上連続
  const sortedPanels = [...page.panels].sort((a, b) => a.reading_order - b.reading_order);
  let runStart = 0;
  for (let i = 1; i <= sortedPanels.length; i++) {
    const prev = sortedPanels[i - 1];
    const curr = sortedPanels[i];
    if (curr && curr.shot_type === prev.shot_type) continue;
    const runLen = i - runStart;
    if (runLen >= SHOT_REPETITION_RUN) {
      warnings.push({
        page_no: page.page_no,
        kind: "shot_repetition",
        message: `${prev.shot_type} が ${runLen} コマ連続 (panels ${sortedPanels[runStart].panel_no}..${prev.panel_no})`,
      });
    }
    runStart = i;
  }

  // panel ごとの警告
  for (const panel of page.panels) {
    const totalChars =
      panel.dialogue.reduce((s, d) => s + d.text.length, 0) +
      panel.monologue.reduce((s, m) => s + m.text.length, 0) +
      panel.narration.reduce((s, n) => s + n.length, 0);
    if (totalChars > DIALOGUE_OVERFLOW_CHARS) {
      warnings.push({
        page_no: page.page_no,
        kind: "dialogue_overflow",
        message: `panel#${panel.panel_no}: 文字数 ${totalChars} (推奨 ${DIALOGUE_OVERFLOW_CHARS})`,
      });
    }

    // focus_entity_missing: focus が char_/loc_/prop_ 接頭辞でない or entities にいない
    const focus = panel.entities.focus_entity_id;
    const focusInChars = panel.entities.characters.some((c) => c.character_id === focus);
    const focusIsLoc = focus === panel.entities.location_id;
    const focusIsProp = panel.entities.props.some((p) => p.prop_id === focus);
    if (!focusInChars && !focusIsLoc && !focusIsProp) {
      warnings.push({
        page_no: page.page_no,
        kind: "focus_entity_missing",
        message: `panel#${panel.panel_no}: focus_entity_id "${focus}" が entities に居ない`,
      });
    }

    // ref_thumbnail_missing: 主要登場キャラの face_front.png が無い
    for (const c of panel.entities.characters) {
      const exists = refsExists(`bible/refs/characters/${c.character_id}/face_front.png`);
      if (!exists) {
        warnings.push({
          page_no: page.page_no,
          kind: "ref_thumbnail_missing",
          message: `panel#${panel.panel_no}: ${c.character_id} の face_front.png 不在`,
        });
        break; // 同一 panel で複数出さない
      }
    }
  }

  return warnings;
}

function renderPanel(
  panel: PanelV2,
  rect: { x: number; y: number; w: number; h: number },
  blocking: EstimatedBlocking,
  bible: BibleSnapshotV2,
  refsExists: (relPath: string) => boolean
): string {
  const sw = importanceStrokeWidth(panel.importance);
  const fill = importanceFill(panel.importance);
  const labelShot = shotTypeLabel(panel.shot_type);
  const labelCam = cameraLabel(panel.camera);

  const parts: string[] = [];

  // panel rect
  if (panel.bleed) {
    // bleed: 裁ち落とし枠 (二重) を上に
    parts.push(
      `<rect x="${rect.x - 12}" y="${rect.y - 12}" width="${rect.w + 24}" height="${rect.h + 24}" fill="none" stroke="#c33" stroke-width="3" stroke-dasharray="20 12" opacity="0.7"/>`
    );
  }
  parts.push(
    `<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" fill="${fill}" stroke="#111" stroke-width="${sw}"/>`
  );

  // 読順番号 (右綴じ前提: 各 panel の右上にバッジ)
  const badgeR = 38;
  parts.push(
    `<circle cx="${rect.x + rect.w - badgeR - 8}" cy="${rect.y + badgeR + 8}" r="${badgeR}" fill="#222" stroke="#fff" stroke-width="3"/>` +
    `<text x="${rect.x + rect.w - badgeR - 8}" y="${rect.y + badgeR + 8}" text-anchor="middle" dominant-baseline="middle" font-size="38" fill="#fff" font-weight="700">${panel.reading_order}</text>`
  );

  // shot/camera ラベル + importance (左上)
  const headerY = rect.y + 36;
  parts.push(
    `<text x="${rect.x + 16}" y="${headerY}" font-size="28" fill="#111" font-weight="600">${labelShot}/${labelCam}</text>`
  );
  parts.push(
    `<text x="${rect.x + 16}" y="${headerY + 32}" font-size="22" fill="#666">★${panel.importance}</text>`
  );

  // silence マーカー (右下に 「♪×」)
  if (panel.silence) {
    parts.push(
      `<text x="${rect.x + rect.w - 16}" y="${rect.y + rect.h - 16}" font-size="32" fill="#999" text-anchor="end" font-weight="700">♪×</text>`
    );
  }

  // focus entity 顔サムネイル (キャラの場合)
  const focusId = panel.entities.focus_entity_id;
  if (focusId.startsWith("char_")) {
    const href = characterFaceHref(focusId, refsExists);
    const thumbSize = Math.min(180, Math.floor(rect.w * 0.22), Math.floor(rect.h * 0.4));
    let thumbX = rect.x + 16;
    let thumbY = rect.y + 80;
    if (blocking.focus_zone === "right") thumbX = rect.x + rect.w - thumbSize - 16;
    if (blocking.focus_zone === "center") thumbX = rect.x + rect.w / 2 - thumbSize / 2;
    if (href) {
      parts.push(
        `<image href="${href}" x="${thumbX}" y="${thumbY}" width="${thumbSize}" height="${thumbSize}" preserveAspectRatio="xMidYMid slice" opacity="0.9"/>` +
        `<rect x="${thumbX}" y="${thumbY}" width="${thumbSize}" height="${thumbSize}" fill="none" stroke="#222" stroke-width="2"/>`
      );
    } else {
      parts.push(
        `<rect x="${thumbX}" y="${thumbY}" width="${thumbSize}" height="${thumbSize}" fill="#eee" stroke="#999" stroke-width="2" stroke-dasharray="6 4"/>` +
        `<text x="${thumbX + thumbSize / 2}" y="${thumbY + thumbSize / 2}" font-size="22" fill="#666" text-anchor="middle" dominant-baseline="middle">${escapeXml(truncate(characterDisplayName(focusId, bible.characters), 8))}</text>`
      );
    }
  }

  // 登場キャラ一覧 (上部、focus 顔サムネ右側に並べる)
  const charNames = panel.entities.characters
    .map((c) => characterDisplayName(c.character_id, bible.characters))
    .join(" / ");
  if (charNames.length > 0) {
    parts.push(
      `<text x="${rect.x + rect.w / 2}" y="${rect.y + 36}" font-size="20" fill="#444" text-anchor="middle">${escapeXml(truncate(charNames, 30))}</text>`
    );
  }

  // key_visual (中央下寄り、複数行)
  const kvY = rect.y + rect.h * 0.55;
  const kv = truncate(panel.key_visual, 80);
  parts.push(
    `<text x="${rect.x + rect.w / 2}" y="${kvY}" font-size="22" fill="#222" text-anchor="middle" font-style="italic">${escapeXml(kv)}</text>`
  );

  // action (中央、key_visual の下)
  if (panel.action) {
    parts.push(
      `<text x="${rect.x + rect.w / 2}" y="${kvY + 36}" font-size="20" fill="#555" text-anchor="middle">${escapeXml(truncate(panel.action, 60))}</text>`
    );
  }

  // 台詞 / モノローグ / ナレーション / SFX を底部にまとめる
  const dlgY = rect.y + rect.h - 96;
  let dlgIdx = 0;
  for (const d of panel.dialogue) {
    const speaker = characterDisplayName(d.character_id, bible.characters);
    parts.push(
      `<text x="${rect.x + 16}" y="${dlgY + dlgIdx * 26}" font-size="20" fill="#000">${escapeXml(`「${truncate(d.text, 40)}」(${truncate(speaker, 6)})`)}</text>`
    );
    dlgIdx++;
  }
  for (const m of panel.monologue) {
    parts.push(
      `<text x="${rect.x + 16}" y="${dlgY + dlgIdx * 26}" font-size="20" fill="#444" font-style="italic">${escapeXml(`(${truncate(m.text, 38)})`)}</text>`
    );
    dlgIdx++;
  }
  for (const n of panel.narration) {
    parts.push(
      `<text x="${rect.x + 16}" y="${dlgY + dlgIdx * 26}" font-size="20" fill="#222" font-weight="600">${escapeXml(`▮ ${truncate(n, 40)}`)}</text>`
    );
    dlgIdx++;
  }
  for (const sfx of panel.sfx) {
    parts.push(
      `<text x="${rect.x + rect.w - 16}" y="${rect.y + rect.h - 30}" font-size="26" fill="#933" text-anchor="end" font-weight="700">${escapeXml(truncate(sfx, 12))}</text>`
    );
  }

  // 吹き出しゾーンマーカー (薄く)
  for (const zone of blocking.bubble_zones) {
    const zr = bubbleZoneRect(zone, rect);
    parts.push(
      `<rect x="${zr.x}" y="${zr.y}" width="${zr.w}" height="${zr.h}" fill="none" stroke="#39c" stroke-width="2" stroke-dasharray="4 4" opacity="0.5"/>`
    );
  }

  // continuity_group_ids (panel 下端、極小)
  if (panel.continuity_group_ids && panel.continuity_group_ids.length > 0) {
    parts.push(
      `<text x="${rect.x + 16}" y="${rect.y + rect.h - 8}" font-size="14" fill="#888">cg: ${escapeXml(truncate(panel.continuity_group_ids.join(","), 60))}</text>`
    );
  }

  return parts.join("\n");
}

function bubbleZoneRect(
  zone: "top_left" | "top_right" | "mid_left" | "mid_right" | "bottom",
  rect: { x: number; y: number; w: number; h: number }
): { x: number; y: number; w: number; h: number } {
  const w3 = rect.w / 3;
  const h3 = rect.h / 3;
  switch (zone) {
    case "top_left": return { x: rect.x + 8, y: rect.y + 60, w: w3, h: h3 * 0.6 };
    case "top_right": return { x: rect.x + rect.w - w3 - 8, y: rect.y + 60, w: w3, h: h3 * 0.6 };
    case "mid_left": return { x: rect.x + 8, y: rect.y + h3, w: w3, h: h3 * 0.6 };
    case "mid_right": return { x: rect.x + rect.w - w3 - 8, y: rect.y + h3, w: w3, h: h3 * 0.6 };
    case "bottom": return { x: rect.x + 8, y: rect.y + rect.h - h3 * 0.6 - 8, w: rect.w - 16, h: h3 * 0.5 };
  }
}

export function renderPageSvg(input: RenderPageInput): RenderPageResult {
  const warnings = detectWarnings(input.storyboardPage, input.pagePlanPage, input.refsExists);

  const panelsByPanelId = new Map(input.storyboardPage.panels.map((p) => [p.panel_id, p]));

  const panelSvg: string[] = [];
  for (const planPanel of input.pagePlanPage.panels) {
    const sbPanel = panelsByPanelId.get(planPanel.panel_id);
    if (!sbPanel) continue;
    const blocking = estimateBlocking(sbPanel);
    panelSvg.push(renderPanel(sbPanel, planPanel.rect, blocking, input.bible, input.refsExists));
  }

  // ページヘッダ: ページ番号 + page_role
  const pageNo = input.pagePlanPage.page_no;
  const pageRole = input.pagePlanPage.page_role;
  const headerH = 50;

  // 警告サマリ (右上、小)
  const warningLines = warnings.slice(0, 4).map((w, i) =>
    `<text x="${PAGE_W - 24}" y="${30 + i * 24}" font-size="18" fill="#c33" text-anchor="end">⚠ ${escapeXml(truncate(w.message, 50))}</text>`
  );

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_W} ${PAGE_H}" preserveAspectRatio="xMidYMid meet" style="background:#fafafa;font-family:'Hiragino Sans','Yu Gothic','Noto Sans JP',system-ui,sans-serif;">
  <!-- page header -->
  <text x="20" y="32" font-size="26" fill="#111" font-weight="700">P.${pageNo} [${pageRole}]</text>
  <text x="20" y="60" font-size="18" fill="#666">strategy: ${input.pagePlanPage.render_strategy} / template: ${input.pagePlanPage.layout_template_id}</text>
  ${warningLines.join("\n  ")}
  <!-- panels -->
  ${panelSvg.join("\n  ")}
  <!-- right-bound reading flow hint -->
  <text x="${PAGE_W - 24}" y="${PAGE_H - 18}" font-size="16" fill="#888" text-anchor="end">→ 右綴じ・右上から読む</text>
</svg>
`;

  return { svg, warnings };
}
