import { describe, expect, it } from "vitest";
import { templateProblems } from "./templates.js";

const floor = { at: [0, 1, 0], turn: [0, 0, 0], outline: [[0, 0], [10, 0], [10, 10], [0, 10]], thickness: 1, surface: "floorboards" };
const hut = { id: "hut00001", name: "Hut", slabs: [floor], objects: [{ type: "rock", at: [5, 5], yaw: 0, scale: 1, y: 1 }], ground: [[0, 0, 0], [1, 0, 0.5]] };

describe("templateProblems", () => {
  it("passes a good template, with or without ground", () => {
    expect(templateProblems(hut)).toEqual([]);
    const { ground: _, ...bare } = hut;
    expect(templateProblems(bare)).toEqual([]);
  });

  it("needs an id, a name, and something in it", () => {
    expect(templateProblems({ ...hut, id: "Hut", name: " " })).toEqual(["needs an id of 8 lowercase letters and digits", "needs a name"]);
    expect(templateProblems({ ...hut, slabs: [], objects: [] })).toEqual(["has no slabs or objects"]);
    expect(templateProblems({ ...hut, objects: undefined })).toEqual(["needs objects: a list, empty if there are none"]);
  });

  it("checks its slabs and objects", () => {
    expect(templateProblems({ ...hut, slabs: [{ ...floor, thickness: 0 }] })).toEqual(["has slab 0, which needs a thickness over 0 and at most 16 ft"]);
    expect(templateProblems({ ...hut, slabs: [{ ...floor, at: [300, 0, 0] }] })).toEqual(["has slab 0 more than 256 ft from its anchor"]);
    expect(templateProblems({ ...hut, objects: [{ type: "template:abc", at: [0, 0], yaw: 0, scale: 0 }] })).toEqual([
      "has object 0, which is template:abc, which can't go in a template",
      "has object 0, which needs a scale over 0",
    ]);
  });

  it("checks its ground", () => {
    expect(templateProblems({ ...hut, ground: [[0, 0, 1], [0, 0, 2]] })).toEqual(["has ground cell 0,0 twice"]);
    expect(templateProblems({ ...hut, ground: [[0.5, 0, 1], [40, 0, 0]] })).toEqual([
      "has a ground cell that isn't [i, j, height]: [0.5,0,1]",
      "has ground cell 40,0, more than 32 cells from the anchor",
    ]);
  });
});
