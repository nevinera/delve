import { describe, it, expect } from "vitest";
import { CELLS } from "./constants.js";
import { generateTile, prepareWorld } from "./generator.js";
import { fbm } from "./noise.js";

const square = (x0, z0, x1, z1) => [[[x0, z0], [x1, z0], [x1, z1], [x0, z1]]];

// A 6×4-tile zone at (10, -4) with a 100ft height pin, a coastline cutting off its western
// tile column with the sea to the west, and a river flowing west into that sea.
const zones = [
  {
    region: [square(10, -4, 16, 0)],
    pins: [{ id: "p1", kind: "height", at: [14, -2], height: 100 }],
    strokes: [
      { id: "s1", kind: "coast", points: [[11, 0], [11, -4]], width: 40 },
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

  it("leaves open ocean far from any zone", () => {
    const tile = generateTile(ctx, 30, 30);
    expect(cell(tile, 32, 32, "height")).toBe(-60);
    expect(cell(tile, 32, 32, "water")).toBe(0);
  });

  it("slopes the land into the sea at the zoned area's edge", () => {
    const inside = generateTile(ctx, 15, -2);
    const outside = generateTile(ctx, 16, -2);
    expect(cell(inside, 63, 32, "height")).toBeGreaterThan(0);
    expect(cell(outside, 40, 32, "height")).toBeLessThan(0);
  });

  it("raises the land toward the height pin", () => {
    const tile = generateTile(ctx, 14, -2);
    expect(cell(tile, 0, 0, "height")).toBeGreaterThan(80);
  });

  it("puts the sea on the coastline's water side", () => {
    const tile = generateTile(ctx, 10, -2);
    expect(cell(tile, 10, 32, "height")).toBeLessThan(0);
    expect(cell(tile, 10, 32, "water")).toBe(0);
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
    expect(Math.max(...tile.layers.height)).toBe(-60);
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
