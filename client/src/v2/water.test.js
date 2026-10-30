import { describe, expect, it } from "vitest";
import { WATER_TYPES, WaterMap, bakeWater, changedWaterBoxes } from "./water.js";

const square = (x, z, size) => [[x, z], [x + size, z], [x + size, z + size], [x, z + size]];
// 65 × 65 corner heights, a slope rising 1 ft a cell eastward from -10.
const slope = () => Float32Array.from({ length: 65 * 65 }, (_, k) => -10 + (k % 65));

describe("WaterMap", () => {
  it("fills cells inside a body's outline whose ground is lower than its level", () => {
    const water = new WaterMap([{ type: "pond", level: 0, points: square(0, 0, 256) }]).tile(0, 0, slope());
    // Cell i's ground is -9.5 + i, so cells 0 to 9 are under.
    expect(Number.isNaN(water.level[9])).toBe(false);
    expect(Number.isNaN(water.level[10])).toBe(true);
    expect(water.level[0]).toBe(0);
    expect(water.type[0]).toBe(WATER_TYPES.indexOf("pond"));
  });

  it("leaves cells outside the outline dry, and tiles it misses with none", () => {
    const map = new WaterMap([{ type: "lake", level: 100, points: square(16, 16, 32) }]);
    const water = map.tile(0, 0, slope());
    expect(Number.isNaN(water.level[3 * 64 + 3])).toBe(true);
    expect(water.level[4 * 64 + 4]).toBe(100);
    expect(Number.isNaN(water.level[12 * 64 + 12])).toBe(true);
    expect(map.tile(1, 0, slope())).toBeNull();
  });

  it("puts the last body on top", () => {
    const map = new WaterMap([
      { type: "lake", level: 50, points: square(0, 0, 256) },
      { type: "swamp", level: 60, points: square(0, 0, 8) },
    ]);
    const water = map.tile(0, 0, slope());
    expect([water.level[0], water.type[0], water.level[2]]).toEqual([60, WATER_TYPES.indexOf("swamp"), 50]);
  });

  it("bakes into a plate's tiles", () => {
    const plate = { coords: [0, 0], tiles: new Map([[0, { heights: slope() }], [1, { heights: slope() }]]) };
    bakeWater(plate, new WaterMap([{ type: "sea", level: 0, points: square(0, 0, 100) }]));
    expect(plate.tiles.get(0).water.level[0]).toBe(0);
    expect(plate.tiles.get(1).water).toBeNull();
  });
});

describe("changedWaterBoxes", () => {
  it("gives the boxes of bodies added, removed or changed", () => {
    const a = { type: "pond", level: 5, points: square(0, 0, 100) };
    const b = { type: "pond", level: 5, points: square(1000, 0, 100) };
    expect(changedWaterBoxes([a], [a, b])).toEqual([[1000, 0, 1100, 100]]);
    expect(changedWaterBoxes([a, b], [a, { ...b, level: 6 }])).toHaveLength(2);
  });
});
