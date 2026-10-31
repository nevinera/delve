import { describe, expect, it } from "vitest";
import { scatterPools } from "./marsh.js";

// A seeded roll, 0 to 1.
const roller = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const flat = () => 50;
const dry = () => false;

describe("scattered pools", () => {
  it("digs pools inside the ring, under their water, that keep apart", () => {
    const pools = scatterPools({ radius: 200, count: 10, size: 30 }, 1000, 1000, flat, dry, roller());
    expect(pools.length).toBeGreaterThan(5);
    for (const { at, undo, bounds, body } of pools) {
      const [x0, z0, x1, z1] = bounds;
      const [mx, mz] = [(x0 + x1) / 2, (z0 + z1) / 2];
      expect(Math.hypot(mx - 1000, mz - 1000)).toBeLessThan(200);
      expect(body.level).toBeCloseTo(49.7);
      expect(50 + at(mx, mz)).toBeLessThan(body.level - 0.5);
      expect(undo(mx, mz)).toBeCloseTo(-at(mx, mz));
      expect(at(x0, z0)).toBe(0);
      expect(body.points.length).toBe(20);
    }
    // No two hollows touch.
    for (const a of pools) {
      for (const b of pools) {
        if (a === b) continue;
        const [ax, az] = [(a.bounds[0] + a.bounds[2]) / 2, (a.bounds[1] + a.bounds[3]) / 2];
        let touch = false;
        for (let k = 0; k < 40; k++) touch ||= a.at(ax + k, az) < 0 && b.at(ax + k, az) < 0;
        expect(touch).toBe(false);
      }
    }
  });

  it("keeps off steep ground and water", () => {
    expect(scatterPools({ radius: 200, count: 10, size: 30 }, 0, 0, (x) => x, dry, roller())).toEqual([]);
    expect(scatterPools({ radius: 200, count: 10, size: 30 }, 0, 0, flat, (x) => x < 1000, roller())).toEqual([]);
  });

  it("stands each pool's water under the lowest ground round it, on gentle slopes", () => {
    const tilted = (x) => 50 + x * 0.05;
    for (const { at, body, bounds } of scatterPools({ radius: 300, count: 6, size: 40 }, 0, 0, tilted, dry, roller(7))) {
      const [x0, , x1] = bounds;
      // The ground at its outline is never under its water.
      for (const [px] of body.points) expect(tilted(px)).toBeGreaterThan(body.level);
      expect(Math.min(...[0, 0.25, 0.5, 0.75, 1].map((t) => tilted(x0 + (x1 - x0) * t) + at(x0 + (x1 - x0) * t, (bounds[1] + bounds[3]) / 2)))).toBeLessThan(body.level);
    }
  });
});
