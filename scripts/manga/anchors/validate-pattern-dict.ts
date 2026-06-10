import { promises as fs } from "node:fs";
import path from "node:path";
import { loadPatternDict, type Pattern, type PatternDict, type PatternSlot } from "@/lib/manga/page-director-v2/pattern-loader";
import { isAxisAlignedRect } from "@/lib/manga/page-director-v2/pattern-matcher";

type Point = [number, number];

type CliArgs = {
  version: string;
  strict: boolean;
  out?: string;
};

type ValidationIssue = {
  rule: string;
  message: string;
  slot_id?: string;
  vertex_index?: number;
  slot_pair?: [string, string];
};

type PatternValidation = {
  id: string;
  panel_count: number;
  status: "pass" | "fail" | "warning";
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
};

type ValidationReport = {
  version: string;
  generated_at: string;
  summary: {
    total_patterns: number;
    passed: number;
    failed: number;
    warning_only: number;
  };
  patterns: PatternValidation[];
};

type Bounds = {
  width: number;
  height: number;
};

type BBox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

const CW_CALIBRATION_RECT: Point[] = [
  [60, 60],
  [1688, 60],
  [1688, 740],
  [60, 740],
];

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { version: "v2", strict: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--version") {
      args.version = normalizeVersion(readRequiredValue(argv, i, "--version"));
      i += 1;
    } else if (arg.startsWith("--version=")) {
      args.version = normalizeVersion(arg.slice("--version=".length));
    } else if (arg === "--strict") {
      args.strict = true;
    } else if (arg === "--out") {
      args.out = readRequiredValue(argv, i, "--out");
      i += 1;
    } else if (arg.startsWith("--out=")) {
      args.out = arg.slice("--out=".length);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  return args;
}

function readRequiredValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function normalizeVersion(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("--version requires a non-empty value");
  }
  return trimmed.startsWith("v") ? trimmed : `v${trimmed}`;
}

function signedArea(polygon: Point[]): number {
  let area = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % polygon.length];
    area += (x2 - x1) * (y2 + y1);
  }
  return area / 2;
}

function signedShoelaceArea(polygon: Point[]): number {
  let area = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % polygon.length];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

function isClockwiseArea(area: number, clockwiseSign: 1 | -1): boolean {
  return area * clockwiseSign > 0;
}

function validateBounds(slot: PatternSlot, bounds: Bounds, errors: ValidationIssue[]): void {
  for (let i = 0; i < slot.polygon.length; i += 1) {
    const [x, y] = slot.polygon[i];
    if (x < 0 || x > bounds.width) {
      errors.push({
        rule: "bounds",
        message: `x=${x} is outside 0..${bounds.width}`,
        slot_id: slot.slot_id,
        vertex_index: i,
      });
    }
    if (y < 0 || y > bounds.height) {
      errors.push({
        rule: "bounds",
        message: `y=${y} is outside 0..${bounds.height}`,
        slot_id: slot.slot_id,
        vertex_index: i,
      });
    }
  }
}

function validateVertices(slot: PatternSlot, errors: ValidationIssue[]): void {
  if (slot.polygon.length < 3) {
    errors.push({
      rule: "vertex_count_min",
      message: `polygon has ${slot.polygon.length} vertices; minimum is 3`,
      slot_id: slot.slot_id,
    });
  }

  for (let i = 0; i < slot.polygon.length; i += 1) {
    const [x1, y1] = slot.polygon[i];
    const [x2, y2] = slot.polygon[(i + 1) % slot.polygon.length];
    if (x1 === x2 && y1 === y2) {
      errors.push({
        rule: "vertex_duplicate",
        message: `consecutive duplicate vertices at index ${i} and ${(i + 1) % slot.polygon.length}`,
        slot_id: slot.slot_id,
        vertex_index: i,
      });
    }
  }
}

function validateSlotCount(pattern: Pattern, errors: ValidationIssue[]): void {
  if (pattern.panel_count !== pattern.slots.length) {
    errors.push({
      rule: "slot_count_match",
      message: `panel_count=${pattern.panel_count} but slots.length=${pattern.slots.length}`,
    });
  }
}

function validateReadingOrder(pattern: Pattern, errors: ValidationIssue[]): void {
  const seen = new Map<number, string>();
  for (const slot of pattern.slots) {
    const previousSlotId = seen.get(slot.reading_order);
    if (previousSlotId) {
      errors.push({
        rule: "reading_order_unique",
        message: `reading_order=${slot.reading_order} is duplicated by ${previousSlotId} and ${slot.slot_id}`,
        slot_id: slot.slot_id,
      });
    }
    seen.set(slot.reading_order, slot.slot_id);

    if (slot.reading_order < 1 || slot.reading_order > pattern.slots.length) {
      errors.push({
        rule: "reading_order_unique",
        message: `reading_order=${slot.reading_order} is outside 1..${pattern.slots.length}`,
        slot_id: slot.slot_id,
      });
    }
  }
}

function validateClockwise(slot: PatternSlot, clockwiseSign: 1 | -1, errors: ValidationIssue[]): void {
  const area = signedArea(slot.polygon);
  if (area === 0) {
    errors.push({
      rule: "clockwise",
      message: "polygon signed area is 0 (degenerate)",
      slot_id: slot.slot_id,
    });
    return;
  }

  if (!isClockwiseArea(area, clockwiseSign)) {
    errors.push({
      rule: "clockwise",
      message: `polygon is counter-clockwise by calibrated signed area (${area})`,
      slot_id: slot.slot_id,
    });
  }
}

function bboxOf(polygon: Point[]): BBox {
  return polygon.reduce(
    (box, [x, y]) => ({
      minX: Math.min(box.minX, x),
      minY: Math.min(box.minY, y),
      maxX: Math.max(box.maxX, x),
      maxY: Math.max(box.maxY, y),
    }),
    { minX: Number.POSITIVE_INFINITY, minY: Number.POSITIVE_INFINITY, maxX: Number.NEGATIVE_INFINITY, maxY: Number.NEGATIVE_INFINITY },
  );
}

function hasPositiveBBoxOverlap(a: BBox, b: BBox): boolean {
  return Math.min(a.maxX, b.maxX) > Math.max(a.minX, b.minX) && Math.min(a.maxY, b.maxY) > Math.max(a.minY, b.minY);
}

function pointOnSegment(point: Point, a: Point, b: Point): boolean {
  const [px, py] = point;
  const [ax, ay] = a;
  const [bx, by] = b;
  const cross = (px - ax) * (by - ay) - (py - ay) * (bx - ax);
  if (cross !== 0) return false;
  return px >= Math.min(ax, bx) && px <= Math.max(ax, bx) && py >= Math.min(ay, by) && py <= Math.max(ay, by);
}

function pointInPolygon(point: Point, polygon: Point[]): boolean {
  // 共有辺・共有頂点は positive-area overlap とみなさないため outside 扱い。
  for (let i = 0; i < polygon.length; i += 1) {
    if (pointOnSegment(point, polygon[i], polygon[(i + 1) % polygon.length])) {
      return false;
    }
  }

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > point[1]) !== (yj > point[1]) && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function validateOverlap(pattern: Pattern, warnings: ValidationIssue[]): void {
  const boxes = new Map<string, BBox>();
  for (const slot of pattern.slots) {
    boxes.set(slot.slot_id, bboxOf(slot.polygon));
  }

  for (let i = 0; i < pattern.slots.length; i += 1) {
    for (let j = i + 1; j < pattern.slots.length; j += 1) {
      const slotA = pattern.slots[i];
      const slotB = pattern.slots[j];
      const boxA = boxes.get(slotA.slot_id);
      const boxB = boxes.get(slotB.slot_id);
      if (!boxA || !boxB || !hasPositiveBBoxOverlap(boxA, boxB)) continue;

      const hasVertexInside =
        slotA.polygon.some((point) => pointInPolygon(point, slotB.polygon)) ||
        slotB.polygon.some((point) => pointInPolygon(point, slotA.polygon));
      if (!hasVertexInside) continue;

      warnings.push({
        rule: "slot_pair_overlap",
        message: `${slotA.slot_id} and ${slotB.slot_id} have positive-area overlap`,
        slot_pair: [slotA.slot_id, slotB.slot_id],
      });
    }
  }
}

function toDeg(radians: number): number {
  return (radians * 180) / Math.PI;
}

function validateConcave(slot: PatternSlot, warnings: ValidationIssue[]): void {
  const polygon = slot.polygon;
  const area = signedShoelaceArea(polygon);
  if (area === 0) return;
  const polygonSign = Math.sign(area);

  for (let i = 0; i < polygon.length; i += 1) {
    const prev = polygon[(i - 1 + polygon.length) % polygon.length];
    const curr = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    const edgeIn: Point = [curr[0] - prev[0], curr[1] - prev[1]];
    const edgeOut: Point = [next[0] - curr[0], next[1] - curr[1]];
    const cross = edgeIn[0] * edgeOut[1] - edgeIn[1] * edgeOut[0];
    if (cross === 0 || Math.sign(cross) === polygonSign) continue;

    const toPrev: Point = [prev[0] - curr[0], prev[1] - curr[1]];
    const toNext: Point = [next[0] - curr[0], next[1] - curr[1]];
    const dot = toPrev[0] * toNext[0] + toPrev[1] * toNext[1];
    const convexAngle = toDeg(Math.atan2(Math.abs(cross), dot));
    const interiorAngle = 360 - convexAngle;
    if (interiorAngle > 270) {
      warnings.push({
        rule: "concave_angle",
        message: `concave interior angle is ${Number(interiorAngle.toFixed(2))} degrees`,
        slot_id: slot.slot_id,
        vertex_index: i,
      });
    }
  }
}

function validateShallowTrapezoid(slot: PatternSlot, warnings: ValidationIssue[]): void {
  const polygon = slot.polygon;
  if (polygon.length !== 4 || isAxisAlignedRect(polygon)) return;

  const xs = new Set(polygon.map(([x]) => x));
  const ys = new Set(polygon.map(([, y]) => y));
  if (xs.size !== 4 || ys.size !== 4) return;

  for (let i = 0; i < polygon.length; i += 1) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % polygon.length];
    const angleDeg = toDeg(Math.atan2(Math.abs(y2 - y1), Math.abs(x2 - x1)));
    if (angleDeg <= 1 || angleDeg >= 89) continue;

    const tilt = Math.min(angleDeg, 90 - angleDeg);
    if (tilt < 10) {
      warnings.push({
        rule: "diagonal_trapezoid_too_shallow",
        message: `diagonal edge tilt is ${Number(tilt.toFixed(2))} degrees from axis`,
        slot_id: slot.slot_id,
      });
      return;
    }
  }
}

function validatePattern(pattern: Pattern, dict: PatternDict, clockwiseSign: 1 | -1): PatternValidation {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  validateSlotCount(pattern, errors);
  validateReadingOrder(pattern, errors);

  for (const slot of pattern.slots) {
    validateBounds(slot, dict.page_dimensions, errors);
    validateVertices(slot, errors);
    validateClockwise(slot, clockwiseSign, errors);
    validateConcave(slot, warnings);
    validateShallowTrapezoid(slot, warnings);
  }
  validateOverlap(pattern, warnings);

  return {
    id: pattern.id,
    panel_count: pattern.panel_count,
    status: errors.length > 0 ? "fail" : warnings.length > 0 ? "warning" : "pass",
    errors,
    warnings,
  };
}

function buildReport(version: string, dict: PatternDict): ValidationReport {
  const calibrationArea = signedArea(CW_CALIBRATION_RECT);
  if (calibrationArea === 0) {
    throw new Error("clockwise calibration rect is degenerate");
  }
  const clockwiseSign = Math.sign(calibrationArea) as 1 | -1;
  const patterns = dict.patterns.map((pattern) => validatePattern(pattern, dict, clockwiseSign));
  const failed = patterns.filter((pattern) => pattern.status === "fail").length;
  const warningOnly = patterns.filter((pattern) => pattern.status === "warning").length;

  return {
    version,
    generated_at: new Date().toISOString(),
    summary: {
      total_patterns: patterns.length,
      passed: patterns.length - failed - warningOnly,
      failed,
      warning_only: warningOnly,
    },
    patterns,
  };
}

async function writeOutput(json: string, out?: string): Promise<void> {
  if (!out) {
    process.stdout.write(json);
    return;
  }

  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, json, "utf-8");
}

function printSummary(report: ValidationReport): void {
  const { total_patterns: total, passed, failed, warning_only: warningOnly } = report.summary;
  console.error(`Validation summary: ${total} total / ${passed} passed / ${failed} failed / ${warningOnly} warning`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const dictPath = path.join(process.cwd(), "data", "manga", "layout_patterns", `${args.version}.json`);
  const dict = await loadPatternDict(dictPath);
  const report = buildReport(args.version, dict);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  await writeOutput(json, args.out);
  printSummary(report);

  const shouldFail = report.summary.failed > 0 || (args.strict && report.summary.warning_only > 0);
  if (shouldFail) {
    process.exit(1);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
