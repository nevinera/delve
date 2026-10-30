import { describe, expect, it } from "vitest";
import { tickSizes } from "./measure.js";

describe("a ruler's ticks", () => {
  it("shows the three biggest sizes that fit", () => {
    expect(tickSizes(0.4 * 5280)).toEqual([1320, 500, 100]);
    expect(tickSizes(3 * 5280)).toEqual([5280, 1320, 500]);
    expect(tickSizes(250)).toEqual([100, 10]);
    expect(tickSizes(5)).toEqual([]);
  });
});
