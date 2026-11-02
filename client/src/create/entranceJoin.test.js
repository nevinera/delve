import { describe, expect, it } from "vitest";
import { TILE_CELLS } from "../v2/caves.js";
import { CELL_FT, CHUNK_FT } from "../v2/sizes.js";
import { ENTRANCE_DEFAULTS, Layout, carvePlan, entranceCells, entranceEnd } from "./caveLayout.js";
import { Caves } from "./caves.js";
import { entranceJoin } from "./entranceJoin.js";

// A hillside rising 0.6 ft for each foot east, and an entrance into it heading east.
const hill = (x) => 0.6 * x;
const groundAt = (x) => hill(x);
const hillside = { heightAt: (x) => hill(x), cells: () => ({ colors: new Uint8Array(TILE_CELLS * TILE_CELLS * 3).fill(100) }) };
const entrance = (details) => {
  const e = { ...ENTRANCE_DEFAULTS, id: "n1", mouth: [0, 0, 0], yaw: 90, ...details };
  return { ...e, at: entranceEnd(e) };
};

// The entrance carved into the hillside, and its join with the ground.
function joined(details) {
  const e = entrance(details);
  const caves = new Caves({ add() {} }, hillside);
  const layout = new Layout();
  const { at, ...rest } = e;
  layout.addNode(at, rest);
  caves.carvePlan(carvePlan(layout, undefined, groundAt), () => {});
  return { e, join: entranceJoin(e, caves.world, groundAt) };
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const minus = (a, b) => a.map((v, k) => v - b[k]);
const flat = (line, { center, across, along }) => line.map((p) => [dot(minus(p, center), across), dot(minus(p, center), along)]);

// Whether a closed line, flattened, crosses itself.
function crosses(points) {
  const turn = (a, b, c) => (c[1] - a[1]) * (b[0] - a[0]) - (b[1] - a[1]) * (c[0] - a[0]);
  const n = points.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const [a, b, c, d] = [points[i], points[i + 1], points[j], points[(j + 1) % n]];
      if (turn(a, c, d) * turn(b, c, d) < 0 && turn(a, b, c) * turn(a, b, d) < 0) return true;
    }
  }
  return false;
}

// Whether flattened point p is inside closed line `points`.
function inside(p, points) {
  let odd = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [a, b] = [points[i], points[j]];
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) odd = !odd;
  }
  return odd;
}

describe("entrance joins", () => {
  it("leaves out the cells the tube reaches, round them the ground's edge on its corners", () => {
    const { e, join } = joined();
    expect(join).not.toBe(null);
    expect(join.cells).toEqual(entranceCells(e, groundAt));
    for (const [x, y, z] of join.ground) {
      expect(x % CELL_FT).toBeCloseTo(0);
      expect(z % CELL_FT).toBeCloseTo(0);
      expect(y).toBeCloseTo(hill(x));
    }
    expect(crosses(flat(join.ground, join.plane))).toBe(false);
  });

  it("fits the plane to the ground's edge, facing out of the mouth", () => {
    const { e, join } = joined();
    const { plane } = join;
    expect(Math.hypot(...plane.normal)).toBeCloseTo(1);
    expect(dot(minus(e.mouth, plane.center), plane.normal)).toBeGreaterThan(0);
    expect(dot(minus(e.at, plane.center), plane.normal)).toBeLessThan(0);
    // On a steady slope the ground's edge lies on it.
    for (const p of join.ground) expect(Math.abs(dot(minus(p, plane.center), plane.normal))).toBeLessThan(0.5);
  });

  it("cuts the rock on the plane in one closed loop, inside the ground's edge", () => {
    const { join } = joined();
    const { plane, ground, rock } = join;
    expect(rock.length).toBeGreaterThan(8);
    for (const p of rock) expect(Math.abs(dot(minus(p, plane.center), plane.normal))).toBeLessThan(0.01);
    expect(Math.hypot(...minus(rock[0], rock.at(-1)))).toBeLessThanOrEqual(2 * CELL_FT);
    const [g, r] = [flat(ground, plane), flat(rock, plane)];
    expect(crosses(r)).toBe(false);
    for (const p of r) expect(inside(p, g)).toBe(true);
  });

  it("zips every point of both once, and keeps the way in and the ground held round it", () => {
    const { e, join } = joined();
    expect(join.steps.replace(/b/g, "")).toHaveLength(join.ground.length);
    expect(join.steps.replace(/a/g, "")).toHaveLength(join.rock.length);
    expect(Math.hypot(...join.axis)).toBeCloseTo(1);
    expect(dot(join.axis, minus(e.at, e.mouth))).toBeGreaterThan(0);
    const held = new Set(join.chunks.map((c) => c.join(",")));
    for (const p of [e.mouth, e.at]) expect(held.has(`${Math.floor(p[0] / CHUNK_FT)},${Math.floor(p[2] / CHUNK_FT)}`)).toBe(true);
    for (const [ci, cj] of join.cells) expect(held.has(`${Math.floor((ci * CELL_FT) / CHUNK_FT)},${Math.floor((cj * CELL_FT) / CHUNK_FT)}`)).toBe(true);
  });

  it("works out the same join on a trial carving as on the caves carved, leaving them as they are", () => {
    const e = entrance();
    const caves = new Caves({ add() {} }, hillside);
    const layout = new Layout();
    const { at, ...rest } = e;
    layout.addNode(at, rest);
    const plan = carvePlan(layout, undefined, groundAt);
    const tried = entranceJoin(e, caves.trial(plan).world, groundAt);
    expect(caves.tiles.size).toBe(0);
    caves.carvePlan(plan, () => {});
    expect(tried).toEqual(entranceJoin(e, caves.world, groundAt));
  });

  it("has nothing to join where the tube doesn't reach the ground", () => {
    const { e } = joined();
    const caves = new Caves({ add() {} }, hillside);
    expect(entranceJoin({ ...e, mouth: [0, -60, 0], at: [e.at[0], e.at[1] - 60, e.at[2]] }, caves.world, groundAt)).toBe(null);
  });
});
