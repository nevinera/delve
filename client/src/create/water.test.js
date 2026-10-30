import { describe, expect, it } from "vitest";
import { rim } from "./water.js";

describe("rim", () => {
  it("is the lowest ground round an outline, between its corners too", () => {
    const square = [[0, 0], [100, 0], [100, 100], [0, 100]];
    // A dip at (48, 0), on an edge, not a corner.
    expect(rim(square, (x, z) => 20 - (z === 0 ? 10 - Math.abs(x - 48) / 5 : 0))).toBe(10);
    expect(rim(square, () => 7.25)).toBe(7.2);
  });
});
