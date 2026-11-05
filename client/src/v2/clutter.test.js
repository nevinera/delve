import { describe, expect, it } from "vitest";
import { BIOME_NAMES } from "./biomes.js";
import { CLUTTER } from "../world/clutter.js";
import { placeOf, tileClutter } from "./clutter.js";
import { WATER_TYPES } from "./water.js";

const kinds = (cell) => new Set(tileClutter(0, 0, () => cell, () => cell.height).map((item) => item.kind));

describe("clutter by the water", () => {
  it("sorts cells by the water near them", () => {
    const lake = WATER_TYPES.indexOf("lake");
    expect(placeOf(10, 5, null).size).toBe(0);
    expect([...placeOf(10.5, 5, { wet: false, level: 10, running: true })].sort()).toEqual(["bank", "runningEdge"]);
    expect([...placeOf(12, 5, { wet: false, level: 10, running: false })]).toEqual(["shore"]);
    expect([...placeOf(7, 5, { wet: true, level: 10, type: lake, running: false })].sort()).toEqual(["stillBed", "stillSurface"]);
    expect(placeOf(-5, 5, { wet: true, level: 0, type: WATER_TYPES.indexOf("sea") }).size).toBe(0);
    expect(placeOf(10.5, 60, { wet: false, level: 10, running: true }).size).toBe(0);
  });

  it("puts pebbles on banks, reeds at still water's edge, and lilies on it", () => {
    const plains = BIOME_NAMES.indexOf("plains");
    expect(kinds({ height: 11, slope: 5, biome: plains, water: { wet: false, level: 10, running: true } })).toEqual(new Set(["pebble", "stone"]));
    expect(kinds({ height: 10.5, slope: 5, biome: plains, water: { wet: false, level: 10, running: false } }).has("reeds")).toBe(true);
    const pond = kinds({ height: 8, slope: 0, biome: plains, water: { wet: true, level: 10, type: WATER_TYPES.indexOf("pond"), running: false } });
    expect(pond.has("lily")).toBe(true);
    expect(pond.has("waterweed")).toBe(true);
  });

  it("grows each new biome's own on dry ground, but not on steep ground or under water", () => {
    for (const biome of BIOME_NAMES.slice(4)) {
      const cell = { height: 10, slope: 5, biome: BIOME_NAMES.indexOf(biome), water: null };
      expect(kinds(cell).size, biome).toBeGreaterThan(0);
      for (const kind of kinds(cell)) expect(CLUTTER[kind], kind).toBeDefined();
      expect(kinds({ ...cell, slope: 60 }).size, biome).toBe(0);
    }
    expect(kinds({ height: 10, slope: 5, biome: 0, water: null }).size).toBe(0);
  });

  it("leaves reeds and lilies out of barren biomes", () => {
    const edge = { height: 10.5, slope: 5, water: { wet: false, level: 10, running: false } };
    expect(kinds({ ...edge, biome: BIOME_NAMES.indexOf("glacier") }).has("reeds")).toBe(false);
    expect(kinds({ ...edge, biome: BIOME_NAMES.indexOf("jungle") }).has("reeds")).toBe(true);
  });

  it("floats lilies on the water", () => {
    const items = tileClutter(0, 0, () => ({ height: 8, slope: 0, biome: 3, water: { wet: true, level: 10, type: WATER_TYPES.indexOf("swamp"), running: false } }), () => 8);
    expect(items.filter((item) => item.kind === "lily").every((item) => item.y === 10)).toBe(true);
  });
});
