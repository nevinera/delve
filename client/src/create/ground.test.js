import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { TILE_FT } from "../v2/sizes.js";
import { encodePlate } from "../v2/plate.js";
import { encodePlatter } from "../v2/platter.js";
import { CELLS, CHUNKS } from "./geo.js";
import { COARSE, COARSE_TILES, FINE, FINE_TILES, FULL, FULL_TILES, Ground, PLATE, Renditions } from "./ground.js";

// Flat ground at `height` everywhere, its plate files there but never read.
const flat = (height = 0) => {
  const rendition = { heights: new Float32Array(81).fill(height), colors: new Uint8Array(192) };
  return { tile: () => rendition, plate: () => rendition, hasCells: () => true, cells: () => null, heightAt: () => height };
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

  it("leaves out tiers narrower than twice the builder's height over the ground", () => {
    const g = new Ground(new THREE.Scene(), flat(100), null);
    const at = (above) => g.finestAt(0, 100 + above, 0);
    expect(at(((2 * FULL_TILES + 1) * TILE_FT) / 2 - 1)).toBe(FULL);
    expect(at(((2 * FULL_TILES + 1) * TILE_FT) / 2 + 1)).toBe(FINE);
    expect(at(((2 * FINE_TILES + 1) * TILE_FT) / 2 + 1)).toBe(COARSE);
    expect(at(((2 * COARSE_TILES + 1) * TILE_FT) / 2 + 1)).toBe(PLATE);
    g.anchor = [0, 0, 0];
    g.finest = COARSE;
    expect(g.tier(0, 0)).toBe(COARSE);
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

describe("raising the ground", () => {
  // A plate at (0, 0) with one tile, all at height 10.
  const world = () => {
    const renditions = new Renditions();
    const rendition = () => ({ heights: new Float32Array(81).fill(10), colors: new Uint8Array(192), hash: "0000000000000000" });
    renditions.addPlatter(encodePlatter({ coords: [0, 0], tiles: new Map([[0, rendition()]]), plates: new Map([[0, rendition()]]) }));
    const tile = { heights: new Float32Array(65 * 65).fill(10), colors: new Uint8Array(64 * 64 * 3), terrain: new Uint8Array(64 * 64), forest: new Uint8Array(64 * 64) };
    renditions.addPlate([0, 0], encodePlate({ coords: [0, 0], palette: ["grass"], tiles: new Map([[0, tile]]) }));
    return renditions;
  };
  const up = (x, z) => (x <= 64 && z <= 64 ? 5 : 0);

  it("moves the cells, and the tile's and plate's renditions where their corners are", () => {
    const renditions = world();
    renditions.cells(0, 0);
    expect(renditions.raise(up, [0, 0, 64, 64], CELLS)).toEqual(new Set(["0,0"]));
    expect(renditions.heightAt(32, 32)).toBe(15);
    expect(renditions.heightAt(100, 100)).toBe(10);
    expect(renditions.tile(0, 0).heights[0]).toBe(15);
    expect(renditions.tile(0, 0).heights[3]).toBe(10);
    expect(renditions.plate(0, 0).heights[0]).toBe(15);
  });

  it("moves plate files read later by what was kept", () => {
    const renditions = world();
    renditions.raise(up, [0, 0, 64, 64], CHUNKS);
    expect(renditions.heightAt(0, 0)).toBe(15);
    renditions.cells(0, 0);
    expect(renditions.cells(0, 0).heights[0]).toBe(15);
    expect(renditions.heightAt(16, 16)).toBe(15);
    expect(renditions.heightAt(200, 200)).toBe(10);
  });
});
