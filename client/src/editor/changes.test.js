import { describe, it, expect } from "vitest";
import { changedTiles } from "./changes.js";

const square = (x0, z0, x1, z1) => [[[[x0, z0], [x1, z0], [x1, z1], [x0, z1]]]];
// A continent of one 20×20-tile zone, with whatever pins, strokes, rivers and pools.
const continent = ({ region = square(0, 0, 20, 20), pins = [], strokes = [], rivers = [], pools = [] } = {}) => ({ zones: [{ region }], pins, strokes, watercourses: { rivers, pools } });
const has = (tiles, tx, tz) => tiles.has(`${tx},${tz}`);

describe("changedTiles", () => {
  it("finds nothing when nothing changed", () => {
    expect(changedTiles(continent(), continent()).size).toBe(0);
  });

  it("ignores info pins, hubs and roads", () => {
    const after = continent({
      pins: [{ id: "p1", kind: "info", at: [5, 5], name: "Camp" }, { id: "p2", kind: "hub", at: [6, 6], radius: 200 }],
      strokes: [{ id: "s1", kind: "road", points: [[1, 1], [9, 9]], width: 16 }],
    });
    expect(changedTiles(continent(), after).size).toBe(0);
  });

  it("covers every zoned tile when a height pin changes", () => {
    const after = continent({ pins: [{ id: "p1", kind: "height", at: [10.5, 10.5], height: 80 }] });
    const tiles = changedTiles(continent(), after);
    expect(has(tiles, 0, 0)).toBe(true);
    expect(has(tiles, 19, 19)).toBe(true);
  });

  it("covers a river's whole length", () => {
    const river = { points: [[1.5, 10.5], [18.5, 10.5]], width: 30 };
    const tiles = changedTiles(continent(), continent({ rivers: [river] }));
    for (let tx = 1; tx <= 18; tx++) expect(has(tiles, tx, 10)).toBe(true);
    expect(has(tiles, 10, 13)).toBe(false);
  });

  it("covers only the land near a changed river, even with biome pins", () => {
    const pins = [{ id: "b1", kind: "biome", at: [5, 5], biome: "forest" }, { id: "b2", kind: "biome", at: [15, 15], biome: "rocky" }];
    const river = { points: [[1.5, 10.5], [18.5, 10.5]], width: 30 };
    const tiles = changedTiles(continent({ pins }), continent({ pins, rivers: [river] }));
    expect(has(tiles, 10, 10)).toBe(true);
    expect(has(tiles, 10, 13)).toBe(true);
    expect(has(tiles, 10, 2)).toBe(false);
    expect(has(tiles, 10, 18)).toBe(false);
  });

  it("covers the shore around a moved coast, not the whole region", () => {
    const tiles = changedTiles(continent(), continent({ region: square(0, 0, 21, 20) }));
    expect(has(tiles, 20, 10)).toBe(true);
    expect(has(tiles, 17, 10)).toBe(true);
    expect(has(tiles, 5, 10)).toBe(false);
  });

  it("ignores a border moving between two zones when there are no biomes", () => {
    const split = (x) => ({ zones: [{ region: square(0, 0, x, 20) }, { region: square(x, 0, 20, 20) }], pins: [], strokes: [] });
    expect(changedTiles(split(10), split(12)).size).toBe(0);
  });

  it("covers every zoned tile when a biome pin changes", () => {
    const pin = { id: "p1", kind: "biome", at: [5.5, 5.5], biome: "forest" };
    const tiles = changedTiles(continent({ pins: [pin] }), continent({ pins: [{ ...pin, biome: "swamp" }] }));
    expect(has(tiles, 0, 0)).toBe(true);
    expect(has(tiles, 19, 19)).toBe(true);
  });

  it("covers every tile of a brand-new region", () => {
    const triangle = [[[[0, 0], [10, 0], [0, 10]]]];
    const tiles = changedTiles({ zones: [], pins: [], strokes: [] }, continent({ region: triangle }));
    expect(has(tiles, 0, 9)).toBe(true);
    expect(has(tiles, 9, 0)).toBe(true);
  });
});

describe("pool changes", () => {
  const pool = { region: [[[[2.2, 2.2], [2.8, 2.2], [2.8, 2.8], [2.2, 2.8]]]], level: 40 };
  const base = { zones: [], pins: [], strokes: [] };
  const withPools = (pools) => ({ ...base, watercourses: { rivers: [], pools } });

  it("marks the tiles round a new pool", () => {
    const tiles = changedTiles(withPools([]), withPools([pool]));
    expect(tiles.has("2,2")).toBe(true);
    expect(tiles.has("3,3")).toBe(true);
    expect(tiles.has("5,5")).toBe(false);
  });

  it("ignores pools that didn't change", () => {
    expect(changedTiles(withPools([pool]), withPools([structuredClone(pool)])).size).toBe(0);
  });
});
