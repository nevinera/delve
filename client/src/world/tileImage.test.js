import { describe, it, expect } from "vitest";
import { tileDetailRgba, tileRgba } from "./tileImage.js";
import { plantTree } from "./trees.js";

// A flat, dry 8×8-cell grass tile at tile (1, 0).
function tile() {
  const count = 64;
  return {
    coords: [1, 0],
    cells: 8,
    cellFt: 8,
    palettes: { terrain: ["grass"], biome: ["plains"] },
    objects: [],
    layers: {
      height: new Float32Array(count).fill(10),
      water: new Float32Array(count).fill(NaN),
      terrain: new Uint8Array(count),
      biome: new Uint8Array(count),
      forest: new Uint8Array(count),
    },
  };
}
const pixel = (rgba, side, x, y) => Array.from(rgba.subarray((y * side + x) * 4, (y * side + x) * 4 + 4));

describe("tileDetailRgba", () => {
  it("draws `px` pixels per cell, matching the thumbnail on plain ground", () => {
    const t = tile();
    const detail = tileDetailRgba(t, 4);
    expect(detail.length).toBe(32 * 32 * 4);
    expect(pixel(detail, 32, 13, 9)).toEqual(pixel(tileRgba(t), 8, 3, 2));
  });

  it("draws a tree's crown over its cells", () => {
    const t = tile();
    plantTree(t, 2, 2, 2, "pine");
    const [r, g] = pixel(tileDetailRgba(t, 4), 32, 12, 12);
    expect(g).toBeGreaterThan(r);
    expect(pixel(tileDetailRgba(t, 4), 32, 12, 12)).not.toEqual(pixel(tileDetailRgba(tile(), 4), 32, 12, 12));
  });

  it("draws objects where they stand", () => {
    const t = tile();
    t.objects.push({ type: "boulder", at: [512 + 44, 20], scale: 6, colors: [[1, 0, 0]] });
    const [r, g, b] = pixel(tileDetailRgba(t, 4), 32, 22, 10);
    expect(r).toBeGreaterThan(200);
    expect(g + b).toBeLessThan(80);
  });
});
