import { describe, it, expect } from "vitest";
import { clutterForTile, meshHeightAt } from "./clutter.js";

const TERRAIN = ["grass", "rock", "sand", "tree_oak_1"];

// A 4×4-cell tile of one biome and terrain, at `height`, with optional per-cell overrides.
function tile({ biome = "plains", terrain = "grass", height = 10, cells = {} } = {}) {
  const count = 16;
  const t = {
    coords: [0, 0],
    cells: 4,
    cellFt: 8,
    generator: { seed: 7 },
    palettes: { terrain: TERRAIN, biome: ["plains", "forest", "rocky", "swamp"], water: ["sea", "fresh"] },
    layers: {
      height: new Float32Array(count).fill(height),
      water: new Float32Array(count).fill(NaN),
      waterKind: new Uint8Array(count),
      terrain: new Uint8Array(count).fill(TERRAIN.indexOf(terrain)),
      biome: new Uint8Array(count).fill(["plains", "forest", "rocky", "swamp"].indexOf(biome)),
      forest: new Uint8Array(count),
    },
  };
  for (const [k, cell] of Object.entries(cells)) {
    for (const [layer, value] of Object.entries(cell)) t.layers[layer][k] = layer === "terrain" ? TERRAIN.indexOf(value) : value;
  }
  return t;
}
const tileAt = (t) => (x, z) => (x === 0 && z === 0 ? t : undefined);
const kinds = (items) => new Set(items.map((c) => c.kind));

describe("clutter", () => {
  it("is the same every time", () => {
    const t = tile();
    expect(clutterForTile(t, tileAt(t))).toEqual(clutterForTile(t, tileAt(t)));
  });

  it("grows grass on plains, on the ground", () => {
    const t = tile({ height: 12 });
    const items = clutterForTile(t, tileAt(t));
    expect(items.filter((c) => c.kind === "grass").length).toBeGreaterThan(20);
    for (const c of items) expect(c.y).toBeCloseTo(12);
  });

  it("leaves tree cells bare", () => {
    const t = tile({ terrain: "tree_oak_1" });
    expect(clutterForTile(t, tileAt(t))).toHaveLength(0);
  });

  it("scales with the clutter layer and the density asked for", () => {
    const t = tile();
    const normal = clutterForTile(t, tileAt(t)).length;
    t.layers.clutter = new Uint8Array(16).fill(200);
    expect(clutterForTile(t, tileAt(t)).length).toBeGreaterThan(normal * 1.6);
    expect(clutterForTile(t, tileAt(t), { density: 0.25 }).length).toBeLessThan(normal);
  });

  it("puts reeds beside and in fresh water, but not the sea", () => {
    const fresh = tile({ cells: { 5: { water: 11, waterKind: 1 }, 6: { water: 11, waterKind: 1 } } });
    expect(kinds(clutterForTile(fresh, tileAt(fresh))).has("reeds")).toBe(true);
    const sea = tile({ terrain: "sand", height: -1, cells: { 5: { water: 0, waterKind: 0 }, 6: { water: 0, waterKind: 0 } } });
    expect(kinds(clutterForTile(sea, tileAt(sea))).has("reeds")).toBe(false);
  });

  it("keeps lichen to steep rock, lying along the slope", () => {
    const steep = tile({ terrain: "rock" });
    steep.layers.height = Float32Array.from({ length: 16 }, (_, k) => (k % 4) * 8);
    const lichen = clutterForTile(steep, tileAt(steep)).filter((c) => c.kind === "lichen");
    expect(lichen.length).toBeGreaterThan(0);
    for (const c of lichen) expect(c.normal[0]).toBeLessThan(-0.5);
    const level = tile({ terrain: "rock" });
    expect(kinds(clutterForTile(level, tileAt(level))).has("lichen")).toBe(false);
  });
});

describe("meshHeightAt", () => {
  it("follows the terrain mesh's triangles between cell centers", () => {
    const t = tile();
    t.layers.height = Float32Array.from({ length: 16 }, (_, k) => (k % 4) * 2 + Math.floor(k / 4));
    expect(meshHeightAt(tileAt(t), 4, 4)).toBeCloseTo(0);
    expect(meshHeightAt(tileAt(t), 8, 4)).toBeCloseTo(1); // halfway to the next cell east
    expect(meshHeightAt(tileAt(t), 12, 12)).toBeCloseTo(3);
  });
});

describe("clutter under slabs", () => {
  const floor = (y) => ({ at: [0, y, 0], turn: [0, 0, 0], outline: [[0, 0], [16, 0], [16, 32], [0, 32]], thickness: 1, surface: "stone" });

  it("grows nowhere a slab's within its height over it", () => {
    const t = tile();
    const all = clutterForTile(t, tileAt(t));
    t.slabs = [floor(11)];
    const left = clutterForTile(t, tileAt(t));
    expect(left.length).toBeLessThan(all.length);
    expect(left.every((c) => c.x >= 16)).toBe(true);
  });

  it("grows under a slab high over it", () => {
    const t = tile();
    const all = clutterForTile(t, tileAt(t));
    t.slabs = [floor(40)];
    expect(clutterForTile(t, tileAt(t))).toHaveLength(all.length);
  });
});
