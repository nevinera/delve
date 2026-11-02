import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { TILE_COLUMNS, VOXEL_FT, carve, cavesPath, emptyColumns, fillRock, openAir } from "../v2/caves.js";
import { CELL_FT, TILE_FT } from "../v2/sizes.js";
import { caveBlocks, caveMesh } from "./caveMesh.js";
import { Caves } from "./caves.js";

// Flat ground at `height`, everywhere, with its cells all one color.
const flat = (height) => ({ heightAt: () => height });

describe("cave columns", () => {
  it("opens air, joining what it meets, and fills it again", () => {
    const span = { stone: [0, 0, 0] };
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
    const middle = tiles.get("0,0")[64 * TILE_COLUMNS + 64];
    // The column's middle is 1 ft off the sphere's each way, so it reaches 9.9 ft down, to the
    // nearest voxel; up, to 2 ft over the ground.
    expect(middle).toHaveLength(1);
    expect(middle[0].floor).toBe(-10);
    expect(middle[0].ceiling).toBe(8);
    expect(middle[0].net).toBe("unnamed");
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
    const cellsLeft = columns.flatMap((spans, n) => (spans ? [n % TILE_COLUMNS] : []));
    expect(Math.max(...cellsLeft) * VOXEL_FT).toBeLessThan(132);
    for (const s of left) expect(s.ceiling - s.floor).toBeGreaterThan(2);
    // A pocket alone, filled but for a sliver round it, closes; the tunnel stays.
    carve({ kind: "sphere", at: [200, -30, 200], radius: 4 }, columnsOf, () => 5);
    carve({ kind: "sphere", at: [201, -30, 200], radius: 3.5 }, columnsOf, () => 5, { fill: true });
    expect(columns.some((spans, n) => spans && n % TILE_COLUMNS >= 96)).toBe(false);
    expect(air().length).toBe(left.length);
  });
});

describe("caves", () => {
  it("meshes dug rock and the ground round its mouth, the rim on the ground at the columns' corners", () => {
    const caves = new Caves({ add() {} }, flat(5));
    caves.dig({ kind: "sphere", at: [128, 0, 128], radius: 10 });
    const mesh = caveMesh(0, 0, caves.world);
    expect(mesh.indices.length).toBeGreaterThan(0);
    // Every vertex over the ground is on it, at a column's corner.
    for (let n = 0; n < mesh.positions.length; n += 3) {
      if (mesh.positions[n + 1] < 5) continue;
      expect(mesh.positions[n + 1]).toBeCloseTo(5);
      expect(mesh.positions[n] % VOXEL_FT).toBeCloseTo(0);
    }
    // The caves draw the ground in a band round where they open through it: a face over each
    // column that isn't open, on the ground.
    const cells = TILE_FT / CELL_FT;
    const band = caves.band(0, 0);
    expect(band.has(32 * cells + 32)).toBe(true);
    expect(band.has(32 * cells + 30)).toBe(true);
    expect(band.has(32 * cells + 40)).toBe(false);
    const { ground } = mesh;
    for (let n = 0; n < ground.positions.length; n += 3) {
      expect(ground.positions[n + 1]).toBeCloseTo(5);
      expect(ground.positions[n] % VOXEL_FT).toBeCloseTo(0);
    }
    expect(ground.indices.length / 6).toBeLessThan(band.size * 4);
    // The ground leaves the band out once the caves have drawn it there.
    expect(caves.holes(0, 0)).toBe(null);
    caves.groundMaterial = () => new THREE.MeshLambertMaterial();
    caves.make("0,0");
    expect(caves.holes(0, 0)).toBe(band);
    expect(caves.holes(5, 5)).toBe(null);
    // Nothing's meshed far from caves.
    expect(caveMesh(4, 4, caves.world)).toBe(null);
  });

  it("draws dug rock as blocks, each face on the voxels' grid and facing into the air", () => {
    const caves = new Caves({ add() {} }, flat(50));
    // A box 8 ft wide and high, 80 ft long, its floor at 10.
    caves.dig({ kind: "box", at: [128, 14, 128], half: [40, 4, 4], yaw: 0 });
    const mesh = caveBlocks(0, 0, caves.world);
    const at = (n) => [0, 1, 2].map((k) => mesh.positions[n * 3 + k]);
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => at(mesh.indices[t + k]));
      for (const p of [a, b, c]) for (const v of p) expect(v % VOXEL_FT).toBeCloseTo(0);
      const [u, v] = [b.map((x, k) => x - a[k]), c.map((x, k) => x - a[k])];
      const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const middle = [0, 1, 2].map((k) => (a[k] + b[k] + c[k]) / 3);
      // A step along the normal from the face is in the air, and a step back is rock.
      const length = Math.hypot(...normal);
      const step = (d) => middle.map((x, k) => x + (normal[k] / length) * d);
      expect(caves.solid(...step(0.5))).toBe(false);
      expect(caves.solid(...step(-0.5))).toBe(true);
    }
    // 40 columns by 4: floor and ceiling a face a column, each wall a face a column along it.
    expect(mesh.indices.length / 6).toBe(40 * 4 * 2 + 40 * 2 + 4 * 2);
    caves.setView("blocks");
    expect(caves.view).toBe("blocks");
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
    expect(TILE_FT / VOXEL_FT).toBe(TILE_COLUMNS);
  });

  it("drops caves files from before cave networks, clearing them when saved", () => {
    const caves = new Caves({ add() {} }, flat(0));
    caves.load(new TextEncoder().encode("caves 1 2 3\ntile 0\nc1 AA\n"), [2, 3]);
    expect(caves.tiles.size).toBe(0);
    expect(caves.unsavedFiles("main").get(cavesPath("main", [2, 3]))).toBe(null);
  });
});
