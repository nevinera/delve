import { describe, expect, it } from "vitest";
import { BIOME_NAMES, BiomeMap, REACH_FT, WARP_FT, changedBoxes, inside } from "./biomes.js";

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
    expect(name(map, 100, 1800)).toBe("forest");
    expect(name(map, 750, 750)).toBe("rocky");
  });

  it("is the nearest edge's area within a quarter mile, outside them", () => {
    expect(name(map, 1000, -REACH_FT + WARP_FT + 10)).toBe("forest");
    expect(name(map, 2600, 500)).toBe("forest");
    expect(name(map, 3400, 500)).toBe("swamp");
  });

  it("is plains past a quarter mile", () => {
    expect(name(map, 1000, -REACH_FT - WARP_FT - 10)).toBe("plains");
  });

  it("wanders either side of a straight edge", () => {
    // Along the forest's south edge, z = 2000, some places just north are outside it, and some just
    // south inside.
    const rocky = new BiomeMap([{ biome: "rocky", points: square(0, 0, 2000) }, { biome: "forest", points: square(0, 2000, 2000) }]);
    const sides = new Set();
    for (let x = 100; x < 1900; x += 20) sides.add(name(rocky, x, 1970));
    expect(sides).toEqual(new Set(["rocky", "forest"]));
  });

  it("works out a tile's cells as it does places", () => {
    for (const [tx, tz] of [[7, 0], [3, 3], [12, 0], [15, 2]]) {
      const cells = map.tile(tx, tz);
      let wrong = 0;
      for (let k = 0; k < cells.length; k++) if (cells[k] !== map.at(tx * 256 + ((k % 64) + 0.5) * 4, tz * 256 + (Math.floor(k / 64) + 0.5) * 4)) wrong++;
      expect(wrong / cells.length).toBeLessThan(0.02);
    }
  });
});

describe("changedBoxes", () => {
  const a = { biome: "forest", points: square(0, 0, 100) };
  const b = { biome: "rocky", points: square(1000, 0, 100) };

  it("is nothing when nothing changed", () => {
    expect(changedBoxes([a, b], [b, a])).toEqual([]);
  });

  it("is the box of an area added, taken away or changed, grown by a quarter mile and how far places move", () => {
    const grow = REACH_FT + WARP_FT;
    expect(changedBoxes([a], [a, b])).toEqual([[1000 - grow, -grow, 1100 + grow, 100 + grow]]);
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
