import { describe, expect, it } from "vitest";
import { CELLS, TILE_FT } from "./constants.js";
import { decodePlate, encodePlate, plateOf, splitPlate } from "./plateCodec.js";

// A tile at (tx, tz) with every layer filled from fill(layer, i, j).
function tileAt([tx, tz], { terrain = ["grass", "dirt", "rock"], fill = () => 0, objects = [], ...rest } = {}) {
  const layer = (name, Type) => Type.from({ length: CELLS * CELLS }, (_, k) => fill(name, k % CELLS, Math.floor(k / CELLS)));
  return {
    coords: [tx, tz],
    layer: "surface",
    cells: CELLS,
    cellFt: 8,
    palettes: { terrain, biome: ["plains", "forest"], water: ["sea", "fresh"] },
    generator: { version: 23, seed: 99 },
    objects,
    layers: {
      height: layer("height", Float64Array),
      water: layer("water", Float64Array),
      waterKind: layer("waterKind", Uint8Array),
      terrain: layer("terrain", Uint8Array),
      biome: layer("biome", Uint8Array),
      forest: layer("forest", Uint8Array),
      clutter: layer("clutter", Uint8Array),
    },
    ...rest,
  };
}

const fill = (name, i, j) =>
  ({
    height: -40 + i * 3.25 + j * 0.5,
    water: i < 10 ? 0 : i < 20 ? 12.75 : NaN,
    waterKind: i < 10 ? 0 : 1,
    terrain: (i + j) % 3,
    biome: 1,
    forest: (i * 7) % 256,
    clutter: i === 44 && j === 44 ? 3 : i < 8 && j < 8 ? 50 : 100,
  })[name];

describe("plates", () => {
  const rock = { id: "x", type: "rock", at: [16 * TILE_FT + 100.5, 300.25], yaw: 1.25, scale: 2.5, colors: [[0.2, 0.4, 0.6]], footprint: {}, height: 1 };
  const a = tileAt([16, 0], { fill, objects: [rock], falls: [{ top: [1, 2, 3], bottom: [4, 5, 6], width: 9, pool: 3 }], rivers: [{ half: 6, segments: [[[0, 0], [1, 1]]] }] });
  // Another tile whose terrain palette is in another order, with a tree.
  const b = tileAt([17, 0], { terrain: ["rock", "tree_oak_2", "grass"], fill: (name, i, j) => (name === "terrain" ? (i + j) % 3 : fill(name, i, j)) });
  const text = encodePlate(plateOf(16, 0), "surface", [b, a]);
  const { header, tiles } = decodePlate(text);

  it("gives back the same tiles", () => {
    expect(header).toMatchObject({ coords: [1, 0], layer: "surface" });
    expect(tiles.map((t) => t.coords)).toEqual([[16, 0], [17, 0]]);
    const [ta, tb] = tiles;
    for (const name of ["height", "water", "waterKind", "biome", "forest", "clutter"]) expect([...ta.layers[name]]).toEqual([...a.layers[name]]);
    expect([...tb.layers.terrain].map((v) => tb.palettes.terrain[v])).toEqual([...b.layers.terrain].map((v) => b.palettes.terrain[v]));
    expect(ta.generator).toEqual({ version: 23, seed: 99 });
    expect(ta.falls).toEqual(a.falls);
    expect(ta.rivers).toEqual(a.rivers);
  });

  it("keeps placed objects, working out their ids and sizes", () => {
    const [object] = tiles[0].objects;
    expect(object).toMatchObject({ id: "16.0.0", type: "rock", at: rock.at, yaw: expect.closeTo(1.25, 3), scale: 2.5 });
    expect(object.colors[0].map((c) => Math.round(c * 255))).toEqual([51, 102, 153]);
    expect(object.footprint.circle).toBeGreaterThan(0);
  });

  it("keeps an object's other fields, and a position out of the plate", () => {
    const odd = { type: "rock", at: [-5, 3], yaw: 0, scale: 1, base: 4, texts: { sign: "HI" } };
    const [back] = decodePlate(encodePlate([1, 0], "surface", [tileAt([16, 0], { objects: [odd] })])).tiles[0].objects;
    expect(back).toMatchObject({ at: [-5, 3], base: 4, texts: { sign: "HI" } });
  });

  it("writes a layer that's alike everywhere on one line, and clutter only where it's off its default", () => {
    expect(text).toContain("layer biome =1");
    const lines = splitPlate(text).tiles[0].text.split("\n");
    const chunks = lines.slice(lines.indexOf("chunks clutter") + 1).filter((l) => /^\d+,\d+ /.test(l));
    expect(chunks.map((l) => l.split(" ")[0])).toEqual(["0,0", "5,5"]);
    expect(chunks[0]).toBe("0,0 =0o");
  });

  it("is plain text with lines of one length per layer", () => {
    expect(/^[\x20-\x7e\n]*$/.test(text)).toBe(true);
    const lines = text.split("\n");
    const rows = lines.slice(lines.indexOf("layer height") + 1, lines.indexOf("layer height") + 1 + CELLS);
    expect(new Set(rows.map((l) => l.length))).toEqual(new Set([CELLS * 3]));
  });

  it("refuses a tile from another plate", () => {
    expect(() => encodePlate([0, 0], "surface", [a])).toThrow(/isn't in plate/);
  });
});
