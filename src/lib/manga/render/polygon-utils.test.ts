import { describe, expect, it } from "vitest";
import { polygonBbox, polygonSvgFrame, polygonToSvgMask } from "./polygon-utils";

function polygonPoints(svg: string): [number, number][] {
  const points = svg.match(/points="([^"]+)"/)?.[1];
  if (!points) throw new Error(`points not found: ${svg}`);
  return points.split(" ").map((pair) => {
    const [x, y] = pair.split(",").map(Number);
    return [x, y];
  });
}

describe("polygon-utils", () => {
  it("polygonToSvgMask は4頂点 polygon を白塗り SVG mask にする", () => {
    const svg = polygonToSvgMask(
      [[10, 20], [110, 20], [110, 80], [10, 80]],
      120,
      90,
      0,
      0
    );

    expect(svg).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 90" width="120" height="90"><polygon points="10,20 110,20 110,80 10,80" fill="white" /></svg>'
    );
  });

  it("polygonBbox は凸四角形と凹L字で正しい bbox を返す", () => {
    expect(polygonBbox([[5, 10], [25, 8], [30, 40], [0, 35]])).toEqual({
      x: 0,
      y: 8,
      w: 30,
      h: 32,
    });
    expect(polygonBbox([[0, 0], [60, 0], [60, 20], [25, 20], [25, 50], [0, 50]])).toEqual({
      x: 0,
      y: 0,
      w: 60,
      h: 50,
    });
  });

  it("polygonSvgFrame は borderWidth/2 だけ重心方向に近似 shrink する", () => {
    const frame = polygonSvgFrame([[0, 0], [10, 0], [10, 10], [0, 10]], {
      borderWidth: 4,
      borderColor: "black",
    });
    const points = polygonPoints(frame);

    expect(points[0][0]).toBeCloseTo(1.414, 3);
    expect(points[0][1]).toBeCloseTo(1.414, 3);
    expect(points[1][0]).toBeCloseTo(8.586, 3);
    expect(points[1][1]).toBeCloseTo(1.414, 3);
    expect(frame).toContain('stroke-width="4"');
  });

  it("mask SVG の viewBox は指定 w x h と一致する", () => {
    const svg = polygonToSvgMask([[0, 0], [4, 0], [4, 4]], 321, 654, 0, 0);

    expect(svg).toContain('viewBox="0 0 321 654"');
    expect(svg).toContain('width="321" height="654"');
  });

  it("polygon offset で page 座標を local 座標に変換できる", () => {
    const svg = polygonToSvgMask(
      [[100, 200], [150, 200], [150, 260], [100, 260]],
      50,
      60,
      -100,
      -200
    );

    expect(svg).toContain('points="0,0 50,0 50,60 0,60"');
  });
});
