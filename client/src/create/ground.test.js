import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { TILE_FT } from "../v2/sizes.js";
import { COARSE, COARSE_TILES, FINE, FINE_TILES, FULL, FULL_TILES, Ground, PLATE } from "./ground.js";

// Flat ground at `height` everywhere, its plate files there but never read.
const flat = (height = 0) => {
  const rendition = { heights: new Float32Array(81).fill(height), colors: new Uint8Array(192) };
  return { tile: () => rendition, plate: () => rendition, hasCells: () => true, cells: () => null };
};

describe("Ground tiers", () => {
  const ground = new Ground(new THREE.Scene(), flat(), null);
  ground.anchor = [0, 0, 0];

  it("draws tiles in squares round the builder's tile", () => {
    expect(ground.tier(FULL_TILES, -FULL_TILES)).toBe(FULL);
    expect(ground.tier(FULL_TILES + 1, 0)).toBe(FINE);
    expect(ground.tier(-FINE_TILES, FINE_TILES)).toBe(FINE);
    expect(ground.tier(0, FINE_TILES + 1)).toBe(COARSE);
    expect(ground.tier(COARSE_TILES, COARSE_TILES)).toBe(COARSE);
    expect(ground.tier(COARSE_TILES + 1, 0)).toBe(PLATE);
  });

  it("counts how high the builder is over the ground", () => {
    ground.anchor = [0, FINE_TILES + 1, 0];
    expect(ground.tier(0, 0)).toBe(COARSE);
    ground.anchor = [0, 0, 0];
  });

  it("draws ground without cells from its rendition", () => {
    const bare = new Ground(new THREE.Scene(), { ...flat(), hasCells: () => false }, null);
    bare.anchor = [0, 0, 0];
    expect(bare.tier(0, 0)).toBe(COARSE);
  });

  it("changes what's drawn only once the builder leaves their tile", () => {
    const g = new Ground(new THREE.Scene(), flat(), null);
    g.update(TILE_FT / 2, 10, TILE_FT / 2);
    const planned = g.wanted;
    g.update(TILE_FT + 20, 10, TILE_FT / 2);
    expect(g.wanted).toBe(planned);
    g.update(TILE_FT + 40, 10, TILE_FT / 2);
    expect(g.wanted).not.toBe(planned);
    expect(g.anchor).toEqual([1, 0, 0]);
  });
});
