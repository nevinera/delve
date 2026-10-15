import { describe, it, expect } from "vitest";
import { applyFullGroundAreas, applyGroundAreaDelta, areaColor, areaOpacity, areaOutline } from "../groundAreas";

const area = (id, extra = {}) => ({ id, map_identifier: "m", shape: { kind: "circle", x: 0, y: 0, radius: 5 }, affects: "bAll", expires_at: 1, ...extra });

describe("ground area sync", () => {
  it("takes the full list from instance-state", () => {
    expect(applyFullGroundAreas({ ground_areas: [area("a")] })).toEqual([area("a")]);
  });

  it("is empty when instance-state has none", () => {
    expect(applyFullGroundAreas({})).toEqual([]);
  });

  it("returns the same list when a delta has no area changes", () => {
    const areas = [area("a")];
    expect(applyGroundAreaDelta(areas, {})).toBe(areas);
  });

  it("appends adds and drops removes", () => {
    const next = applyGroundAreaDelta([area("a"), area("b")], { ground_area_adds: [area("c")], ground_area_removes: ["a"] });
    expect(next.map((a) => a.id)).toEqual(["b", "c"]);
  });

  it("replaces an area re-added under the same id", () => {
    const next = applyGroundAreaDelta([area("a")], { ground_area_adds: [area("a", { expires_at: 9 })] });
    expect(next).toHaveLength(1);
    expect(next[0].expires_at).toBe(9);
  });
});

describe("area appearance", () => {
  it("tints by affects when no graphic is given", () => {
    expect(areaColor(area("a", { affects: "bAll" }))).toBe("ff3b30");
    expect(areaColor(area("a", { affects: "gAll" }))).toBe("34c759");
    expect(areaColor(area("a", { affects: "all" }))).toBe("ffcc00");
  });

  it("uses the given color", () => {
    expect(areaColor(area("a", { graphic: { color: "00ff00" } }))).toBe("00ff00");
  });

  it("has no tint for a bare texture", () => {
    expect(areaColor(area("a", { graphic: { textureURL: "t.png" } }))).toBeNull();
  });

  it("defaults opacity to 50%", () => {
    expect(areaOpacity(area("a"))).toBe(0.5);
    expect(areaOpacity(area("a", { graphic: { opacity: 0.2 } }))).toBe(0.2);
  });
});

describe("areaOutline", () => {
  it("puts circle points on the radius", () => {
    const { outer, hole } = areaOutline({ kind: "circle", x: 10, y: 20, radius: 5 });
    expect(hole).toBeNull();
    for (const [px, py] of outer) expect(Math.hypot(px - 10, py - 20)).toBeCloseTo(5);
  });

  it("gives a ring an inner hole", () => {
    const { outer, hole } = areaOutline({ kind: "ring", x: 0, y: 0, innerRadius: 3, outerRadius: 6 });
    expect(Math.hypot(...outer[0])).toBeCloseTo(6);
    expect(Math.hypot(...hole[0])).toBeCloseTo(3);
  });

  it("lays a line along +y at angle 0", () => {
    const { outer } = areaOutline({ kind: "line", x: 0, y: 0, angle: 0, length: 20, width: 4 });
    const ys = outer.map((p) => p[1]);
    expect(Math.min(...ys)).toBeCloseTo(0);
    expect(Math.max(...ys)).toBeCloseTo(20);
    expect(Math.max(...outer.map((p) => Math.abs(p[0])))).toBeCloseTo(2);
  });

  it("turns a line toward +x at angle 90", () => {
    const { outer } = areaOutline({ kind: "line", x: 0, y: 0, angle: 90, length: 20, width: 4 });
    expect(Math.max(...outer.map((p) => p[0]))).toBeCloseTo(20);
  });

  it("widens a cone to its width at its length, starting past the offset", () => {
    const { outer } = areaOutline({ kind: "cone", x: 0, y: 0, angle: 0, offset: 5, length: 25, width: 10 });
    expect(Math.min(...outer.map((p) => p[1]))).toBeCloseTo(5);
    const far = outer.filter((p) => Math.abs(p[1] - 25) < 1e-9);
    expect(Math.max(...far.map((p) => Math.abs(p[0])))).toBeCloseTo(5);
  });
});
