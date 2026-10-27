import { describe, expect, it } from "vitest";
import { setBuiltObjects } from "./objects.js";
import { emptyStructure, withWalk } from "./structures.js";
import { edgeDistance, standOn, surfaceAt, tileWalk } from "./walkIndex.js";

// A one-cell hut with a wall on its north side and a cellar under it, open to the sky one cell
// east (a stairwell with no floor over it).
function hut() {
  const s = emptyStructure("hut", () => 0.5);
  s.id = "hut00001";
  s.storeys[0].floor = ["0,0"];
  s.storeys[0].edges["0,0,n"] = { material: Object.keys(s.materials)[0] };
  s.storeys.push({ level: -1, floor: ["0,0", "1,0"], edges: {} });
  return withWalk(s);
}

describe("walk index", () => {
  it("indexes a placed structure's cells, edges and cut by world cell", () => {
    setBuiltObjects([], [], [hut()]);
    const walk = tileWalk([{ type: "structure:hut00001", at: [40, 80], yaw: 0, base: 100, scale: 1 }]);
    expect(walk.cells.get("10,20").map((c) => c.level).sort()).toEqual([-1, 0]);
    expect(walk.cells.get("10,20").find((c) => c.level === 0).heights).toEqual([100, 100, 100, 100]);
    expect(walk.edges.get("10,20,n")[0]).toEqual({ kind: "wall", heights: [100, 110] });
    expect([...walk.under].sort()).toEqual(["10,20", "11,20"]);
    expect([...walk.cut]).toEqual(["11,20"]);
    // Turned a quarter, +x goes to -z: the open cell is north of the anchor's.
    const turned = tileWalk([{ type: "structure:hut00001", at: [40, 80], yaw: Math.PI / 2, base: 100, scale: 1 }]);
    expect([...turned.cut]).toEqual(["10,18"]);
  });

  it("stands on the highest surface within a step, and finds edges", () => {
    expect(standOn([110, 100], 98, 100, 1.5)).toBe(100);
    expect(standOn([110, 100], 98, 109, 1.5)).toBe(110);
    expect(standOn([], null, 0, 1.5)).toBe(null);
    // Nothing low enough: the lowest, to be climbed or not.
    expect(standOn([120], 115, 100, 1.5)).toBe(115);
    expect(surfaceAt({ heights: [0, 4, 4, 0] }, 2, 1)).toBe(2);
    expect(edgeDistance("1,1,n", 6, 5)).toBe(1);
    expect(edgeDistance("1,1,w", 2, 6)).toBe(2);
  });
});
