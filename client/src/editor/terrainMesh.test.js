import { describe, it, expect } from "vitest";
import { groundCells, terrainMesh, waterMesh } from "./terrainMesh.js";
import { FLOW_NONE, encodeFlowDir, encodeFlowSlope } from "../world/generator.js";

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
  it("is empty without water", () => {
    expect(waterMesh(tile(0, 0, 5), {}, [0, 0])).toBeNull();
  });

  it("covers a narrow river and runs on into its banks at the river's level", () => {
    const river = tile(0, 0, 9, true); // water at 11 down column 1
    river.layers.height = Float32Array.from({ length: 16 }, (_, k) => (k % 4 === 1 ? 5 : 12));
    const water = waterMesh(river, {}, [0, 0]);
    expect(water.indices.length).toBeGreaterThan(0);
    for (const i of water.indices) expect(water.positions[i * 3 + 1]).toBe(11);
    const wide = tile(0, 0, 5, true);
    wide.layers.water = new Float32Array(16).fill(7);
    expect(waterMesh(wide, {}, [0, 0]).indices.length).toBe(4 * 4 * 6);
  });

  it("dips its shore under a bank lower than the water, so it never hangs over dry ground", () => {
    const river = tile(0, 0, 5, true); // water at 7 down column 1, ground 5 everywhere
    const water = waterMesh(river, {}, [0, 0]);
    expect(heightAt(water, 5, 1, 1)).toBe(7);
    expect(heightAt(water, 5, 2, 1)).toBe(4.5);
    // How deep it is, for fading the shore: 2ft in the river, under the ground at the bank.
    expect(water.depths[1 * 5 + 1]).toBe(2);
    expect(water.depths[1 * 5 + 2]).toBe(-0.5);
  });

  it("goes by the water kind layer where a tile has one", () => {
    const pool = tile(0, 0, -5);
    pool.layers.water = new Float32Array(16).fill(0); // fresh water that rounded to level 0
    pool.layers.waterKind = new Uint8Array(16).fill(1);
    pool.palettes.water = ["sea", "fresh"];
    expect(waterMesh(pool, {}, [0, 0], "sea")).toBeNull();
    expect(waterMesh(pool, {}, [0, 0], "fresh").indices.length).toBe(4 * 4 * 6);
  });

  it("gives fresh water its flow, spreading it to the shore", () => {
    const river = tile(0, 0, 5, true);
    // Column 1 runs south, falling 1 in 25.
    river.layers.flowDir = Uint8Array.from({ length: 16 }, (_, k) => (k % 4 === 1 ? encodeFlowDir(0, 1) : FLOW_NONE));
    river.layers.flowSlope = Uint8Array.from({ length: 16 }, (_, k) => (k % 4 === 1 ? encodeFlowSlope(0.04) : 0));
    const { flows } = waterMesh(river, {}, [0, 0]);
    const at = (a, b) => Array.from(flows.slice((b * 5 + a) * 3, (b * 5 + a) * 3 + 3));
    const [vx, vz, steep] = at(1, 1);
    expect(Math.abs(vx)).toBeLessThan(0.1);
    expect(vz).toBeGreaterThan(5);
    expect(steep).toBeCloseTo(0.2, 1);
    expect(at(2, 1)[1]).toBeCloseTo(vz, 1); // the bank beside it
    expect(at(4, 1)).toEqual([0, 0, 0]); // too far from any flow
  });

  it("keeps the sea and fresh water apart", () => {
    const sea = tile(0, 0, -5);
    sea.layers.water = new Float32Array(16).fill(0);
    expect(waterMesh(sea, {}, [0, 0], "fresh")).toBeNull();
    expect(waterMesh(sea, {}, [0, 0], "sea").indices.length).toBe(4 * 4 * 6);
  });
});

describe("groundCells", () => {
  it("gives each vertex its ground's layer and forest cover, the far edge from the neighbours", () => {
    const here = tile(0, 0, 0);
    here.layers.forest[1] = 200;
    const east = tile(1, 0, 0);
    east.palettes.terrain = ["rock"];
    const { data, side, corner } = groundCells(here, { east }, [0, 0], (name) => ["grass", "rock"].indexOf(name));
    expect(side).toBe(5);
    expect(corner).toEqual([4, 4]);
    expect([data[0], data[1], data[2], data[3]]).toEqual([0, 0, 0, 200]);
    expect(data[4 * 2]).toBe(1);
  });
});
