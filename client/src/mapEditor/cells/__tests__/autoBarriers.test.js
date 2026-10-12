import {describe, it, expect} from "vitest";
import {autoBarriers, clipLoop, simplify} from "../autoBarriers";
import {computeMapFill} from "../../../game/mapFill";
import {hasLineOfSight} from "../../../game/collision";
import {CELL_SIZE, cellCenter, cellPoint, mapSize} from "../../../cellMap/hexGrid";
import {warp} from "../../../cellMap/regions";
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
  const fill = computeMapFill({feetDimensions, barriers: result.barriers, connections: result.connections ?? [], fillPoints: result.fillPoints});
  // Where the cell's drawn: walls bend with the drawing.
  const {x, y} = warp(cellCenter(col, row, CELL_SIZE), cellMap.seed);
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

  it("closes each exit's gap in the trees with a line connection named for its side", () => {
    // Trees ring the map, with a gap through them on the north and west.
    const map = blank(20, 14);
    map.cells = map.cells.map((line, r) => [...line].map((ch, c) => {
      const ring = c < 3 || r < 3 || c >= 17 || r >= 11;
      const gap = (r < 3 && c >= 8 && c <= 11) || (c < 3 && r >= 6 && r <= 8) || (c >= 17 && r >= 5 && r <= 7);
      return ring && !gap ? "T" : ".";
    }).join(""));
    map.exits = [{side: "north", from: 8, to: 11}, {side: "east", from: 5, to: 7}, {side: "west", from: 6, to: 8}];
    const result = autoBarriers(map);
    expect(result.error).toBeNull();
    expect(result.openEdge).toBe(false);
    const {width, height} = mapSize(map.grid);
    const [north, east, west] = result.connections;
    // Right on the east edge, not rounded past it.
    expect(east).toMatchObject({identifier: "east", start: {x: width}, end: {x: width}});
    expect(north).toMatchObject({identifier: "north", type: "line", start: {y: height}, end: {y: height}});
    expect(west).toMatchObject({identifier: "west", type: "line", start: {x: 0}, end: {x: 0}});
    // About as wide as the gap, and it ends on the walls either side.
    const gapWidth = cellCenter(11, 0, CELL_SIZE).x - cellCenter(8, 0, CELL_SIZE).x;
    expect(Math.abs(north.end.x - north.start.x)).toBeGreaterThan(gapWidth * 0.8);
    expect(Math.abs(north.end.x - north.start.x)).toBeLessThan(gapWidth + 2 * CELL_SIZE);
    const ends = result.barriers.filter((b) => b.type === "wall").flatMap(({locations}) => [locations[0], locations[locations.length - 1]]);
    for (const p of [north.start, north.end, west.start, west.end]) expect(ends).toContainEqual(p);
    // So the clearing and the gaps are open, and the trees filled.
    expect(filledAt(map, result, 10, 1)).toBe(false);
    expect(filledAt(map, result, 1, 7)).toBe(false);
    expect(filledAt(map, result, 18, 6)).toBe(false);
    expect(filledAt(map, result, 10, 7)).toBe(false);
    expect(filledAt(map, result, 1, 1)).toBe(true);
    expect(filledAt(map, result, 18, 9)).toBe(true);
  });

  it("turns the cellMap's places into the map's, in feet and bent like the walls", () => {
    const map = ringed();
    map.places = [{identifier: "glade", polygon: [[2, 2], [8, 2], [8, 6], [2, 6]]}];
    const result = autoBarriers(map);
    const {height} = mapSize(map.grid);
    expect(result.places).toEqual([{identifier: "glade", polygon: map.places[0].polygon.map(([c, r]) => {
      const {x, y} = warp(cellPoint(c, r, CELL_SIZE), map.seed);
      return {x: expect.closeTo(x, 1), y: expect.closeTo(height - y, 1)};
    })}]);
  });

  it("keeps a little copse's wall around its fill point, so the open ground isn't filled", () => {
    // Two trees side by side, in rows and columns all over a clearing, so
    // the warp bends them every which way.
    const map = ringed();
    for (const [c, r] of [[5, 5], [6, 5], [13, 10], [13, 11], [8, 12], [9, 11]]) map.cells[r] = replaceAt(map.cells[r], c, "T");
    const result = autoBarriers(map);
    expect(filledAt(map, result, 5, 5)).toBe(true);
    expect(filledAt(map, result, 13, 10)).toBe(true);
    expect(filledAt(map, result, 7, 7)).toBe(false);
    expect(filledAt(map, result, 11, 12)).toBe(false);
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
    const one = warp(cellCenter(4, 5, CELL_SIZE), map.seed);
    expect(circles).toContainEqual({type: "circle", location: {x: round(one.x), y: round(mapSize(map.grid).height - one.y)}, radius: 2.5});
    expect(result.barriers.filter((b) => b.type === "wall")).toHaveLength(1);
    expect(result.fillPoints).toHaveLength(1);
    expect(filledAt(map, result, 12, 8)).toBe(true);
    expect(filledAt(map, result, 4, 5)).toBe(true);
    expect(filledAt(map, result, 4, 12)).toBe(true);
    expect(filledAt(map, result, 17, 4)).toBe(true);
  });

  it("walls water off with walls you can see across, trees' walls blocking sight where they meet it", () => {
    // Trees ring the map; a lake in the clearing, with an island of trees,
    // and a stretch of shore where the lake meets the forest.
    const map = blank(24, 18);
    map.cells = map.cells.map((line, r) => [...line].map((ch, c) => {
      if (c < 3 || r < 3 || c >= 21 || r >= 15) return "T";
      if (c >= 7 && c <= 16 && r >= 6 && r <= 11) return c >= 11 && c <= 12 && r >= 8 && r <= 9 ? "T" : "w";
      if (c >= 3 && c <= 7 && r >= 9 && r <= 11) return "w";
      return ".";
    }).join(""));
    const result = autoBarriers(map);
    expect(result.error).toBeNull();
    const walls = result.barriers.filter((b) => b.type === "wall");
    expect(walls.some((b) => b.blocksSight === false)).toBe(true);
    expect(walls.some((b) => b.blocksSight === undefined)).toBe(true);
    // The lake and the island are each filled; the meadow isn't.
    expect(filledAt(map, result, 8, 7)).toBe(true);
    expect(filledAt(map, result, 11, 8)).toBe(true);
    expect(filledAt(map, result, 5, 10)).toBe(true);
    expect(filledAt(map, result, 18, 5)).toBe(false);
    expect(filledAt(map, result, 10, 13)).toBe(false);

    // Across the lake you can see, but not through the island.
    const {height} = mapSize(map.grid);
    const at = (c, r) => {
      const {x, y} = cellCenter(c, r, CELL_SIZE);
      return [x, height - y];
    };
    expect(hasLineOfSight(...at(9, 4), ...at(9, 13), result.barriers)).toBe(true);
    expect(hasLineOfSight(...at(12, 4), ...at(12, 13), result.barriers)).toBe(false);
  });

  it("cuts a bridge's deck out of the water, with rails, filling the water either side", () => {
    // Trees ring the map; a river runs down it, and a bridge crosses.
    const map = blank(24, 16);
    map.cells = map.cells.map((line, r) => [...line].map((ch, c) => {
      if (c === 0 || r === 0 || c === 23 || r === 15) return "T";
      return c >= 10 && c <= 13 ? "w" : ".";
    }).join(""));
    map.bridges = [{from: [8, 8], to: [15, 11]}];
    const result = autoBarriers(map);
    expect(result.error).toBeNull();
    expect(filledAt(map, result, 6, 8)).toBe(false);
    expect(filledAt(map, result, 17, 11)).toBe(false);
    expect(filledAt(map, result, 11, 9)).toBe(false);
    expect(filledAt(map, result, 11, 3)).toBe(true);
    expect(filledAt(map, result, 11, 13)).toBe(true);

    // Nothing stands in the way along the deck, and its rails are straight.
    const {height} = mapSize(map.grid);
    const at = (c, r) => {
      const {x, y} = cellCenter(c, r, CELL_SIZE);
      return [x, height - y];
    };
    const solid = result.barriers.map((b) => ({...b, blocksSight: true}));
    expect(hasLineOfSight(...at(8, 8), ...at(15, 11), solid)).toBe(true);
    const rails = result.barriers.filter((b) => b.type === "wall" && b.locations.length === 2 && b.blocksSight === false);
    expect(rails.length).toBeGreaterThanOrEqual(2);
  });

  it("gives a lone round pond a circle you can see across", () => {
    const map = blank(12, 10);
    map.cells[4] = replaceAt(map.cells[4], 5, "w");
    const {barriers, fillPoints} = autoBarriers(map);
    expect(barriers).toHaveLength(1);
    expect(barriers[0]).toMatchObject({type: "circle", radius: 2.5, blocksSight: false});
    expect(fillPoints).toEqual([]);
  });

  it("handles the woodland example within the segment limit", () => {
    const result = autoBarriers(woodland);
    expect(result.error).toBeNull();
    expect(result.segments).toBeLessThanOrEqual(3000);
  });

  it("walls trees a trail runs through, as if it weren't there", () => {
    expect(autoBarriers(woodland).barriers).toEqual(autoBarriers({...woodland, trails: []}).barriers);
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
