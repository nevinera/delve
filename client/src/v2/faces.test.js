import { describe, expect, it } from "vitest";
import { faceHeight, faceSlope, gridHeight } from "./faces.js";

describe("faces", () => {
  // A square whose northeast corner is raised 4 ft: the northwest triangle slopes, the southeast
  // one too, but a square split the other way would put the rise elsewhere.
  const [nw, ne, sw, se] = [0, 4, 0, 0];

  it("meets the corners, and runs straight along the split", () => {
    expect(faceHeight(nw, ne, sw, se, 0, 0)).toBe(0);
    expect(faceHeight(nw, ne, sw, se, 1, 0)).toBe(4);
    expect(faceHeight(nw, ne, sw, se, 1, 1)).toBe(0);
    expect(faceHeight(nw, ne, sw, se, 0.5, 0.5)).toBe(2);
  });

  it("is flat across each triangle", () => {
    // Northwest triangle: rises 4 ft east and 0 south.
    expect(faceHeight(nw, ne, sw, se, 0.25, 0.25) - faceHeight(nw, ne, sw, se, 0, 0.25)).toBeCloseTo(1);
    // Southeast triangle: rises 4 ft north and 0 east.
    expect(faceHeight(nw, ne, sw, se, 0.75, 0.5) - faceHeight(nw, ne, sw, se, 0.75, 0.75)).toBeCloseTo(1);
  });

  it("gives each triangle's own slope, the same anywhere in it", () => {
    expect(faceSlope(nw, ne, sw, se, 0.1, 0.1, 4)).toBe(1);
    expect(faceSlope(nw, ne, sw, se, 0.4, 0.5, 4)).toBe(1);
    expect(faceSlope(nw, ne, sw, se, 0.9, 0.9, 4)).toBe(1);
    // Beside a steep square, a flat one is flat, right up to the edge between them.
    expect(faceSlope(0, 0, 0, 0, 0.99, 0.5, 4)).toBe(0);
  });

  it("reads a grid of corners", () => {
    const heights = [0, 4, 8, 0, 4, 8, 0, 4, 8]; // 3 corners a side, rising 4 ft a square east
    expect(gridHeight(heights, 3, 1.5, 0.5)).toBe(6);
    expect(gridHeight(heights, 3, 2, 2)).toBe(8);
  });
});
