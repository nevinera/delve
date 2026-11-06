import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { TILE_FT } from "../v2/sizes.js";
import { trackOf } from "../v2/courses.js";
import { roadTrack } from "../v2/roads.js";
import { decodePlate, encodePlate } from "../v2/plate.js";
import { loadZipper } from "../v2/zstd.js";
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
    // Ground painted by hand isn't kept in plate files.
    expect(renditions.cells(0, 0).palette).toEqual([]);
    expect(renditions.heightAt(10, 10)).toBe(12);
    expect(renditions.hasCells(9, 0)).toBe(false);
  });

  it("fetches a plate file again a little after it couldn't", async () => {
    const renditions = new Renditions();
    const tile = { heights: new Float32Array(65 * 65).fill(12), colors: new Uint8Array(64 * 64 * 3), terrain: new Uint8Array(64 * 64), forest: new Uint8Array(64 * 64) };
    renditions.plate = () => ({}); // the platter has the plate
    const bytes = encodePlate({ coords: [0, 0], palette: ["grass"], tiles: new Map([[0, tile]]) });
    let tries = 0;
    renditions.fetchPlate = async () => (++tries === 1 ? Promise.reject(new Error("offline")) : bytes);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    expect(renditions.hasCells(0, 0)).toBe(false);
    await new Promise((done) => setTimeout(done));
    expect(renditions.hasCells(0, 0)).toBe(false);
    expect(tries).toBe(1);
    now = 6000;
    renditions.hasCells(0, 0);
    await new Promise((done) => setTimeout(done));
    expect(tries).toBe(2);
    expect(renditions.hasCells(0, 0)).toBe(true);
    vi.restoreAllMocks();
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
    const stream = { type: "stream", points: [[0, 128, 6], [256, 128, 6]], surface: [9, 9], seed: 1 };
    // Where its track crosses x = 100.
    const on = (course) => {
      const track = trackOf(course.points, course.seed);
      const k = track.x.findIndex((x) => x >= 100);
      return [track.x[k], track.z[k]];
    };
    renditions.setWater({ bodies: [], courses: [stream] });
    // Its bed under its surface in its middle, the ground beside it as it was.
    const [x, z] = on(stream);
    expect(renditions.heightAt(x, z)).toBeLessThan(8.5);
    expect(renditions.baseAt(x, z)).toBeCloseTo(10);
    expect(renditions.heightAt(100, 200)).toBe(10);
    const moved = { ...stream, points: [[0, 64, 6], [256, 64, 6]] };
    renditions.setWater({ bodies: [], courses: [moved] });
    expect(renditions.heightAt(x, z)).toBeCloseTo(10);
    const [mx, mz] = on(moved);
    expect(renditions.heightAt(mx, mz)).toBeLessThan(8.5);
    const { water, cut } = decodePlate(renditions.changedFiles("main").get("places/continents/main/plates/0_0.plate")).tiles.get(0);
    expect(cut[Math.round(mz / 4) * 65 + Math.round(mx / 4)]).toBeGreaterThan(1);
    expect(water.level[Math.floor(mz / 4) * 64 + Math.floor(mx / 4)]).toBe(9);
  });

  it("puts the ground where roads have it, and back when they're taken away", () => {
    const renditions = world();
    renditions.cells(0, 0);
    // A road on a bank 2 ft over the flat ground, at 12.
    const road = { kind: "road", points: [[20, 128, 14], [236, 128, 14]], seed: 1, bed: Array(40).fill(12) };
    renditions.setRoads({ roads: [road] });
    const track = roadTrack(road.points, road.kind, road.seed);
    const k = track.x.findIndex((x) => x >= 128);
    expect(renditions.heightAt(track.x[k], track.z[k])).toBeCloseTo(12);
    expect(renditions.baseAt(track.x[k], track.z[k])).toBeCloseTo(10);
    expect(renditions.heightAt(128, 200)).toBe(10);
    const { cut } = decodePlate(renditions.changedFiles("main").get("places/continents/main/plates/0_0.plate")).tiles.get(0);
    expect(cut[Math.round(track.z[k] / 4) * 65 + Math.round(track.x[k] / 4)]).toBeCloseTo(-2);
    renditions.setRoads({ roads: [] });
    expect(renditions.heightAt(track.x[k], track.z[k])).toBeCloseTo(10);
  });

  it("marks the cells under roads, saves them, and clears them when the road goes", () => {
    const renditions = world();
    renditions.cells(0, 0);
    const road = { kind: "trail", points: [[20, 128, 6], [236, 128, 6]], seed: 1, bed: Array(40).fill(10) };
    renditions.setRoads({ roads: [road] });
    const saved = () => decodePlate(renditions.changedFiles("main").get("places/continents/main/plates/0_0.plate")).tiles.get(0).road;
    const on = saved();
    const count = on.reduce((n, v) => n + (v ? 1 : 0), 0);
    // About 6 ft wide and 216 ft long, in 4 ft cells.
    expect(count).toBeGreaterThan(54 * 1.2);
    expect(count).toBeLessThan(54 * 3);
    expect(on.every((v) => v === 0 || v === 2)).toBe(true);
    renditions.setRoads({ roads: [] });
    expect(saved()).toBeNull();
  });

  it("keeps roads when courses are carved again near them", () => {
    const renditions = world();
    renditions.cells(0, 0);
    const road = { kind: "road", points: [[20, 128, 14], [236, 128, 14]], seed: 1, bed: Array(40).fill(12) };
    renditions.setRoads({ roads: [road] });
    renditions.setWater({ bodies: [], courses: [{ type: "stream", points: [[0, 60, 6], [256, 60, 6]], surface: [9, 9], seed: 1 }] });
    const track = roadTrack(road.points, road.kind, road.seed);
    const k = track.x.findIndex((x) => x >= 128);
    expect(renditions.heightAt(track.x[k], track.z[k])).toBeCloseTo(12);
  });

  it("builds courses' banks up a little where they're lower than their water", () => {
    const renditions = world();
    renditions.cells(0, 0);
    const stream = { type: "stream", points: [[0, 128, 6], [256, 128, 6]], surface: [10.2, 10.2], seed: 1 };
    renditions.setWater({ bodies: [], courses: [stream] });
    const track = trackOf(stream.points, 1);
    const k = track.x.findIndex((x) => x >= 100);
    const [dx, dz] = [track.x[k + 1] - track.x[k - 1], track.z[k + 1] - track.z[k - 1]];
    const d = Math.hypot(dx, dz);
    // A ridge over its water just past each edge; in its middle, cut down.
    const ridge = (side) => Math.max(...[0, 1, 2, 3, 4, 5, 6].map((o) => renditions.heightAt(track.x[k] - (dz / d) * side * (track.width[k] / 2 + o), track.z[k] + (dx / d) * side * (track.width[k] / 2 + o))));
    expect(ridge(1)).toBeGreaterThan(10.3);
    expect(ridge(-1)).toBeGreaterThan(10.3);
    expect(renditions.heightAt(track.x[k], track.z[k])).toBeLessThan(10);
    expect(renditions.heightAt(100, 220)).toBe(10);
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

describe("the sea across plates", () => {
  const SEA = 0;
  // Tiles 7 and 8 of row 0, the last of plate (0, 0) and the first of plate (1, 0), side by side,
  // high round their north and south and the outer sides, their corners `height(i, j)` inside,
  // with sea saved in tile 8's cells under it where `sea`.
  const world = (height7, height8, sea) => {
    const renditions = new Renditions();
    const rendition = () => ({ heights: new Float32Array(81).fill(0), colors: new Uint8Array(192), hash: "0000000000000000" });
    renditions.addPlatter(encodePlatter({ coords: [0, 0], tiles: new Map([[7, rendition()], [8, rendition()]]), plates: new Map([[0, rendition()], [1, rendition()]]) }));
    const tile = (height, outer, water = null) => ({
      heights: Float32Array.from({ length: 65 * 65 }, (_, k) => {
        const [i, j] = [k % 65, Math.floor(k / 65)];
        return j < 2 || j > 62 || outer(i) ? 5 : height(i, j);
      }),
      colors: new Uint8Array(64 * 64 * 3),
      terrain: new Uint8Array(64 * 64),
      forest: new Uint8Array(64 * 64),
      water,
    });
    const water = { level: new Float32Array(4096).fill(NaN), type: new Uint8Array(4096) };
    if (sea) for (let j = 2; j < 62; j++) for (let i = 0; i < 61; i++) water.level[j * 64 + i] = 0;
    renditions.addPlate([0, 0], encodePlate({ coords: [0, 0], palette: ["grass"], tiles: new Map([[7, tile(height7, (i) => i < 2)]]) }));
    renditions.addPlate([1, 0], encodePlate({ coords: [1, 0], palette: ["grass"], tiles: new Map([[0, tile(height8, (i) => i > 62, water)]]) }));
    return renditions;
  };
  const sea = (renditions, key, index, i, j) => {
    const { water } = decodePlate(renditions.changedFiles("main").get(`places/continents/main/plates/${key}.plate`)).tiles.get(index);
    return Boolean(water) && water.type[j * 64 + i] === SEA && water.level[j * 64 + i] === 0;
  };

  it("comes in from the plate next to it, to ground lowered by its side", () => {
    const renditions = world((i) => (i === 64 ? -7 : 5), () => -7, true);
    renditions.cells(7, 0);
    // Tile 7 lowered to -7 inside its rim, up to the plates' side.
    renditions.raise((x, z) => (x >= 7 * 256 + 8 && x < 8 * 256 && z >= 8 && z <= 61 * 4 ? -12 : 0), [7 * 256, 0, 8 * 256, 256], CELLS);
    expect(renditions.heightAt(7 * 256 + 128, 120)).toBe(-7);
    expect(sea(renditions, "0_0", 7, 63, 30)).toBe(true);
    expect(sea(renditions, "0_0", 7, 10, 30)).toBe(true);
  });

  it("has the plate next to it saved again when it reaches its side", () => {
    // Tile 8 low and dry; tile 7's sea comes in from the plate's open side once lowered.
    const renditions = world((i) => (i === 64 ? -7 : 5), () => -7, false);
    renditions.cells(7, 0);
    renditions.cells(8, 0);
    renditions.unsaved.clear();
    renditions.changed.clear();
    renditions.raise((x, z) => (x >= 7 * 256 && x < 8 * 256 && z >= 8 && z <= 61 * 4 ? -12 : 0), [7 * 256 - 8, 0, 8 * 256, 256], CELLS);
    renditions.addPlate([0, 0], renditions.changedFiles("main").get("places/continents/main/plates/0_0.plate"));
    expect(renditions.unsaved.has("1,0")).toBe(true);
    expect(sea(renditions, "1_0", 0, 30, 30)).toBe(true);
  });

  it("has a plate saved again when it's read with dry ground under the sea next to the sea", () => {
    const renditions = world(() => 5, () => -7, true);
    // Tile 7's east column is low but dry, by tile 8's sea.
    const dry = world((i) => (i >= 63 ? -7 : 5), () => -7, true);
    dry.cells(8, 0);
    dry.cells(7, 0);
    expect(dry.unsaved.has("0,0")).toBe(true);
    renditions.cells(8, 0);
    renditions.cells(7, 0);
    expect(renditions.unsaved.size).toBe(0);
  });
});

describe("saving plates the worker reads", () => {
  const up = () => 3;
  // A world of two plates side by side, their files written and none of them read.
  const twoPlates = () => {
    const made = new Renditions();
    made.raise(up, [0, 0, 1100, 100], CELLS);
    const files = made.changedFiles("main");
    const fresh = new Renditions();
    for (const [path, bytes] of files) {
      if (path.includes("/platters/")) fresh.addPlatter(bytes);
      else fresh.addPlate(path.match(/(-?\d+)_(-?\d+)\.plate/).slice(1).map(Number), bytes);
    }
    return fresh;
  };

  it.each([
    ["cell", CELLS],
    ["chunk", CHUNKS],
    ["tile", TILES],
  ])("writes the same file as reading it here, for %s moves", async (_, level) => {
    await loadZipper(); // files are packed once it's there
    const here = twoPlates();
    const there = twoPlates();
    for (const each of [here, there]) {
      each.raise(up, [64, 64, 300, 300], level);
      each.clear(576, 64, 1);
      each.decoded.clear();
    }
    const expected = here.changedFiles("main");
    const got = await there.unsavedFiles("main");
    expect([...got.keys()].sort()).toEqual([...expected.keys()].sort());
    for (const [path, bytes] of expected) expect(got.get(path), path).toEqual(bytes);
  });

  it("reads none of them on this thread", async () => {
    const world = twoPlates();
    world.raise(up, [64, 64, 300, 300], TILES);
    world.decoded.clear();
    let readHere = 0;
    const readNow = world.readNow.bind(world);
    world.readNow = (key) => (readHere++, readNow(key));
    await world.unsavedFiles("main");
    expect(readHere).toBe(0);
    expect(world.decoded.size).toBe(0);
  });

  it("saves the plates next door again only where the sea along their side changed", async () => {
    const world = twoPlates();
    world.raise(up, [64, 64, 200, 200], CELLS);
    world.decoded.clear();
    await world.unsavedFiles("main");
    expect(world.unsaved.size).toBe(0);
  });

  it("drops what it knew of a plate's sides once its tiles change", async () => {
    const world = twoPlates();
    await world.readEdges(["0,0"]);
    expect(world.fileEdges.has("0,0")).toBe(true);
    world.clear(64, 64, 1);
    expect(world.fileEdges.has("0,0")).toBe(false);
  });
});

describe("held platters", () => {
  const rendition = () => ({ heights: new Float32Array(81).fill(7), colors: new Uint8Array(192), hash: "0000000000000000" });
  const platter = (coords) => encodePlatter({ coords, tiles: new Map([[0, rendition()]]), plates: new Map([[0, rendition()]]) });

  it("reads a held platter when its ground is first wanted", () => {
    const renditions = new Renditions();
    renditions.holdPlatter([1, 0], platter([1, 0]));
    expect(renditions.platters.size).toBe(0);
    expect(renditions.tile(64, 0)).not.toBeNull();
    expect([renditions.platters.size, renditions.held.size]).toEqual([1, 0]);
  });

  it("reads held platters one at a time, saying when there are none left", () => {
    const renditions = new Renditions();
    renditions.holdPlatter([0, 0], platter([0, 0]));
    renditions.holdPlatter([1, 0], platter([1, 0]));
    expect([renditions.readHeld(), renditions.readHeld(), renditions.readHeld()]).toEqual([true, true, false]);
    expect(renditions.plate(8, 0)).not.toBeNull();
  });
});
