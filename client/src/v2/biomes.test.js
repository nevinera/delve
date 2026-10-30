import { describe, expect, it } from "vitest";
import { BIOME_NAMES, BiomeMap, REACH_FT, changedBoxes, inside } from "./biomes.js";

const square = (x0, z0, side) => [[x0, z0], [x0 + side, z0], [x0 + side, z0 + side], [x0, z0 + side]];
const name = (map, x, z) => BIOME_NAMES[map.at(x, z)];

describe("inside", () => {
  const ell = [[0, 0], [100, 0], [100, 40], [40, 40], [40, 100], [0, 100]];

  it("finds points inside a polygon", () => {
    expect(inside(square(0, 0, 100), 50, 50)).toBe(true);
    expect(inside(ell, 20, 80)).toBe(true);
  });

  it("leaves points outside it out", () => {
    expect(inside(square(0, 0, 100), 150, 50)).toBe(false);
    expect(inside(ell, 80, 80)).toBe(false);
  });
});

describe("BiomeMap", () => {
  const map = new BiomeMap([
    { biome: "forest", points: square(0, 0, 2000) },
    { biome: "rocky", points: square(500, 500, 500) },
    { biome: "swamp", points: square(4000, 0, 1000) },
  ]);

  it("is plains with no areas", () => {
    expect(name(new BiomeMap(), 10, 10)).toBe("plains");
  });

  it("is the area on top inside them", () => {
    expect(name(map, 100, 100)).toBe("forest");
    expect(name(map, 700, 700)).toBe("rocky");
  });

  it("is the nearest edge's area within a quarter mile, outside them", () => {
    expect(name(map, 1000, -REACH_FT + 10)).toBe("forest");
    expect(name(map, 2900, 500)).toBe("forest");
    expect(name(map, 3100, 500)).toBe("swamp");
  });

  it("is plains past a quarter mile", () => {
    expect(name(map, 1000, -REACH_FT - 10)).toBe("plains");
  });

  it("works out a tile's cells", () => {
    // Tile 7, 0 runs from 1792 to 2048 east: forest, then out past the edge, still forest.
    const cells = new BiomeMap([{ biome: "forest", points: square(0, 0, 2000) }]).tile(7, 0);
    expect(new Set(cells)).toEqual(new Set([1]));
    // Tile 13, 0 is 1328 ft and more past the edge: forest for its first cells only.
    const far = new BiomeMap([{ biome: "forest", points: square(0, 0, 2000) }]).tile(13, 0);
    expect(far[0]).toBe(0);
    expect(new BiomeMap([{ biome: "forest", points: square(0, 0, 2000) }]).tile(12, 0)[0]).toBe(1);
    expect(new BiomeMap([{ biome: "forest", points: square(0, 0, 2000) }]).tile(12, 0)[63]).toBe(0);
  });
});

describe("changedBoxes", () => {
  const a = { biome: "forest", points: square(0, 0, 100) };
  const b = { biome: "rocky", points: square(1000, 0, 100) };

  it("is nothing when nothing changed", () => {
    expect(changedBoxes([a, b], [b, a])).toEqual([]);
  });

  it("is the box of an area added, taken away or changed, grown by a quarter mile", () => {
    expect(changedBoxes([a], [a, b])).toEqual([[1000 - REACH_FT, -REACH_FT, 1100 + REACH_FT, 100 + REACH_FT]]);
    expect(changedBoxes([a, b], [a, { ...b, biome: "swamp" }])).toHaveLength(2);
  });
});

describe("plate files", async () => {
  const { decodePlate, encodePlate } = await import("./plate.js");
  const { bakePlate } = await import("./biomes.js");

  it("keep the biomes baked into them", () => {
    const tile = () => ({ heights: new Float32Array(65 * 65), colors: new Uint8Array(64 * 64 * 3), terrain: new Uint8Array(64 * 64), forest: new Uint8Array(64 * 64) });
    const plate = bakePlate({ coords: [0, 0], palette: ["grass"], tiles: new Map([[0, tile()], [17, tile()]]) }, new BiomeMap([{ biome: "swamp", points: square(0, 0, 300) }]));
    const read = decodePlate(encodePlate(plate));
    expect(read.tiles.get(0).biome[0]).toBe(3);
    expect(read.tiles.get(17).biome[0]).toBe(3);
  });
});
