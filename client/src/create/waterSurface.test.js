import { describe, expect, it } from "vitest";
import { BIOME_NAMES } from "../v2/biomes.js";
import { WATER_TYPES } from "../v2/water.js";
import { WATER_LOOKS, waterLookOf } from "./waterSurface.js";

describe("how water looks", () => {
  const lake = WATER_TYPES.indexOf("lake");

  it("goes by its type where a biome doesn't change it", () => {
    expect(waterLookOf(lake, BIOME_NAMES.indexOf("plains"))).toEqual(WATER_LOOKS.lake);
  });

  it("freezes or burns in the biomes that say so", () => {
    expect(waterLookOf(lake, BIOME_NAMES.indexOf("snowfield")).still).toBe(1);
    expect(waterLookOf(WATER_TYPES.indexOf("river"), BIOME_NAMES.indexOf("volcanic waste")).emissive).toBeGreaterThan(0);
  });
});
