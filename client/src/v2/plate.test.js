import { describe, expect, it } from "vitest";
import { decodePlate, encodePlate } from "./plate.js";
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
