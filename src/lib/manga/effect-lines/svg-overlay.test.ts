import { describe, expect, it } from "vitest";
import { renderEffectLineOverlay } from "./svg-overlay";

describe("renderEffectLineOverlay", () => {
  it("speed は 40 本程度の line と intensity stroke-width を出す", () => {
    const svg = renderEffectLineOverlay({ type: "speed", intensity: "normal", direction: 0 }, 400, 300);

    expect(svg).toContain('data-effect-line-type="speed"');
    expect(svg.match(/data-effect-line="speed"/g)).toHaveLength(40);
    expect(svg).toContain('stroke-width="2"');
  });

  it("focus は strong で 36 本の放射 line を出す", () => {
    const svg = renderEffectLineOverlay({ type: "focus", intensity: "strong", centerX: 0.5, centerY: 0.5 }, 400, 300);

    expect(svg).toContain('data-effect-line-type="focus"');
    expect(svg.match(/data-effect-line="focus"/g)).toHaveLength(36);
    expect(svg).toContain('stroke-width="3"');
  });

  it("radial は太線と impact の切れ目を出す", () => {
    const svg = renderEffectLineOverlay({ type: "radial", intensity: "strong", centerX: 0.5, centerY: 0.5 }, 400, 300);

    expect(svg).toContain('data-effect-line-type="radial"');
    expect(svg.match(/data-effect-line="radial"/g)).toHaveLength(16);
    expect(svg.match(/data-effect-line="radial-impact"/g)).toHaveLength(16);
    expect(svg).toContain('stroke-width="3"');
  });

  it("vibration は panel 縁の短い path を出す", () => {
    const svg = renderEffectLineOverlay({ type: "vibration", intensity: "subtle" }, 400, 300);

    expect(svg).toContain('data-effect-line-type="vibration"');
    expect(svg.match(/data-effect-line="vibration"/g)).toHaveLength(4);
    expect(svg).toContain('stroke-width="1"');
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
