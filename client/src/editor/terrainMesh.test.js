import { describe, it, expect } from "vitest";
import { terrainMesh, waterMesh } from "./terrainMesh.js";

// A 4×4-cell tile with every cell at `height`, river water down column 1 when wet.
function tile(tx, tz, height, wet = false) {
  const count = 16;
  return {
    coords: [tx, tz],
    cells: 4,
    cellFt: 8,
    palettes: { terrain: ["grass"], biome: ["temperate"] },
    layers: {
      height: new Float32Array(count).fill(height),
      water: Float32Array.from({ length: count }, (_, k) => (wet && k % 4 === 1 ? height + 2 : NaN)),
      terrain: new Uint8Array(count),
      biome: new Uint8Array(count),
      forest: new Uint8Array(count),
    },
  };
}
const heightAt = (mesh, side, a, b) => mesh.positions[(b * side + a) * 3 + 1];

describe("terrainMesh", () => {
  it("puts vertices on cell centers, relative to the origin", () => {
    const mesh = terrainMesh(tile(1, 0, 5), {}, [32, 0], 1);
    expect(Array.from(mesh.positions.slice(0, 3))).toEqual([4, 5, 4]);
    expect(mesh.indices.length).toBe(4 * 4 * 6);
  });

  it("takes its far row and column from the neighbours", () => {
    const mesh = terrainMesh(tile(0, 0, 5), { east: tile(1, 0, 9), south: tile(0, 1, 7), southEast: tile(1, 1, 3) }, [0, 0], 1);
    expect(heightAt(mesh, 5, 4, 0)).toBe(9);
    expect(heightAt(mesh, 5, 0, 4)).toBe(7);
    expect(heightAt(mesh, 5, 4, 4)).toBe(3);
  });

  it("repeats its own edge without neighbours", () => {
    const mesh = terrainMesh(tile(0, 0, 5), {}, [0, 0], 2);
    expect(heightAt(mesh, 3, 2, 2)).toBe(5);
  });

  it("winds triangles so they face up", () => {
    const { positions: p, indices } = terrainMesh(tile(0, 0, 0), {}, [0, 0], 1);
    const [a, b, c] = [indices[0] * 3, indices[1] * 3, indices[2] * 3];
    const u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
    const v = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
    expect(u[2] * v[0] - u[0] * v[2]).toBeGreaterThan(0);
  });
});

describe("waterMesh", () => {
  it("is empty without river water", () => {
    expect(waterMesh(tile(0, 0, 5), {}, [0, 0])).toBeNull();
  });

  it("covers only where neighbouring cells are all wet", () => {
    const water = waterMesh(tile(0, 0, 5, true), {}, [0, 0]);
    // A single wet column has no wet neighbours across, so no triangles; a wider river would.
    expect(water).toBeNull();
    const wide = tile(0, 0, 5, true);
    wide.layers.water = new Float32Array(16).fill(7);
    expect(waterMesh(wide, {}, [0, 0]).indices.length).toBe(4 * 4 * 6);
  });
});
