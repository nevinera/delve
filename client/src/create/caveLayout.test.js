import { describe, expect, it } from "vitest";
import { TILE_CELLS } from "../v2/caves.js";
import { CELL_FT } from "../v2/sizes.js";
import { Layout, arcShapes, arcSteepness, carvePlan, nodeShapes, shapesOf } from "./caveLayout.js";
import { Caves } from "./caves.js";

// Flat ground at `height`, everywhere, with its cells all one color.
const flat = (height) => ({ heightAt: () => height, cells: () => ({ colors: new Uint8Array(TILE_CELLS * TILE_CELLS * 3).fill(100) }) });
const scene = { add: () => {} };
const spansAt = (caves, x, z) => caves.spans(Math.floor(x / CELL_FT), Math.floor(z / CELL_FT));

describe("cave layout", () => {
  it("bends an arc about every 32 ft, and takes a node's arcs with it", () => {
    const layout = new Layout();
    const [a, b] = [layout.addNode([0, -100, 0]), layout.addNode([128, -100, 0])];
    const arc = layout.addArc(a.id, b.id);
    expect(arc.bends).toHaveLength(3);
    expect(arc.bends[1]).toEqual([64, -100, 0]);
    layout.remove(a.id);
    expect(layout.arcs.size).toBe(0);
  });

  it("knows what's changed since it was carved: new, moved, or deleted", () => {
    const layout = new Layout();
    const [a, b] = [layout.addNode([0, -100, 0]), layout.addNode([96, -100, 0])];
    const arc = layout.addArc(a.id, b.id);
    expect(layout.changes().sort()).toEqual([a.id, b.id, arc.id].sort());
    layout.carved = carvePlan(layout).carved;
    expect(layout.changes()).toEqual([]);
    // Moving a node changes its arcs.
    b.at = [96, -92, 0];
    expect(layout.changes().sort()).toEqual([b.id, arc.id].sort());
    layout.carved = carvePlan(layout).carved;
    layout.remove(arc.id);
    expect(layout.changes()).toEqual([arc.id]);
  });

  it("makes the same shapes from the same element", () => {
    const layout = new Layout();
    const node = layout.addNode([0, -100, 0], { size: "l", shape: "cathedral" });
    expect(nodeShapes(layout.copyOf(node.id))).toEqual(nodeShapes(structuredClone(layout.copyOf(node.id))));
    const other = layout.addNode([200, -60, 40]);
    const arc = layout.addArc(node.id, other.id, { shape: "deadends", style: "lavatube" });
    expect(arcShapes(layout.copyOf(arc.id))).toEqual(arcShapes(layout.copyOf(arc.id)));
  });

  it("says how steep an arc climbs", () => {
    const layout = new Layout();
    const [a, b] = [layout.addNode([0, -100, 0]), layout.addNode([0, 0, 64])];
    const arc = layout.addArc(a.id, b.id);
    const steepest = Math.max(...arcSteepness(layout.copyOf(arc.id)).map((p) => p.deg));
    expect(steepest).toBeGreaterThan(45);
  });

  it("carves rooms with flat floors and tunnels between them, and carving again changes nothing", () => {
    const caves = new Caves(scene, flat(0));
    const layout = new Layout();
    const [a, b] = [layout.addNode([0, -100, 0], { size: "l" }), layout.addNode([160, -100, 0], { size: "m" })];
    layout.addArc(a.id, b.id, { size: 12, shape: "straight" });
    const plan = carvePlan(layout);
    expect(caves.carvePlan(plan)).toBeTruthy();
    layout.carved = plan.carved;
    // The room's floor is flat, on the node.
    for (const x of [-12, 0, 12]) expect(spansAt(caves, x + 2, 2)[0].floor).toBe(-100);
    // The tunnel's open halfway between.
    expect(spansAt(caves, 82, 2).length).toBe(1);
    expect(carvePlan(layout).opens).toHaveLength(0);
  });

  it("fills in what a moved room carved, and carves again what that filling cut into", () => {
    const caves = new Caves(scene, flat(0));
    const layout = new Layout();
    const [a, b] = [layout.addNode([0, -100, 0], { size: "l" }), layout.addNode([160, -100, 0])];
    const arc = layout.addArc(a.id, b.id, { size: 12, shape: "straight" });
    const far = layout.addNode([2000, -100, 0]);
    let plan = carvePlan(layout);
    caves.carvePlan(plan);
    layout.carved = plan.carved;
    a.at = [0, -100, -400];
    plan = carvePlan(layout);
    const redone = [...plan.carved.keys()].filter((id) => plan.carved.get(id) !== layout.carved.get(id));
    expect(redone.sort()).toEqual([a.id, arc.id, b.id].sort());
    expect(redone).not.toContain(far.id);
    caves.carvePlan(plan, () => {});
    layout.carved = plan.carved;
    expect(spansAt(caves, 2, 2)).toEqual([]);
    expect(spansAt(caves, 2, -398)[0].floor).toBe(-100);
  });

  it("undoes a carve as one, saying so", () => {
    const caves = new Caves(scene, flat(0));
    const layout = new Layout();
    layout.addNode([0, -100, 0]);
    let undone = false;
    caves.carvePlan(carvePlan(layout), () => (undone = true));
    expect(spansAt(caves, 2, 2).length).toBe(1);
    caves.undo();
    expect(undone).toBe(true);
    expect(spansAt(caves, 2, 2)).toEqual([]);
  });

  it("carves again what's joined to what changed, and nothing else", () => {
    const layout = new Layout();
    const [a, b, c] = [layout.addNode([0, -100, 0]), layout.addNode([96, -100, 0]), layout.addNode([0, -100, 400])];
    const arc = layout.addArc(a.id, b.id);
    layout.carved = carvePlan(layout).carved;
    arc.size = 14;
    expect(layout.linked(arc.id)).toEqual([a.id, b.id]);
    expect(layout.linked(a.id)).toEqual([arc.id]);
    const redone = new Set(carvePlan(layout).opens.map(({ shape }) => shape));
    expect(redone.size).toBe(shapesOf(layout.copyOf(arc.id)).length + shapesOf(layout.copyOf(a.id)).length + shapesOf(layout.copyOf(b.id)).length);
  });

  it("carves round an opening, which has no shapes of its own", () => {
    const layout = new Layout();
    const room = layout.addNode([0, -100, 0]);
    const opening = layout.addNode([200, 0, 0], { shape: "opening" });
    layout.addArc(room.id, opening.id);
    layout.carved = carvePlan(layout).carved;
    room.at = [0, -92, 0];
    expect(() => carvePlan(layout)).not.toThrow();
  });

  it("doesn't count locking as a change", () => {
    const layout = new Layout();
    const node = layout.addNode([0, -100, 0]);
    layout.carved = carvePlan(layout).carved;
    node.locked = true;
    expect(layout.changes()).toEqual([]);
  });

  it("opens the ground only where a tunnel comes up to an opening, and leaves out rooms too near it", () => {
    const caves = new Caves(scene, flat(0));
    const layout = new Layout();
    const deep = layout.addNode([64, -60, 64], { size: "m" });
    const shallow = layout.addNode([192, -10, 64], { size: "m" });
    const opening = layout.addNode([64, 0, 192], { size: "m", shape: "opening" });
    layout.addArc(deep.id, opening.id, { size: 8 });
    const plan = carvePlan(layout, undefined, () => 0);
    expect(plan.unfit).toEqual([shallow.id]);
    caves.carvePlan(plan, () => {});
    expect(spansAt(caves, 192, 64)).toEqual([]);
    // The tunnel comes up through the ground at the opening, and part way along, stays under it.
    expect(Math.max(...spansAt(caves, 64, 192).map((s) => s.ceiling))).toBeGreaterThan(0);
    expect(Math.max(...spansAt(caves, 64, 100).map((s) => s.ceiling))).toBeLessThanOrEqual(-4);
  });

  it("gives every element some shapes", () => {
    const layout = new Layout();
    for (const shape of ["cathedral", "round", "flat"]) for (const style of ["mineshaft", "borehole", "lavatube"]) expect(shapesOf(layout.copyOf(layout.addNode([0, 0, 0], { shape, style }).id)).length).toBeGreaterThan(0);
  });
});
