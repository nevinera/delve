import { describe, it, expect } from "vitest";
import { World } from "../world/world.js";
import { CELL_FT, TERRAIN, THEME, TILE_CELLS } from "../world/constants.js";
import { encodeTile, decodeTile } from "../world/tileCodec.js";
import { generateWorld } from "../world/generate.js";

const flatWorld = (height = 20) => {
  const world = new World(3, 3);
  world.height.fill(height);
  return world;
};

describe("World.heightAt", () => {
  it("passes through each cell's height at the cell center", () => {
    const world = flatWorld();
    world.height[world.index(10, 12)] = 30;

    expect(world.heightAt(10.5 * CELL_FT, 12.5 * CELL_FT)).toBeCloseTo(30);
    expect(world.heightAt(14.5 * CELL_FT, 12.5 * CELL_FT)).toBeCloseTo(20);
  });

  it("is continuous across a tile seam", () => {
    const world = new World(3, 3);
    for (let i = 0; i < world.height.length; i++) world.height[i] = (i % world.w) * 0.7;
    const seam = TILE_CELLS * CELL_FT;

    expect(world.heightAt(seam - 0.01, 100)).toBeCloseTo(world.heightAt(seam + 0.01, 100), 1);
  });

  it("clamps at the world edge", () => {
    const world = flatWorld(12);

    expect(world.heightAt(-50, -50)).toBeCloseTo(12);
  });
});

describe("theme blending", () => {
  it("fades from temperate to swamp across the border", () => {
    const world = flatWorld();
    for (let gz = 128; gz < world.h; gz++) for (let gx = 0; gx < world.w; gx++) world.theme[world.index(gx, gz)] = THEME.swamp;
    world.refreshThemeField();

    expect(world.swampAt(500, 900)).toBe(0);
    expect(world.swampAt(500, 1024)).toBeCloseTo(0.5, 1);
    expect(world.swampAt(500, 1200)).toBe(1);
  });
});

describe("tile codec", () => {
  it("round-trips a tile's layers and objects", () => {
    const world = new World(3, 3);
    generateWorld(world);
    const bytes = encodeTile(world, 1, 2);
    const copy = new World(3, 3);

    decodeTile(copy, bytes);

    const i = world.index(64 + 20, 128 + 33);
    expect(copy.height[i]).toBeCloseTo(world.height[i], 1);
    expect(copy.terrain[i]).toBe(world.terrain[i]);
    expect(copy.forest[i]).toBe(world.forest[i]);
    expect(copy.theme[i]).toBe(THEME.swamp);
    expect(copy.objects).toEqual(world.objects.filter((o) => o.x >= 512 && o.x < 1024 && o.z >= 1024));
    expect(bytes.length).toBeLessThan(25_000);
  });

  it("maps stored palette ids by name", () => {
    const world = flatWorld();
    world.terrain[world.index(3, 3)] = TERRAIN.moss;
    const bytes = encodeTile(world, 0, 0);
    const json = new TextDecoder().decode(bytes.subarray(8, 8 + new DataView(bytes.buffer).getUint32(4, true)));
    expect(JSON.parse(json).palettes.terrain).toContain("moss");

    const copy = new World(3, 3);
    decodeTile(copy, bytes);

    expect(copy.terrain[copy.index(3, 3)]).toBe(TERRAIN.moss);
  });
});
