import { describe, it, expect } from "vitest";
import { BLOCK, LAND_FT, LandGrid, PER_TILE, SEA_FLOOR_FT, changedPoints, landBounds, loadLand, saveLand } from "./landGrid.js";

describe("LandGrid", () => {
  it("is sea floor everywhere until raised", () => {
    const land = new LandGrid();
    expect(land.heightAt(1234, -567)).toBe(SEA_FLOOR_FT);
    expect(land.tiles().size).toBe(0);
    expect(landBounds(land)).toBeNull();
  });

  it("passes through every point, smoothly between them without overshooting a step", () => {
    const land = new LandGrid();
    for (let g = -4; g <= 4; g++) for (let h = -4; h <= 4; h++) land.set(g, h, g > 0 ? 100 : 0);
    expect(land.heightAt(0, 0)).toBe(0);
    expect(land.heightAt(LAND_FT, 0)).toBe(100);
    const between = land.heightAt(LAND_FT / 2, 0);
    expect(between).toBeGreaterThan(0);
    expect(between).toBeLessThan(100);
    for (let x = -3 * LAND_FT; x <= 3 * LAND_FT; x += 4) {
      expect(land.heightAt(x, 0)).toBeGreaterThanOrEqual(0);
      expect(land.heightAt(x, 0)).toBeLessThanOrEqual(100);
    }
  });

  it("maps the tiles with ground above deep ocean, and the ones just past it", () => {
    const land = new LandGrid();
    land.set(PER_TILE * 3 + 5, PER_TILE * 2 + 5, 10);
    const tiles = land.tiles();
    expect(tiles.has("3,2")).toBe(true);
    expect(tiles.has("5,5")).toBe(false);
    // A point on a block's edge maps the tiles either side of it.
    const edge = new LandGrid();
    edge.set(BLOCK, 4, 10);
    expect(edge.tiles().has(`${BLOCK / PER_TILE - 1},0`)).toBe(true);
    expect(edge.tiles().has(`${BLOCK / PER_TILE},0`)).toBe(true);
  });

  it("round-trips through the world's files, and finds what changed", () => {
    const land = new LandGrid();
    land.set(3, -700, 42);
    const files = new Map();
    saveLand(files, "main", land);
    const back = loadLand(files, "main");
    expect(back.point(3, -700)).toBe(42);
    expect(back.hash()).toBe(land.hash());
    back.set(10, 10, 5);
    expect(changedPoints(land, back)).toEqual([[10, 10]]);
    expect(back.hash()).not.toBe(land.hash());
  });
});
