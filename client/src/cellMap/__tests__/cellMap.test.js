import {describe, it, expect} from "vitest";
import {validateCellMap} from "../format";
import {cellAt, cellCenter, cellCorners, mapSize, neighbor} from "../hexGrid";
import {regionLoops, smoothLoop} from "../regions";
import {buildScene} from "../scene";
import {cacheKey} from "../render";
import clearing from "../examples/clearing.json";
import forestEdge from "../examples/forest-edge.json";
import woodlandTrail from "../examples/woodland-trail.json";

const tiny = (cells, seed = 1) => ({format: "cellmap", version: 1, seed, grid: {type: "hex", cols: cells[0].length, rows: cells.length, cellSize: 5}, cells});

describe("validateCellMap", () => {
  it("accepts the examples", () => {
    for (const map of [clearing, forestEdge, woodlandTrail]) expect(validateCellMap(map)).toEqual([]);
  });

  it("names what's wrong", () => {
    const map = {...tiny(["..", ".."]), cells: ["..", ".x."]};
    expect(validateCellMap(map)).toEqual(['cells[1] has 3 cells, grid.cols is 2', 'cells[1] has unknown cells: "x"']);
    expect(validateCellMap({...tiny([".."]), grid: {type: "square", cols: 0, rows: 1, cellSize: -1}})).toEqual([
      'grid.type must be "hex"',
      "grid.cols must be an integer from 1 to 200",
      "grid.cellSize must be a positive number",
      "cells[0] has 2 cells, grid.cols is 0",
    ]);
  });
});

describe("hexGrid", () => {
  it("puts neighbors one cell apart, across the edge they share", () => {
    for (const col of [2, 3]) {
      const corners = cellCorners(col, 4, 5);
      for (let edge = 0; edge < 6; edge++) {
        const [c, r] = neighbor(col, 4, edge);
        const a = cellCenter(col, 4, 5);
        const b = cellCenter(c, r, 5);
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(5);
        const mid = {x: (corners[edge].x + corners[(edge + 1) % 6].x) / 2, y: (corners[edge].y + corners[(edge + 1) % 6].y) / 2};
        expect(mid.x).toBeCloseTo((a.x + b.x) / 2);
        expect(mid.y).toBeCloseTo((a.y + b.y) / 2);
      }
    }
  });

  it("finds the cell under a point", () => {
    const {x, y} = cellCenter(7, 3, 5);
    expect(cellAt(x + 1, y - 1.5, 5)).toEqual([7, 3]);
  });

  it("sizes the map to the grid", () => {
    const {width, height} = mapSize({cols: 2, rows: 1, cellSize: Math.sqrt(3)});
    expect(width).toBeCloseTo(3.5);
    expect(height).toBeCloseTo(1.5 * Math.sqrt(3));
  });
});

describe("regionLoops", () => {
  it("outlines a lone cell with its six corners", () => {
    const loops = regionLoops(tiny(["...", ".T.", "..."]), "trees");
    expect(loops).toHaveLength(1);
    expect(loops[0]).toHaveLength(6);
  });

  it("gives a meadow hole in the forest its own loop", () => {
    expect(regionLoops(tiny(["TTTTT", "TT.TT", "TTTTT"]), "trees")).toHaveLength(2);
  });

  it("keeps outlines off the map, past its edge", () => {
    const map = tiny(["TT", "TT"]);
    const {width, height} = mapSize(map.grid);
    const [loop] = regionLoops(map, "trees").map((l) => smoothLoop(l, 5, 1));
    expect(loop.every(({x, y}) => x < 0 || y < 0 || x > width || y > height)).toBe(true);
  });
});

describe("buildScene", () => {
  it("builds the same scene from the same map", () => {
    expect(buildScene(clearing)).toEqual(buildScene(structuredClone(clearing)));
  });

  it("changes with the seed", () => {
    expect(buildScene({...clearing, seed: 12}).crowns).not.toEqual(buildScene(clearing).crowns);
  });

  it("only changes what's near an edited cell", () => {
    const edited = {...clearing, cells: clearing.cells.map((row, r) => (r === 10 ? row.slice(0, 20) + "T" + row.slice(21) : row))};
    const before = new Set(buildScene(clearing).crowns.map((c) => `${c.x},${c.y}`));
    const added = buildScene(edited).crowns.filter((c) => !before.has(`${c.x},${c.y}`));
    const {x, y} = cellCenter(20, 10, 5);
    expect(added.length).toBeGreaterThan(0);
    expect(added.every((c) => Math.hypot(c.x - x, c.y - y) < 5)).toBe(true);
  });
});

describe("cacheKey", () => {
  it("ignores the map's name but not its cells or seed", () => {
    expect(cacheKey({...clearing, name: "Other"}, 10)).toEqual(cacheKey(clearing, 10));
    expect(cacheKey({...clearing, seed: 99}, 10)).not.toEqual(cacheKey(clearing, 10));
    expect(cacheKey(clearing, 20)).not.toEqual(cacheKey(clearing, 10));
  });
});
