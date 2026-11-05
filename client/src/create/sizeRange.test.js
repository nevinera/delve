import { describe, expect, it } from "vitest";
import { rangeAround, rollSize } from "./sizeRange.js";

describe("size ranges", () => {
  it("spread a size either side, within the sizes allowed", () => {
    const sizes = { least: 0.25, most: 4 };
    expect(rangeAround(1, 0.1, sizes)).toEqual([0.9, 1.1]);
    expect(rangeAround(4, 0.1, sizes)).toEqual([3.6, 4]);
    expect(rangeAround(0.25, 0.1, sizes)[0]).toBe(0.25);
  });

  it("roll between their ends", () => {
    expect(rollSize([0.9, 1.1], () => 0)).toBeCloseTo(0.9);
    expect(rollSize([0.9, 1.1], () => 1)).toBeCloseTo(1.1);
    expect(rollSize([0.9, 1.1], () => 0.5)).toBeCloseTo(1);
  });
});
