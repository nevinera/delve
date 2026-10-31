import { describe, expect, it } from "vitest";
import { inside } from "../v2/biomes.js";
import { Line, WALK_DEG, baseHeights, growth, middleOutline, raises } from "./growth.js";

const straight = [
  [0, 0],
  [5000, 0],
];

describe("a line", () => {
  it("finds how far points are from it, and how far along", () => {
    const line = new Line(straight, 1000);
    expect(line.nearest(2000, 300)).toEqual({ d: 300, s: 2000, side: 1 });
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

describe("middleOutline", () => {
  it("outlines the middle third of the band, round its ends", () => {
    const grown = growth("range", [[0, 0], [5000, 0], [8000, 3000]], { width: 3000, height: 1000, noise: 0.6, density: 3 }, () => 0);
    const outline = middleOutline(grown);
    let [middle, wrong] = [0, 0];
    for (let z = -2000; z <= 5000; z += 50) {
      for (let x = -2000; x <= 10000; x += 50) {
        const inMiddle = grown.zone(x, z) === 3;
        if (inMiddle) middle++;
        if (inMiddle !== inside(outline, x, z)) wrong++;
      }
    }
    expect(wrong / middle).toBeLessThan(0.02);
  });
});

describe("cliff", () => {
  const line = [
    [0, 0],
    [1000, 0],
  ];
  const settings = { width: 300, noise: 0 };
  // Ground rising to the line's right, going along it (+z), or its left.
  const right = (x, z) => z * 0.1;
  const left = (x, z) => -z * 0.1;
  // The ground's height across the line at x once the cliff's grown, every foot from -400 to 400.
  const across = (grown, ground, x) => Array.from({ length: 801 }, (_, k) => ground(x, k - 400) + grown.raise(x, k - 400, 0));
  const steepest = (heights) => Math.max(...heights.slice(1).map((h, k) => Math.abs(h - heights[k])));

  it("gathers the ground's rise across the line into a step up to the higher side", () => {
    for (const ground of [right, left]) {
      const grown = growth("cliff", line, settings, ground);
      expect(grown.flat).toBe(false);
      const heights = across(grown, ground, 500);
      expect((Math.atan(steepest(heights)) * 180) / Math.PI).toBeGreaterThan(WALK_DEG);
      // As it was past the band, and no higher or lower than it was at its edges.
      expect(grown.raise(500, 320, 0)).toBe(0);
      expect(grown.raise(500, -320, 0)).toBe(0);
      expect(Math.max(...heights)).toBeCloseTo(40, 0);
      expect(Math.min(...heights)).toBeCloseTo(-40, 0);
    }
  });

  it("isn't a plateau: the ground keeps rising behind its top", () => {
    const grown = growth("cliff", line, settings, right);
    const heights = across(grown, right, 500);
    expect(heights[400 + 280]).toBeGreaterThan(heights[400 + 120] + 2);
    expect(heights[400 - 120]).toBeGreaterThan(heights[400 - 280] + 2);
  });

  it("makes a little step where the ground's only a little higher, and none where it's flat", () => {
    const slight = (x, z) => z * 0.01;
    const small = growth("cliff", line, settings, slight);
    expect(small.flat).toBe(false);
    const step = steepest(across(small, slight, 500));
    expect(step).toBeGreaterThan(0.1);
    expect(step).toBeLessThan(steepest(across(growth("cliff", line, settings, right), right, 500)) / 4);
    const flat = growth("cliff", line, settings, () => 0);
    expect(flat.flat).toBe(true);
    expect(flat.raise(500, 50, 0)).toBe(0);
  });

  it("steps up to the side higher along most of the line, and not where it rises the other way", () => {
    const long = [
      [0, 0],
      [4000, 0],
    ];
    // Higher on the right for the first three quarters, the left after.
    const ground = (x, z) => (x < 3000 ? z : -z) * 0.1;
    const grown = growth("cliff", long, settings, ground);
    expect(steepest(across(grown, ground, 1500))).toBeGreaterThan(2);
    expect(steepest(across(grown, ground, 3700))).toBeLessThan(0.15);
  });

  it("eases out to no step at its ends", () => {
    const grown = growth("cliff", line, settings, right);
    const steps = [5, 75, 150, 300].map((x) => steepest(across(grown, right, x)));
    for (let k = 1; k < steps.length; k++) expect(steps[k]).toBeGreaterThan(steps[k - 1]);
    expect(steps[0]).toBeLessThan(0.15);
  });

  it("meanders", () => {
    const grown = growth("cliff", line, settings, right);
    const faces = [300, 400, 500, 600, 700].map((x) => {
      const heights = across(grown, right, x);
      let [most, at] = [0, 0];
      heights.slice(1).forEach((h, k) => h - heights[k] > most && ([most, at] = [h - heights[k], k]));
      return at;
    });
    expect(Math.max(...faces) - Math.min(...faces)).toBeGreaterThan(8);
  });
});
