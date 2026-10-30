import { describe, expect, it } from "vitest";
import { Line, baseHeights, growth, raises } from "./growth.js";

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

for (const kind of ["range", "hills"]) {
  describe(kind, () => {
    const flat = () => 0;
    const grown = growth(kind, straight, { width: 4000, height: 1000, noise: 0.6, density: 1 }, flat);
    const across = (d0, d1) => {
      let most = 0;
      for (let x = 500; x <= 4500; x += 100) for (let d = d0; d <= d1; d += 50) most = Math.max(most, grown.raise(x, d, 0));
      return most;
    };

    it("scatters its tallest peaks in the middle third, and shorter ones further out", () => {
      const tallest = grown.peaks.filter((p) => p.tier === 0);
      expect(tallest.length).toBeGreaterThan(2);
      for (const p of tallest) expect(Math.abs(p.z)).toBeLessThanOrEqual(2000 / 3 + 1);
      for (const p of grown.peaks.filter((p) => p.tier === 2)) expect(p.tall).toBeLessThan(250);
    });

    it("rises highest in the middle, and fades to nothing at the band's edge", () => {
      expect(across(0, 600)).toBeGreaterThan(500);
      expect(across(0, 600)).toBeGreaterThan(across(1400, 1900));
      expect(across(2300, 3000)).toBe(0);
      expect(grown.zone(2500, 0)).toBe(3);
      expect(grown.zone(2500, 1800)).toBe(1);
    });

    it("never lowers the ground", () => {
      expect(grown.raise(2500, 0, 5000)).toBe(0);
    });

    it("is taken away again by undo", () => {
      const r = raises(grown, flat);
      expect(r.at(2496, 0)).toBeCloseTo(grown.raise(2496, 0, 0));
      expect(r.undo(2496, 0)).toBeCloseTo(-grown.raise(2496, 0, 0));
    });
  });
}
