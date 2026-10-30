import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { TILE_FT } from "../v2/sizes.js";
import { decodePlate, encodePlate } from "../v2/plate.js";
import { decodePlatter, encodePlatter } from "../v2/platter.js";
import { CELLS, CHUNKS, TILES } from "./geo.js";
import { COARSE, COARSE_TILES, EMPTY_FT, FINE, FINE_TILES, FULL, FULL_TILES, Ground, PLATE, Renditions } from "./ground.js";

// Flat ground at `height` everywhere, its plate files there but never read.
const flat = (height = 0) => {
  const rendition = { heights: new Float32Array(81).fill(height) };
  return { tile: () => rendition, plate: () => rendition, hasCells: () => true, cells: () => null, heightAt: () => height, biomes: { at: () => 0 }, biomeTile: () => new Uint8Array(64 * 64), looks: 0, wetPlates: new Set() };
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
    // 13 of 17 samples each way round the plate's corner are in the raised square.
    expect(renditions.plate(0, 0).heights[0]).toBeCloseTo(10 + 5 * (13 / 17) ** 2);
  });

  it("moves coarser renditions by the average move round each corner", () => {
    const renditions = world();
    // 5 ft over a circle 105 ft across round the plate's and tile's corner at (0, 0).
    const disc = (x, z) => (Math.hypot(x, z) < 105 ? 5 : 0);
    renditions.raise(disc, [-105, -105, 105, 105], CELLS);
    // The circle's about half the 256 ft square round the corner.
    expect(renditions.plate(0, 0).heights[0] - 10).toBeGreaterThan(2);
    expect(renditions.plate(0, 0).heights[0] - 10).toBeLessThan(3.2);
    expect(renditions.tile(0, 0).heights[0]).toBe(15);
  });

  it("gives the files whose ground moved, with the moves in", () => {
    const renditions = world();
    renditions.raise(up, [0, 0, 64, 64], CHUNKS);
    const files = renditions.changedFiles("main");
    expect([...files.keys()].sort()).toEqual(["places/continents/main/plates/0_0.plate", "places/continents/main/platters/0_0.platter"]);
    expect(decodePlate(files.get("places/continents/main/plates/0_0.plate")).tiles.get(0).heights[0]).toBe(15);
    expect(decodePlatter(files.get("places/continents/main/platters/0_0.platter")).tiles.get(0).heights[0]).toBe(15);
    expect(world().changedFiles("main").size).toBe(0);
  });

  it("bakes water into the plates its bodies change", () => {
    const renditions = world();
    const pond = { type: "pond", level: 1000, points: [[10, 10], [50, 10], [50, 50], [10, 50]] };
    expect([...renditions.setWater({ bodies: [pond], courses: [] })]).toEqual(["0,0"]);
    const { water } = decodePlate(renditions.changedFiles("main").get("places/continents/main/plates/0_0.plate")).tiles.get(0);
    expect(water.level[4 * 64 + 4]).toBe(1000);
    expect(Number.isNaN(water.level[0])).toBe(true);
  });

  it("carves courses' channels, and fills them in again when they move", () => {
    const renditions = world();
    renditions.cells(0, 0);
    const stream = { type: "stream", points: [[0, 128, 6], [256, 128, 6]], surface: [9, 9] };
    renditions.setWater({ bodies: [], courses: [stream] });
    // Its bed 1.5 ft under its surface in its middle, the ground beside it as it was.
    expect(renditions.heightAt(100, 128)).toBeCloseTo(7.5);
    expect(renditions.baseAt(100, 128)).toBeCloseTo(10);
    expect(renditions.heightAt(100, 200)).toBe(10);
    renditions.setWater({ bodies: [], courses: [{ ...stream, points: [[0, 64, 6], [256, 64, 6]] }] });
    expect(renditions.heightAt(100, 128)).toBeCloseTo(10);
    expect(renditions.heightAt(100, 64)).toBeCloseTo(7.5);
    const { water, cut } = decodePlate(renditions.changedFiles("main").get("places/continents/main/plates/0_0.plate")).tiles.get(0);
    expect(cut[16 * 65 + 25]).toBeCloseTo(2.5);
    expect(water.level[16 * 64 + 25]).toBe(9);
  });

  it("moves plate files read later by what was kept", () => {
    const renditions = world();
    // up() everywhere west and north of (64, 64), the ring of corners round the tile too.
    renditions.raise(up, [-64, -64, 64, 64], CHUNKS);
    expect(renditions.heightAt(0, 0)).toBe(15);
    renditions.cells(0, 0);
    expect(renditions.cells(0, 0).heights[0]).toBe(15);
    expect(renditions.heightAt(16, 16)).toBe(15);
    expect(renditions.heightAt(200, 200)).toBe(10);
  });

  it("curves moves between corners, without creases where tiles meet", () => {
    const renditions = world();
    // A slope rising 1 ft a foot west to east, worked out on chunk corners, then the cells read.
    renditions.raise((x) => x, [-64, -64, 320, 320], CHUNKS);
    renditions.cells(0, 0);
    const h = (x) => renditions.heightAt(x, 100) - 10;
    // Straight between corners, a straight slope stays straight.
    expect(h(20)).toBeCloseTo(20);
    // A bend: up 0 to x = 64, then 1 ft a foot.
    const bent = world();
    bent.raise((x) => Math.max(0, x - 64), [-64, -64, 320, 320], CHUNKS);
    bent.cells(0, 0);
    const g = (x) => bent.heightAt(x, 100) - 10;
    // Curved round the bend, never dipping below the flat ground before it.
    expect(g(48)).toBe(0);
    expect(g(56)).toBe(0);
    expect(g(72)).toBeGreaterThan(0);
    expect(g(72)).toBeLessThan(8);
  });
});

describe("raising the empty sea floor", () => {
  const up = () => 30;

  it("makes tiles of sea floor where it's moved, at every level", () => {
    for (const level of [CELLS, CHUNKS, TILES]) {
      const renditions = new Renditions();
      expect(renditions.heightAt(-256, 256)).toBeNull();
      // Round the corner where tiles (-2, 0), (-1, 0), (-2, 1) and (-1, 1) meet.
      expect(renditions.raise(up, [-260, 250, -250, 260], level)).toEqual(new Set(["-1,0"]));
      expect(renditions.tile(-2, 1).heights[8]).toBe(EMPTY_FT + 30);
      expect(renditions.tile(-2, 1).heights[0]).toBe(EMPTY_FT);
      expect(renditions.plate(-1, 0)).not.toBeNull();
      expect(renditions.hasCells(-2, 1)).toBe(true);
      expect(renditions.heightAt(-256, 256)).toBeCloseTo(EMPTY_FT + 30);
      expect(renditions.cells(-2, 1).kinds).toHaveLength(64 * 64);
      expect(renditions.tile(5, 5)).toBeNull();
    }
  });

  it("gives files for the tiles it made", () => {
    const renditions = new Renditions();
    renditions.raise(up, [0, 0, 64, 64], CELLS);
    const files = renditions.changedFiles("main");
    expect(decodePlate(files.get("places/continents/main/plates/0_0.plate")).tiles.get(0).heights[0]).toBe(EMPTY_FT + 30);
    expect(decodePlatter(files.get("places/continents/main/platters/0_0.platter")).tiles.get(0).heights[0]).toBe(EMPTY_FT + 30);
  });
});

describe("clearing the ground away", () => {
  const up = () => 30;

  it("takes away the tiles in reach, and their plates and platters when they're left with none", () => {
    const renditions = new Renditions();
    renditions.raise(up, [0, 0, 600, 100], CELLS); // tiles (0, 0) to (2, 0)
    expect(renditions.clear(128, 128, 260)).toEqual(new Set(["0,0"]));
    expect(renditions.tile(0, 0)).toBeNull();
    expect(renditions.tile(1, 0)).toBeNull();
    expect(renditions.tile(2, 0)).not.toBeNull();
    expect(renditions.heightAt(100, 100)).toBeNull();
    expect(renditions.cells(2, 0)).not.toBeNull();
    expect(renditions.clear(640, 128, 1)).toEqual(new Set(["0,0"]));
    expect(renditions.plate(0, 0)).toBeNull();
    expect(renditions.platters.size).toBe(0);
    const files = renditions.changedFiles("main");
    expect(files.get("places/continents/main/plates/0_0.plate")).toBeNull();
    expect(files.get("places/continents/main/platters/0_0.platter")).toBeNull();
  });

  it("leaves cleared tiles out of plate files read later, till they're made again", () => {
    const renditions = new Renditions();
    renditions.raise(up, [0, 0, 600, 100], CELLS);
    const files = renditions.changedFiles("main");
    const fresh = new Renditions();
    fresh.platters.set("0,0", decodePlatter(files.get("places/continents/main/platters/0_0.platter")));
    fresh.plateFiles.set("0,0", files.get("places/continents/main/plates/0_0.plate"));
    fresh.clear(128, 128, 1);
    fresh.decoded.clear();
    expect(fresh.readNow("0,0").tiles.has(0)).toBe(false);
    fresh.raise(up, [0, 0, 64, 64], CELLS);
    expect(fresh.cells(0, 0)).not.toBeNull();
  });
});
