import { describe, expect, it } from "vitest";
import { inside } from "./biomes.js";

describe("inside", () => {
  const square = [[0, 0], [100, 0], [100, 100], [0, 100]];
  const ell = [[0, 0], [100, 0], [100, 40], [40, 40], [40, 100], [0, 100]];

  it("finds points inside a polygon", () => {
    expect(inside(square, 50, 50)).toBe(true);
    expect(inside(ell, 20, 80)).toBe(true);
  });

  it("leaves points outside it out", () => {
    expect(inside(square, 150, 50)).toBe(false);
    expect(inside(ell, 80, 80)).toBe(false);
  });
});
