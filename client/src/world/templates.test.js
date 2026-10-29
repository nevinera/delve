import { describe, expect, it } from "vitest";
import { captureTemplate, convexHull, hullCells, templateProblems } from "./templates.js";

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
    expect(templateProblems({ ...hut, slabs: [{ ...floor, at: [1100, 0, 0] }] })).toEqual(["has slab 0 more than 1024 ft from its anchor"]);
    expect(templateProblems({ ...hut, objects: [{ type: "template:abc", at: [0, 0], yaw: 0, scale: 0 }] })).toEqual([
      "has object 0, which is template:abc, which can't go in a template",
      "has object 0, which needs a scale over 0",
    ]);
  });

  it("checks its ground", () => {
    expect(templateProblems({ ...hut, ground: [[0, 0, 1], [0, 0, 2]] })).toEqual(["has ground cell 0,0 twice"]);
    expect(templateProblems({ ...hut, ground: [[0.5, 0, 1], [140, 0, 0]] })).toEqual([
      "has a ground cell that isn't [i, j, height]: [0.5,0,1]",
      "has ground cell 140,0, more than 128 cells from the anchor",
    ]);
  });
});

describe("captureTemplate", () => {
  const floor = { at: [100, 12, 200], turn: [0, 0, 0], outline: [[0, 0], [16, 0], [16, 16], [0, 16]], thickness: 1, surface: "floorboards" };
  const stool = { id: "1.2.abc", type: "stool", at: [130, 210], yaw: 1, scale: 2, footprint: [], height: 3 };

  it("anchors on the cell corner nearest the middle, at the ground's mean height under it", () => {
    const height = (ci, cj) => (ci + cj) % 2 ? 10.5 : 11.5;
    const t = captureTemplate({ id: "abcd1234", name: "hut", slabs: [floor], objects: [stool], height });
    // x 100 to 130 middles at 115, nearest corner 112 (cell 14); z 200 to 216 at 208 (cell 26).
    expect(t.slabs[0].at).toEqual([-12, 1, -8]);
    expect(t.objects).toEqual([{ type: "stool", at: [18, 2], yaw: 1, scale: 2 }]);
    expect(t.ground).toBeUndefined();
    expect(templateProblems(t)).toEqual([]);
  });

  it("keeps the ground over the cells inside the hull, from the anchor", () => {
    const t = captureTemplate({ id: "abcd1234", name: "pad", slabs: [{ ...floor, at: [96, 12, 200] }], objects: [], height: (ci, cj) => ci + cj, withGround: true });
    // The floor covers cells 12 to 13 and 25 to 26; the anchor is corner (13, 26) at their mean, 38.
    expect(t.ground).toEqual([[-1, -1, -1], [0, -1, 0], [-1, 0, 0], [0, 0, 1]]);
    expect(t.slabs[0].at).toEqual([-8, -26, -8]);
  });
});

describe("hullCells", () => {
  it("takes the cells a triangle overlaps, not those it only touches", () => {
    expect(hullCells(convexHull([[0, 0], [16, 0], [0, 16]]))).toEqual([[0, 0], [1, 0], [0, 1]]);
  });
});
