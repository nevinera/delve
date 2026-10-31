import { describe, expect, it } from "vitest";
import { inside } from "../v2/biomes.js";
import { Line, WALK_DEG, baseHeights, crossing, growth, middleOutline, raises } from "./growth.js";

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

describe("a way across", () => {
  const flat = () => 0;
  const grown = growth("range", straight, { width: 2000, height: 1000, noise: 0, density: 1 }, flat);
  // A wall along the line, with a gap in it, or none.
  const walled = (gap) => ({ ...grown, raise: (x, z) => (Math.abs(z) < 200 && Math.abs(x - 2500) > gap ? 1000 : 0) });

  it("is found through a gap", () => {
    const path = crossing(raises(walled(150), flat));
    expect(path).not.toBeNull();
    // Through the gap, from one side to the other.
    expect(path.filter(([, z]) => Math.abs(z) < 200).every(([x]) => Math.abs(x - 2500) <= 150)).toBe(true);
    expect(Math.sign(path[0][1])).not.toBe(Math.sign(path.at(-1)[1]));
  });

  it("isn't found through a wall, nor round its ends", () => {
    expect(crossing(raises(walled(0), flat))).toBeNull();
  });
});

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
  const settings = { width: 300, height: 60, noise: 0 };
  // Ground rising to the line's right, going along it (+z), or its left.
  const right = (x, z) => z * 0.1;
  const left = (x, z) => -z * 0.1;

  it("raises the ground on whichever side's higher, and none on the other", () => {
    const up = growth("cliff", line, settings, right);
    expect(up.flat).toBe(false);
    expect(up.raise(500, 120, 0)).toBeGreaterThan(55);
    expect(up.raise(500, -120, 0)).toBe(0);
    expect(up.raise(500, 400, 0)).toBe(0);
    const down = growth("cliff", line, settings, left);
    expect(down.raise(500, -120, 0)).toBeGreaterThan(55);
    expect(down.raise(500, 120, 0)).toBe(0);
  });

  it("makes a little cliff where the ground's only a little higher, and none where it's flat", () => {
    const slight = growth("cliff", line, settings, (x, z) => z * 0.01);
    expect(slight.flat).toBe(false);
    expect(slight.raise(500, 120, 0)).toBeGreaterThan(5);
    expect(slight.raise(500, 120, 0)).toBeLessThan(30);
    const flat = growth("cliff", line, settings, () => 0);
    expect(flat.flat).toBe(true);
    expect(flat.raise(500, 120, 0)).toBe(0);
    expect(flat.raise(500, -120, 0)).toBe(0);
  });

  it("rises on the side higher along most of the line, and not where it rises the other way", () => {
    const long = [
      [0, 0],
      [4000, 0],
    ];
    // Higher on the right for the first three quarters, the left after.
    const grown = growth("cliff", long, settings, (x, z) => (x < 3000 ? z : -z) * 0.1);
    expect(grown.raise(1500, 120, 0)).toBeGreaterThan(55);
    expect(grown.raise(1500, -120, 0)).toBe(0);
    expect(grown.raise(3600, 120, 0)).toBe(0);
    expect(grown.raise(3600, -120, 0)).toBe(0);
  });

  it("meanders, with a face steeper than a character walks up, lower by its ends", () => {
    const grown = growth("cliff", line, settings, right);
    // Where its face crosses the middle of its height, along it.
    const faceAt = (x) => {
      for (let z = -100; z <= 100; z += 0.5) if (grown.raise(x, z, 0) > 30) return z;
      return null;
    };
    const faces = [100, 300, 500, 700, 900].map(faceAt);
    expect(Math.max(...faces) - Math.min(...faces)).toBeGreaterThan(8);
    let steepest = 0;
    for (let z = -100; z <= 100; z += 1) steepest = Math.max(steepest, grown.raise(500, z + 1, 0) - grown.raise(500, z, 0));
    expect((Math.atan(steepest) * 180) / Math.PI).toBeGreaterThan(WALK_DEG);
    expect(grown.raise(10, 120, 0)).toBeLessThan(5);
    expect(grown.zone(500, 150)).toBe(2);
    expect(grown.zone(500, -150)).toBe(0);
  });

  it("can't be walked up, but round its ends, unless it's too low", () => {
    const r = raises(growth("cliff", line, settings, right), right);
    expect(r.step).toBe(4);
    expect(crossing(r)).toBeNull();
    expect(crossing(raises(growth("cliff", line, { ...settings, height: 1 }, right), right))).not.toBeNull();
  });
});
