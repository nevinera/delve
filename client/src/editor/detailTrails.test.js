import { describe, expect, it } from "vitest";
import { CELLS, CELL_FT, TILE_FT } from "../world/constants.js";
import { findTrees, plantTree } from "../world/trees.js";
import { stampTrail } from "./detailTrails.js";

// A generated-looking tile at (tx, tz): grass at `h`, rising `slope` ft per cell eastward.
function tile(tx, tz, { h = 20, slope = 0 } = {}) {
  const n = CELLS * CELLS;
  const height = new Float64Array(n);
  for (let k = 0; k < n; k++) height[k] = h + (k % CELLS) * slope;
  return {
    coords: [tx, tz],
    cells: CELLS,
    cellFt: CELL_FT,
    palettes: { terrain: ["grass", "dirt"] },
    objects: [],
    layers: { height, water: new Float64Array(n).fill(NaN), terrain: new Uint8Array(n), clutter: new Uint8Array(n).fill(100) },
  };
}

const terrainAt = (t, i, j) => t.palettes.terrain[t.layers.terrain[j * CELLS + i]];
const across = [[0, 256], [TILE_FT, 256]];

describe("detail trails", () => {
  it("surfaces a footpath in path and leaves the ground far off be", () => {
    const tiles = new Map([["0,0", tile(0, 0)]]);
    expect(stampTrail(tiles, () => true, { kind: "footpath" }, across)).toEqual(["0,0"]);
    const t = tiles.get("0,0");
    expect(terrainAt(t, 32, 32)).toBe("path");
    expect(terrainAt(t, 32, 10)).toBe("grass");
    expect(t.roads ?? []).toEqual([]);
  });

  it("lists a road in use in tile.roads, clears its clutter and fells trees on it", () => {
    const tiles = new Map([["0,0", tile(0, 0)]]);
    const t = tiles.get("0,0");
    plantTree(t, 31, 31, 2, "oak");
    stampTrail(tiles, () => true, { kind: "road" }, across);
    expect(findTrees(t)).toEqual([]);
    expect(t.layers.clutter[32 * CELLS + 20]).toBe(0);
    expect(t.roads).toHaveLength(1);
    expect(t.roads[0].kind).toBe("road");
  });

  it("evens a slope along its bed", () => {
    const tiles = new Map([["0,0", tile(0, 0, { slope: 0 })]]);
    const t = tiles.get("0,0");
    // A bump across the line, which the bed smooths out.
    for (let j = 0; j < CELLS; j++) t.layers.height[j * CELLS + 32] = 40;
    stampTrail(tiles, () => true, { kind: "trail" }, across);
    expect(t.layers.height[32 * CELLS + 32]).toBeLessThan(30);
  });

  it("changes only tiles it may", () => {
    const tiles = new Map([["0,0", tile(0, 0)], ["1,0", tile(1, 0)]]);
    const changed = stampTrail(tiles, (key) => key === "0,0", { kind: "road" }, [[0, 256], [TILE_FT * 2, 256]]);
    expect(changed).toEqual(["0,0"]);
    expect(terrainAt(tiles.get("1,0"), 10, 32)).toBe("grass");
  });
});
