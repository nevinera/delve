import { describe, expect, it } from "vitest";
import { setBuiltObjects } from "../world/objects.js";
import { BUILTIN_STRUCTURES } from "../world/builtinStructures.js";
import { Walker } from "./walker.js";

// Walks routes through the builtin structures, each placed at continent (200, 200) on flat ground
// at 100 ft with its ground floor at 100.5, checking each step is allowed and where it ends up.

const AT = 200;
const BASE = 100.5;

function walker(name) {
  setBuiltObjects([]);
  const s = BUILTIN_STRUCTURES.find((x) => x.name === name);
  const n = 64;
  const tile = {
    coords: [0, 0],
    cells: n,
    cellFt: 8,
    layers: { height: new Float32Array(n * n).fill(100), water: new Float32Array(n * n).fill(NaN) },
    objects: [{ type: `structure:${s.id}`, at: [AT, AT], yaw: 0, base: BASE, scale: 1, footprint: { open: 64 }, height: 30 }],
  };
  const w = Object.create(Walker.prototype);
  w.view = { decoded: new Map([["0,0", tile]]), origin: [0, 0], treesOf: () => [] };
  return w;
}

// Walks from the first point through the rest (feet from the structure's anchor), a quarter foot
// at a time. Returns where the feet end up, or where a step was refused.
function walk(name, points) {
  const w = walker(name);
  const [sx, sz] = points[0];
  w.pos = { x: AT + sx, y: 0, z: AT + sz };
  w.pos.y = w.standHeight(w.pos.x, w.pos.z, Infinity);
  for (const [px, pz] of points.slice(1)) {
    const [tx, tz] = [AT + px, AT + pz];
    const steps = Math.ceil(Math.hypot(tx - w.pos.x, tz - w.pos.z) / 0.25);
    const [dx, dz] = [(tx - w.pos.x) / steps, (tz - w.pos.z) / steps];
    for (let i = 0; i < steps; i++) {
      const [nx, nz] = [w.pos.x + dx, w.pos.z + dz];
      if (!w.canStep(nx, nz)) return { stuck: [Math.round((nx - AT) * 10) / 10, Math.round((nz - AT) * 10) / 10], y: w.pos.y };
      w.pos = { x: nx, y: w.standHeight(nx, nz, w.pos.y), z: nz };
    }
  }
  return { y: Math.round(w.pos.y * 10) / 10 };
}

describe("walking through the builtin structures", () => {
  it("goes in a cottage's door", () => {
    expect(walk("cottage", [[2, 10], [2, 3]])).toEqual({ y: BASE });
  });

  it("climbs a farmhouse's stairs", () => {
    expect(walk("farmhouse", [[-2, 16], [-2, 10], [-10, 10], [-10, -6], [-4, -6], [-4, 2]])).toEqual({ y: BASE + 10 });
  });

  it("climbs an inn's stairs past its tables", () => {
    expect(walk("inn", [[2, 12], [2, 6], [-10, 6], [-10, -10], [0, -10]])).toEqual({ y: BASE + 11 });
  });

  it("climbs a keep to its roof", () => {
    expect(walk("keep", [[0, 16], [0, 10], [-10, 10], [-10, -6], [-6, -6], [-6, -2], [6, -2], [6, -10], [10, -10], [10, 6], [-4, 6]])).toEqual({ y: BASE + 20 });
  });

  it("climbs a watchtower to its top", () => {
    expect(walk("watchtower", [[2, 16], [2, 10], [-2, 10], [-2, -2], [2, -2], [2, 10]])).toEqual({ y: BASE + 20 });
  });

  it("goes down into a mine", () => {
    expect(walk("mine entrance", [[2.5, 24], [2.5, -4]])).toEqual({ y: BASE - 12 });
  });

  it("goes down into a small cave", () => {
    expect(walk("small cave", [[0, 20], [0, -6]])).toEqual({ y: BASE - 12 });
  });

  it("goes down two levels into a large cave", () => {
    expect(walk("large cave", [[0, 28], [0, 6], [2, -6], [2, -10], [6, -10], [6, 10]])).toEqual({ y: BASE - 24 });
  });

  it("goes down a crypt's stairs", () => {
    expect(walk("crypt", [[2, 6], [2, 2], [2, -6], [-2, -6], [-2, 6], [0, 6]])).toEqual({ y: BASE - 10 });
  });
});
