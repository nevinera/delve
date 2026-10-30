import { describe, expect, it } from "vitest";
import { AROUND, WATER_TYPES, WaterMap, bakeWater, changedWaterBoxes, dryWater } from "./water.js";

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
    const plate = { coords: [0, 0], tiles: new Map([[0, { heights: slope() }], [1, { heights: slope().map((h) => h + 20) }]]) };
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

describe("the sea", () => {
  const SEA = WATER_TYPES.indexOf("sea");
  // A tile whose ground is `height(i, j)` at each corner.
  const tile = (height, water = null) => ({ heights: Float32Array.from({ length: 65 * 65 }, (_, k) => height(k % 65, Math.floor(k / 65))), water });
  // Every tile round the plate there.
  const all = new Uint8Array(AROUND * AROUND).fill(1);
  const wet = (t, i, j) => t.water && t.water.type[j * 64 + i] === SEA && !Number.isNaN(t.water.level[j * 64 + i]);

  it("comes in from the side of a tile with no tile past it, over ground lower than it", () => {
    // Tile 0 alone, high round its north, south and east sides; it falls below the sea westward,
    // with a ridge at cell 20.
    const t = tile((i, j) => (i === 20 || i === 21 || j < 2 || j > 61 ? 5 : i < 40 ? -5 : 5));
    const around = all.slice();
    around[1 * AROUND + 0] = 0; // none west of it
    bakeWater({ coords: [0, 0], around, tiles: new Map([[0, t]]) }, new WaterMap());
    expect(wet(t, 0, 10)).toBe(true);
    expect(wet(t, 19, 10)).toBe(false); // the ridge's slope
    expect(wet(t, 30, 10)).toBe(false); // closed off from the sea
    expect(t.water.level[10 * 64]).toBe(0);
  });

  it("stays where it was, spreads to ground lowered next to it, and leaves ground raised", () => {
    const water = dryWater(4096);
    for (let j = 0; j < 64; j++) [water.level[j * 64], water.type[j * 64]] = [0, SEA];
    // High round its north and south, so the sea's only in from what it had.
    const t = tile((i, j) => (j < 2 || j > 61 ? 3 : i < 30 ? -5 : 5), water);
    bakeWater({ coords: [0, 0], around: all, tiles: new Map([[0, t]]) }, new WaterMap());
    expect(wet(t, 0, 10)).toBe(true);
    expect(wet(t, 28, 10)).toBe(true);
    expect(wet(t, 31, 10)).toBe(false);
    expect(wet(t, 0, 0)).toBe(false);
  });

  it("crosses into the plate's other tiles", () => {
    const low = () => tile(() => -2);
    const tiles = new Map([[0, low()], [1, low()]]);
    const around = all.slice();
    around[1 * AROUND + 0] = 0;
    bakeWater({ coords: [0, 0], around, tiles }, new WaterMap());
    expect(wet(tiles.get(1), 63, 63)).toBe(true);
  });

  it("is under the bodies", () => {
    const t = tile(() => -2);
    const around = all.slice();
    around[0] = 0;
    around[1 * AROUND] = 0;
    bakeWater({ coords: [0, 0], around, tiles: new Map([[0, t]]) }, new WaterMap([{ type: "lake", level: 3, points: square(0, 0, 8) }]));
    expect([t.water.level[0], t.water.type[0]]).toEqual([3, WATER_TYPES.indexOf("lake")]);
    expect(wet(t, 5, 5)).toBe(true);
  });
});
