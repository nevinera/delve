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
  const slope = (x0, x1) => (Math.atan(Math.abs(hills.raise(2500, x1, 0) - hills.raise(2500, x0, 0)) / Math.abs(x1 - x0)) * 180) / Math.PI;

  it("rise to their height over the line, and not past the foothills", () => {
    expect(hills.raise(2500, 0, 0)).toBeCloseTo(300);
    expect(hills.zone(2500, 0)).toBe(2);
    expect(hills.zone(2500, 700)).toBe(1);
    expect(hills.zone(2500, 1200)).toBe(0);
    expect(hills.raise(2500, 1200, 0)).toBe(0);
  });

  it("are too steep to climb at the core's edge, but not in the foothills", () => {
    expect(slope(440, 480)).toBeGreaterThan(WALK_DEG);
    expect(slope(600, 700)).toBeLessThan(WALK_DEG);
  });

  it("never lower the ground", () => {
    expect(hills.raise(2500, 0, 1000)).toBe(0);
  });

  it("are taken away again by undo", () => {
    const r = raises(hills, flat);
    expect(r.at(2500, 0)).toBeCloseTo(300);
    expect(r.undo(2500, 0)).toBeCloseTo(-300);
  });
});
