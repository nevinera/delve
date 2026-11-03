import { describe, expect, it } from "vitest";
import { setBuiltObjects } from "../world/objects.js";
import { ViewGround, Walker, frameDue } from "./walker.js";

// A 3 ft crate.
const crate = { id: "crate001", name: "crate", palette: [{ color: "#806040" }], pieces: [{ type: "box", size: [3, 3, 3], at: [0, 1.5, 0], turn: [0, 0, 0], color: 0 }] };

// A walker on flat ground at 100 ft, with `others` among its tile's objects.
function walker({ others = [] } = {}) {
  setBuiltObjects([crate]);
  const n = 64;
  const tile = {
    coords: [0, 0],
    cells: n,
    cellFt: 8,
    layers: { height: new Float32Array(n * n).fill(100), water: new Float32Array(n * n).fill(NaN) },
    objects: others,
  };
  const w = Object.create(Walker.prototype);
  w.view = { decoded: new Map([["0,0", tile]]), origin: [0, 0], treesOf: () => [] };
  w.ground = new ViewGround(w.view);
  return w;
}

const at = (w, x, y, z) => {
  w.pos = { x, y, z };
  return w;
};

describe("walker among objects", () => {
  it("bumps into objects, but jumps over low ones", () => {
    const placed = { type: "built:crate001", at: [206, 210], yaw: 0, scale: 1, footprint: { rect: [3, 3] }, height: 3 };
    expect(at(walker(), 203, 100, 210).canStep(204.5, 210)).toBe(true);
    expect(at(walker({ others: [placed] }), 203, 100, 210).canStep(204.5, 210)).toBe(false);
    expect(at(walker({ others: [placed] }), 203, 103, 210).canStep(204.5, 210)).toBe(true);
  });
});

describe("the frame rate cap", () => {
  it("draws a frame once its share of a second has nearly passed", () => {
    expect(frameDue(null, 5, 60)).toBe(true);
    expect(frameDue(1000, 1014, 60)).toBe(false);
    expect(frameDue(1000, 1015, 60)).toBe(true);
    expect(frameDue(1000, 1020, 30)).toBe(false);
    expect(frameDue(1000, 1032, 30)).toBe(true);
  });
});

describe("walker on slabs", () => {
  // Flat ground at 100 ft with a 20 ft floor at (300, 300), its top at 101, a wall along its north
  // edge with a 4 ft doorway in the middle, and a 30° ramp up to 111 off its east side.
  function slabbed() {
    const w = walker();
    const tile = w.view.decoded.get("0,0");
    const surface = "stone";
    tile.slabs = [
      { at: [300, 101, 300], turn: [0, 0, 0], outline: [[0, 0], [20, 0], [20, 20], [0, 20]], thickness: 1, surface },
      { at: [300, 101, 299], turn: [0, -90, 0], outline: [[0, 0], [8, 0], [8, 7], [12, 7], [12, 0], [20, 0], [20, 10], [0, 10]], thickness: 1, surface },
      { at: [320, 101, 300], turn: [0, 0, 30], outline: [[0, 0], [20, 0], [20, 20], [0, 20]], thickness: 1, surface },
    ];
    return w;
  }

  it("stands on a floor, and steps up onto it", () => {
    expect(slabbed().stand(310, 310, 101)).toEqual({ height: 101, slab: true, swim: false });
    expect(at(slabbed(), 310, 100, 320.4).canStep(310, 319.6)).toBe(true);
  });

  it("walks up a ramp", () => {
    const w = at(slabbed(), 321, 101, 310);
    expect(w.standHeight(321, 310)).toBeCloseTo(101 + Math.tan(Math.PI / 6), 2);
    expect(w.canStep(321.5, 310)).toBe(true);
  });

  it("can't walk through a wall, but can through its doorway", () => {
    expect(at(slabbed(), 304, 101, 301.2).canStep(304, 300.8)).toBe(false);
    expect(at(slabbed(), 310, 101, 301.2).canStep(310, 300.8)).toBe(true);
    expect(at(slabbed(), 310, 101, 301.5).canStep(310, 299)).toBe(true);
  });

  it("walks under a floor high enough overhead", () => {
    const w = slabbed();
    w.view.decoded.get("0,0").slabs.push({ at: [340, 110, 340], turn: [0, 0, 0], outline: [[0, 0], [20, 0], [20, 20], [0, 20]], thickness: 1, surface: "stone" });
    expect(at(w, 338, 100, 350).canStep(338.5, 350)).toBe(true);
    expect(w.standHeight(345, 350, 100)).toBeCloseTo(100);
  });
});

describe("walker going downhill", () => {
  // A hill falling away to the south at `slope`, rise over run, with the character running down it.
  function downhill(slope) {
    const w = Object.create(Walker.prototype);
    const groundAt = (x, z) => 1000 - z * slope;
    w.ground = { groundAt, waterAt: () => NaN, footholds: () => [], inWay: () => false };
    Object.assign(w, { pos: { x: 0, y: 1000, z: 0 }, held: new Set(["w"]), cam: { yaw: 0 }, yaw: 0, vy: 0, t: 0, airTime: 0, jumpedAt: -Infinity, gait: "run" });
    return w;
  }
  const run = (w, frames = 30) => {
    for (let n = 0; n < frames; n++) w.step(1 / 60);
  };

  it("keeps its feet on a walkable slope", () => {
    const w = downhill(Math.tan((45 * Math.PI) / 180));
    run(w);
    expect(w.airTime).toBe(0);
    expect(w.pos.y).toBeCloseTo(w.standHeight(w.pos.x, w.pos.z), 5);
  });

  it("falls down a slope too steep to walk", () => {
    const w = downhill(Math.tan((70 * Math.PI) / 180));
    run(w);
    expect(w.airTime).toBeGreaterThan(0.15);
  });

  it("can still jump, and leaves the ground when it does", () => {
    const w = downhill(0.5);
    run(w, 5);
    w.held.add(" ");
    run(w, 5);
    expect(w.airTime).toBeGreaterThan(0);
    expect(w.pos.y).toBeGreaterThan(w.standHeight(w.pos.x, w.pos.z));
  });

  it("falls off a ledge, however gentle the ground below", () => {
    const w = downhill(0);
    w.ground.groundAt = (x, z) => (z < 3 ? 1000 : 990);
    run(w);
    expect(w.airTime).toBeGreaterThan(0);
  });
});
