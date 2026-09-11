import { describe, expect, it } from "vitest";
import { ACTION_ROWS_LANDSCAPE } from "../App";

describe("ACTION_ROWS_LANDSCAPE", () => {
  it("covers all 10 slots exactly once", () => {
    const flat = ACTION_ROWS_LANDSCAPE.flat();
    expect(flat.length).toBe(10);
    expect(new Set(flat).size).toBe(10);
    for (let i = 0; i < 10; i++) expect(flat).toContain(i);
  });

  it("is sized 2/3/3/2 from the bottom (top-to-bottom array order)", () => {
    expect(ACTION_ROWS_LANDSCAPE.map((row) => row.length)).toEqual([2, 3, 3, 2]);
  });

  it("numbers slots left-to-right, bottom-to-top as 1..10", () => {
    const readingOrder = [...ACTION_ROWS_LANDSCAPE].reverse().flat();
    expect(readingOrder).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
