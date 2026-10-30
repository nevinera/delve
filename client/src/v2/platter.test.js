import { describe, expect, it } from "vitest";
import { CORNERS, decodePlatter, encodePlatter, indexIn, plateIndexIn, platterOf } from "./platter.js";

describe("platter files", () => {
  it("keep each tile's rendition", () => {
    const heights = Float32Array.from({ length: CORNERS * CORNERS }, (_, k) => k * 1.25 - 40);
    const tiles = new Map([[indexIn(-3, 70), { heights, hash: "0123456789abcdef" }]]);
    const plates = new Map([[plateIndexIn(-1, 8), { heights, hash: "fedcba9876543210" }]]);
    const back = decodePlatter(encodePlatter({ coords: platterOf(-3, 70), tiles, plates }));
    expect(back.coords).toEqual([-1, 1]);
    expect([...back.tiles.keys()]).toEqual([indexIn(-3, 70)]);
    const tile = back.tiles.get(indexIn(-3, 70));
    expect([...tile.heights]).toEqual([...heights]);
    expect(tile.hash).toBe("0123456789abcdef");
    expect([...back.plates.keys()]).toEqual([plateIndexIn(-1, 8)]);
    expect(back.plates.get(plateIndexIn(-1, 8)).hash).toBe("fedcba9876543210");
  });

  it("keep each tile's water", () => {
    const heights = new Float32Array(CORNERS * CORNERS);
    const water = { level: new Float32Array(64).fill(NaN), type: new Uint8Array(64) };
    [water.level[9], water.type[9], water.level[10], water.type[10]] = [12.25, 1, -3, 4];
    const tiles = new Map([[0, { heights, hash: "0123456789abcdef", water }], [1, { heights, hash: "0123456789abcdef", water: null }]]);
    const plates = new Map([[0, { heights, hash: "fedcba9876543210" }]]);
    const back = decodePlatter(encodePlatter({ coords: [0, 0], tiles, plates }));
    expect([...back.tiles.get(0).water.level]).toEqual([...water.level]);
    expect([...back.tiles.get(0).water.type]).toEqual([...water.type]);
    expect(back.tiles.get(1).water).toBeNull();
    expect(back.plates.get(0).hash).toBe("fedcba9876543210");
  });

  it("number tiles within their platter", () => {
    expect(indexIn(0, 0)).toBe(0);
    expect(indexIn(-1, 0)).toBe(63);
    expect(indexIn(1, 1)).toBe(65);
  });
});
