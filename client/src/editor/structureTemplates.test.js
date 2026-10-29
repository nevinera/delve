import fs from "fs";
import { describe, expect, it } from "vitest";
import { BUILTIN_STRUCTURES } from "../world/builtinStructures.js";
import { slabTop } from "../world/slabs.js";
import { builtinTemplatesJson, rectangles, structureTemplate } from "./structureTemplates.js";

describe("structureTemplate", () => {
  it("wrote builtin/templates.json from the builtin structures as they are (node script/templates.mjs)", () => {
    expect(fs.readFileSync(new URL("../world/builtin/templates.json", import.meta.url), "utf8")).toBe(builtinTemplatesJson());
  });

  it("covers cells with rectangles, each a row's run stacked down while the rows below cover it, none over 10 cells a side", () => {
    expect(rectangles([[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2], [2, 2]])).toEqual([[0, 0, 2, 3], [2, 2, 3, 3]]);
    expect(rectangles(Array.from({ length: 12 }, (_, x) => [x, 0]))).toEqual([[0, 0, 10, 1], [10, 0, 12, 1]]);
  });

  it("stands walls on their edges, floors under their levels, and gable ends up to the roof", () => {
    const cottage = BUILTIN_STRUCTURES.find((s) => s.name === "cottage");
    const template = structureTemplate(cottage);
    const ys = (slab) => slabTop(slab).map((p) => p[1]);
    const floor = template.slabs[0];
    expect(Math.max(...ys(floor))).toBe(0);
    const tallest = Math.max(...template.slabs.filter((s) => s.turn[1] === -90).flatMap(ys));
    expect(tallest).toBeGreaterThan(cottage.storeyFt);
  });
});
