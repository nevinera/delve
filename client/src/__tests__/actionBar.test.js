import { describe, expect, it } from "vitest";
import { ACTION_ROWS_PORTRAIT, fitActionGridColumns } from "../App";

describe("ACTION_ROWS_PORTRAIT", () => {
  it("covers all 10 slots exactly once", () => {
    const flat = ACTION_ROWS_PORTRAIT.flat();
    expect(flat.length).toBe(10);
    expect(new Set(flat).size).toBe(10);
    for (let i = 0; i < 10; i++) expect(flat).toContain(i);
  });

  it("is two rows of 5", () => {
    expect(ACTION_ROWS_PORTRAIT.map((row) => row.length)).toEqual([5, 5]);
  });

  it("numbers the bottom row 1-5 reading right to left", () => {
    const bottomRow = ACTION_ROWS_PORTRAIT[1];
    const rightToLeft = [...bottomRow].reverse();
    expect(rightToLeft.map((i) => i + 1)).toEqual([1, 2, 3, 4, 5]);
  });

  it("numbers the top row 6-10 reading right to left", () => {
    const topRow = ACTION_ROWS_PORTRAIT[0];
    const rightToLeft = [...topRow].reverse();
    expect(rightToLeft.map((i) => i + 1)).toEqual([6, 7, 8, 9, 10]);
  });
});

describe("fitActionGridColumns", () => {
  const base = { itemCount: 10, gap: 8, size: 43, minSize: 28 };

  it("prefers 2 columns at full size when there's room", () => {
    // 2 cols wide (43*2+8=94), 5 rows tall (43*5+8*4=247)
    const layout = fitActionGridColumns({ ...base, width: 200, height: 300 });
    expect(layout).toEqual({ columns: 2, rows: 5, size: 43 });
  });

  it("falls back to 3 columns at full size when 2 columns is too tall but 3 fits", () => {
    // 2 cols needs 247 tall; give it only 200 - too short for 5 rows.
    // 3 cols wide (43*3+16=145) x 4 rows (43*4+24=196) fits in 200x300.
    const layout = fitActionGridColumns({ ...base, width: 200, height: 200 });
    expect(layout).toEqual({ columns: 3, rows: 4, size: 43 });
  });

  it("shrinks to fit 2 columns when the pane is too narrow for 3 columns", () => {
    // Too short for 2x5 (247) and too narrow for 3 columns (145), so it
    // must stay at 2 columns and shrink the buttons to fit the height.
    const layout = fitActionGridColumns({ ...base, width: 100, height: 200 });
    expect(layout.columns).toBe(2);
    expect(layout.rows).toBe(5);
    expect(layout.size).toBeLessThan(43);
    expect(layout.size).toBeGreaterThanOrEqual(28);
    // 5*size + 4*8 should just fit within 200.
    expect(layout.size * 5 + 8 * 4).toBeLessThanOrEqual(200.5);
  });

  it("switches to 3 shrunk columns rather than sticking with a worse-fitting 2 when both axes are tight", () => {
    // 2 cols: sizeByHeight = (150-32)/5 = 23.6. 3 cols: sizeByHeight = (150-24)/4 = 31.5,
    // sizeByWidth = (140-16)/3 = 41.3 -> 3 columns fits bigger buttons than 2 here.
    const layout = fitActionGridColumns({ ...base, width: 140, height: 150 });
    expect(layout.columns).toBe(3);
    expect(layout.size).toBeGreaterThan(28);
  });

  it("never shrinks below minSize even when both dimensions are tiny", () => {
    const layout = fitActionGridColumns({ ...base, width: 40, height: 40 });
    expect(layout.size).toBe(28);
  });

  it("falls back to a sane default when the pane hasn't been measured yet", () => {
    expect(fitActionGridColumns({ ...base, width: 0, height: 0 })).toEqual({ columns: 2, rows: 5, size: 43 });
  });
});
