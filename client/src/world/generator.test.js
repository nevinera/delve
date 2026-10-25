import { describe, it, expect } from "vitest";
import { CELLS } from "./constants.js";
import { TERRAIN, generateTile, prepareZone } from "./generator.js";
import { fbm } from "./noise.js";

// A 3×2-tile zone with the sea to the west, a river flowing west into it, a road and a hub.
const zone = {
  version: 1,
  origin: [10, -4],
  tiles: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]],
  strokes: [
    { id: "s1", kind: "coast", points: [[0.3, 2], [0.3, 0]], width: 40 },
    { id: "s2", kind: "river", points: [[2.9, 0.5], [1.5, 0.6], [0.1, 0.5]], width: 40 },
    { id: "s3", kind: "road", points: [[1, 1.8], [2.8, 1.2]], width: 12 },
  ],
  pins: [{ id: "p1", kind: "hub", at: [2.5, 1.5] }],
};

const ctx = prepareZone(zone, "test/zone");
const cell = (tile, i, j, layer) => tile.layers[layer][j * CELLS + i];

describe("generator", () => {
  it("is deterministic", () => {
    const a = generateTile(ctx, 11, -4);
    const b = generateTile(prepareZone(zone, "test/zone"), 11, -4);
    expect(Array.from(a.layers.height)).toEqual(Array.from(b.layers.height));
    expect(Array.from(a.layers.forest)).toEqual(Array.from(b.layers.forest));
  });

  it("joins neighbouring tiles without a step", () => {
    const left = generateTile(ctx, 11, -3);
    const right = generateTile(ctx, 12, -3);
    for (let j = 0; j < CELLS; j++) {
      const step = Math.abs(cell(left, CELLS - 1, j, "height") - cell(right, 0, j, "height"));
      expect(step).toBeLessThan(8);
    }
  });

  it("puts the sea below zero on the water side of the coast", () => {
    const tile = generateTile(ctx, 10, -3);
    expect(cell(tile, 0, 32, "height")).toBeLessThan(0);
    expect(cell(tile, 0, 32, "water")).toBe(0);
    expect(cell(tile, 63, 32, "height")).toBeGreaterThan(0);
  });

  it("keeps river water flowing downhill", () => {
    for (const river of ctx.rivers) {
      for (let i = 1; i < river.surface.length; i++) {
        expect(river.surface[i]).toBeLessThanOrEqual(river.surface[i - 1]);
      }
    }
  });

  it("levels the hub as dirt with no forest", () => {
    // The hub sits at zone tile (2.5, 1.5): continent tile (12, -3), cell (32, 32).
    const tile = generateTile(ctx, 12, -3);
    expect(TERRAIN[cell(tile, 32, 32, "terrain")]).toBe("dirt");
    expect(cell(tile, 32, 32, "forest")).toBe(0);
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
