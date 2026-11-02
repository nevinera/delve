import { describe, expect, it } from "vitest";
import { VOXEL_FT } from "../v2/caves.js";
import { ENTRANCE_DEFAULTS, Layout, carvePlan, entranceEnd, entranceProblem, mouthBehind, shapesOf } from "./caveLayout.js";
import { slugOf } from "./cavePlan.js";
import { Caves } from "./caves.js";

// A hillside rising 0.6 ft for each foot east.
const hill = (x) => 0.6 * x;
const hillside = { heightAt: (x) => hill(x) };
const entrance = (details) => ({ ...ENTRANCE_DEFAULTS, mouth: [0, 0, 0], yaw: 90, ...details });
const scene = { add: () => {} };
const spansAt = (caves, x, z) => caves.spans(Math.floor(x / VOXEL_FT), Math.floor(z / VOXEL_FT));

describe("cave layout", () => {
  it("starts a network with an entrance, ending at a point passages go on from", () => {
    const layout = new Layout();
    layout.addNetwork("wailing-hollow");
    const e = layout.addEntrance("wailing-hollow", entrance());
    const point = layout.points.get(e.point);
    expect(point.net).toBe("wailing-hollow");
    expect(point.at).toEqual(entranceEnd(e));
    expect(layout.changes().sort()).toEqual([e.id]);
    // Removing the entrance takes its point, and the network left empty.
    layout.remove(e.id);
    expect(layout.points.size).toBe(0);
    expect(layout.networks.size).toBe(0);
  });

  it("keeps networks, entrances, points and segments in its file", () => {
    const layout = new Layout();
    layout.addNetwork("deep-run");
    const e = layout.addEntrance("deep-run", entrance());
    const far = layout.addPoint("deep-run", [80, -10, 0]);
    layout.addSegment("deep-run", e.point, far.id);
    layout.carved = carvePlan(layout).carved;
    const back = new Layout(JSON.parse(JSON.stringify(layout.toJSON())));
    expect(back.toJSON()).toEqual(layout.toJSON());
    expect(back.changes()).toEqual([]);
    expect(back.addPoint("deep-run", [0, 0, 0]).id).toBe("p5");
  });

  it("renames a network and everything in it, so it's carved again", () => {
    const layout = new Layout();
    layout.addNetwork("deep-run");
    const e = layout.addEntrance("deep-run", entrance());
    layout.carved = carvePlan(layout).carved;
    layout.renameNetwork("deep-run", "deeper-run");
    expect([...layout.networks.keys()]).toEqual(["deeper-run"]);
    expect(layout.points.get(e.point).net).toBe("deeper-run");
    expect(layout.changes()).toEqual([e.id]);
  });

  it("carves a segment again when a point it joins changes", () => {
    const layout = new Layout();
    const [a, b, c] = [[0, -40, 0], [32, -40, 0], [64, -40, 0]].map((at) => layout.addPoint("n", at));
    const [ab, bc] = [layout.addSegment("n", a.id, b.id), layout.addSegment("n", b.id, c.id)];
    layout.carved = carvePlan(layout).carved;
    expect(layout.changes()).toEqual([]);
    c.width = 20;
    expect(layout.changes()).toEqual([bc.id]);
    b.at = [32, -42, 0];
    expect(layout.changes().sort()).toEqual([ab.id, bc.id]);
  });

  it("leaves out segments too near the ground", () => {
    const layout = new Layout();
    const [a, b, c] = [[0, -60, 0], [32, -60, 0], [64, -6, 0]].map((at) => layout.addPoint("n", at));
    const deep = layout.addSegment("n", a.id, b.id);
    const shallow = layout.addSegment("n", b.id, c.id);
    const plan = carvePlan(layout, undefined, () => 0);
    expect(plan.unfit).toEqual([shallow.id]);
    expect(plan.carved.has(deep.id)).toBe(true);
  });

  it("puts an entrance only where its mouth is in the open and its far end under the ground", () => {
    expect(entranceEnd({ mouth: [0, 0, 0], yaw: 90, length: 32, slope: "down" })).toEqual([32, -6.5, 0]);
    expect(mouthBehind([10, 0, 0], { yaw: 90, slope: "down" }, 10).map((v) => v + 0)).toEqual([0, 2, 0]);
    expect(entranceProblem(entrance(), hill)).toBe(null);
    expect(entranceProblem(entrance({ mouth: [0, -5, 0] }), hill)).toMatch(/mouth/);
    expect(entranceProblem(entrance(), () => 0)).toMatch(/far end/);
    expect(entranceProblem(entrance({ yaw: 270 }), hill)).toMatch(/far end/);
  });

  it("drops a layout from before cave networks", () => {
    const old = new Layout({ version: 1, nodes: [{ id: "n1", at: [0, -40, 0] }], arcs: [], carved: {} });
    expect(old.dropped).toBe(true);
    expect(old.networks.size).toBe(0);
    const kept = new Layout(new Layout().toJSON());
    expect(kept.dropped).toBe(false);
  });

  it("carves an entrance's tube out through the hillside, in its network, and a passage on from it", () => {
    const caves = new Caves(scene, hillside);
    const layout = new Layout();
    layout.addNetwork("hill-cave");
    const e = layout.addEntrance("hill-cave", entrance());
    const far = layout.addPoint("hill-cave", [100, 0, 0]);
    layout.addSegment("hill-cave", e.point, far.id);
    const plan = carvePlan(layout, undefined, hill);
    expect(plan.unfit).toEqual([]);
    caves.carvePlan(plan, () => {});
    // The tube opens through the ground near its mouth, and further in, has rock over it.
    expect(Math.max(...spansAt(caves, 6, 0).map((s) => s.ceiling))).toBeGreaterThan(hill(6));
    expect(spansAt(caves, 48, 0)[0].floor).toBeCloseTo(0, 0);
    expect(Math.max(...spansAt(caves, 40, 0).map((s) => s.ceiling))).toBeLessThanOrEqual(hill(40) - 4);
    // The passage goes on past it.
    expect(spansAt(caves, 90, 0).length).toBe(1);
    expect(spansAt(caves, 90, 0)[0].net).toBe("hill-cave");
  });

  it("gives every entrance some shapes", () => {
    const layout = new Layout();
    for (const style of ["natural", "mine"]) expect(shapesOf(layout.copyOf(layout.addEntrance("n", entrance({ style })).id)).length).toBeGreaterThan(1);
  });

  it("names networks as slugs", () => {
    expect(slugOf("  Wailing Hollow! ")).toBe("wailing-hollow");
    expect(slugOf("--")).toBe("");
  });
});
