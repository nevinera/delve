import { describe, expect, it } from "vitest";
import { trackOf } from "./courses.js";
import { ACROSS, AROUND, WATER_TYPES, WaterMap, bakeWater, changedWaterBoxes, dryWater, missingSea, partWater, seaEdges } from "./water.js";

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
    expect(changedWaterBoxes({ bodies: [a] }, { bodies: [a, b] })).toEqual([[1000, 0, 1100, 100]]);
    expect(changedWaterBoxes({ bodies: [a, b] }, { bodies: [a, { ...b, level: 6 }] })).toHaveLength(2);
    const course = { type: "stream", points: [[0, 0, 6], [100, 0, 6]], surface: [5, 5] };
    expect(changedWaterBoxes({ courses: [course] }, { courses: [{ ...course, surface: [5, 4] }] })).toHaveLength(2);
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

  it("comes in from the sea in the plate next to it", () => {
    // Below the sea, but high round its north, south and east, the plate's only tile.
    const high = (i, j) => (j < 2 || j > 61 || i > 61 ? 5 : -7);
    const t = tile(high);
    const west = new Uint8Array(8 * 64);
    west[20] = 1; // tile 0's west side, cell 20 down it
    bakeWater({ coords: [0, 0], around: all, tiles: new Map([[0, t]]), shores: { west } }, new WaterMap());
    expect(wet(t, 0, 20)).toBe(true);
    expect(wet(t, 55, 30)).toBe(true);
    const dry = tile(high);
    bakeWater({ coords: [0, 0], around: all, tiles: new Map([[0, dry]]) }, new WaterMap());
    expect(wet(dry, 0, 20)).toBeFalsy();
  });

  it("tells what's sea along a plate's sides, and where a plate's missing the sea next to it", () => {
    const water = dryWater(4096);
    for (let j = 0; j < 64; j++) [water.level[j * 64 + 63], water.type[j * 64 + 63]] = [0, SEA];
    // Tile 7, the plate's northeast one, has sea down its east side.
    const edges = seaEdges((a, b) => (a === 7 && b === 0 ? water : null));
    expect(edges.east[5]).toBe(1);
    expect(edges.east[64 + 5]).toBe(0);
    expect(edges.west.every((v) => !v)).toBe(true);
    expect(ACROSS.east).toBe("west");
    // The plate east of it, its tile 0 low and dry, is missing the sea along its west side.
    const low = { tiles: new Map([[0, tile(() => -7)]]) };
    expect(missingSea(low, "west", edges.east)).toBe(true);
    expect(missingSea({ tiles: new Map([[0, tile(() => 3)]]) }, "west", edges.east)).toBe(false);
    expect(missingSea(low, "west", new Uint8Array(512))).toBe(false);
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

describe("partWater", () => {
  it("wets a chunk's part where a quarter of its cells are wet, at their mean level, of the type most are", () => {
    const water = dryWater(4096);
    // Part 0: 16 cells, 12 lake at 10, 4 pond at 14. Part 1: 15 cells, short of a quarter.
    for (let k = 0; k < 16; k++) [water.level[Math.floor(k / 8) * 64 + (k % 8)], water.type[Math.floor(k / 8) * 64 + (k % 8)]] = k < 12 ? [10, 1] : [14, 2];
    for (let k = 0; k < 15; k++) water.level[Math.floor(k / 8) * 64 + 8 + (k % 8)] = 5;
    const parts = partWater(water);
    expect([parts.level[0], parts.type[0]]).toEqual([11, 1]);
    expect(Number.isNaN(parts.level[1])).toBe(true);
    expect(partWater(dryWater(4096))).toBeNull();
    expect(partWater(null)).toBeNull();
  });
});

describe("courses' water", () => {
  // The cell under a course's track where it crosses x.
  const cellAt = (course, x) => {
    const track = trackOf(course.points, course.seed ?? 0);
    const k = track.x.findIndex((v) => v >= x);
    return Math.floor(track.z[k] / 4) * 64 + Math.floor(track.x[k] / 4);
  };

  it("lies along their track, as wide as they are, where the ground's lower than their surface", () => {
    // Ground at -12 everywhere; a river 40 ft wide across the tile round z = 128, its surface at -10.
    const heights = new Float32Array(65 * 65).fill(-12);
    const river = { type: "river", points: [[-50, 128, 40], [300, 128, 40]], surface: [-10, -10] };
    const water = new WaterMap([], [river]).tile(0, 0, heights);
    const k = cellAt(river, 100);
    expect(water.level[k]).toBe(-10);
    expect(water.type[k]).toBe(WATER_TYPES.indexOf("river"));
    // 16 ft either side of it, and none 80 ft off.
    expect(water.level[k + 4 * 64]).toBe(-10);
    expect(water.level[k - 4 * 64]).toBe(-10);
    expect(Number.isNaN(water.level[k + 20 * 64])).toBe(true);
  });

  it("lie under the water they run into where it's higher, and the sea's over them at its level", () => {
    const heights = new Float32Array(65 * 65).fill(-12);
    const lake = { type: "lake", level: -5, points: [[0, 0], [128, 0], [128, 256], [0, 256]] };
    const river = { type: "river", points: [[-50, 128, 40], [300, 128, 40]], surface: [-10, -10] };
    const water = new WaterMap([lake], [river]).tile(0, 0, heights);
    expect(water.level[cellAt(river, 60)]).toBe(-5);
    expect(water.type[cellAt(river, 60)]).toBe(WATER_TYPES.indexOf("lake"));
    expect(water.level[cellAt(river, 200)]).toBe(-10);
    // At the same level, the lake's, levels with tenths too.
    const level = new WaterMap([{ ...lake, level: 705.8 }], [{ ...river, surface: [705.8, 705.8] }]).tile(0, 0, heights);
    expect(level.type[cellAt(river, 60)]).toBe(WATER_TYPES.indexOf("lake"));
    const tile = { heights: new Float32Array(65 * 65).fill(-12) };
    const sea = { type: "river", points: [[-50, 128, 40], [300, 128, 40]], surface: [0, 0] };
    bakeWater({ coords: [0, 0], tiles: new Map([[0, tile]]) }, new WaterMap([], [sea]));
    expect(tile.water.type[cellAt(sea, 100)]).toBe(WATER_TYPES.indexOf("sea"));
  });
});
