import { describe, expect, it } from "vitest";
import { CELL_FT } from "../world/constants.js";
import { brushWeight, detailBrush } from "./detailTools.js";

// Flat cells at `h` everywhere, editable where `editable` says.
function flat(h = 10, editable = () => true) {
  const heights = new Map();
  return {
    height: (ci, cj) => heights.get(`${ci},${cj}`) ?? h,
    editable,
    apply(changes) {
      for (const [ci, cj, v] of changes) heights.set(`${ci},${cj}`, v);
    },
  };
}

const at = (ci, cj) => [(ci + 0.5) * CELL_FT, (cj + 0.5) * CELL_FT];
const brush = { radius: 32, falloff: 16, strength: 10 };

describe("detail brushes", () => {
  it("weighs fully out to the radius and eases to nothing over the falloff", () => {
    expect(brushWeight(0, 32, 16)).toBe(1);
    expect(brushWeight(32, 32, 16)).toBe(1);
    expect(brushWeight(40, 32, 16)).toBeCloseTo(0.5);
    expect(brushWeight(48, 32, 16)).toBe(0);
  });

  it("raises a plateau, not a hump", () => {
    const cells = flat();
    cells.apply(detailBrush(cells, { ...brush, tool: "raise" }, at(0, 0), 1));
    expect(cells.height(0, 0)).toBeCloseTo(20);
    expect(cells.height(4, 0)).toBeCloseTo(20); // 32ft out, the edge of the radius
    expect(cells.height(5, 0)).toBeCloseTo(15); // 40ft out, halfway through the falloff
    expect(cells.height(6, 0)).toBe(10);
  });

  it("lowers, and leaves cells it can't edit be", () => {
    const cells = flat(10, (ci) => ci >= 0);
    cells.apply(detailBrush(cells, { ...brush, tool: "lower" }, at(0, 0), 1));
    expect(cells.height(1, 0)).toBeCloseTo(0);
    expect(cells.height(-1, 0)).toBe(10);
  });

  it("flattens toward where the stroke began", () => {
    const cells = flat();
    cells.apply([[1, 0, 30]]);
    for (let n = 0; n < 100; n++) cells.apply(detailBrush(cells, { ...brush, tool: "flatten" }, at(0, 0), 0.1, 10));
    expect(cells.height(1, 0)).toBeCloseTo(10, 1);
  });

  it("smooths a spike into its neighbours", () => {
    const cells = flat();
    cells.apply([[0, 0, 50]]);
    cells.apply(detailBrush(cells, { ...brush, tool: "smooth" }, at(0, 0), 0.1));
    expect(cells.height(0, 0)).toBeLessThan(30);
  });

  it("erodes only cells it can edit", () => {
    const cells = flat(0, (ci) => ci >= 0);
    for (let ci = -10; ci <= 10; ci++) for (let cj = -10; cj <= 10; cj++) cells.apply([[ci, cj, Math.abs(ci) * 4 + cj * 2]]);
    const changes = detailBrush(cells, { ...brush, tool: "erode", erosion: "slump", talus: 20, strength: 60 }, at(0, 0), 1);
    expect(changes.length).toBeGreaterThan(0);
    expect(changes.every(([ci]) => ci >= 0)).toBe(true);
    expect(detailBrush(cells, { ...brush, tool: "erode", erosion: "water", strength: 60 }, at(0, 0), 1).every(([ci]) => ci >= 0)).toBe(true);
  });
});
