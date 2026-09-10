import { describe, expect, it } from "vitest";
import { ACTION_ROWS, ACTION_COLUMNS } from "../App";

describe("ACTION_ROWS", () => {
  it("covers all 10 slots exactly once", () => {
    const flat = ACTION_ROWS.flat();
    expect(flat.length).toBe(10);
    expect(new Set(flat).size).toBe(10);
    for (let i = 0; i < 10; i++) expect(flat).toContain(i);
  });

  it("is sized 3/3/2/2 from the bottom (top-to-bottom array order)", () => {
    expect(ACTION_ROWS.map((row) => row.length)).toEqual([2, 2, 3, 3]);
  });

  it("numbers slots left-to-right, bottom-to-top as 1..10", () => {
    // ACTION_ROWS is stored top-to-bottom (for normal column stacking), so
    // read it bottom-to-top to recover the numbering order.
    const readingOrder = [...ACTION_ROWS].reverse().flat();
    expect(readingOrder).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe("ACTION_COLUMNS", () => {
  it("covers all 10 slots exactly once", () => {
    const flat = ACTION_COLUMNS.flat();
    expect(flat.length).toBe(10);
    expect(new Set(flat).size).toBe(10);
    for (let i = 0; i < 10; i++) expect(flat).toContain(i);
  });

  it("is two columns of five", () => {
    expect(ACTION_COLUMNS.map((col) => col.length)).toEqual([5, 5]);
  });

  it("numbers slots top-to-bottom, left column first, as 1..10", () => {
    expect(ACTION_COLUMNS.flat()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
