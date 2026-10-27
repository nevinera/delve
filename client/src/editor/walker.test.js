import { describe, expect, it } from "vitest";
import { setBuiltObjects } from "../world/objects.js";
import { emptyStructure, withWalk } from "../world/structures.js";
import { Walker } from "./walker.js";

// A 3 by 3 cell house, walled round with a door in the middle of its south side, over a cellar
// whose stair climbs north in its south-east cell, open above.
function house() {
  const s = emptyStructure("house", () => 0.5);
  s.id = "house001";
  const ground = s.storeys[0];
  for (let z = 0; z < 3; z++) for (let x = 0; x < 3; x++) if (x !== 2 || z !== 2) ground.floor.push(`${x},${z}`);
  for (let i = 0; i < 3; i++) {
    ground.edges[`${i},0,n`] = { material: "stone" };
    ground.edges[`${i},3,n`] = { material: "stone" };
    ground.edges[`0,${i},w`] = { material: "stone" };
    ground.edges[`3,${i},w`] = { material: "stone" };
  }
  ground.edges["1,3,n"] = { material: "stone", opening: "door", sill: 0, top: 8 };
  const cellar = [];
  for (let z = 0; z < 3; z++) for (let x = 0; x < 3; x++) cellar.push(`${x},${z}`);
  s.storeys.push({ level: -1, floor: cellar, edges: {} });
  s.components.push({ type: "stairs", level: -1, at: [2, 2], facing: 0, run: 1 });
  return withWalk(s);
}

// A 3 ft crate.
const crate = { id: "crate001", name: "crate", palette: [{ color: "#806040" }], pieces: [{ type: "box", size: [3, 3, 3], at: [0, 1.5, 0], turn: [0, 0, 0], color: 0 }] };

// A walker on flat ground at 100 ft, the house at continent (200, 200) with its floor at 100.6,
// and `others` among its tile's objects.
function walker({ furnished = false, others = [] } = {}) {
  const h = house();
  if (furnished) h.objects.push({ type: "built:crate001", at: [6, 0, 6], yaw: 0, scale: 1 });
  setBuiltObjects([crate], [], [h]);
  const n = 64;
  const tile = {
    coords: [0, 0],
    cells: n,
    cellFt: 8,
    layers: { height: new Float32Array(n * n).fill(100), water: new Float32Array(n * n).fill(NaN) },
    objects: [{ type: "structure:house001", at: [200, 200], yaw: 0, base: 100.6, scale: 1, footprint: { open: 20 }, height: 20 }, ...others],
  };
  const w = Object.create(Walker.prototype);
  w.view = { decoded: new Map([["0,0", tile]]), origin: [0, 0], treesOf: () => [] };
  return w;
}

const at = (w, x, y, z) => {
  w.pos = { x, y, z };
  return w;
};

describe("walker on structures", () => {
  it("stands on floors, and on the ground outside", () => {
    const w = walker();
    expect(w.stand(206, 206, 100.6)).toEqual({ height: 100.6, structure: true, swim: false });
    expect(w.standHeight(190, 206, 100)).toBeCloseTo(100);
  });

  it("can't walk through walls, but can through the door", () => {
    expect(at(walker(), 198.4, 100, 206).canStep(198.6, 206)).toBe(false);
    expect(at(walker(), 198.4, 100, 206).canStep(198.2, 206)).toBe(true);
    expect(at(walker(), 206, 100, 214).canStep(206, 213.4)).toBe(true);
    expect(at(walker(), 206, 100, 212.4).canStep(206, 211.8)).toBe(true);
    // Through the wall beside the door, no.
    expect(at(walker(), 202, 100, 213.6).canStep(202, 213.4)).toBe(false);
  });

  it("goes down the cellar stair, where the ground doesn't count", () => {
    const w = walker();
    expect(w.standHeight(210, 208.2, 100.6)).toBeCloseTo(100.1);
    expect(w.standHeight(210, 211.8, 91.6)).toBeCloseTo(91.1);
    expect(at(w, 210, 100.6, 207.9).canStep(210, 208.2)).toBe(true);
    // From the cellar, not up into the ground outside.
    expect(at(walker(), 200.2, 90.6, 206).canStep(199.8, 206)).toBe(false);
  });

  it("bumps into the house's objects, and world objects on its floor", () => {
    expect(at(walker(), 203, 100.6, 206).canStep(204.5, 206)).toBe(true);
    expect(at(walker({ furnished: true }), 203, 100.6, 206).canStep(204.5, 206)).toBe(false);
    const placed = { type: "built:crate001", at: [206, 210], yaw: 0, scale: 1, footprint: { rect: [3, 3] }, height: 3 };
    expect(at(walker({ others: [placed] }), 203, 100.6, 210).canStep(204.5, 210)).toBe(false);
    // Down in the cellar, the crate upstairs isn't in the way.
    expect(at(walker({ furnished: true }), 203, 90.6, 206).canStep(204.5, 206)).toBe(true);
  });
});
