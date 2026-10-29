import { describe, expect, it } from "vitest";
import { slabBottom, slabProblems, slabSpanAt, slabTop } from "../world/slabs.js";
import { SlabTool, conformedCells, faceSlab, roofPieces, roomPieces, floorSlab, rectanglePieces, rectangleSlab, wallPieces, wallSlab } from "./slabTool.js";

const near = (points) => points.map((p) => p.map((v) => Math.round(v * 100) / 100 + 0));

describe("wallSlab", () => {
  it("stands a wall along the line, from its foot to its height over the start", () => {
    const wall = wallSlab([100, 40, 200], [100, 40, 212], { foot: 37, height: 10, thickness: 1, surface: "brick" });
    expect(near(slabTop(wall))).toEqual([[100, 37, 200], [100, 37, 212], [100, 50, 212], [100, 50, 200]]);
    // Its thickness goes off to one side of the line.
    expect(new Set(near(slabBottom(wall)).map((p) => p[0])).size).toBe(1);
    expect(near(slabBottom(wall))[0][0]).not.toBe(100);
  });

  it("runs any way across the ground", () => {
    const wall = wallSlab([0, 0, 0], [-6, 0, -8], { foot: 0, height: 8, thickness: 0.5, surface: "plaster" });
    expect(near(slabTop(wall)).slice(0, 2)).toEqual([[0, 0, 0], [-6, 0, -8]]);
  });
});

describe("floorSlab", () => {
  it("lies on its corners' level, its top a thickness over them", () => {
    const floor = floorSlab([[10, 40, 20], [18, 40, 20], [18, 40, 26]], { thickness: 1, surface: "stone" });
    expect(near(slabTop(floor))).toEqual([[10, 41, 20], [18, 41, 20], [18, 41, 26]]);
    expect(near(slabBottom(floor)).map((p) => p[1])).toEqual([40, 40, 40]);
  });
});

describe("faceSlab", () => {
  it("stands up through its corners, as a gable end", () => {
    const gable = faceSlab([[0, 10, 0], [12, 10, 0], [6, 16, 0]], { thickness: 1, surface: "plaster" });
    expect(near(slabTop(gable))).toEqual([[0, 10, 0], [12, 10, 0], [6, 16, 0]]);
  });
});

describe("rectangleSlab", () => {
  it("runs along the world's axes for a camera looking north", () => {
    const floor = rectangleSlab([0, 5, 0], [10, 5, 6], 0, { thickness: 1, surface: "stone" });
    expect(near(slabTop(floor))).toEqual([[0, 6, 0], [10, 6, 0], [10, 6, 6], [0, 6, 6]]);
  });

  it("squares up to a turned camera, its far corner where it was dragged to", () => {
    const floor = rectangleSlab([0, 0, 0], [3, 0, 9], 30, { thickness: 1, surface: "stone" });
    expect(floor.turn).toEqual([30, 0, 0]);
    expect(near(slabTop(floor))[2]).toEqual([3, 1, 9]);
  });
});

describe("cutting up long rectangles", () => {
  it("cuts a big floor into pieces a whole number of repeats across, meeting edge to edge", () => {
    // Brick repeats every 4 ft, so the pieces are 40 ft, and what's left.
    const pieces = rectanglePieces([0, 0, 0], [100, 0, 30], 0, { thickness: 1, surface: "brick" });
    expect(pieces.map((p) => p.outline[2])).toEqual([[40, 30], [40, 30], [20, 30]]);
    expect(pieces.map((p) => p.at[0])).toEqual([0, 40, 80]);
    for (const piece of pieces) expect(slabProblems(piece)).toEqual([]);
  });

  it("cuts a turned floor along its own sides", () => {
    const pieces = rectanglePieces([0, 0, 0], [100, 0, 0], 45, { thickness: 2, surface: "stone" });
    expect(pieces.length).toBeGreaterThan(1);
    for (const piece of pieces) expect(slabProblems(piece)).toEqual([]);
  });

  it("cuts a long wall along its length", () => {
    const pieces = wallPieces([0, 0, 0], [0, 0, 130], { foot: 0, height: 12, thickness: 1, surface: "stoneBlocks" });
    expect(pieces.map((p) => p.outline[1][0])).toEqual([40, 40, 40, 10]);
    expect(near(pieces.map((p) => slabTop(p)[0]))).toEqual([[0, 0, 0], [0, 0, 40], [0, 0, 80], [0, 0, 120]]);
    for (const piece of pieces) expect(slabProblems(piece)).toEqual([]);
  });

  it("leaves one past the limit whole, to show red", () => {
    expect(rectanglePieces([0, 0, 0], [3000, 0, 10], 0, { thickness: 1, surface: "brick" })).toHaveLength(1);
  });
});

describe("conformedCells", () => {
  it("sets the ground under a floor, and a cell past its edges, to its bottom", () => {
    const floor = floorSlab([[16, 40, 16], [32, 40, 16], [32, 40, 32], [16, 40, 32]], { thickness: 1, surface: "stone" });
    const cells = conformedCells([floor], 8);
    expect(new Set(cells.map((c) => c[2]))).toEqual(new Set([40]));
    const keys = cells.map(([ci, cj]) => `${ci},${cj}`);
    // The 2×2 cells under it, and the ring a cell round them.
    expect(keys).toHaveLength(16);
    expect(keys).toContain("2,2");
    expect(keys).toContain("1,1");
    expect(keys).not.toContain("0,0");
  });
});

describe("fitting floors inside walls", () => {
  // A tool over one tile, 0,0, with no view: just enough for fitFloors.
  function tool(slabs) {
    const tile = { slabs };
    const t = Object.create(SlabTool.prototype);
    t.detail = { view: { decoded: new Map([["0,0", tile]]) }, editable: () => true, touch() {}, dirtySlabs: new Set() };
    return { t, tile };
  }
  const walls = [
    wallSlab([10, 0, 10], [30, 0, 10], { foot: 0, height: 10, thickness: 1, surface: "brick" }),
    wallSlab([10, 0, 30], [10, 0, 10], { foot: 0, height: 10, thickness: 1, surface: "brick" }),
  ];
  const floor = () => floorSlab([[10, 0, 10], [30, 0, 10], [30, 0, 30], [10, 0, 30]], { thickness: 1, surface: "stone" });
  const extent = (slab) => {
    const top = slabTop(slab);
    return [Math.min(...top.map((p) => p[0])), Math.max(...top.map((p) => p[0])), Math.min(...top.map((p) => p[2])), Math.max(...top.map((p) => p[2]))];
  };

  it("fits a new floor inside the walls there", () => {
    const { t, tile } = tool([...walls]);
    const f = floor();
    tile.slabs.push(f);
    const [fitted] = t.fitFloors([f]);
    // Both walls' thickness goes into the room.
    expect(near([extent(fitted)])[0]).toEqual([11, 30, 11, 30]);
    expect(tile.slabs).not.toContain(f);
    expect(tile.slabs).toContain(fitted);
  });

  it("fits an old floor inside a new wall", () => {
    const f = floor();
    const { t, tile } = tool([f, walls[0]]);
    expect(t.fitFloors([walls[0]])).toEqual([walls[0]]);
    expect(tile.slabs).not.toContain(f);
    expect(tile.slabs).toHaveLength(2);
  });
});

describe("roomPieces", () => {
  const room = (a, b, yaw = 0) => roomPieces(a, b, yaw, { height: 10, thickness: 1, surface: "brick", footUnder: () => 38 });
  const footprint = (slab) => {
    const corners = [...slabTop(slab), ...slabBottom(slab)];
    return near([[Math.min(...corners.map((p) => p[0])), Math.max(...corners.map((p) => p[0])), Math.min(...corners.map((p) => p[2])), Math.max(...corners.map((p) => p[2]))]])[0];
  };

  it("stands four walls round the floor, inside its edges, over its top", () => {
    for (const [a, b] of [[[0, 40, 0], [20, 40, 30]], [[20, 40, 30], [0, 40, 0]], [[20, 40, 0], [0, 40, 30]]]) {
      const slabs = room(a, b);
      const walls = slabs.filter((s) => s.turn[1]);
      expect(walls.map(footprint).sort()).toEqual([[0, 1, 1, 29], [0, 20, 0, 1], [0, 20, 29, 30], [19, 20, 1, 29]].sort());
      for (const wall of walls) expect(Math.max(...slabTop(wall).map((p) => p[1]))).toBe(51);
      expect(slabs.filter((s) => !s.turn[1]).map(footprint)).toEqual([[0, 20, 0, 30]]);
    }
  });

  it("makes nothing from a line", () => {
    expect(room([0, 40, 0], [20, 40, 0])).toEqual([]);
  });

  it("puts a roof over it, the walls risen to meet it", () => {
    const slabs = roomPieces([0, 40, 0], [20, 40, 30], 0, { height: 10, thickness: 1, surface: "brick", footUnder: () => 38, roof: { style: "gable", pitch: 30, overhang: 1 } });
    const walls = slabs.filter((s) => s.turn[1] === -90);
    expect(walls).toHaveLength(4);
    const peaks = walls.map((wall) => Math.max(...slabTop(wall).map((p) => p[1])));
    // The gable ends peak under the ridge; the others stay at the eaves, a little over the floor's top and height.
    expect(peaks.filter((y) => y > 55)).toHaveLength(2);
    expect(peaks.filter((y) => y < 52)).toHaveLength(2);
    expect(slabs.filter((s) => s.turn[1] && s.turn[1] !== -90).length).toBeGreaterThanOrEqual(2);
  });
});

describe("roofPieces", () => {
  // Over a 30 by 20 ft room whose walls' tops are at 10 ft.
  const roof = (style, b = [30, 10, 20], options = {}) => roofPieces([0, 10, 0], b, 0, { style, pitch: 30, overhang: 1, thickness: 1, surface: "slateTiles", ...options });
  const under = (pieces, x, z) => Math.min(...pieces.map((p) => slabSpanAt(p, x, z)).filter(Boolean).map(([low]) => low));
  const tan = Math.tan(Math.PI / 6);

  for (const style of ["flat", "shed", "gable", "hip"]) {
    it(`makes a ${style} roof of good slabs, its underside at the walls' tops along their edges`, () => {
      const pieces = roof(style);
      expect(pieces.length).toBeGreaterThan(0);
      for (const piece of pieces) expect(slabProblems(piece)).toEqual([]);
      expect(under(pieces, 15, 0)).toBeCloseTo(10, 2);
      if (style !== "shed") expect(under(pieces, 15, 20)).toBeCloseTo(10, 2);
      if (style === "hip") expect(under(pieces, 0, 10)).toBeCloseTo(10, 2);
    });
  }

  it("rises to a ridge along the longer side", () => {
    expect(under(roof("gable"), 15, 9.9)).toBeCloseTo(10 + 9.9 * tan, 2);
    expect(under(roof("gable"), 0.5, 10.1)).toBeCloseTo(10 + 9.9 * tan, 2);
    // Drawn the other way round, the ridge still runs the long way.
    expect(under(roof("gable", [-20, 10, -30]), -10.1, -15)).toBeCloseTo(10 + 9.9 * tan, 2);
    expect(under(roof("hip"), 2, 10)).toBeCloseTo(10 + 2 * tan, 2);
  });

  it("runs a gable's ridge, or slopes a shed, the way it's told", () => {
    // Ridge along v (z): the slopes rise from the x edges.
    expect(under(roof("gable", [30, 10, 20], { ridge: 1 }), 14.9, 10)).toBeCloseTo(10 + 14.9 * tan, 2);
    // A shed rising north: highest along z = 0.
    const shed = roof("shed", [30, 10, 20], { rising: [0, -1] });
    expect(under(shed, 15, 0.1)).toBeCloseTo(10 + 19.9 * tan, 2);
    expect(under(shed, 15, 19.9)).toBeCloseTo(10 + 0.1 * tan, 2);
    expect(under(roof("shed", [30, 10, 20], { rising: [1, 0] }), 29.9, 10)).toBeCloseTo(10 + 29.9 * tan, 2);
  });

  it("cuts a big roof into pieces", () => {
    const pieces = roof("gable", [100, 10, 60]);
    expect(pieces.length).toBeGreaterThan(4);
    for (const piece of pieces) expect(slabProblems(piece)).toEqual([]);
    expect(under(pieces, 50, 29.9)).toBeCloseTo(10 + 29.9 * tan, 2);
  });
});
