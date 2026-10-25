import { describe, it, expect } from "vitest";
import { prepareHeights } from "./heightField.js";

describe("heightField", () => {
  it("is the default height with no pins", () => {
    expect(prepareHeights([], 20)(123, 456)).toBe(20);
  });

  it("passes through every pin", () => {
    const pins = [
      { x: 0, z: 0, height: 100 },
      { x: 2000, z: 0, height: 20 },
      { x: 0, z: 2000, height: 60 },
      { x: 1500, z: 1500, height: 5 },
    ];
    const at = prepareHeights(pins, 20);
    for (const p of pins) expect(at(p.x, p.z)).toBeCloseTo(p.height, 3);
  });

  it("spans smoothly between two pins instead of doming around each", () => {
    const at = prepareHeights([{ x: 0, z: 0, height: 100 }, { x: 2000, z: 0, height: 0 }], 20);
    expect(at(1000, 0)).toBeCloseTo(50, 0);
    expect(at(500, 0)).toBeGreaterThan(at(1000, 0));
    expect(at(1500, 0)).toBeLessThan(at(1000, 0));
  });

  it("never goes past the pins' range, and eases to the default far away", () => {
    const pins = [
      { x: 0, z: 0, height: 100 },
      { x: 1000, z: 0, height: 0 },
      { x: 0, z: 1000, height: 0 },
    ];
    const at = prepareHeights(pins, 20);
    for (let x = -2000; x <= 3000; x += 250) {
      const h = at(x, -1500);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(100);
    }
    expect(at(20000, 20000)).toBe(20);
  });

  it("copes with one pin, or pins in a line", () => {
    expect(prepareHeights([{ x: 0, z: 0, height: 70 }], 20)(500, 0)).toBeCloseTo(70);
    const line = prepareHeights([0, 1000, 2000].map((x, i) => ({ x, z: 0, height: i * 30 })), 20);
    expect(line(1000, 0)).toBeCloseTo(30, 3);
  });
});
