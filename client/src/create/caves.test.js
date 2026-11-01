import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { TILE_CELLS, carve, cavesPath, fillCave, decodeCaves, emptyColumns, encodeCaves, fillRock, openAir } from "../v2/caves.js";
import { CELL_FT, TILE_FT } from "../v2/sizes.js";
import { caveMesh, mouthCells } from "./caveMesh.js";
import { Caves } from "./caves.js";

// Flat ground at `height`, everywhere, with its cells all one color.
const flat = (height) => ({ heightAt: () => height, cells: () => ({ colors: new Uint8Array(TILE_CELLS * TILE_CELLS * 3).fill(100) }) });

describe("cave columns", () => {
  it("opens air, joining what it meets, and fills it again", () => {
    const span = { theme: 0, hewn: false };
    let column = openAir(null, 0, 10, span);
    column = openAir(column, 20, 30, span);
    expect(column.map((s) => [s.floor, s.ceiling])).toEqual([[0, 10], [20, 30]]);
    column = openAir(column, 8, 22, span);
    expect(column.map((s) => [s.floor, s.ceiling])).toEqual([[0, 30]]);
    column = fillRock(column, 10, 20);
    expect(column.map((s) => [s.floor, s.ceiling])).toEqual([[0, 10], [20, 30]]);
    expect(fillRock(column, -5, 40)).toBe(null);
  });

  it("digs a sphere, opening through the ground as a mouth", () => {
    const tiles = new Map();
    const columnsOf = (tx, tz, make) => {
      if (!tiles.has(`${tx},${tz}`) && make) tiles.set(`${tx},${tz}`, emptyColumns());
      return tiles.get(`${tx},${tz}`) ?? null;
    };
    const changed = carve({ kind: "sphere", at: [128, 0, 128], radius: 10 }, columnsOf, () => 5);
    expect([...changed]).toEqual(["0,0"]);
    const middle = tiles.get("0,0")[32 * TILE_CELLS + 32];
    // The cell's middle is 2 ft off the sphere's each way, so it reaches 9.6 ft up and down; up, to
    // 2 ft over the ground.
    expect(middle).toHaveLength(1);
    expect(middle[0].floor).toBe(-9.5);
    expect(middle[0].ceiling).toBe(7);
  });

  it("fills without leaving crumbs of air, but leaves the rest of a cave", () => {
    const tiles = new Map();
    const columnsOf = (tx, tz, make) => {
      if (!tiles.has(`${tx},${tz}`) && make) tiles.set(`${tx},${tz}`, emptyColumns());
      return tiles.get(`${tx},${tz}`) ?? null;
    };
    const air = () => [...tiles.values()].flat().filter(Boolean).flat();
    // A tunnel 40 ft long, its end filled by a sphere a little off its line.
    for (let x = 100; x <= 140; x += 4) carve({ kind: "sphere", at: [x, -30, 128], radius: 6 }, columnsOf, () => 5);
    const before = air().length;
    carve({ kind: "sphere", at: [139, -29, 129], radius: 9 }, columnsOf, () => 5, { fill: true });
    const left = air();
    expect(left.length).toBeLessThan(before);
    // Only the tunnel's start is left, all of it joined: nothing past where the fill reached.
    const columns = tiles.get("0,0");
    const cellsLeft = columns.flatMap((spans, n) => (spans ? [n % TILE_CELLS] : []));
    expect(Math.max(...cellsLeft) * 4).toBeLessThan(132);
    for (const s of left) expect(s.ceiling - s.floor).toBeGreaterThan(2);
    // A pocket alone, filled but for a sliver round it, closes; the tunnel stays.
    carve({ kind: "sphere", at: [200, -30, 200], radius: 4 }, columnsOf, () => 5);
    carve({ kind: "sphere", at: [201, -30, 200], radius: 3.5 }, columnsOf, () => 5, { fill: true });
    expect(columns.some((spans, n) => spans && n % TILE_CELLS >= 48)).toBe(false);
    expect(air().length).toBe(left.length);
  });

  it("fills a whole cave out to a reach, leaving caves apart from it", () => {
    const tiles = new Map();
    const columnsOf = (tx, tz, make) => {
      if (!tiles.has(`${tx},${tz}`) && make) tiles.set(`${tx},${tz}`, emptyColumns());
      return tiles.get(`${tx},${tz}`) ?? null;
    };
    const ground = () => 100;
    // A tunnel 200 ft long, and a chamber beside it but not joined.
    for (let x = 20; x <= 220; x += 4) carve({ kind: "sphere", at: [x, 0, 128], radius: 6 }, columnsOf, ground);
    carve({ kind: "sphere", at: [60, 0, 160], radius: 8 }, columnsOf, ground);
    const xs = () => [...tiles.values()].flatMap((columns) => columns.flatMap((spans, n) => (spans ? [{ x: (n % TILE_CELLS) * 4 + 2, z: Math.floor(n / TILE_CELLS) * 4 + 2 }] : [])));
    expect(fillCave([200, 0, 128], columnsOf, 150).size).toBeGreaterThan(0);
    const left = xs();
    // The tunnel's start past 150 ft stays, and the chamber.
    expect(left.filter((c) => c.z < 140).every((c) => c.x < 52)).toBe(true);
    expect(left.some((c) => c.z > 150)).toBe(true);
    expect(left.some((c) => c.z < 140)).toBe(true);
    // Missing every cave fills nothing.
    expect(fillCave([200, -60, 128], columnsOf, 150).size).toBe(0);
  });

  it("reads back what it writes", () => {
    const columns = emptyColumns();
    columns[5] = [{ floor: -10.25, ceiling: -2, theme: 2, hewn: true }, { floor: 4, ceiling: 9.5, theme: 0, hewn: false }];
    const { coords, tiles } = decodeCaves(encodeCaves([-1, 2], new Map([[9, columns]])));
    expect(coords).toEqual([-1, 2]);
    expect(tiles.get(9)[5]).toEqual(columns[5]);
    expect(tiles.get(9)[4]).toBe(null);
  });
});

describe("caves", () => {
  it("meshes dug rock, and the ground round its mouth", () => {
    const caves = new Caves({ add() {} }, flat(5));
    caves.dig({ kind: "sphere", at: [128, 0, 128], radius: 10 });
    const mesh = caveMesh(0, 0, caves.world);
    expect(mesh.inside).toBeGreaterThan(0);
    expect(mesh.indices.length).toBeGreaterThan(mesh.inside);
    expect(mouthCells(0, 0, caves.world).has(32 * TILE_CELLS + 32)).toBe(true);
    expect(caves.holes(5, 5)).toBe(null);
    // Nothing's meshed far from caves.
    expect(caveMesh(4, 4, caves.world)).toBe(null);
  });

  it("stands the builder on a cave's floor under the ground, and keeps it out of rock", () => {
    const caves = new Caves({ add() {} }, flat(50));
    // A tunnel along x, 8 ft high, its floor at 10.
    caves.dig({ kind: "box", at: [128, 14, 128], half: [40, 4, 4], yaw: 0 });
    expect(caves.groundAt(128, 128, 12.5)).toBe(10);
    expect(caves.groundAt(128, 128)).toBe(50);
    expect(caves.groundAt(128, 160, 12.5)).toBe(50);
    expect(caves.inRock(130, 128, 12.5, 16)).toBe(false);
    expect(caves.inRock(128, 140, 12.5, 16)).toBe(true);
    expect(caves.inRock(200, 128, 52.5, 56)).toBe(false);
  });

  it("keeps the camera inside, and undoes", () => {
    const caves = new Caves({ add() {} }, flat(50));
    caves.dig({ kind: "box", at: [128, 14, 128], half: [40, 4, 4], yaw: 0 });
    // Looking along the tunnel, the camera stays where it is; across it, it's short of the wall.
    const head = new THREE.Vector3(128, 15, 128);
    expect(caves.clear(head, new THREE.Vector3(140, 15, 128)).x).toBe(140);
    expect(caves.clear(head, new THREE.Vector3(128, 15, 160)).z).toBeLessThan(134);
    expect(caves.undo()).toBe(true);
    expect(caves.tiles.size).toBe(0);
    expect(caves.unsavedFiles("main").get(cavesPath("main", [0, 0]))).toBe(null);
  });

  it("digs at the rock a ray meets", () => {
    const caves = new Caves({ add() {} }, flat(0));
    const at = caves.hit(new THREE.Ray(new THREE.Vector3(128, 20, 128), new THREE.Vector3(0, -1, 0)));
    expect(at[1]).toBeCloseTo(0, 1);
    expect(TILE_FT / CELL_FT).toBe(TILE_CELLS);
  });
});
