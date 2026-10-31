import { describe, expect, it } from "vitest";
import { WalkSearch } from "./walk.js";

// Tiles 256 ft a side whose ground is height(x, z) at each corner, with water at `water(x, z)`
// over each cell, or none, and no tiles past `extent` tiles from the middle.
const world = (height, water = () => NaN, extent = 8) => (tx, tz) => {
  if (Math.abs(tx) > extent || Math.abs(tz) > extent) return undefined;
  const heights = Float32Array.from({ length: 65 * 65 }, (_, k) => height(tx * 256 + (k % 65) * 4, tz * 256 + Math.floor(k / 65) * 4));
  const level = Float32Array.from({ length: 64 * 64 }, (_, k) => water(tx * 256 + (k % 64) * 4 + 2, tz * 256 + Math.floor(k / 64) * 4 + 2));
  return { heights, water: { level } };
};
const run = (search) => {
  let state;
  do state = search.step(100000);
  while (state === "searching" || state === "waiting");
  return state;
};

describe("the walk search", () => {
  it("goes straight across flat ground", () => {
    const search = new WalkSearch({ from: [10, 10], to: [410, 10], most: 1000, cellsOf: world(() => 0) });
    expect(run(search)).toBe("found");
    expect(search.path.ft).toBeCloseTo(400, -1);
    expect(search.path.swumFt).toBe(0);
    expect(search.path.points.length).toBe(2);
  });

  it("goes through a gap in a wall, and not at all where there's none or it's too far round", () => {
    // A wall 100 ft high along x = 300, with a gap at z 380 to 420.
    const walled = (gap) => world((x, z) => (Math.abs(x - 300) < 20 && !(gap && z > 380 && z < 420) ? 100 : 0), () => NaN, 3);
    const through = new WalkSearch({ from: [100, 400], to: [500, 400], most: 1000, cellsOf: walled(true) });
    expect(run(through)).toBe("found");
    const inGap = through.path.points.filter((p) => Math.abs(p.x - 300) < 20);
    expect(inGap.every((p) => p.z > 380 && p.z < 420)).toBe(true);
    // The wall runs from z -768 to 1024 with sea round it, swum round, but too far within 1,000 ft.
    expect(run(new WalkSearch({ from: [100, 400], to: [500, 400], most: 1000, cellsOf: walled(false) }))).toBe("none");
  });

  it("climbs a slope gentler than the most it walks up, and not a steeper one, even slanting across it", () => {
    const ramp = (rise) => world((x) => Math.max(0, Math.min(200, (x - 100) * rise)), () => NaN, 3);
    expect(run(new WalkSearch({ from: [50, 50], to: [600, 50], most: 2000, cellsOf: ramp(1) }))).toBe("found");
    // 56°: a step slanting across it climbs less steeply than that.
    expect(run(new WalkSearch({ from: [50, 50], to: [600, 50], most: 2000, cellsOf: ramp(1.5) }))).toBe("none");
  });

  it("swims across deep water, and tells how far it swam", () => {
    // A channel 10 ft deep from x 200 to 300, its banks at its level.
    const ground = (x) => (x > 200 && x < 300 ? -10 : 0);
    const search = new WalkSearch({ from: [100, 100], to: [400, 100], most: 1000, cellsOf: world(ground, (x) => (x > 196 && x < 304 ? 0 : NaN)) });
    expect(run(search)).toBe("found");
    expect(search.path.swumFt).toBeGreaterThan(90);
    expect(search.path.points.some((p) => p.swum)).toBe(true);
  });

  it("can't climb out of the water up a high bank", () => {
    const ground = (x) => (x > 200 && x < 300 ? -10 : x >= 300 ? 30 : 0);
    const water = (x) => (x > 196 && x < 304 ? 0 : NaN);
    expect(run(new WalkSearch({ from: [100, 100], to: [400, 100], most: 1000, cellsOf: world(ground, water, 2) }))).toBe("none");
  });

  it("waits for tiles being read", () => {
    let ready = false;
    const flat = world(() => 0);
    const search = new WalkSearch({ from: [10, 10], to: [600, 10], most: 1000, cellsOf: (tx, tz) => (tx === 2 && !ready ? null : flat(tx, tz)) });
    let state;
    for (let n = 0; n < 20 && state !== "waiting"; n++) state = search.step(1000);
    expect(state).toBe("waiting");
    ready = true;
    expect(run(search)).toBe("found");
  });

  it("tells each cell it reaches, with how far it is", () => {
    const reached = [];
    run(new WalkSearch({ from: [10, 10], to: [50, 10], most: 1000, cellsOf: world(() => 0), onReach: (i, j, ft, swum) => reached.push([i, j, ft, swum]) }));
    expect(reached[0]).toEqual([2, 2, 0, false]);
    expect(reached.at(-1)[2]).toBeCloseTo(40, -1);
  });
});
