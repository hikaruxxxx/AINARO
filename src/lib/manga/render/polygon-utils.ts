export type Polygon = [number, number][];

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Number(n.toFixed(3)));
}

function pointsToString(polygon: Polygon, offsetX = 0, offsetY = 0): string {
  return polygon
    .map(([x, y]) => `${formatNumber(x + offsetX)},${formatNumber(y + offsetY)}`)
    .join(" ");
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** polygon を白塗り SVG マスクとして生成。offsetX/Y で原点をシフト。 */
export function polygonToSvgMask(
  polygon: Polygon,
  w: number,
  h: number,
  offsetX: number,
  offsetY: number
): string {
  const width = Math.max(1, Math.round(w));
  const height = Math.max(1, Math.round(h));
  const points = pointsToString(polygon, offsetX, offsetY);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    `<polygon points="${points}" fill="white" />`,
    "</svg>",
  ].join("");
}

/** bounding box 計算 */
export function polygonBbox(polygon: Polygon): { x: number; y: number; w: number; h: number } {
  const xs = polygon.map(([x]) => x);
  const ys = polygon.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
  };
}

function shrinkTowardCentroid(polygon: Polygon, amount: number): Polygon {
  const cx = polygon.reduce((sum, [x]) => sum + x, 0) / polygon.length;
  const cy = polygon.reduce((sum, [, y]) => sum + y, 0) / polygon.length;

  return polygon.map(([x, y]) => {
    const dx = x - cx;
    const dy = y - cy;
    const distance = Math.hypot(dx, dy);
    if (distance === 0) return [x, y];
    const ratio = Math.max(0, (distance - amount) / distance);
    return [cx + dx * ratio, cy + dy * ratio];
  });
}

/** 枠線用 SVG <polygon> 文字列。stroke 中央基準で borderWidth/2 だけ内側へ縮める */
export function polygonSvgFrame(
  polygon: Polygon,
  opts: { borderWidth: number; borderColor: string }
): string {
  const halfBorder = opts.borderWidth / 2;
  const points = pointsToString(shrinkTowardCentroid(polygon, halfBorder));

  return `<polygon points="${points}" fill="none" stroke="${escapeAttr(opts.borderColor)}" stroke-width="${formatNumber(opts.borderWidth)}" stroke-linejoin="miter" />`;
}
