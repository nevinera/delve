import { describe, expect, it } from "vitest";
import { CELLS, CELL_FT } from "./constants.js";
import { waterGround } from "./waterGround.js";

describe("the ground water runs over", () => {
  it("is the land grid outside hand-shaped tiles, and the lowest cell round each point in them", () => {
    const height = new Float32Array(CELLS * CELLS).fill(50);
    height[10 * CELLS + 11] = 20; // one cell dug, whose corners include (11, 10) and (12, 11)
    const at = waterGround(() => 100, new Map([["0,0", height]]));
    expect(at(11 * CELL_FT, 10 * CELL_FT)).toBe(20);
    expect(at(12 * CELL_FT, 11 * CELL_FT)).toBe(20);
    expect(at(20 * CELL_FT, 20 * CELL_FT)).toBe(50);
    expect(at(-40 * CELL_FT, 20 * CELL_FT)).toBe(100);
  });
});
