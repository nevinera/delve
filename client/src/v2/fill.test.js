import { describe, expect, it } from "vitest";
import { BIOME_NAMES } from "./biomes.js";
import { fillSlots } from "./fill.js";
import { makeSlots } from "./slots.js";

// What fills `tiles` tiles all of one biome, on flat ground.
const count = (biome, tiles = 100) => {
  const index = BIOME_NAMES.indexOf(biome);
  let [trees, objects] = [0, 0];
  for (let t = 0; t < tiles; t++) {
    const filled = fillSlots(makeSlots(t, 7), t, 7, () => index, () => ({ height: 50, slope: 0 }));
    trees += filled.trees.length;
    objects += filled.objects.length;
  }
  return { trees: trees / tiles, objects: objects / tiles };
};

describe("filling slots", () => {
  it("leaves plains sparse, a lone tree every few tiles", () => {
    const { trees } = count("plains");
    expect(trees).toBeGreaterThan(0.1);
    expect(trees).toBeLessThan(0.8);
  });

  it("fills forests thickly", () => {
    expect(count("forest", 20).trees).toBeGreaterThan(8);
  });

  it("leaves ground under water empty", () => {
    const under = fillSlots(makeSlots(0, 0), 0, 0, () => 1, () => ({ height: 50, slope: 0, water: { wet: true, level: 52, type: 1 } }));
    expect(under.trees.length + under.objects.length).toBe(0);
  });

  it("leaves steep ground and the shore empty", () => {
    const steep = fillSlots(makeSlots(0, 0), 0, 0, () => 1, () => ({ height: 50, slope: 60 }));
    const shore = fillSlots(makeSlots(0, 0), 0, 0, () => 1, () => ({ height: 1, slope: 0, water: { wet: false, level: 0 } }));
    expect(steep.trees.length + steep.objects.length + shore.trees.length + shore.objects.length).toBe(0);
  });
});
