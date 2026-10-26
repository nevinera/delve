import { describe, it, expect } from "vitest";
import { SAMPLES, overviewHeights } from "./overviewHeights.js";

describe("overviewHeights", () => {
  it("samples the middle of each block, lifting wet cells to the water's surface", () => {
    const cells = 64;
    const height = Float32Array.from({ length: cells * cells }, (_, k) => k % cells);
    const water = new Float32Array(cells * cells).fill(NaN);
    water.fill(100, 0, cells * 4); // the first four rows are under water
    const out = overviewHeights({ cells, layers: { height, water } });
    expect(out.length).toBe(SAMPLES * SAMPLES);
    expect(out[0]).toBe(100);
    expect(out[SAMPLES]).toBe(1.5); // cells 1 and 2 of the second row of blocks
    expect(out[SAMPLES + 1]).toBe(5.5);
  });
});
