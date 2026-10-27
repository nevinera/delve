import { describe, expect, it } from "vitest";
import { bakeWalk, edgeToward, emptyStructure, placedWalk, problems, pushGround, turnCell, turnEdge, withWalk } from "./structures.js";

// A 2 by 2 cell hut: stone walls all round, a door on the south, a window on the east, and a
// cellar under its west half, down a stair from the north-east cell.
function hut() {
  const s = emptyStructure("hut", () => 0.5);
  const ground = s.storeys[0];
  ground.floor = ["0,0", "1,0", "0,1"];
  for (const x of [0, 1]) {
    ground.edges[`${x},0,n`] = { material: "stone" };
    ground.edges[`${x},2,n`] = { material: "stone" };
  }
  for (const z of [0, 1]) {
    ground.edges[`0,${z},w`] = { material: "stone" };
    ground.edges[`2,${z},w`] = { material: "stone" };
  }
  ground.edges["0,2,n"] = { material: "stone", opening: "door", sill: 0, top: 8 };
  ground.edges["2,0,w"] = { material: "stone", opening: "window", sill: 3, top: 6 };
  s.materials.stone.tile = { image: "bistone0", every: 4, jitter: 0.2 };
  s.storeys.push({ level: -1, floor: ["0,0", "0,1", "1,0"], edges: {} });
  // Up from the cellar, northward, into the hole in the ground floor at 1,1.
  s.components.push({ type: "stairs", level: -1, at: [1, 1], facing: 0, run: 1 });
  s.components.push({ type: "railing", level: 0, edges: [edgeToward(1, 1, 3)] });
  return s;
}

describe("structures", () => {
  it("finds nothing wrong with a sound structure", () => {
    expect(problems(hut())).toEqual([]);
    expect(problems(emptyStructure())).toEqual([]);
  });

  it("says what's wrong", () => {
    const s = hut();
    s.storeyFt = 4;
    s.storeys[0].edges["0,0,n"] = { material: "brick" };
    s.storeys[0].edges["0,2,n"].sill = 2;
    s.storeys[0].floor.push("40,0");
    s.storeys.push({ level: -1, floor: [], edges: {} });
    s.components.push({ type: "stairs", level: 3, at: [0, 0], facing: 5, run: 0 }, { type: "lift", level: 0 });
    expect(problems(s)).toEqual([
      "its storeys should be 6 to 30 whole feet",
      "two of its storeys are on the same level",
      "storey 0's floor should list cells within 16 of the anchor",
      'storey 0\'s edge 0,0,n is an unknown material, "brick"',
      "storey 0's edge 0,2,n needs a door from the floor, or a window, with a sill below its top, within the storey",
      "storey 0's edge 2,0,w needs a door from the floor, or a window, with a sill below its top, within the storey",
      "component 3 is on level 3, which has no storey",
      "component 3 (stairs) should face 0 to 3 (north, east, south, west)",
      "component 3 (stairs) needs a run of whole cells",
      'component 4 is an unknown type, "lift"',
    ]);
  });

  it("bakes floors, walls, openings, flights and railings into walk data", () => {
    const walk = bakeWalk(hut());
    const [cellar, ground] = walk.storeys;
    expect(cellar.level).toBe(-1);
    expect(cellar.cells["0,0"]).toEqual([-10, -10, -10, -10]);
    // The stair climbs northward: its south corners at the cellar floor, its north ones at the
    // ground floor.
    expect(cellar.cells["1,1"]).toEqual([0, 0, -10, -10]);
    expect(ground.cells["1,0"]).toEqual([0, 0, 0, 0]);
    expect(ground.cells["1,1"]).toBeUndefined();
    expect(ground.edges).toMatchObject({ "0,0,n": "wall", "0,2,n": "door", "2,0,w": "window", "1,1,w": "railing" });
    // The stairwell is under no floor; the cellar's other cells are.
    expect(walk.cut).toEqual(["1,1"]);
  });

  it("spreads a flight to the right of its way up, over its run", () => {
    const s = emptyStructure();
    s.storeyFt = 12;
    s.components.push({ type: "ramp", level: 0, at: [0, 0], facing: 1, run: 3, width: 2 });
    const { cells } = bakeWalk(s).storeys[0];
    expect(Object.keys(cells).sort()).toEqual(["0,0", "0,1", "1,0", "1,1", "2,0", "2,1"]);
    expect(cells["0,1"]).toEqual([0, 4, 4, 0]);
    expect(cells["2,0"]).toEqual([8, 12, 12, 8]);
  });

  it("walks roofs on the level above, and spans as railed decks", () => {
    const s = emptyStructure();
    s.storeys[0].floor = ["0,0", "1,0", "0,1", "1,1"];
    s.components.push({ type: "roof", level: 0, at: [0, 0], size: [2, 2], shape: "gable", ridge: "x", pitch: 0.5, overhangFt: 1 });
    s.components.push({ type: "span", level: 0, at: [5, 0], facing: 2, run: 3, width: 2 });
    expect(problems(s)).toEqual([]);
    const [ground, above] = bakeWalk(s).storeys;
    expect(above.level).toBe(1);
    // The ridge runs east-west over the middle: 4 ft in from the eaves at half pitch, 2 ft up.
    expect(above.cells["0,0"]).toEqual([10, 10, 12, 12]);
    expect(above.cells["1,1"]).toEqual([12, 12, 10, 10]);
    // Running south, its width spreads west, the way a southward walker's right hand points.
    expect(ground.cells["4,2"]).toEqual([0, 0, 0, 0]);
    expect(ground.edges).toMatchObject({ "6,0,w": "railing", "6,2,w": "railing", "4,1,w": "railing" });
    s.components[0].shape = "lean-to";
    s.components[0].facing = 1;
    expect(problems(s)).toEqual([]);
    // Low on the east: 8 ft across at half pitch.
    expect(bakeWalk(s).storeys[1].cells["0,0"]).toEqual([14, 12, 12, 14]);
    s.components[0].material = "gold";
    expect(problems(s)).toEqual(['component 1 (roof) is made of an unknown material, "gold"']);
  });

  it("turns cells and edges by quarter turns, as yaw does", () => {
    // A quarter turn takes east to north.
    expect(turnCell(0, 0, 1).cell).toEqual([0, -1]);
    expect(turnCell(2, 0, 1).cell).toEqual([0, -3]);
    expect(turnEdge("1,0,w", 1)).toBe("0,-1,n");
    // Four quarter turns come back round.
    for (const key of ["0,0,n", "3,-2,w", "-5,4,n"]) expect(turnEdge(key, 4)).toBe(key);
    expect(turnCell(3, -2, 4)).toEqual({ cell: [3, -2], from: [0, 1, 2, 3] });
  });

  it("places walk data in world cells, turned and raised", () => {
    const s = withWalk(hut());
    const placed = placedWalk(s, { at: [400, 800], yaw: 1, base: 50 });
    // Turned a quarter, the stair (cell 1,1, climbing north) climbs west from cell 1,-2.
    const stair = placed.cells.find((c) => c.level === -1 && c.heights.some((h) => h === 50));
    expect(stair.cell).toEqual([101, 198]);
    expect(stair.heights).toEqual([50, 40, 40, 50]);
    // The south door now faces east.
    expect(placed.edges.find((e) => e.kind === "door")).toEqual({ edge: "102,199,w", kind: "door", level: 0, heights: [50, 60] });
  });

  it("pushes the ground down under the ground floor, and puts it back", () => {
    const s = emptyStructure("pad", () => 0.5);
    s.storeys[0].floor = ["0,0"];
    const heights = new Map();
    const ground = { height: (ci, cj) => heights.get(`${ci},${cj}`) ?? 100, editable: (ci) => ci < 5 };
    const apply = (changes) => changes.forEach(([ci, cj, h]) => heights.set(`${ci},${cj}`, h));
    // The cell covers 4 to 8 ft each way: ground cell 0,0's middle is under it; the three round
    // it reach under it.
    const sunk = pushGround(s, { at: [4, 4], yaw: 0, base: 99, pushed: [] }, ground, 8);
    expect(sunk.changes.sort()).toEqual([[0, 0, 98.3], [0, 1, 98.9], [1, 0, 98.9], [1, 1, 98.9]]);
    expect(sunk.pushed.length).toBe(4);
    apply(sunk.changes);
    // Lower still: pushed further, remembering the ground as it first was.
    const deeper = pushGround(s, { at: [4, 4], yaw: 0, base: 98, pushed: sunk.pushed }, ground, 8);
    expect(deeper.pushed.every(([, , h]) => h === 100)).toBe(true);
    apply(deeper.changes);
    // Raised above the ground: all put back.
    const raised = pushGround(s, { at: [4, 4], yaw: 0, base: 101, pushed: deeper.pushed }, ground, 8);
    expect(raised.pushed).toEqual([]);
    apply(raised.changes);
    expect([...heights.values()].every((h) => h === 100)).toBe(true);
    // Ground that can't be edited is left alone.
    expect(pushGround(s, { at: [36, 4], yaw: 0, base: 0, pushed: [] }, ground, 8).changes.every(([ci]) => ci < 5)).toBe(true);
  });
});
