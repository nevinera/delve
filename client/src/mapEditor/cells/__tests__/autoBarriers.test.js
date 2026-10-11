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

function blank(cols, rows) {
  return {version: 1, theme: "glade", seed: 3, grid: {type: "hex", cols, rows}, cells: Array.from({length: rows}, () => ".".repeat(cols))};
}

const replaceAt = (line, at, text) => line.slice(0, at) + text + line.slice(at + text.length);
const round = (n) => Math.round(n * 100) / 100;

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

  it("gives a lone grove that's round a circle, and others walls", () => {
    const map = blank(20, 16);
    map.cells[5] = replaceAt(map.cells[5], 4, "T"); // one cell
    for (const [c, r] of [[12, 8], [12, 7], [12, 9], [11, 7], [11, 8], [13, 7], [13, 8]]) map.cells[r] = replaceAt(map.cells[r], c, "T"); // a cell and its six neighbors
    map.cells[12] = replaceAt(map.cells[12], 4, "TT"); // two cells
    for (const [c, r] of [[16, 4], [16, 5], [17, 4]]) map.cells[r] = replaceAt(map.cells[r], c, "T"); // three around a corner
    const result = autoBarriers(map);
    const circles = result.barriers.filter((b) => b.type === "circle");
    expect(circles.map(({radius}) => radius).sort()).toEqual([2.5, 4.55, 7.5]);
    const one = cellCenter(4, 5, CELL_SIZE);
    expect(circles).toContainEqual({type: "circle", location: {x: round(one.x), y: round(mapSize(map.grid).height - one.y)}, radius: 2.5});
    expect(result.barriers.filter((b) => b.type === "wall")).toHaveLength(1);
    expect(result.fillPoints).toHaveLength(1);
    expect(filledAt(map, result, 12, 8)).toBe(true);
    expect(filledAt(map, result, 4, 5)).toBe(true);
    expect(filledAt(map, result, 4, 12)).toBe(true);
    expect(filledAt(map, result, 17, 4)).toBe(true);
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
