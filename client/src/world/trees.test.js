import { describe, it, expect } from "vitest";
import { findTrees, fellTree, plantTree } from "./trees.js";

const N = 8;
const blank = () => ({
  cells: N,
  palettes: { terrain: ["grass", "sand"] },
  layers: { terrain: new Uint8Array(N * N), water: new Float32Array(N * N).fill(NaN) },
});

describe("trees", () => {
  it("finds trees of each size, even side by side", () => {
    const tile = blank();
    expect(plantTree(tile, 0, 0, 2)).toBe(true);
    expect(plantTree(tile, 2, 0, 2)).toBe(true);
    expect(plantTree(tile, 1, 2, 3)).toBe(true);
    expect(plantTree(tile, 7, 7, 1)).toBe(true);
    expect(findTrees(tile)).toEqual([
      { i: 0, j: 0, size: 2 },
      { i: 2, j: 0, size: 2 },
      { i: 1, j: 2, size: 3 },
      { i: 7, j: 7, size: 1 },
    ]);
  });

  it("won't overlap a tree, leave the tile, or stand in water", () => {
    const tile = blank();
    plantTree(tile, 2, 2, 2);
    expect(plantTree(tile, 3, 3, 1)).toBe(false);
    expect(plantTree(tile, 7, 0, 2)).toBe(false);
    tile.layers.water[5 * N + 5] = 1;
    expect(plantTree(tile, 4, 4, 2)).toBe(false);
    expect(findTrees(tile)).toHaveLength(1);
  });

  it("fells the tree covering a cell, back to grass", () => {
    const tile = blank();
    plantTree(tile, 2, 2, 3);
    expect(fellTree(tile, 4, 3)).toBe(true);
    expect(findTrees(tile)).toEqual([]);
    expect(tile.palettes.terrain[tile.layers.terrain[3 * N + 4]]).toBe("grass");
    expect(fellTree(tile, 4, 3)).toBe(false);
  });
});
