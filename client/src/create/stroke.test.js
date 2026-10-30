import { describe, expect, it } from "vitest";
import { CELL_FT } from "../v2/sizes.js";
import { STROKE_MAX_FT, STROKE_MAX_POINTS, Stroke } from "./stroke.js";

describe("a stroke", () => {
  it("keeps a point a cell apart, filling in where the pointer jumps", () => {
    const stroke = new Stroke(0, 0);
    stroke.add(2, 0);
    expect(stroke.points).toEqual([[0, 0]]);
    stroke.add(40, 0);
    expect(stroke.points.length).toBe(11);
    expect(stroke.points[1][0]).toBeCloseTo(CELL_FT);
    expect(stroke.length).toBe(40);
  });

  it("drops every other point, keeping them twice as far apart, past its most", () => {
    const stroke = new Stroke(0, 0);
    stroke.add(CELL_FT * STROKE_MAX_POINTS + 100, 0);
    expect(stroke.points.length).toBeLessThanOrEqual(STROKE_MAX_POINTS);
    expect(stroke.step).toBe(CELL_FT * 2);
    expect(stroke.points[1][0] - stroke.points[0][0]).toBeCloseTo(CELL_FT * 2);
  });

  it("stops at its longest, ending there", () => {
    const stroke = new Stroke(0, 0);
    stroke.add(0, 30000);
    stroke.add(30000, 30000);
    expect(stroke.full).toBe(true);
    expect(stroke.length).toBeCloseTo(STROKE_MAX_FT);
    expect(stroke.points.at(-1)[0]).toBeCloseTo(STROKE_MAX_FT - 30000);
    expect(stroke.points.length).toBeLessThanOrEqual(STROKE_MAX_POINTS);
    stroke.add(31000, 31000);
    expect(stroke.length).toBeCloseTo(STROKE_MAX_FT);
  });
});
