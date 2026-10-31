import { describe, expect, it } from "vitest";
import { poolAt } from "./pools.js";

// A bowl 200 ft across, its rim 20 ft up, its middle 0, and the ground falling away past it.
const bowl = (x, z) => {
  const r = Math.hypot(x, z);
  return r < 100 ? r / 5 : 20 - (r - 100) / 5;
};

describe("pools", () => {
  it("fill a low spot to just under where it spills", () => {
    const pool = poolAt(bowl, 0, 0, 1, 100);
    expect(pool.level).toBeCloseTo(19.5, 0);
    // Its outline's round the ground under that, about 100 ft out, on ground over it.
    for (const [x, z] of pool.points) {
      expect(Math.hypot(x, z)).toBeGreaterThan(90);
      expect(Math.hypot(x, z)).toBeLessThan(110);
    }
    expect(pool.points.length).toBeGreaterThan(8);
  });

  it("stop at the most they're let fill to", () => {
    expect(poolAt(bowl, 0, 0, 1, 10).level).toBe(10);
  });

  it("don't fill where the ground falls away below where they're filled from", () => {
    expect(poolAt((x) => -x / 10, 0, 0, 1, 100)).toBeNull();
  });
});
