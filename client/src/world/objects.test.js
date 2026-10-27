import { describe, it, expect } from "vitest";
import { problems, shapeOf } from "./builtObjects.js";
import { BUILTIN_COLLECTIONS } from "./builtinCollections.js";
import { OBJECT_TYPES, blocks, makeObject, scatterObjects, tileOf } from "./objects.js";

const TERRAIN = ["grass", "rock", "sand", "tree_oak_1"];
const BIOMES = ["plains", "forest", "rocky", "swamp"];

// A 64×64-cell tile of one biome and terrain, flat at `height`.
function tile({ biome = "plains", terrain = "grass", height = 10 } = {}) {
  const count = 64 * 64;
  return {
    coords: [1, 2],
    cells: 64,
    cellFt: 8,
    generator: { seed: 7 },
    palettes: { terrain: TERRAIN, biome: BIOMES, water: ["sea", "fresh"] },
    layers: {
      height: new Float32Array(count).fill(height),
      water: new Float32Array(count).fill(NaN),
      terrain: new Uint8Array(count).fill(TERRAIN.indexOf(terrain)),
      biome: new Uint8Array(count).fill(BIOMES.indexOf(biome)),
    },
  };
}

describe("objects", () => {
  it("scatters each biome's types, the same every time, inside the tile", () => {
    for (const biome of BIOMES) {
      const t = tile({ biome });
      const objects = scatterObjects(t);
      expect(objects.length).toBeGreaterThan(0);
      expect(scatterObjects(t)).toEqual(objects);
      for (const o of objects) {
        expect(tileOf(o.at)).toEqual([1, 2]);
        const [lo, hi] = OBJECT_TYPES[o.type].size;
        expect(o.scale).toBeGreaterThanOrEqual(lo);
        expect(o.scale).toBeLessThanOrEqual(hi);
      }
    }
    expect(new Set(scatterObjects(tile({ biome: "forest" })).map((o) => o.type)).has("log")).toBe(true);
  });

  it("keeps clear of trees, deep water and each other", () => {
    expect(scatterObjects(tile({ terrain: "tree_oak_1" }))).toHaveLength(0);
    const deep = tile();
    deep.layers.water.fill(20);
    expect(scatterObjects(deep)).toHaveLength(0);
    const objects = scatterObjects(tile({ biome: "rocky" }));
    for (const a of objects) {
      for (const b of objects) {
        if (a !== b) expect(blocks(a, ...b.at)).toBe(false);
      }
    }
  });

  it("blocks by footprint, turned with the object", () => {
    const log = makeObject("log", [0, 0], 0, 20); // lies along x, 20 long, 1 across
    expect(blocks(log, 9, 0)).toBe(true);
    expect(blocks(log, 0, 3)).toBe(false);
    expect(blocks(log, 0, 3, 2.5)).toBe(true);
    const turned = { ...log, yaw: Math.PI / 2 }; // now along z
    expect(blocks(turned, 9, 0)).toBe(false);
    expect(blocks(turned, 0, 9)).toBe(true);
    const fence = makeObject("fence", [0, 0], 0, 4);
    expect(blocks(fence, 5, 0)).toBe(true);
    expect(blocks(fence, 0, 1)).toBe(false);
  });

  it("builds kit types from good kit objects standing as tall as the type says", () => {
    const kits = Object.entries(OBJECT_TYPES).filter(([, spec]) => spec.kit);
    expect(kits.map(([type]) => type).sort()).toEqual(["driftLog", "fence", "log", "rottingLog"]);
    for (const [type, spec] of kits) {
      expect(problems(spec.kit), type).toEqual([]);
      expect(shapeOf(spec.kit).height / spec.unitFt, type).toBeCloseTo(spec.height, 1);
    }
  });

  it("lists every type in exactly one builtin collection", () => {
    const listed = BUILTIN_COLLECTIONS.flatMap((c) => c.types);
    expect([...listed].sort()).toEqual(Object.keys(OBJECT_TYPES).sort());
  });
});
