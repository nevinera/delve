import { describe, expect, it } from "vitest";
import { MAX_TEXT, layoutText, signText } from "./pixelFont.js";

describe("pixelFont", () => {
  it("keeps only what the font can show", () => {
    expect(signText("  Oak  vale, 2 mi!  ")).toBe("OAK VALE 2 MI!");
    expect(signText("x".repeat(50))).toHaveLength(MAX_TEXT);
    expect(signText(undefined)).toBe("");
  });

  it("lays text out as big as fits, wrapping when the box is tall", () => {
    // OAK: 3 + 1 + 3 + 1 + 3 = 11 px wide, plus a margin each side; 5 tall plus margins.
    const wide = layoutText("oak", 13, 7);
    expect([wide.cols, wide.rows]).toEqual([13, 7]);
    const xs = wide.on.map(([x]) => x);
    const ys = wide.on.map(([, y]) => y);
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([1, 11, 1, 5]);
    // Two words in a square box go on two lines.
    const square = layoutText("oak vale", 10, 10);
    expect(new Set(square.on.map(([, y]) => y)).size).toBe(10);
    expect(layoutText("", 10, 10).on).toEqual([]);
  });
});
