import { describe, it, expect } from "vitest";
import { decodeTile, encodeTile } from "./tileCodec.js";

function tile(cells) {
  const count = cells * cells;
  return {
    coords: [-3, 7],
    layer: "surface",
    cells,
    cellFt: 8,
    palettes: { terrain: ["grass", "rock"], biome: ["temperate"] },
    generator: { version: 1, seed: 42 },
    layers: {
      height: Float32Array.from({ length: count }, (_, i) => i * 0.25 - 1.5),
      water: Float32Array.from({ length: count }, (_, i) => (i % 2 ? NaN : 0)),
      terrain: Uint8Array.from({ length: count }, (_, i) => i % 2),
      biome: new Uint8Array(count),
      forest: Uint8Array.from({ length: count }, (_, i) => i * 10),
    },
  };
}

describe("tileCodec", () => {
  it("round-trips the manifest and every layer", () => {
    const original = tile(4);
    const decoded = decodeTile(encodeTile(original));
    expect(decoded.coords).toEqual([-3, 7]);
    expect(decoded.palettes).toEqual(original.palettes);
    expect(decoded.generator).toEqual(original.generator);
    for (const name of ["height", "terrain", "biome", "forest"]) {
      expect(Array.from(decoded.layers[name])).toEqual(Array.from(original.layers[name]));
    }
  });

  it("keeps heights below sea level and marks missing water as NaN", () => {
    const decoded = decodeTile(encodeTile(tile(4)));
    expect(decoded.layers.height[0]).toBe(-1.5);
    expect(decoded.layers.water[0]).toBe(0);
    expect(decoded.layers.water[1]).toBeNaN();
  });

  it("rounds heights to quarter feet", () => {
    const t = tile(2);
    t.layers.height[0] = 10.1;
    expect(decodeTile(encodeTile(t)).layers.height[0]).toBe(10);
  });

  it("starts the layers on a 4-byte boundary", () => {
    const bytes = encodeTile(tile(2));
    const jsonLength = new DataView(bytes.buffer).getUint32(4, true);
    expect((bytes.length - 2 * 2 * 4 - 3 * 4) % 4).toBe(0);
    expect(bytes.length).toBeGreaterThan(8 + jsonLength);
  });

  it("rejects files that aren't tiles", () => {
    expect(() => decodeTile(new Uint8Array(16))).toThrow(/not a tile/);
  });
});

describe("tall land", () => {
  it("keeps heights above 16-bit quarter feet", () => {
    const t = {
      coords: [0, 0], layer: "surface", cells: 2, cellFt: 8,
      palettes: { terrain: ["rock"], biome: ["rocky"] },
      generator: {},
      layers: {
        height: Float32Array.from([21120, 20000.25, -40, 0]),
        water: Float32Array.from([NaN, NaN, -2, 0]),
        terrain: new Uint8Array(4), biome: new Uint8Array(4), forest: new Uint8Array(4),
      },
    };
    const back = decodeTile(encodeTile(t));
    expect([...back.layers.height]).toEqual([21120, 20000.25, -40, 0]);
    expect(back.layers.water[0]).toBeNaN();
    expect(back.layers.water[2]).toBe(-2);
  });
});
