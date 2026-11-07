import { describe, expect, it } from "vitest";
import { BLOCK_STEPS, continentGrid, outlines, solidMask } from "./mapShapes.js";

// One platter of land, with steep cells where steepAt(i, j) says, i and j its chunks (0 to 511),
// and water where levelAt(i, j) gives a level.
function grid(steepAt, levelAt = () => NaN) {
  const tiles = new Map();
  for (let index = 0; index < 64 * 64; index++) {
    const [ti, tj] = [index % 64, Math.floor(index / 64)];
    const at = (part) => [ti * 8 + (part % 8), tj * 8 + Math.floor(part / 8)];
    const steep = Uint8Array.from({ length: 64 }, (_, part) => (steepAt(...at(part)) ? BLOCK_STEPS : 0));
    const level = Float32Array.from({ length: 64 }, (_, part) => levelAt(...at(part)));
    tiles.set(index, { heights: new Float32Array(81), water: { level, type: new Uint8Array(64) }, steep });
  }
  return continentGrid([{ coords: [0, 0], tiles }]);
}
const cell = (g, i, j) => (j + 1) * g.w + i + 1;

describe("the map's solid ground", () => {
  it("fills what a ring of cliffs walls off, and the cliffs", () => {
    const ring = (i, j) => Math.max(Math.abs(i - 100), Math.abs(j - 100)) === 20;
    const g = grid(ring);
    const solid = solidMask(g);
    expect(solid[cell(g, 100, 100)]).toBe(1);
    expect(solid[cell(g, 120, 100)]).toBe(1);
    expect(solid[cell(g, 200, 200)]).toBe(0);
  });

  it("leaves what's walled off open where you are", () => {
    const g = grid((i, j) => Math.max(Math.abs(i - 100), Math.abs(j - 100)) === 20);
    const solid = solidMask(g, [[100 * 32 + 16, 100 * 32 + 16]]);
    expect(solid[cell(g, 100, 100)]).toBe(0);
    expect(solid[cell(g, 120, 100)]).toBe(1);
  });

  it("lets you swim down a falls through cliffs, but not up it", () => {
    const ring = (i, j) => Math.max(Math.abs(i - 100), Math.abs(j - 100)) === 20 && !(i === 120 && j === 100);
    // A lake 50 ft up inside the ring, its stream falling out through the gap to the east.
    const water = (i, j) => (Math.max(Math.abs(i - 100), Math.abs(j - 100)) < 20 ? 50 : j === 100 && i >= 120 && i < 200 ? 0 : NaN);
    const g = grid(ring, water);
    expect(solidMask(g)[cell(g, 100, 100)]).toBe(1);
    const gentle = grid(ring, (i, j) => (Math.max(Math.abs(i - 100), Math.abs(j - 100)) < 20 ? 3 : j === 100 && i >= 120 && i < 200 ? 0 : NaN));
    expect(solidMask(gentle)[cell(gentle, 100, 100)]).toBe(0);
  });

  it("keeps a cliff running slantwise whole", () => {
    const g = grid((i, j) => i + j === 300 && i > 100 && i < 200);
    expect(solidMask(g)[cell(g, 150, 150)]).toBe(1);
  });

  it("doesn't climb a gully stepped with cliffs", () => {
    // Land rising 8 ft a chunk eastward, a quarter of each chunk steep.
    const tiles = new Map();
    for (let index = 0; index < 64 * 64; index++) {
      const ti = index % 64;
      const heights = Float32Array.from({ length: 81 }, (_, c) => (ti * 8 + (c % 9)) * 8);
      tiles.set(index, { heights, water: null, steep: new Uint8Array(64).fill(16) });
    }
    const g = continentGrid([{ coords: [0, 0], tiles }]);
    const solid = solidMask(g);
    expect(solid[cell(g, 5, 200)]).toBe(1);
  });

  it("lets small specks through", () => {
    const g = grid((i, j) => i >= 50 && i < 52 && j >= 50 && j < 52);
    expect(solidMask(g)[cell(g, 50, 50)]).toBe(0);
  });

  it("outlines each shape in a closed loop around it", () => {
    const g = grid((i, j) => Math.hypot(i - 300, j - 300) < 30);
    const loops = outlines(solidMask(g), g);
    expect(loops).toHaveLength(1);
    const [xs, zs] = [loops[0].filter((_, k) => k % 2 === 0), loops[0].filter((_, k) => k % 2 === 1)];
    expect(Math.min(...xs)).toBeCloseTo(270 * 32, -2);
    expect(Math.max(...zs)).toBeCloseTo(330 * 32, -2);
  });

});
