import { describe, it, expect } from "vitest";
import { CELLS, TILE_FT } from "./constants.js";
import { fallsOf, generateTile, prepareWorld as prepareContinent } from "./generator.js";
import { findTrees } from "./trees.js";
import { fbm } from "./noise.js";
import { makePolyline } from "./polyline.js";
import { LAND_FT, LandGrid, PER_TILE } from "./landGrid.js";

// A land grid over tiles [tx0, tz0] to [tx1, tz1] and a margin of sea floor around them, each
// point's height (ft) from height(x, z) in feet.
function landOf([tx0, tz0, tx1, tz1], height) {
  const land = new LandGrid();
  for (let gz = (tz0 - 2) * PER_TILE; gz <= (tz1 + 2) * PER_TILE; gz++) {
    for (let gx = (tx0 - 2) * PER_TILE; gx <= (tx1 + 2) * PER_TILE; gx++) land.set(gx, gz, height(gx * LAND_FT, gz * LAND_FT));
  }
  return land.data;
}
// Land over tiles [tx0, tz0] to [tx1, tz1], rising from the sea floor at its edge at `slope` (rise
// over run) to `top` ft, so the coast's 80ft in from its edge with slope 0.25 and top at least 0.
function island([tx0, tz0, tx1, tz1], top, slope = 0.25) {
  return landOf([tx0, tz0, tx1, tz1], (x, z) => {
    const inside = Math.min(x - tx0 * TILE_FT, tx1 * TILE_FT - x, z - tz0 * TILE_FT, tz1 * TILE_FT - z);
    return Math.max(-50, Math.min(top, inside * slope - 20));
  });
}
const prepareWorld = (land, { pins = [], rivers = [], pools = [], paths = [] } = {}) => prepareContinent({ land, pins, paths, watercourses: { rivers, pools } }, "test");

// A 6×4-tile island at (10, -4), 100ft high, with a river flowing west into the sea.
const land = island([10, -4, 16, 0], 100);
const rivers = [{ points: [[15.5, -3.5], [13, -3], [10.5, -3]], width: 40 }];
const ctx = prepareWorld(land, { rivers });
const cell = (tile, i, j, layer) => tile.layers[layer][j * CELLS + i];

describe("generator", () => {
  it("is deterministic", () => {
    const a = generateTile(ctx, 12, -3);
    const b = generateTile(prepareWorld(land, { rivers }), 12, -3);
    expect(Array.from(a.layers.height)).toEqual(Array.from(b.layers.height));
    expect(Array.from(a.layers.forest)).toEqual(Array.from(b.layers.forest));
  });

  it("joins neighbouring tiles without a step", () => {
    const left = generateTile(ctx, 12, -2);
    const right = generateTile(ctx, 13, -2);
    for (let j = 0; j < CELLS; j++) {
      const step = Math.abs(cell(left, CELLS - 1, j, "height") - cell(right, 0, j, "height"));
      expect(step).toBeLessThan(8);
    }
  });

  it("leaves open ocean far from any land, with an uneven floor", () => {
    const tile = generateTile(ctx, 30, 30);
    expect(cell(tile, 32, 32, "height")).toBeLessThan(-40);
    expect(cell(tile, 32, 32, "water")).toBe(0);
    expect(new Set(tile.layers.height).size).toBeGreaterThan(10);
  });

  // Heights along one row, west to east, across the island's east edge at x = 16 tiles.
  const row = (j) => [14, 15, 16].flatMap((tx) => Array.from({ length: CELLS }, (_, i) => cell(generateTile(ctx, tx, -2), i, j, "height")));

  it("puts the coast where the land grid crosses sea level", () => {
    // The grid crosses 0 80ft in from the edge, 10 cells.
    for (const j of [8, 32, 56]) {
      const heights = row(j);
      expect(heights[2 * CELLS - 13]).toBeGreaterThan(0);
      expect(heights[2 * CELLS - 7]).toBeLessThan(0);
      expect(cell(generateTile(ctx, 15, -2), CELLS - 7, j, "water")).toBe(0);
    }
  }, 20000);

  it("follows the land grid inland", () => {
    const tile = generateTile(ctx, 13, -2);
    expect(cell(tile, 32, 0, "height")).toBeGreaterThan(80);
    expect(cell(tile, 32, 0, "height")).toBeLessThan(130);
  });

  it("keeps river water flowing downhill", () => {
    for (const river of ctx.rivers) {
      for (let i = 1; i < river.surface.length; i++) {
        expect(river.surface[i]).toBeLessThanOrEqual(river.surface[i - 1]);
      }
    }
  });

  it("lists the rivers near each tile, running downstream, and stores no flow", () => {
    const tile = generateTile(ctx, 12, -3);
    expect(tile.rivers).toHaveLength(1);
    expect(tile.rivers[0].half).toBe(20);
    for (const [ax, , bx] of tile.rivers[0].segments) expect(bx).toBeLessThan(ax); // the river runs west
    expect(tile.layers.flowDir).toBeUndefined();
    expect(generateTile(ctx, 13, -1).rivers).toEqual([]);
  });

  it("finds waterfalls where a river's surface drops sharply, one per drop", () => {
    // A river falling 1ft per 16ft step, then 20ft in one, then gently again.
    const surface = [50, 49, 48, 28, 27, 26, 25];
    const river = { line: makePolyline([[0, 0], [96, 0]]), surface, width: 20 };
    const falls = fallsOf(river);
    expect(falls).toHaveLength(1);
    expect(falls[0].top).toEqual([32, 48, 0]);
    expect(falls[0].bottom).toEqual([48, 28, 0]);
    expect(falls[0].depth).toBeGreaterThan(3);
    expect(fallsOf({ ...river, surface: [50, 49, 48, 47, 46, 45, 44] })).toEqual([]);
    // A drop as steep as rapids, 7ft per 16ft step, is no waterfall.
    expect(fallsOf({ ...river, surface: [50, 43, 36, 29, 22, 15, 8] })).toEqual([]);
  });

  it("holds a river running across a slope in, with no water above the ground beside it", () => {
    // Land falling to the south, with a river running east across it.
    const slope = landOf([0, -4, 8, 4], (x, z) => Math.max(40, Math.min(500, 270 - (z / TILE_FT) * 153)));
    const world = prepareWorld(slope, { pins: [{ id: "c", kind: "biome", at: [4, 0], biome: "forest", tags: ["hilly"] }], rivers: [{ points: [[1.5, 0.2], [6.5, 0.2]], width: 24 }] });
    let edges = 0;
    for (const [tx, tz] of [1, 2, 3, 4, 5, 6].flatMap((x) => [[x, -1], [x, 0]])) {
      const tile = generateTile(world, tx, tz);
      const { height, water } = tile.layers;
      for (let j = 0; j < CELLS; j++) {
        for (let i = 0; i < CELLS; i++) {
          const k = j * CELLS + i;
          if (Number.isNaN(water[k])) continue;
          expect(height[k]).toBeLessThan(water[k]);
          for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const [ni, nj] = [i + di, j + dj];
            if (ni < 0 || nj < 0 || ni >= CELLS || nj >= CELLS || !Number.isNaN(water[nj * CELLS + ni])) continue;
            expect(height[nj * CELLS + ni]).toBeGreaterThanOrEqual(water[k] - 0.5);
            edges++;
          }
        }
      }
    }
    expect(edges).toBeGreaterThan(20);
  });

  it("floods a kept pool flat at its level, below the ground around it", () => {
    // A square pool over the middle of tile (12, -2), whose cells run 0-63 across it.
    const pool = { region: [[[[12.25, -1.75], [12.75, -1.75], [12.75, -1.25], [12.25, -1.25]]]], level: 96 };
    const tile = generateTile(prepareWorld(land, { pools: [pool] }), 12, -2);
    // The ground there is about 90 to 100ft; the rim just outside holds the water in.
    expect(cell(tile, 32, 32, "water")).toBe(96);
    expect(cell(tile, 32, 32, "height")).toBeLessThan(95);
    expect(cell(tile, 15, 32, "height")).toBeGreaterThan(96);
    expect(Number.isNaN(cell(tile, 4, 32, "water"))).toBe(true);
  });

  it("is all ocean with no land", () => {
    const tile = generateTile(prepareWorld(new LandGrid().data), 0, 0);
    expect(Math.max(...tile.layers.height)).toBeLessThan(-40);
  });
});

describe("beaches", () => {
  // Low, flat land, 8×8 tiles, all one biome.
  const low = (biome) => prepareWorld(island([0, 0, 8, 8], 3, 1), { pins: [{ id: "b", kind: "biome", at: [4, 4], biome, tags: ["flat"] }] });
  // Sand on land; the sea floor is sand everywhere.
  const sand = (tile) => tile.layers.terrain.filter((t, k) => tile.palettes.terrain[t] === "sand" && tile.layers.height[k] > 0).length;

  it("puts sand on low land by the coast, but not inland", () => {
    const ctx = low("plains");
    expect(sand(generateTile(ctx, 0, 4)) + sand(generateTile(ctx, 1, 4))).toBeGreaterThan(50);
    expect(sand(generateTile(ctx, 4, 4))).toBe(0);
  });

  it("gives swamps no beaches", () => {
    const ctx = low("swamp");
    expect(sand(generateTile(ctx, 0, 4)) + sand(generateTile(ctx, 1, 4))).toBe(0);
  });
});

describe("biomes in the generator", () => {
  // Flat land 20ft up, 8×8 tiles, given over to a single biome pin.
  const world = (biome, tags = []) => prepareWorld(island([0, 0, 8, 8], 20, 1), { pins: [{ id: "b", kind: "biome", at: [4, 4], biome, tags }] });
  const tiles = (ctx) => [3, 4].flatMap((tx) => [3, 4].map((tz) => generateTile(ctx, tx, tz)));
  const count = (ctx, fn) => tiles(ctx).reduce((sum, tile) => sum + fn(tile), 0);

  it("plants many more trees in forest than plains", () => {
    const trees = (biome) => count(world(biome), (t) => findTrees(t).length);
    expect(trees("forest")).toBeGreaterThan(trees("plains") * 4);
  });

  it("fills swamps with pools", () => {
    const wet = (biome) => count(world(biome), (t) => t.layers.water.filter((w) => w > 0).length);
    expect(wet("plains")).toBe(0);
    expect(wet("swamp")).toBeGreaterThan(500);
  });

  it("keeps each swamp pool flat, in a hollow, and off slopes", () => {
    const tile = tiles(world("swamp"))[0];
    const levels = new Set();
    tile.layers.water.forEach((w, k) => {
      if (Number.isNaN(w)) return;
      levels.add(w);
      expect(w).toBeGreaterThan(tile.layers.height[k]);
    });
    expect(levels.size).toBeGreaterThan(1);
    expect(levels.size).toBeLessThan(tile.layers.water.filter((w) => !Number.isNaN(w)).length / 20); // a level per pool
    // Land climbing 1ft in 6 has no hollows to hold water.
    const slope = prepareWorld(
      landOf([0, 0, 8, 8], (x) => 20 + x / 6),
      { pins: [{ id: "b", kind: "biome", at: [4, 4], biome: "swamp", tags: [] }] },
    );
    const sloped = generateTile(slope, 4, 4);
    expect(sloped.layers.water.filter((w) => !Number.isNaN(w)).length).toBeLessThan(40);
  });

  it("scatters flat-topped ponds and lakes where tagged", () => {
    const all = (ctx) => [2, 3, 4, 5].flatMap((tx) => [2, 3, 4, 5].map((tz) => generateTile(ctx, tx, tz)));
    const water = (tiles) => tiles.flatMap((t) => Array.from(t.layers.water).filter((w) => !Number.isNaN(w)));
    expect(water(all(world("plains")))).toHaveLength(0);
    const tiles = all(world("plains", ["lakes"]));
    const wet = water(tiles);
    expect(wet.length).toBeGreaterThan(100);
    expect(new Set(wet).size).toBeLessThan(wet.length / 20); // a level per lake, not per cell
    for (const tile of tiles) {
      for (const { i, j } of findTrees(tile)) expect(Number.isNaN(cell(tile, i, j, "water"))).toBe(true);
    }
  });

  it("cuts ravines only where tagged", () => {
    const lowest = (tags) => Math.min(...tiles(world("plains", tags)).flatMap((t) => Array.from(t.layers.height)));
    expect(lowest([])).toBeGreaterThan(4);
    expect(lowest(["ravines"])).toBeLessThan(5);
  });
});

describe("fbm", () => {
  it("stays within [-1, 1]", () => {
    for (let i = 0; i < 500; i++) {
      const v = fbm(i * 37.3, i * -11.9, 7, { wavelength: 100 });
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
    }
  });
});

describe("roads", () => {
  // Rocky land rising east, with a 12ft road straight across tile (3, 4) along z = 4.5.
  const rising = landOf([0, 0, 8, 8], (x) => Math.max(20, Math.min(300, 20 + ((x / TILE_FT - 1) * 280) / 6)));
  const pins = [{ id: "b", kind: "biome", at: [4, 4], biome: "rocky" }];
  const withRoad = (tags) => prepareWorld(rising, { pins, paths: [{ id: "r1", from: "a", to: "b", width: 12, tags, route: { points: [[2, 4.5], [6, 4.5]] } }] });
  const row = (tile, layer) => Array.from({ length: CELLS }, (_, i) => cell(tile, i, 32, layer));
  const PATH = 4; // TERRAIN.indexOf("path")

  it("digs the road in and builds it up to an even bed, surfaced in path", () => {
    const road = generateTile(withRoad(["road"]), 3, 4);
    const bare = generateTile(prepareWorld(rising, { pins }), 3, 4);
    const heights = row(road, "height");
    for (let i = 1; i < CELLS; i++) expect(Math.abs(heights[i] - heights[i - 1])).toBeLessThanOrEqual(0.1 * 8 + 0.01);
    expect(heights.some((h, i) => Math.abs(h - row(bare, "height")[i]) > 1)).toBe(true);
    expect(row(road, "terrain").every((t) => t === PATH)).toBe(true);
    // Well off to the side, the land's untouched.
    expect(cell(road, 10, 2, "height")).toBe(cell(bare, 10, 2, "height"));
  });

  it("surfaces faint and disused roads in patches", () => {
    const share = (tags) => row(generateTile(withRoad(tags), 3, 4), "terrain").filter((t) => t === PATH).length / CELLS;
    expect(share(["road", "faint"])).toBeGreaterThan(0.2);
    expect(share(["road", "faint"])).toBeLessThan(0.95);
    expect(share(["road", "disused"])).toBeLessThan(share(["road", "faint"]));
  });
});
