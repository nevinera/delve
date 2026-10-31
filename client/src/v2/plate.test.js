import { describe, expect, it } from "vitest";
import { decodePlate, encodePlate } from "./plate.js";
import { encodeBinaryPlate } from "./plateBinary.js";
import { makeSlots } from "./slots.js";
import { dryWater } from "./water.js";

const tile = (water) => ({ heights: new Float32Array(65 * 65), terrain: new Uint8Array(64 * 64), biome: new Uint8Array(64 * 64), water });
const roundTrip = (tiles) => decodePlate(encodePlate({ coords: [0, 0], palette: [], tiles: new Map(tiles) })).tiles;

describe("plate files' water", () => {
  it("reads back dry tiles as having none", () => {
    expect(roundTrip([[0, tile(null)], [1, tile(dryWater(4096))]]).get(1).water).toBeNull();
  });

  it("keeps each cell's level and type, whichever way its chunk is kept", () => {
    const water = dryWater(4096);
    // Chunk 0 all one level (sea), chunk 1 a shore, chunk 2 two types meeting.
    for (let j = 0; j < 8; j++) {
      for (let i = 0; i < 8; i++) water.level[j * 64 + i] = 0;
      for (let i = 8; i < 13; i++) [water.level[j * 64 + i], water.type[j * 64 + i]] = [12.25, 2];
      for (let i = 16; i < 24; i++) [water.level[j * 64 + i], water.type[j * 64 + i]] = i < 20 ? [0, 0] : [0.5 + j / 4, 4];
    }
    const read = roundTrip([[5, tile(water)]]).get(5).water;
    expect([...read.level]).toEqual([...water.level]);
    expect([...read.type]).toEqual([...water.type]);
  });

  it("keeps a chunk at one level small", () => {
    const water = dryWater(4096);
    water.level.fill(-3);
    const size = (w) => encodePlate({ coords: [0, 0], palette: [], tiles: new Map([[0, tile(w)]]) }).length;
    expect(size(water) - size(null)).toBeLessThan(100);
  });
});

describe("plate files' cuts", () => {
  it("keep how far courses cut each corner, and none where they cut nothing", () => {
    const cut = new Float32Array(65 * 65);
    cut[70] = 3.25;
    const tiles = roundTrip([[0, { ...tile(null), cut }], [1, { ...tile(null), cut: new Float32Array(65 * 65) }], [2, tile(null)]]);
    expect(tiles.get(0).cut[70]).toBe(3.25);
    expect(tiles.get(1).cut).toBeNull();
    expect(tiles.get(2).cut).toBeNull();
  });
});

describe("plate files", () => {
  const heights = (f) => Float32Array.from({ length: 65 * 65 }, (_, k) => f(k % 65, Math.floor(k / 65)));

  it("keep heights, biomes and slots, and leave out what was painted", () => {
    const biome = new Uint8Array(64 * 64);
    biome.fill(1, 100, 900);
    biome.fill(3, 2000);
    const terrain = new Uint8Array(64 * 64).fill(2);
    const tiles = new Map([
      [0, { ...tile(null), heights: heights((x, z) => x * 0.5 - z * 0.25), biome, terrain }],
      [9, { ...tile(null), heights: heights((x) => (x > 30 ? 1500 : -40)) }],
    ]);
    const back = decodePlate(encodePlate({ coords: [2, -1], palette: ["path"], tiles }));
    expect(back.coords).toEqual([2, -1]);
    expect([...back.tiles.get(0).heights]).toEqual([...tiles.get(0).heights]);
    expect([...back.tiles.get(9).heights]).toEqual([...tiles.get(9).heights]);
    expect([...back.tiles.get(0).biome]).toEqual([...biome]);
    expect(back.tiles.get(0).terrain.every((v) => !v)).toBe(true);
    // Slots from the tile's coordinates, as made, kept as a seed.
    expect([...back.tiles.get(9).slots]).toEqual([...makeSlots(17, -7)]);
    expect(back.tiles.get(9).slotSeed).toEqual([17, -7]);
  });

  it("keep a tile's slot seed with it, and slots no seed made as they are", () => {
    const moved = { ...tile(null), slots: makeSlots(40, 41), slotSeed: [40, 41] };
    const own = { ...tile(null), slots: makeSlots(0, 0).slice(0, 40) };
    const lines = new TextDecoder().decode(encodePlate({ coords: [0, 0], tiles: new Map([[0, moved], [1, own]]) })).split("\n");
    expect(lines).toContain("s s1 40 41");
    const back = decodePlate(encodePlate({ coords: [0, 0], tiles: new Map([[0, moved], [1, own]]) }));
    expect([...back.tiles.get(0).slots]).toEqual([...makeSlots(40, 41)]);
    expect([...back.tiles.get(1).slots]).toEqual([...own.slots]);
  });

  it("read plate files from before they were text", () => {
    const old = encodeBinaryPlate({ coords: [1, 1], palette: [], tiles: new Map([[3, { ...tile(null), heights: heights((x) => x) }]]) });
    const back = decodePlate(old);
    expect(back.tiles.get(3).heights[64]).toBe(64);
    expect([...decodePlate(encodePlate(back)).tiles.get(3).heights]).toEqual([...back.tiles.get(3).heights]);
  });
});
