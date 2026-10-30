import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { TILE_FT } from "../v2/sizes.js";
import { encodePlate } from "../v2/plate.js";
import { COARSE, COARSE_TILES, FINE, FINE_TILES, FULL, FULL_TILES, Ground, PLATE, Renditions } from "./ground.js";

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

describe("Renditions", () => {
  it("reads a plate file when its cells are wanted, and says when it has", () => {
    const renditions = new Renditions();
    const tile = { heights: new Float32Array(65 * 65).fill(12), colors: new Uint8Array(64 * 64 * 3), terrain: new Uint8Array(64 * 64), forest: new Uint8Array(64 * 64) };
    renditions.addPlate([0, 0], encodePlate({ coords: [0, 0], palette: ["grass"], tiles: new Map([[0, tile]]) }));
    let reads = 0;
    renditions.onRead = () => reads++;
    expect(renditions.hasCells(0, 0)).toBe(true);
    expect(reads).toBe(1);
    expect(renditions.cells(0, 0).palette).toEqual(["grass"]);
    expect(renditions.heightAt(10, 10)).toBe(12);
    expect(renditions.hasCells(9, 0)).toBe(false);
  });
});
