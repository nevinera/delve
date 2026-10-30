import { describe, expect, it } from "vitest";
import { cut } from "./marks.js";

describe("cutting a line", () => {
  const line = [
    [0, 0],
    [100, 0],
    [200, 0],
  ];

  it("splits it in two where the circle crosses its middle", () => {
    const pieces = cut(line, 100, 0, 10);
    expect(pieces).toHaveLength(2);
    expect(pieces[0]).toEqual([
      [0, 0],
      [90, 0],
    ]);
    expect(pieces[1]).toEqual([
      [110, 0],
      [200, 0],
    ]);
  });

  it("cuts within a segment, between its points", () => {
    const pieces = cut(line, 50, 5, 10);
    expect(pieces).toHaveLength(2);
    expect(pieces[0][1][0]).toBeCloseTo(50 - Math.sqrt(75));
    expect(pieces[1][0][0]).toBeCloseTo(50 + Math.sqrt(75));
  });

  it("shortens it from an end, and leaves it alone out of reach", () => {
    expect(cut(line, 0, 0, 30)).toEqual([
      [
        [30, 0],
        [100, 0],
        [200, 0],
      ],
    ]);
    expect(cut(line, 100, 50, 10)).toEqual([line]);
    expect(cut(line, 100, 0, 500)).toEqual([]);
  });
});
