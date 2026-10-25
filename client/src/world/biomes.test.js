import { describe, it, expect } from "vitest";
import { BIOMES, biomeAt, biomesNear, climateAt, prepareBiomes, profileFor } from "./biomes.js";

const at = (b, x, z) => BIOMES[biomeAt(b, x, z).biome];
const forest = { x: 0, z: 0, biome: "forest" };
const swamp = { x: 4000, z: 0, biome: "swamp" };
const plain = (extra = {}, options = { warp: false }) =>
  prepareBiomes({ pins: [forest, swamp], rivers: [], edges: [], seed: 1, ...extra }, options);

describe("biomes", () => {
  it("is plains everywhere without biome pins", () => {
    expect(at(prepareBiomes({ pins: [], rivers: [], edges: [], seed: 1 }), 100, 100)).toBe("plains");
  });

  it("splits the land halfway between pins without warp", () => {
    const b = plain();
    expect(at(b, 1900, 300)).toBe("forest");
    expect(at(b, 2100, -300)).toBe("swamp");
    expect(biomeAt(b, 1900, 0).gap).toBeCloseTo(200);
  });

  it("snaps the border onto a river near it", () => {
    const b = plain({ rivers: [[[2600, -5000], [2600, 5000]]] });
    expect(at(b, 2300, 0)).toBe("forest");
    expect(at(b, 2700, 0)).toBe("swamp");
  });

  it("keeps a pin's cells within its margin, even across a river", () => {
    const b = plain({ rivers: [[[4200, -5000], [4200, 5000]]] });
    expect(at(b, 4300, 0)).toBe("swamp");
  });

  it("gives the same answers with segments narrowed to a tile", () => {
    const b = plain({ rivers: [[[2600, -5000], [2600, 5000]]], edges: [[2000, -5000, 2000, 5000]] }, {});
    const near = biomesNear(b, [2048, -512, 2560, 0]);
    for (let x = 2048; x < 2560; x += 64) expect(at(near, x, -100)).toBe(at(b, x, -100));
  });

  it("lets tags adjust a biome's profile", () => {
    expect(profileFor("forest", ["flat"]).amp).toBeLessThan(profileFor("forest").amp);
    expect(profileFor("forest", ["dense"]).trees).toBeGreaterThan(profileFor("forest").trees);
    expect(profileFor("rocky", ["ravines"]).ravines).toBe(1);
  });

  it("blends profiles across a border, evenly right on it", () => {
    const b = plain();
    const inside = climateAt(b, 500, 0);
    expect(inside.weight).toBe(1);
    expect(inside.profile.pools).toBe(0);
    const border = climateAt(b, 2001, 0);
    expect(border.weight).toBeCloseTo(0.5, 1);
    expect(border.profile.pools).toBeCloseTo(0.5, 1);
  });

  it("wanders with the warp, but never within a tile of a pin", () => {
    const b = plain({}, {});
    // Where the border crosses each east-west line between the pins.
    const crossings = [];
    for (let z = -3000; z <= 3000; z += 250) {
      let x = 0;
      while (x < 4000 && at(b, x, z) === "forest") x += 25;
      crossings.push(x);
    }
    expect(Math.max(...crossings) - Math.min(...crossings)).toBeGreaterThan(500);
    for (let a = 0; a < 6.28; a += 0.3) {
      expect(at(b, Math.cos(a) * 500, Math.sin(a) * 500)).toBe("forest");
      expect(at(b, 4000 + Math.cos(a) * 500, Math.sin(a) * 500)).toBe("swamp");
    }
  });
});
