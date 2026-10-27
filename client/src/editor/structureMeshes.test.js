import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { emptyStructure } from "../world/structures.js";
import { structureGeometries } from "./structureMeshes.js";

const bounds = (g) => {
  g.computeBoundingBox();
  const { min, max } = g.boundingBox;
  return [...min.toArray(), ...max.toArray()].map((v) => Math.round(v * 100) / 100 + 0);
};

describe("structure meshes", () => {
  it("draws floors, walls with openings, the foundation and flights by storey", () => {
    const s = emptyStructure();
    s.storeys[0].floor = ["0,0", "1,0"];
    s.storeys[0].edges["0,0,n"] = { material: "stone", opening: "door", sill: 0, top: 8 };
    s.storeys.push({ level: 1, floor: ["0,0"], edges: {} });
    s.components.push({ type: "stairs", level: 0, at: [1, 0], facing: 0, run: 1 });
    const storeys = structureGeometries(s, { depthFt: 2 });
    expect([...storeys.keys()].sort()).toEqual([0, 1]);
    // Ground: the plinth 2 ft down, the stone wall's half thickness north of the grid and 10 ft up.
    expect(bounds(storeys.get(0))).toEqual([-0.75, -2, -0.75, 8, 10, 4]);
    expect(bounds(storeys.get(1))).toEqual([0, 9.5, 0, 4, 10, 4]);
    // The door leaves no wall between 0 and 8 ft in the middle of the edge.
    const p = storeys.get(0).attributes.position;
    const v = new THREE.Vector3();
    let inDoor = 0;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      if (Math.abs(v.x - 2) < 1.4 && v.z < -0.1 && v.y > 0.1 && v.y < 7.9) inDoor++;
    }
    expect(inDoor).toBe(0);
  });

  it("turns a flight to face its way up", () => {
    const s = emptyStructure();
    s.components.push({ type: "ramp", level: 0, at: [2, 0], facing: 3, run: 2, width: 1 });
    const g = structureGeometries(s).get(0);
    // Climbing west from cell 2,0: it covers cells 1 and 2, highest at the west end.
    expect(bounds(g)).toEqual([4, -0.5, 0, 12, 10, 4]);
    const p = g.attributes.position;
    let westTop = -Infinity;
    for (let i = 0; i < p.count; i++) if (p.getX(i) < 4.01) westTop = Math.max(westTop, p.getY(i));
    expect(westTop).toBeCloseTo(10);
  });
});
