import { describe, it, expect } from "vitest";
import { changedTiles } from "./changes.js";
import { LandGrid, PER_TILE } from "../world/landGrid.js";

// 20×20 tiles of land 10ft up, with a point raised (or sunk) at each of `raised` ([gx, gz, h]).
function landOf(raised = []) {
  const land = new LandGrid();
  for (let gz = 0; gz <= 20 * PER_TILE; gz++) for (let gx = 0; gx <= 20 * PER_TILE; gx++) land.set(gx, gz, 10);
  for (const [gx, gz, h] of raised) land.set(gx, gz, h);
  return land;
}
const flat = landOf();
const all = flat.tiles();
// A continent on that land, with whatever pins, paths, rivers and lakes.
const continent = ({ land = flat, pins = [], paths = [], rivers = [], lakes = [] } = {}) => ({ land, pins, paths, water: { rivers, lakes } });
const changed = (before, after) => changedTiles(before, after, all);
const has = (tiles, tx, tz) => tiles.has(`${tx},${tz}`);

describe("changedTiles", () => {
  it("finds nothing when nothing changed", () => {
    expect(changed(continent(), continent()).size).toBe(0);
  });

  it("ignores info pins, hubs and roads without a route", () => {
    const after = continent({
      pins: [{ id: "p1", kind: "info", at: [5, 5], name: "Camp" }, { id: "p2", kind: "hub", at: [6, 6], radius: 200 }, { id: "p3", kind: "road", at: [1, 1] }, { id: "p4", kind: "road", at: [9, 9] }],
      paths: [{ id: "r1", from: "p3", to: "p4", width: 16 }],
    });
    expect(changed(continent(), after).size).toBe(0);
  });

  it("covers the tiles along a road whose route, width or tags change", () => {
    const pins = [{ id: "p3", kind: "road", at: [1.5, 1.5] }, { id: "p4", kind: "road", at: [9.5, 1.5] }];
    const road = (width, tags) => continent({ pins, paths: [{ id: "r1", from: "p3", to: "p4", width, tags, route: { key: "k", points: [[1.5, 1.5], [9.5, 1.5]] } }] });
    const tiles = changed(continent({ pins }), road(12, ["road"]));
    expect(has(tiles, 5, 1)).toBe(true);
    expect(has(tiles, 5, 10)).toBe(false);
    expect(has(changed(road(12, ["road"]), road(12, ["road", "faint"])), 5, 1)).toBe(true);
    expect(changed(road(12, ["road"]), road(12, ["road"])).size).toBe(0);
  });

  it("covers the tiles round a changed land height, and no further", () => {
    const tiles = changed(continent(), continent({ land: landOf([[10 * PER_TILE + 8, 10 * PER_TILE + 8, 50]]) }));
    expect(has(tiles, 10, 10)).toBe(true);
    expect(has(tiles, 11, 11)).toBe(true);
    expect(has(tiles, 13, 10)).toBe(false);
  });

  it("covers a river's whole length", () => {
    const river = { points: [[1.5, 10.5], [18.5, 10.5]], width: 30 };
    const tiles = changed(continent(), continent({ rivers: [river] }));
    for (let tx = 1; tx <= 18; tx++) expect(has(tiles, tx, 10)).toBe(true);
    expect(has(tiles, 10, 13)).toBe(false);
  });

  it("covers only the land near a changed river, even with biome pins", () => {
    const pins = [{ id: "b1", kind: "biome", at: [5, 5], biome: "forest" }, { id: "b2", kind: "biome", at: [15, 15], biome: "rocky" }];
    const river = { points: [[1.5, 10.5], [18.5, 10.5]], width: 30 };
    const tiles = changed(continent({ pins }), continent({ pins, rivers: [river] }));
    expect(has(tiles, 10, 10)).toBe(true);
    expect(has(tiles, 10, 13)).toBe(true);
    expect(has(tiles, 10, 2)).toBe(false);
    expect(has(tiles, 10, 18)).toBe(false);
  });

  it("covers every tile with land when a biome pin changes", () => {
    const pin = { id: "p1", kind: "biome", at: [5.5, 5.5], biome: "forest" };
    const tiles = changed(continent({ pins: [pin] }), continent({ pins: [{ ...pin, biome: "swamp" }] }));
    expect(has(tiles, 0, 0)).toBe(true);
    expect(has(tiles, 19, 19)).toBe(true);
  });
});

describe("lake changes", () => {
  // A hollow 2ft deep around grid point (gx, gz) in tile (2, 2).
  const g = 2.5 * PER_TILE;
  const hollow = landOf([[g, g, 8]]);
  const lake = { id: "l1", seed: [2.5, 2.5], level: 9.5 };

  it("marks the tiles round a new lake", () => {
    const tiles = changed(continent({ land: hollow }), continent({ land: hollow, lakes: [lake] }));
    expect(tiles.has("2,2")).toBe(true);
    expect(tiles.has("3,3")).toBe(true);
    expect(tiles.has("5,5")).toBe(false);
  });

  it("ignores lakes that didn't change", () => {
    expect(changed(continent({ land: hollow, lakes: [lake] }), continent({ land: hollow, lakes: [structuredClone(lake)] })).size).toBe(0);
  });

  it("marks a lake whose shape the land changed", () => {
    const deeper = landOf([[g, g, 8], [g + 1, g, 8]]);
    const tiles = changed(continent({ land: hollow, lakes: [lake] }), continent({ land: deeper, lakes: [lake] }));
    expect(tiles.has("2,2")).toBe(true);
  });
});
