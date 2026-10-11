import {describe, it, expect} from "vitest";
import {autoBarriers, clipLoop, simplify} from "../autoBarriers";
import {computeMapFill} from "../../../game/mapFill";
import {CELL_SIZE, cellCenter, mapSize} from "../../../cellMap/hexGrid";
import woodland from "../../../cellMap/examples/woodland-trail.json";

// A map of trees with a clearing in the middle, and a grove in the
// clearing.
function ringed(cols = 20, rows = 16) {
  const cells = Array.from({length: rows}, (_, r) => [...Array(cols)].map((_, c) => {
    const inClearing = c >= 4 && c < cols - 4 && r >= 3 && r < rows - 3;
    const inGrove = c >= 9 && c <= 11 && r >= 7 && r <= 8;
    return inClearing && !inGrove ? "." : "T";
  }).join(""));
  return {version: 1, theme: "glade", seed: 3, grid: {type: "hex", cols, rows}, cells};
}

// Whether a cell's center is filled, under the map's fill rules.
function filledAt(cellMap, result, col, row) {
  const feetDimensions = mapSize(cellMap.grid);
  const fill = computeMapFill({feetDimensions, barriers: result.barriers, connections: [], fillPoints: result.fillPoints});
  const {x, y} = cellCenter(col, row, CELL_SIZE);
  const p = [x, feetDimensions.height - y];
  const inside = (ring) => {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  return fill.filled.some(({outer, holes}) => inside(outer) && !holes.some(inside));
}

describe("autoBarriers", () => {
  it("walls off the forest: trees filled, the clearing open, the grove filled", () => {
    const map = ringed();
    const result = autoBarriers(map);
    expect(result.error).toBeNull();
    expect(result.openEdge).toBe(false);
    expect(result.barriers.length).toBeGreaterThan(0);
    expect(result.segments).toBeLessThanOrEqual(3000);
    expect(result.fillPoints).toHaveLength(1);
    expect(filledAt(map, result, 1, 1)).toBe(true);
    expect(filledAt(map, result, 6, 5)).toBe(false);
    expect(filledAt(map, result, 10, 7)).toBe(true);
  });

  it("keeps walls on the map, with runs ending on its edge", () => {
    const map = {...ringed(), cells: ringed().cells.map((line, r) => (r >= 6 && r <= 9 ? "...." + line.slice(4) : line))};
    const {width, height} = mapSize(map.grid);
    const result = autoBarriers(map);
    for (const {locations} of result.barriers) {
      for (const {x, y} of locations) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(width + 0.01);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(height + 0.01);
      }
    }
    // The clearing now reaches the left edge, so it would be filled.
    expect(result.openEdge).toBe(true);
  });

  it("doesn't add a fill point where one already is", () => {
    const map = ringed();
    const first = autoBarriers(map);
    expect(autoBarriers(map, first.fillPoints).fillPoints).toEqual(first.fillPoints);
  });

  it("handles the woodland example within the segment limit", () => {
    const result = autoBarriers(woodland);
    expect(result.error).toBeNull();
    expect(result.segments).toBeLessThanOrEqual(3000);
  });
});

describe("clipLoop", () => {
  it("keeps a loop inside the map closed", () => {
    const loop = [[1, 1], [3, 1], [3, 3], [1, 3]];
    expect(clipLoop(loop, 10, 10)).toEqual([{points: [...loop, [1, 1]], closed: true}]);
  });

  it("cuts a loop crossing the edge into a run from edge to edge", () => {
    const runs = clipLoop([[-2, 2], [4, 2], [4, 6], [-2, 6]], 10, 10);
    expect(runs).toEqual([{points: [[0, 2], [4, 2], [4, 6], [0, 6]], closed: false}]);
  });

  it("joins a run that wraps around the loop's start", () => {
    const runs = clipLoop([[4, 2], [4, 6], [-2, 6], [-2, 2]], 10, 10);
    expect(runs).toEqual([{points: [[0, 2], [4, 2], [4, 6], [0, 6]], closed: false}]);
  });
});

describe("simplify", () => {
  it("drops points within the tolerance", () => {
    expect(simplify([[0, 0], [1, 0.05], [2, 0], [3, 2]], 0.1)).toEqual([[0, 0], [2, 0], [3, 2]]);
  });
});
