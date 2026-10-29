import { gunzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { CELLS } from "../world/constants.js";
import { encodePlate } from "../world/plateCodec.js";
import { decodeTile } from "../world/tileCodec.js";
import { KEEP, MemoryStore, PlateCache } from "./plateCache.js";

const tileAt = ([tx, tz]) => {
  const layer = (Type, v) => new Type(CELLS * CELLS).fill(v);
  return {
    coords: [tx, tz],
    layer: "surface",
    cells: CELLS,
    cellFt: 8,
    palettes: { terrain: ["grass"], biome: ["plains"], water: ["sea", "fresh"] },
    objects: [],
    layers: {
      height: layer(Float64Array, 10),
      water: layer(Float64Array, NaN),
      waterKind: layer(Uint8Array, 0),
      terrain: layer(Uint8Array, 0),
      biome: layer(Uint8Array, 0),
      forest: layer(Uint8Array, 0),
      clutter: layer(Uint8Array, 100),
    },
  };
};

const text = encodePlate([0, 0], "surface", [tileAt([0, 0]), tileAt([1, 0])]);
async function* inPieces() {
  for (let at = 0; at < text.length; at += 500) yield text.slice(at, at + 500);
}

describe("the plate cache", () => {
  it("stores a plate's tiles as it reads them, and gives them back after without reading", async () => {
    const cache = new PlateCache(new MemoryStore());
    let reads = 0;
    const read = async () => (reads++, inPieces());
    const tiles = await cache.tiles("abc", read);
    expect(tiles.map(([key]) => key)).toEqual(["0,0", "1,0"]);
    expect(decodeTile(gunzipSync(tiles[1][1])).coords).toEqual([1, 0]);
    expect(await cache.tiles("abc", read)).toEqual(tiles);
    expect(reads).toBe(1);
  });

  it("reads a plate again that was cut off partway", async () => {
    const cache = new PlateCache(new MemoryStore());
    async function* cutOff() {
      yield text.slice(0, text.length / 2);
      throw new Error("connection lost");
    }
    await expect(cache.tiles("abc", async () => cutOff())).rejects.toThrow("connection lost");
    expect(await cache.store.plate("abc")).toBeNull();
    expect(await cache.tiles("abc", async () => inPieces())).toHaveLength(2);
  });

  it(`keeps the ${KEEP} plates used last`, async () => {
    let clock = 0;
    const cache = new PlateCache(new MemoryStore(), () => clock++);
    for (let n = 0; n < KEEP; n++) await cache.tiles(`p${n}`, async () => inPieces());
    await cache.tiles("p0", async () => inPieces()); // used again, so it's kept
    await cache.tiles("new", async () => inPieces());
    const kept = (await cache.store.plates()).map((p) => p.hash);
    expect(kept).toHaveLength(KEEP);
    expect(kept).toContain("p0");
    expect(kept).toContain("new");
    expect(kept).not.toContain("p1");
    expect(cache.store.files.has("p1 0,0")).toBe(false);
  });
});
