import { describe, it, expect } from "vitest";
import { CLIFF, prepareCliffs } from "./cliffs.js";
import { prepareHeights } from "./heightField.js";

// A cliff running east along z = 0, so its bottom is to the south (z > 0).
const cliff = [{ points: [[-3000, 0], [3000, 0]] }];

describe("cliffs", () => {
  it("steps the ground down across the line, by the drop", () => {
    const { knots, settle } = prepareCliffs(cliff, 1);
    const at = settle(new Float64Array(knots.length).fill(100));
    expect(at(0, -80) - at(0, 120)).toBeGreaterThan(95);
    expect(at(0, -80) - at(0, 120)).toBeLessThan(105);
    // It fades away from the line, and at the ends.
    expect(Math.abs(at(0, -20000))).toBeLessThan(5);
    expect(Math.abs(at(3500, -80) - at(3500, 120))).toBeLessThan(10);
  });

  it("works out drops from the pins either side, leaving gentle ground", () => {
    const pins = [
      { x: -1000, z: -400, height: 300 },
      { x: 1000, z: -400, height: 300 },
      { x: -1000, z: 400, height: 100 },
      { x: 1000, z: 400, height: 100 },
    ];
    const at = prepareHeights(pins, 20, prepareCliffs(cliff, 1));
    for (const p of pins) expect(Math.abs(at(p.x, p.z) - p.height)).toBeLessThan(2);
    const drop = at(0, -60) - at(0, 100);
    expect(drop).toBeGreaterThan(150);
    expect(at(0, -200) - at(0, -400)).toBeLessThan(30);
    expect(Math.max(...at.drops.values)).toBeGreaterThan(150);
  });

  it("drops no more than the pins call for, saying where that's hardly a cliff", () => {
    const pins = [
      { x: -1000, z: -400, height: 50 },
      { x: 1000, z: 400, height: 50 },
      { x: 1000, z: -400, height: 50 },
    ];
    const at = prepareHeights(pins, 20, prepareCliffs(cliff, 1));
    expect(Math.max(...at.drops.values)).toBeLessThan(CLIFF.shortFt);
    expect(at.drops.short.every(Boolean)).toBe(true);
  });

  it("has a face 20 to 50ft across on the bottom side", () => {
    const { knots, settle } = prepareCliffs(cliff, 7);
    const at = settle(new Float64Array(knots.length).fill(200));
    for (let x = -1000; x <= 1000; x += 37) {
      const top = at(x, -20);
      const bottom = at(x, 80);
      expect(top - bottom).toBeGreaterThan(190);
      // Halfway down is somewhere in the face, not right at the line.
      let z = -20;
      while (at(x, z) > (top + bottom) / 2) z += 1;
      expect(z).toBeGreaterThan(-10);
      expect(z).toBeLessThan(70);
    }
  });
});
