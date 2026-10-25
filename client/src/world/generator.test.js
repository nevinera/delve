import { describe, it, expect } from "vitest";
import { CELLS } from "./constants.js";
import { generateTile, prepareWorld } from "./generator.js";
import { findTrees } from "./trees.js";
import { fbm } from "./noise.js";

const square = (x0, z0, x1, z1) => [[[x0, z0], [x1, z0], [x1, z1], [x0, z1]]];

// A 6×4-tile zone at (10, -4) with a 100ft height pin and a river flowing west into the sea.
const zones = [
  {
    region: [square(10, -4, 16, 0)],
    pins: [{ id: "p1", kind: "height", at: [14, -2], height: 100 }],
    strokes: [
      { id: "s2", kind: "river", points: [[15.5, -3.5], [13, -3], [10.5, -3]], width: 40 },
    ],
  },
];

const ctx = prepareWorld(zones, "test");
const cell = (tile, i, j, layer) => tile.layers[layer][j * CELLS + i];

describe("generator", () => {
  it("is deterministic", () => {
    const a = generateTile(ctx, 12, -3);
    const b = generateTile(prepareWorld(zones, "test"), 12, -3);
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

  it("leaves open ocean far from any zone, with an uneven floor", () => {
    const tile = generateTile(ctx, 30, 30);
    expect(cell(tile, 32, 32, "height")).toBeLessThan(-40);
    expect(cell(tile, 32, 32, "water")).toBe(0);
    expect(new Set(tile.layers.height).size).toBeGreaterThan(10);
  });

  // Heights along one row, west to east, across the zone's east edge at x = 16 tiles.
  const row = (j) => [14, 15, 16].flatMap((tx) => Array.from({ length: CELLS }, (_, i) => cell(generateTile(ctx, tx, -2), i, j, "height")));

  it("puts the coast a little inside the zoned area's edge", () => {
    for (const j of [8, 32, 56]) {
      const heights = row(j);
      expect(heights[2 * CELLS - 100]).toBeGreaterThan(0); // 800ft inside
      expect(heights[2 * CELLS]).toBeLessThan(0); // on the edge
      expect(heights[2 * CELLS + 40]).toBeLessThan(0);
    }
  });

  it("wanders the coast rather than following the edge", () => {
    const coast = (j) => row(j).findIndex((h) => h < 0);
    const spots = [0, 16, 32, 48, 63].map(coast);
    expect(Math.max(...spots) - Math.min(...spots)).toBeGreaterThan(3);
  });

  it("meets the sea in a cliff where the land is high", () => {
    const heights = row(32);
    const drops = heights.slice(1).map((h, i) => heights[i] - h);
    expect(Math.max(...drops)).toBeGreaterThan(40);
  });

  it("raises the land toward the height pin", () => {
    const tile = generateTile(ctx, 14, -2);
    expect(cell(tile, 0, 0, "height")).toBeGreaterThan(80);
  });

  it("keeps river water flowing downhill", () => {
    for (const river of ctx.rivers) {
      for (let i = 1; i < river.surface.length; i++) {
        expect(river.surface[i]).toBeLessThanOrEqual(river.surface[i - 1]);
      }
    }
  });

  it("is all ocean with no zones", () => {
    const tile = generateTile(prepareWorld([], "test"), 0, 0);
    expect(Math.max(...tile.layers.height)).toBeLessThan(-40);
  });
});

describe("beaches", () => {
  // A low, flat zone, 8×8 tiles, all one biome.
  const low = (biome) =>
    prepareWorld([{ region: [square(0, 0, 8, 8)], pins: [{ id: "h", kind: "height", at: [4, 4], height: 3 }, { id: "b", kind: "biome", at: [4, 4], biome, tags: ["flat"] }], strokes: [] }], "test");
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
  // One flat 8×8-tile zone given over to a single biome pin.
  const world = (biome, tags = []) =>
    prepareWorld([{ region: [square(0, 0, 8, 8)], pins: [{ id: "b", kind: "biome", at: [4, 4], biome, tags }], strokes: [] }], "test");
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
