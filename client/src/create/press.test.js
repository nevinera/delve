import { describe, expect, it } from "vitest";
import { CELL_CORNERS } from "../v2/plate.js";
import { CELL_FT, TILE_FT } from "../v2/sizes.js";
import { overlaps, pressHeights, pressedCorners, pressesOver, pressing } from "./press.js";

const pressedBy = (slabs, tx, tz) => pressedCorners(pressesOver(slabs, tx, tz), tx, tz);

const floor = (x, y, z, w, yaw = 0) => ({ at: [x, y, z], turn: [yaw, 0, 0], outline: [[0, 0], [w, 0], [w, w], [0, w]], thickness: 1, surface: "floorboards" });
const corner = (i, j) => j * CELL_CORNERS + i;

describe("pressing the ground", () => {
  it("presses every corner of the cells a level slab covers to its bottom", () => {
    const pressed = pressedBy([floor(10, 50, 10, 6)], 0, 0);
    // x 10 to 16 covers cells 2 to 3, so corners 2 to 4, and the same along z.
    expect([...pressed.keys()].sort((a, b) => a - b)).toEqual([2, 3, 4].flatMap((j) => [2, 3, 4].map((i) => corner(i, j))).sort((a, b) => a - b));
    expect(pressed.get(corner(3, 3))).toBe(49);
  });

  it("leaves cells the slab only touches", () => {
    const pressed = pressedBy([floor(8, 0, 8, 8)], 0, 0);
    expect(pressed.has(corner(1, 2))).toBe(false);
    expect(pressed.has(corner(2, 2))).toBe(true);
    expect(pressed.has(corner(5, 5))).toBe(false);
  });

  it("presses a tile's edge corners from a slab in the tile beside it", () => {
    const pressed = pressedBy([floor(TILE_FT - 6, 0, 10, 4)], 1, 0);
    expect(pressed.has(corner(0, 3))).toBe(true);
    expect(pressed.has(corner(1, 3))).toBe(false);
  });

  it("takes only slabs over the tile or its edge", () => {
    expect(pressesOver([floor(10, 0, 10, 8), floor(TILE_FT + 10, 0, 10, 8)], 0, 0).length).toBe(1);
    expect(pressesOver([floor(TILE_FT + 2, 0, 10, 8)], 0, 0).length).toBe(1);
  });

  it("presses nothing for a slab that isn't level", () => {
    const ramp = { ...floor(10, 0, 10, 8), turn: [0, 0, 20] };
    expect(pressing(ramp)).toBe(null);
    expect(pressedBy([ramp], 0, 0).size).toBe(0);
  });

  it("finds the cells a turned slab covers", () => {
    const outline = pressing(floor(20, 0, 20, 12, 45)).outline;
    expect(overlaps(outline, 20, 20)).toBe(true);
    expect(overlaps(outline, 20 + 3 * CELL_FT, 20 - 3 * CELL_FT)).toBe(false);
  });

  it("only lowers ground", () => {
    const heights = new Float32Array(CELL_CORNERS * CELL_CORNERS).fill(10);
    heights[corner(3, 3)] = 40;
    const out = pressHeights(heights, new Map([[corner(3, 3), 20], [corner(4, 4), 20]]));
    expect(out[corner(3, 3)]).toBe(20);
    expect(out[corner(4, 4)]).toBe(10);
    expect(heights[corner(3, 3)]).toBe(40);
    expect(pressHeights(heights, new Map())).toBe(heights);
  });
});
