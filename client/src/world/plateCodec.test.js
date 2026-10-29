import { describe, expect, it } from "vitest";
import { CELLS, TILE_FT } from "./constants.js";
import { decodePlate, decodePlateTile, encodePlate, plateOf, splitPlate, streamPlate } from "./plateCodec.js";

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
  const a = tileAt([16, 0], { fill, objects: [rock], falls: [{ top: [1, 2, 3], bottom: [4, 5, 6], width: 9, pool: 3 }], rivers: [{ half: 6, segments: [[[0, 0], [1, 1]]] }], slabs: [{ at: [16 * TILE_FT + 10, 40, 20], turn: [0, 0, 0], outline: [[0, 0], [8, 0], [8, 8]], thickness: 1, surface: "brick" }] });
  // Another tile whose terrain palette is in another order, with a tree.
  const b = tileAt([17, 0], { terrain: ["rock", "tree_oak_2", "grass"], fill: (name, i, j) => (name === "terrain" ? (i + j) % 3 : fill(name, i, j)) });
  const sizes = { rock: { footprint: { circle: 1.5 }, height: 2, fixed: false } };
  const text = encodePlate(plateOf(16, 0), "surface", [b, a], sizes);
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
    expect(ta.slabs).toEqual(a.slabs);
  });

  it("reads a plate as it arrives, tile by tile, however the text is cut", async () => {
    async function* pieces(size) {
      for (let at = 0; at < text.length; at += size) yield text.slice(at, at + size);
    }
    for (const size of [1, 7, 1000, text.length]) {
      const read = [];
      for await (const part of streamPlate(pieces(size))) read.push(part);
      const [streamed, ...streamedTiles] = read;
      expect(streamed).toEqual(header);
      expect(streamedTiles.map((t) => t.coords)).toEqual([[16, 0], [17, 0]]);
      expect(streamedTiles.map((t) => decodePlateTile(streamed, t.text))).toEqual(tiles);
    }
  });

  it("keeps placed objects, working out their ids and sizes", () => {
    const [object] = tiles[0].objects;
    expect(object).toMatchObject({ id: "16.0.0", type: "rock", at: rock.at, yaw: expect.closeTo(1.25, 3), scale: 2.5 });
    expect(object.colors[0].map((c) => Math.round(c * 255))).toEqual([51, 102, 153]);
    expect(object.footprint).toEqual({ circle: 3.75 });
    expect(object.height).toBe(5);
  });

  it("keeps each kind's size in the object table", () => {
    expect(text).toContain("object 0 circle:1.5 2 rock");
    expect(header.sizes[0]).toEqual({ footprint: { circle: 1.5 }, height: 2, fixed: false });
  });

  it("sizes a kind it isn't given from its objects, and keeps structures' heights fixed", () => {
    const hut = { type: "structure:abcd1234", at: [16 * TILE_FT + 8, 8], yaw: 0, scale: 1, footprint: { open: 12 }, height: 9 };
    const big = { type: "boulder", at: [16 * TILE_FT + 30, 8], yaw: 0, scale: 2, footprint: { rect: [4, 6] }, height: 8 };
    const plate = encodePlate([1, 0], "surface", [tileAt([16, 0], { objects: [hut, big] })]);
    expect(plate).toContain("rect:2,3 4 boulder");
    expect(plate).toContain("open:12 =9 structure:abcd1234");
    const objects = decodePlate(plate).tiles[0].objects;
    expect(objects.find((o) => o.type === "boulder")).toMatchObject({ footprint: { rect: [4, 6] }, height: 8 });
    expect(objects.find((o) => o.type === hut.type)).toMatchObject({ footprint: { open: 12 }, height: 9 });
  });

  it("reads version 1 plates, whose objects have no sizes", () => {
    const old = text.replace(/^plate 2 /, "plate 1 ").replace("object 0 circle:1.5 2 rock", "object 0 rock");
    const [object] = decodePlate(old).tiles[0].objects;
    expect(object.type).toBe("rock");
    expect(object.footprint).toBeUndefined();
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
