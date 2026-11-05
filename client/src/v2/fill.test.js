import fs from "fs";
import { describe, expect, it } from "vitest";
import { treeCrown, treeHeight, trunkRadius } from "../render/treeMeshes.js";
import { shapeOf } from "../world/builtObjects.js";
import { BUILTIN_OBJECTS } from "../world/builtinObjects.js";
import { setBuiltObjects, specOf } from "../world/objects.js";
import { BIOME_NAMES } from "./biomes.js";
import { fillSlots } from "./fill.js";
import FILL from "./fill.json";
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
  it("has entries for every biome, each a kind that exists", () => {
    setBuiltObjects([]);
    for (const name of BIOME_NAMES) {
      const sizes = Object.values(FILL.biomes[name] ?? {});
      expect(sizes.length, name).toBeGreaterThan(0);
      for (const entry of sizes.flat()) {
        if (entry.tree) expect(treeHeight(entry.tree, entry.size), `${name} ${entry.tree}`).toBeGreaterThan(0);
        else expect(specOf(entry.object), `${name} ${entry.object}`).toBeDefined();
      }
    }
  });

  it("keeps built objects' shapes in step with their definitions", () => {
    for (const entry of Object.values(FILL.biomes).flatMap((sizes) => Object.values(sizes).flat())) {
      if (!entry.object?.startsWith("built:")) continue;
      const object = BUILTIN_OBJECTS.find((o) => `built:${o.id}` === entry.object);
      const { footprint, height } = shapeOf(object);
      expect(entry.footprint, object.name).toEqual(footprint);
      expect(entry.height, object.name).toBe(height);
      expect(entry.blocksSight, object.name).toBe(object.blocksSight);
    }
  });

  it("gives the game server the same trees", () => {
    const go = fs.readFileSync(new URL("../../../game-server/internal/worlds/fill.go", import.meta.url), "utf8");
    const kinds = new Set(Object.values(FILL.biomes).flatMap((sizes) => Object.values(sizes).flat()).map((e) => e.tree).filter(Boolean));
    const treeKinds = go.slice(go.indexOf("treeKinds = map"));
    const crowns = go.slice(go.indexOf("var treeCrowns"));
    for (const kind of kinds) {
      const [, height, trunk] = new RegExp(`"${kind}": \\{([\\d.]+), ([\\d.]+)\\}`).exec(treeKinds) ?? [];
      expect(Number(height) * 60, kind).toBeCloseTo(treeHeight(kind, 1));
      expect(Number(trunk) * 2.5, kind).toBeCloseTo(trunkRadius(kind, 1));
      const crown = new RegExp(`"${kind}": \\{([\\d.]+), ([\\d.]+), ([\\d.]+)\\}`).exec(crowns);
      const theirs = treeCrown(kind, 1);
      if (!theirs) expect(crown, kind).toBeNull();
      else {
        expect(Number(crown[1]) * treeHeight(kind, 1), kind).toBeCloseTo(theirs.from);
        expect(Number(crown[2]) * treeHeight(kind, 1), kind).toBeCloseTo(theirs.to);
        expect(Number(crown[3]) * 18, kind).toBeCloseTo(theirs.radius);
      }
    }
  });

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

  it("leaves steep ground and deeper water empty", () => {
    const steep = fillSlots(makeSlots(0, 0), 0, 0, () => 1, () => ({ height: 50, slope: 60 }));
    const deep = fillSlots(makeSlots(0, 0), 0, 0, () => 1, () => ({ height: -5, slope: 0, water: { wet: true, level: 0, running: true } }));
    expect(steep.trees.length + steep.objects.length + deep.trees.length + deep.objects.length).toBe(0);
  });

  it("puts boulders and driftwood on banks and in shallows, more by running water, and no trees", () => {
    const count = (water) => fillSlots(makeSlots(0, 0), 0, 0, () => 1, () => ({ height: 1, slope: 0, water }));
    const [bank, shore, shallows] = [count({ wet: false, level: 0, running: true }), count({ wet: false, level: 0, running: false }), count({ wet: true, level: 2, running: true })];
    for (const filled of [bank, shore, shallows]) expect(filled.trees.length).toBe(0);
    expect(new Set(bank.objects.map((o) => o.type))).toContain("boulder");
    expect(bank.objects.length).toBeGreaterThan(shore.objects.length * 3);
    expect(shallows.objects.length).toBeGreaterThan(0);
  });
});
