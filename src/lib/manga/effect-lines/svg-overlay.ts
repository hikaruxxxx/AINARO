import { randomUUID } from "node:crypto";
import type { EffectLineSpec, EffectLineIntensity } from "./detector";

export function renderEffectLineOverlay(
  spec: EffectLineSpec,
  panelWidth: number,
  panelHeight: number,
  clipPolygon?: [number, number][]
): string {
  const strokeWidth = strokeWidthFor(spec.intensity);
  const content = (() => {
    switch (spec.type) {
      case "speed":
        return renderSpeedLines(spec, panelWidth, panelHeight, strokeWidth);
      case "focus":
        return renderFocusLines(spec, panelWidth, panelHeight, strokeWidth);
      case "radial":
        return renderRadialLines(spec, panelWidth, panelHeight, strokeWidth);
      case "vibration":
        return renderVibrationLines(spec, panelWidth, panelHeight, strokeWidth);
    }
  })();

  if (!clipPolygon || clipPolygon.length < 3) {
    return `<g data-effect-line-type="${spec.type}" data-effect-line-intensity="${spec.intensity}">${content}</g>`;
  }

  const clipPathId = `clip-${randomUUID()}`;
  const points = clipPolygon.map(([x, y]) => `${round(x)},${round(y)}`).join(" ");
  return [
    `<g data-effect-line-type="${spec.type}" data-effect-line-intensity="${spec.intensity}">`,
    `<defs><clipPath id="${escapeXml(clipPathId)}"><polygon points="${points}"/></clipPath></defs>`,
    `<g clip-path="url(#${escapeXml(clipPathId)})">`,
    content,
    "</g>",
    "</g>",
  ].join("");
}

function strokeWidthFor(intensity: EffectLineIntensity): number {
  if (intensity === "subtle") return 2;
  if (intensity === "normal") return 3;
  return 4;
}

function renderSpeedLines(
  spec: EffectLineSpec,
  panelWidth: number,
  panelHeight: number,
  strokeWidth: number
): string {
  const direction = ((spec.direction ?? 0) * Math.PI) / 180;
  const ux = Math.cos(direction);
  const uy = Math.sin(direction);
  const px = -uy;
  const py = ux;
  const cx = panelWidth / 2;
  const cy = panelHeight / 2;
  const diagonal = Math.hypot(panelWidth, panelHeight);
  const spacing = Math.max(4, panelWidth / 40);
  const lineCount = 40;
  const startOffset = -((lineCount - 1) * spacing) / 2;

  return Array.from({ length: lineCount }, (_, i) => {
    const offset = startOffset + i * spacing;
    const mx = cx + px * offset;
    const my = cy + py * offset;
    const x1 = mx - ux * diagonal;
    const y1 = my - uy * diagonal;
    const x2 = mx + ux * diagonal;
    const y2 = my + uy * diagonal;
    return [
      `<line data-effect-line="speed-halo" x1="${round(x1)}" y1="${round(y1)}" x2="${round(x2)}" y2="${round(y2)}" stroke="#ffffff" stroke-width="${strokeWidth + 3}" stroke-linecap="round" opacity="0.85"/>`,
      `<line data-effect-line="speed" x1="${round(x1)}" y1="${round(y1)}" x2="${round(x2)}" y2="${round(y2)}" stroke="#000000" stroke-width="${strokeWidth}" stroke-linecap="round" opacity="0.85"/>`,
    ].join("");
  }).join("");
}

function renderFocusLines(
  spec: EffectLineSpec,
  panelWidth: number,
  panelHeight: number,
  strokeWidth: number
): string {
  const cx = (spec.centerX ?? 0.5) * panelWidth;
  const cy = (spec.centerY ?? 0.5) * panelHeight;
  const lineCount = spec.intensity === "strong" ? 36 : spec.intensity === "normal" ? 30 : 24;
  const length = Math.max(panelWidth, panelHeight);

  return Array.from({ length: lineCount }, (_, i) => {
    const angle = (i / lineCount) * Math.PI * 2;
    const inner = 24 + (i % 3) * 8;
    const x1 = cx + Math.cos(angle) * inner;
    const y1 = cy + Math.sin(angle) * inner;
    const x2 = cx + Math.cos(angle) * length;
    const y2 = cy + Math.sin(angle) * length;
    return [
      `<line data-effect-line="focus-halo" x1="${round(x1)}" y1="${round(y1)}" x2="${round(x2)}" y2="${round(y2)}" stroke="#ffffff" stroke-width="${strokeWidth + 3}" stroke-linecap="round" opacity="0.85"/>`,
      `<line data-effect-line="focus" x1="${round(x1)}" y1="${round(y1)}" x2="${round(x2)}" y2="${round(y2)}" stroke="#000000" stroke-width="${strokeWidth}" stroke-linecap="round" opacity="0.85"/>`,
    ].join("");
  }).join("");
}

function renderRadialLines(
  spec: EffectLineSpec,
  panelWidth: number,
  panelHeight: number,
  strokeWidth: number
): string {
  const cx = (spec.centerX ?? 0.5) * panelWidth;
  const cy = (spec.centerY ?? 0.5) * panelHeight;
  const lineCount = spec.intensity === "strong" ? 16 : spec.intensity === "normal" ? 14 : 12;
  const length = Math.max(panelWidth, panelHeight);
  const lines: string[] = [];

  for (let i = 0; i < lineCount; i++) {
    const angle = (i / lineCount) * Math.PI * 2;
    const inner = 12 + (i % 2) * 10;
    const x1 = cx + Math.cos(angle) * inner;
    const y1 = cy + Math.sin(angle) * inner;
    const x2 = cx + Math.cos(angle) * length;
    const y2 = cy + Math.sin(angle) * length;
    lines.push(`<line data-effect-line="radial-halo" x1="${round(x1)}" y1="${round(y1)}" x2="${round(x2)}" y2="${round(y2)}" stroke="#ffffff" stroke-width="${strokeWidth + 3}" stroke-linecap="round" opacity="0.9"/>`);
    lines.push(`<line data-effect-line="radial" x1="${round(x1)}" y1="${round(y1)}" x2="${round(x2)}" y2="${round(y2)}" stroke="#000000" stroke-width="${strokeWidth}" stroke-linecap="round" opacity="0.9"/>`);

    // 衝撃の切れ目を短い補助線で足す。
    const gapStart = length * 0.38;
    const gapEnd = gapStart + Math.min(panelWidth, panelHeight) * 0.12;
    lines.push(`<line data-effect-line="radial-impact" x1="${round(cx + Math.cos(angle) * gapStart)}" y1="${round(cy + Math.sin(angle) * gapStart)}" x2="${round(cx + Math.cos(angle) * gapEnd)}" y2="${round(cy + Math.sin(angle) * gapEnd)}" stroke="#ffffff" stroke-width="${strokeWidth + 2}" stroke-linecap="round" opacity="0.9"/>`);
  }

  return lines.join("");
}

function renderVibrationLines(
  spec: EffectLineSpec,
  panelWidth: number,
  panelHeight: number,
  strokeWidth: number
): string {
  const lineCount = spec.intensity === "strong" ? 8 : spec.intensity === "normal" ? 6 : 4;
  const marginX = panelWidth * 0.08;
  const marginY = panelHeight * 0.08;
  const paths: string[] = [];

  for (let i = 0; i < lineCount; i++) {
    const side = i % 4;
    const t = (Math.floor(i / 4) + 1) / (Math.ceil(lineCount / 4) + 1);
    const baseX = side === 1 ? panelWidth - marginX : side === 3 ? marginX : marginX + (panelWidth - marginX * 2) * t;
    const baseY = side === 0 ? marginY : side === 2 ? panelHeight - marginY : marginY + (panelHeight - marginY * 2) * t;
    const horizontal = side === 0 || side === 2;
    const d = vibrationPath(baseX, baseY, horizontal);
    paths.push(`<path data-effect-line="vibration-halo" d="${d}" fill="none" stroke="#ffffff" stroke-width="${strokeWidth + 3}" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>`);
    paths.push(`<path data-effect-line="vibration" d="${d}" fill="none" stroke="#000000" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>`);
  }

  return paths.join("");
}

function vibrationPath(x: number, y: number, horizontal: boolean): string {
  const amp = 4;
  const step = 10;
  const points: string[] = [];
  for (let i = 0; i < 6; i++) {
    const offset = i * step;
    const wobble = Math.sin(i * Math.PI * 0.9) * amp;
    const px = horizontal ? x + offset : x + wobble;
    const py = horizontal ? y + wobble : y + offset;
    points.push(`${i === 0 ? "M" : "L"} ${round(px)} ${round(py)}`);
  }
  return points.join(" ");
}

function round(n: number): string {
  return Number(n.toFixed(2)).toString();
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
