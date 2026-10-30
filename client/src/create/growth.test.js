import { describe, expect, it } from "vitest";
import { Line, WALK_DEG, baseHeights, growth, raises } from "./growth.js";

const straight = [
  [0, 0],
  [5000, 0],
];

describe("a line", () => {
  it("finds how far points are from it, and how far along", () => {
    const line = new Line(straight, 1000);
    expect(line.nearest(2000, 300)).toEqual({ d: 300, s: 2000 });
    expect(line.nearest(2000, 3000)).toBeNull();
  });

  it("averages the ground under it along it", () => {
    const line = new Line(
      Array.from({ length: 51 }, (_, k) => [k * 100, 0]),
      100,
    );
    // A narrow ditch is mostly bridged.
    const bases = baseHeights(line, (x) => (Math.abs(x - 2500) < 150 ? -300 : 0));
    expect(bases[25]).toBeGreaterThan(-60);
  });
});

describe("hills", () => {
  const flat = () => 0;
  const hills = growth("hills", straight, { width: 1000, height: 300, noise: 0 }, flat);
  // The steepest slope, in degrees, going out from the line between d0 and d1 ft, 2500 ft along.
  const steepest = (d0, d1) => {
    let most = 0;
    for (let d = d0; d < d1; d += 4) most = Math.max(most, (Math.atan(Math.abs(hills.raise(2500, d + 4, 0) - hills.raise(2500, d, 0)) / 4) * 180) / Math.PI);
    return most;
  };

  it("are raised over the line, and not past the foothills", () => {
    expect(hills.raise(2500, 0, 0)).toBeGreaterThanOrEqual(150);
    expect(hills.zone(2500, 0)).toBe(2);
    expect(hills.zone(2500, 800)).toBe(1);
    expect(hills.zone(2500, 1600)).toBe(0);
    expect(hills.raise(2500, 1600, 0)).toBe(0);
  });

  it("are too steep to climb at the core's edge, but not in the outer foothills", () => {
    expect(steepest(350, 650)).toBeGreaterThan(WALK_DEG);
    expect(steepest(800, 1200)).toBeLessThan(WALK_DEG);
  });

  it("never lower the ground", () => {
    expect(hills.raise(2500, 0, 1000)).toBe(0);
  });

  it("are taken away again by undo", () => {
    const r = raises(hills, flat);
    expect(r.at(2496, 0)).toBeCloseTo(hills.raise(2496, 0, 0));
    expect(r.undo(2496, 0)).toBeCloseTo(-hills.raise(2496, 0, 0));
  });
});

describe("a range", () => {
  const flat = () => 0;
  const range = growth("range", straight, { width: 2000, height: 1000, noise: 0.5 }, flat);
  const steepest = (d0, d1) => {
    let most = 0;
    for (let d = d0; d < d1; d += 4) most = Math.max(most, (Math.atan(Math.abs(range.raise(2500, d + 4, 0) - range.raise(2500, d, 0)) / 4) * 180) / Math.PI);
    return most;
  };

  it("rises highest along its ridge", () => {
    expect(range.raise(2500, 0, 0)).toBeGreaterThan(500);
    expect(range.raise(2500, 0, 0)).toBeGreaterThan(range.raise(2500, 700, 0));
  });

  it("is too steep to climb at the core's edge, but not in the outer foothills", () => {
    expect(steepest(700, 1300)).toBeGreaterThan(WALK_DEG);
    expect(steepest(1700, 2400)).toBeLessThan(WALK_DEG);
  });
});
