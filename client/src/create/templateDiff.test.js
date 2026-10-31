import { describe, expect, it } from "vitest";
import { footprint, slabKind, templateDiff } from "./templateDiff.js";

const object = (type, x = 0, z = 0) => ({ type, at: [x, z], yaw: 0, scale: 1 });
const floor = (w = 8) => ({ at: [0, 0, 0], turn: [0, 0, 0], outline: [[0, 0], [w, 0], [w, w], [0, w]], thickness: 1, surface: "floorboards" });
const wall = () => ({ at: [0, 0, 0], turn: [0, -90, 0], outline: [[0, 0], [8, 0], [8, 8], [0, 8]], thickness: 1, surface: "stone" });
const template = (objects, slabs) => ({ id: "t", name: "t", objects, slabs });

describe("template differences", () => {
  it("counts what was added and taken away, by kind", () => {
    const before = template([object("boulder"), object("boulder", 4)], [floor()]);
    const after = template([object("boulder"), object("stump", 6)], [floor(), wall()]);
    expect(templateDiff(before, after).changes).toEqual([
      { label: "boulder", before: 2, after: 1 },
      { label: "stump", before: 0, after: 1 },
      { label: "wall (stone)", before: 0, after: 1 },
    ]);
  });

  it("shows nothing for things only moved", () => {
    expect(templateDiff(template([object("boulder")], []), template([object("boulder", 3, 3)], [])).changes).toEqual([]);
  });

  it("names objects as asked", () => {
    const { changes } = templateDiff(template([], []), template([object("built:abc")], []), (type) => (type === "built:abc" ? "lamp" : type));
    expect(changes).toEqual([{ label: "lamp", before: 0, after: 1 }]);
  });

  it("tells slabs apart by how they lie", () => {
    expect(slabKind(floor())).toBe("floor (floorboards)");
    expect(slabKind(wall())).toBe("wall (stone)");
    expect(slabKind({ ...floor(), turn: [0, 30, 0] })).toBe("roof (floorboards)");
  });

  it("measures a footprint in cells and feet", () => {
    const { cells, across, deep } = footprint(template([], [floor(8)]));
    expect(cells).toBeGreaterThan(0);
    expect(across).toBeGreaterThanOrEqual(8);
    expect(deep).toBeGreaterThanOrEqual(8);
  });
});
