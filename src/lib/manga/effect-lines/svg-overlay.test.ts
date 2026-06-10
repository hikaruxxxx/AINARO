import { describe, expect, it } from "vitest";
import { renderEffectLineOverlay } from "./svg-overlay";

describe("renderEffectLineOverlay", () => {
  it("speed は 40 本程度の line と intensity stroke-width を出す", () => {
    const svg = renderEffectLineOverlay({ type: "speed", intensity: "normal", direction: 0 }, 400, 300);

    expect(svg).toContain('data-effect-line-type="speed"');
    expect(svg.match(/data-effect-line="speed"/g)).toHaveLength(40);
    expect(svg).toContain('stroke-width="3"');
    expect(svg).toContain('opacity="0.85"');
  });

  it("focus は strong で 36 本の放射 line を出す", () => {
    const svg = renderEffectLineOverlay({ type: "focus", intensity: "strong", centerX: 0.5, centerY: 0.5 }, 400, 300);

    expect(svg).toContain('data-effect-line-type="focus"');
    expect(svg.match(/data-effect-line="focus"/g)).toHaveLength(36);
    expect(svg).toContain('stroke-width="4"');
    expect(svg).toContain('opacity="0.85"');
  });

  it("radial は太線と impact の切れ目を出す", () => {
    const svg = renderEffectLineOverlay({ type: "radial", intensity: "strong", centerX: 0.5, centerY: 0.5 }, 400, 300);

    expect(svg).toContain('data-effect-line-type="radial"');
    expect(svg.match(/data-effect-line="radial"/g)).toHaveLength(16);
    expect(svg.match(/data-effect-line="radial-impact"/g)).toHaveLength(16);
    expect(svg).toContain('stroke-width="4"');
    expect(svg).toContain('opacity="0.9"');
  });

  it("vibration は panel 縁の短い path を出す", () => {
    const svg = renderEffectLineOverlay({ type: "vibration", intensity: "subtle" }, 400, 300);

    expect(svg).toContain('data-effect-line-type="vibration"');
    expect(svg.match(/data-effect-line="vibration"/g)).toHaveLength(4);
    expect(svg).toContain('stroke-width="2"');
    expect(svg).toContain('opacity="0.85"');
  });

  it("各 effect line に対応する halo を出す", () => {
    const speedSvg = renderEffectLineOverlay({ type: "speed", intensity: "normal", direction: 0 }, 400, 300);
    const focusSvg = renderEffectLineOverlay({ type: "focus", intensity: "normal", centerX: 0.5, centerY: 0.5 }, 400, 300);
    const vibrationSvg = renderEffectLineOverlay({ type: "vibration", intensity: "normal" }, 400, 300);
    const radialSvg = renderEffectLineOverlay({ type: "radial", intensity: "normal", centerX: 0.5, centerY: 0.5 }, 400, 300);

    expect(speedSvg.match(/data-effect-line="speed"/g)).toHaveLength(speedSvg.match(/data-effect-line="speed-halo"/g)?.length ?? 0);
    expect(focusSvg.match(/data-effect-line="focus"/g)).toHaveLength(focusSvg.match(/data-effect-line="focus-halo"/g)?.length ?? 0);
    expect(vibrationSvg.match(/data-effect-line="vibration"/g)).toHaveLength(vibrationSvg.match(/data-effect-line="vibration-halo"/g)?.length ?? 0);
    expect(radialSvg.match(/data-effect-line="radial-halo"/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
  });

  it("clipPolygon 指定時は clipPath を含める", () => {
    const svg = renderEffectLineOverlay(
      { type: "speed", intensity: "normal", direction: 0 },
      400,
      300,
      [[0, 0], [400, 0], [400, 300], [0, 300]]
    );

    expect(svg).toContain("<clipPath");
    expect(svg).toContain('clip-path="url(#clip-');
    expect(svg).toContain('<polygon points="0,0 400,0 400,300 0,300"/>');
  });
});
