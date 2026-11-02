import { describe, expect, it } from "vitest";
import { POINT_DEFAULTS, carvePlan, Layout } from "./caveLayout.js";
import { reachOf, segmentShapes } from "./caveQualities.js";
import { Caves } from "./caves.js";

const point = (at, qualities = [], more = {}) => ({ ...structuredClone(POINT_DEFAULTS), at, qualities, ...more });
const segment = (qualities, { id = "s7", to = [64, -60, 0], others } = {}) => ({ id, ends: [point([0, -60, 0], qualities), point(to, qualities)], others });
// How far each dome's floor middle is off the line along z = 0, and up from it.
const across = (shapes) => shapes.map((s) => Math.abs(s.at[2]));
const up = (shapes) => shapes.map((s) => s.at[1] + 60);
// The air a segment opens, in voxel columns' feet.
function air(copy) {
  const caves = new Caves({ add() {} }, { heightAt: () => 0, cellHeightAt: () => 0 });
  for (const shape of segmentShapes(copy)) caves.dig(shape);
  let ft = 0;
  for (const columns of caves.tiles.values()) for (const spans of columns) for (const s of spans ?? []) ft += s.ceiling - s.floor;
  return ft;
}

describe("cave passage qualities", () => {
  it("comes out the same from the same segment, and differently from another", () => {
    expect(segmentShapes(segment(["twisty"]))).toEqual(segmentShapes(segment(["twisty"])));
    expect(segmentShapes(segment(["twisty"]))).not.toEqual(segmentShapes(segment(["twisty"], { id: "s8" })));
  });

  it("meanders a twisty passage, through its points, and further when very twisty", () => {
    const plain = segmentShapes(segment([]));
    expect(Math.max(...across(plain))).toBe(0);
    for (const [q, most] of [["twisty", 10], ["very twisty", 20]]) {
      const twisty = segmentShapes(segment([q]));
      expect(Math.max(...across(twisty))).toBeGreaterThan(1);
      expect(Math.max(...across(twisty))).toBeLessThanOrEqual(most * 1.8);
      expect(twisty[0].at).toEqual([0, -60, 0]);
      expect(twisty.at(-1).at.map((v) => Math.round(v * 1e6) / 1e6 + 0)).toEqual([64, -60, 0]);
      expect(Math.max(...up(twisty))).toBe(0);
    }
  });

  it("fades a quality across the middle where the points differ", () => {
    const copy = { id: "s7", ends: [point([0, -60, 0], ["very twisty"]), point([64, -60, 0])] };
    const shapes = segmentShapes(copy);
    const lastQuarter = shapes.filter((s) => s.at[0] > 50);
    expect(Math.max(...across(lastQuarter))).toBe(0);
  });

  it("raises and drops a bumpy passage's floor", () => {
    const bumpy = segmentShapes(segment(["bumpy"]));
    expect(Math.max(...up(bumpy).map(Math.abs))).toBeGreaterThan(0.5);
    expect(Math.max(...up(bumpy).map(Math.abs))).toBeLessThanOrEqual(4 * 1.5);
  });

  it("carves a shelf along one wall for ledges, up off the floor", () => {
    const shapes = segmentShapes(segment(["ledges"]));
    const ledge = shapes.filter((s) => Math.abs(s.at[2]) > 6);
    expect(ledge.length).toBeGreaterThan(2);
    expect(Math.max(...up(ledge))).toBeGreaterThanOrEqual(4);
    expect(Math.min(...up(ledge))).toBe(0);
  });

  it("leaves rock in a cluttered passage", () => {
    const wide = (qualities) => ({ id: "s7", ends: [point([0, -60, 0], qualities, { width: 20 }), point([96, -60, 0], qualities, { width: 20 })] });
    expect(air(wide(["cluttered"]))).toBeLessThan(air(wide([])));
  });

  it("opens alcoves and side passages off a passage with offshoots, clear of the passages near it", () => {
    const ids = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"];
    const far = (shapes) => Math.max(...across(shapes));
    const reaches = ids.map((id) => far(segmentShapes(segment(["offshoots"], { id, to: [96, -60, 0] }))));
    expect(Math.max(...reaches)).toBeGreaterThan(20); // a side passage, on some
    expect(Math.min(...reaches)).toBeGreaterThan(6); // alcoves, on all
    // With passages alongside both ways, side passages can't go, and alcoves keep clear.
    const others = [-24, 24].map((z) => [point([-40, -60, z]), point([140, -60, z])]);
    for (const id of ids) expect(far(segmentShapes(segment(["offshoots"], { id, to: [96, -60, 0], others })))).toBeLessThan(6 + reachOf(point([0, 0, 0], ["offshoots"]), 96) + 1);
  });

  it("zigzags a steep passage with switchbacks, each leg walkable", () => {
    const steep = { id: "s7", ends: [point([0, -100, 0], ["switchbacks"]), point([30, -40, 0], ["switchbacks"])] };
    const shapes = segmentShapes(steep);
    expect(Math.max(...across(shapes))).toBeGreaterThan(10);
    // Along each leg; across a corner, the way's cut short.
    for (let i = 1; i < shapes.length; i++) {
      if (Math.abs(shapes[i].yaw - shapes[i - 1].yaw) > 0.01) continue;
      const [a, b] = [shapes[i - 1].at, shapes[i].at];
      expect(Math.abs(b[1] - a[1])).toBeLessThanOrEqual(Math.tan((36 * Math.PI) / 180) * Math.hypot(b[0] - a[0], b[2] - a[2]) + 0.01);
    }
    // Not steep, it's left straight.
    expect(Math.max(...across(segmentShapes(segment(["switchbacks"]))))).toBe(0);
  });

  it("keeps the passages near a segment with offshoots in its carved copy", () => {
    const layout = new Layout();
    const [a, b, c, d] = [[0, -60, 0], [64, -60, 0], [0, -60, 40], [64, -60, 40]].map((at) => layout.addPoint("n", at, { qualities: ["offshoots"] }));
    const ab = layout.addSegment("n", a.id, b.id);
    layout.addSegment("n", c.id, d.id);
    expect(layout.copyOf(ab.id).others.length).toBe(1);
    layout.carved = carvePlan(layout).carved;
    d.at = [64, -60, 44];
    expect(layout.changes()).toContain(ab.id);
  });
});
