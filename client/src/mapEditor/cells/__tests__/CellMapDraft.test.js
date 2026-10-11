import {describe, it, expect} from "vitest";
import {CellMapDraft} from "../CellMapDraft";
import {validateCellMap} from "../../../cellMap/format";
import {cellPoint, gridFor, hexDistance, mapSize, neighbor, pointAt} from "../../../cellMap/hexGrid";

// Starts all trees; most tests want open meadow to work on.
const blank = () => CellMapDraft.blank({cols: 5, rows: 4}).with({cells: [".....", ".....", ".....", "....."]});

describe("CellMapDraft", () => {
  it("starts all trees, and valid", () => {
    const draft = CellMapDraft.blank({cols: 5, rows: 4});
    expect(draft.data.cells).toEqual(["TTTTT", "TTTTT", "TTTTT", "TTTTT"]);
    expect(validateCellMap(draft.data)).toEqual([]);
  });

  it("changes theme, keeping the cells and dropping the old colors", () => {
    const draft = blank().paint(1, 1, "w").setColor("meadow", "#112233");
    const glade = draft.setTheme("glade");
    expect(glade).toBe(draft);
    expect(validateCellMap(glade.data)).toEqual([]);
  });

  it("paints a cell, or a cell and its neighbors", () => {
    expect(blank().paint(1, 1, "T").data.cells).toEqual([".....", ".T...", ".....", "....."]);
    const big = blank().paint(2, 1, "T", 2).data.cells;
    expect(big.join("").split("T").length - 1).toBe(7);
    for (let edge = 0; edge < 6; edge++) {
      const [c, r] = neighbor(2, 1, edge);
      expect(big[r][c]).toBe("T");
    }
  });

  it("returns itself when painting changes nothing", () => {
    const draft = blank();
    expect(draft.paint(0, 0, ".")).toBe(draft);
  });

  it("fills the cells like the one clicked, joined to it", () => {
    const walled = blank().with({cells: ["..T..", "..T..", "TTT..", "....."]});
    expect(walled.fill(0, 0, "~").data.cells).toEqual(["~~T..", "~~T..", "TTT..", "....."]);
    expect(walled.fill(2, 0, "%").data.cells).toEqual(["..%..", "..%..", "%%%..", "....."]);
  });

  it("resizes from the bottom-left, moving trails with their cells", () => {
    const draft = blank().paint(0, 3, "T").addTrail([[0, 3], [2, 1]]);
    const taller = draft.resize({cols: 2, rows: 6});
    expect(taller.data.cells).toEqual(["TT", "TT", "..", "..", "..", "T."]);
    expect(taller.trails[0].points).toEqual([[0, 5], [2, 3]]);
    expect(taller.grid).toEqual({type: "hex", cols: 2, rows: 6});
    const shorter = draft.resize({rows: 2});
    expect(shorter.data.cells).toEqual([".....", "T...."]);
    expect(shorter.trails[0].points).toEqual([[0, 1], [2, -1]]);
  });

  it("sets and resets colors", () => {
    const draft = blank().setColor("meadow", "#112233");
    expect(draft.data.colors).toEqual({meadow: "#112233"});
    expect(draft.setColor("meadow", null).data).not.toHaveProperty("colors");
  });

  it("edits trails", () => {
    let draft = blank().addTrail([[0, 0], [2.123, 1]]);
    expect(draft.trails).toEqual([{width: 0.8, points: [[0, 0], [2.12, 1]]}]);
    draft = draft.insertTrailPoint(0, 1, [1, 2]).moveTrailPoint(0, 2, [3, 3]).setTrailWidth(0, 1.2);
    expect(draft.trails).toEqual([{width: 1.2, points: [[0, 0], [1, 2], [3, 3]]}]);
    draft = draft.removeTrailPoint(0, 0);
    expect(draft.trails[0].points).toEqual([[1, 2], [3, 3]]);
    expect(draft.removeTrailPoint(0, 0).trails).toEqual([]);
  });
});

describe("hexGrid helpers", () => {
  it("inverts cellPoint", () => {
    for (const [c, r] of [[0, 0], [3, 2], [2.5, 1.25], [7.3, 4.9]]) {
      const {x, y} = cellPoint(c, r, 5);
      const [col, row] = pointAt(x, y, 5);
      expect(col).toBeCloseTo(c);
      expect(row).toBeCloseTo(r);
    }
  });

  it("counts steps between cells", () => {
    for (let edge = 0; edge < 6; edge++) expect(hexDistance([3, 3], neighbor(3, 3, edge))).toBe(1);
    expect(hexDistance([0, 0], [4, 0])).toBe(4);
  });

  it("sizes a grid to cover an area", () => {
    const grid = gridFor({width: 100, height: 80});
    const size = mapSize(grid);
    expect(Math.abs(size.width - 100)).toBeLessThan(5);
    expect(Math.abs(size.height - 80)).toBeLessThan(5);
  });
});
