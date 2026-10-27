import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { emptyStructure } from "../world/structures.js";
import { builtinImage } from "../world/builtinImages.js";
import { structureGeometries, structureGroup } from "./structureMeshes.js";

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
    expect(bounds(storeys.get(0).base)).toEqual([-0.75, -2, -0.75, 8, 10, 4]);
    expect(bounds(storeys.get(1).base)).toEqual([0, 9.5, 0, 4, 10, 4]);
    // The door leaves no wall between 0 and 8 ft in the middle of the edge.
    const p = storeys.get(0).base.attributes.position;
    const v = new THREE.Vector3();
    let inDoor = 0;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      if (Math.abs(v.x - 2) < 1.4 && v.z < -0.1 && v.y > 0.1 && v.y < 7.9) inDoor++;
    }
    expect(inDoor).toBe(0);
  });

  it("stands its objects on their storeys, leaving out missing ones", () => {
    const s = emptyStructure();
    s.storeys[0].floor = ["0,0"];
    s.storeys.push({ level: 1, floor: ["0,0"], edges: {} });
    s.objects.push({ type: "a", at: [1, 10, 2], yaw: 1, scale: 2 }, { type: "gone", at: [0, 0, 0], yaw: 0, scale: 1 });
    const furnish = (o) => (o.type === "a" ? new THREE.Group() : undefined);
    const upstairs = structureGroup(s, { furnish }).children.find((g) => g.userData.level === 1);
    const made = upstairs.children.find((c) => c.isGroup);
    expect(made.position.toArray()).toEqual([1, 10, 2]);
    expect([made.rotation.y, made.scale.x]).toEqual([1, 2]);
    expect(structureGroup(s, { furnish }).children.flatMap((g) => g.children).filter((c) => c.isGroup)).toHaveLength(1);
  });

  it("puts no foundation over a cellar", () => {
    const s = emptyStructure();
    s.storeys[0].floor = ["0,0"];
    s.storeys.push({ level: -1, floor: ["0,0"], edges: {} });
    // The ground floor's slab, and nothing under it down to the cellar's.
    expect(bounds(structureGeometries(s, { depthFt: 5 }).get(0).base)).toEqual([0, -0.5, 0, 4, 0, 4]);
  });

  it("turns a flight to face its way up", () => {
    const s = emptyStructure();
    s.components.push({ type: "ramp", level: 0, at: [2, 0], facing: 3, run: 2, width: 1 });
    const g = structureGeometries(s).get(0).base;
    // Climbing west from cell 2,0: it covers cells 1 and 2, highest at the west end.
    expect(bounds(g)).toEqual([4, -0.5, 0, 12, 10, 4]);
    const p = g.attributes.position;
    let westTop = -Infinity;
    for (let i = 0; i < p.count; i++) if (p.getX(i) < 4.01) westTop = Math.max(westTop, p.getY(i));
    expect(westTop).toBeCloseTo(10);
  });

  it("draws a roof's slopes over its overhang, and its gable ends up to the ridge", () => {
    const s = emptyStructure();
    s.components.push({ type: "roof", level: 0, at: [0, 0], size: [3, 2], shape: "gable", ridge: "x", pitch: 0.5, overhangFt: 1, ends: "stone" });
    const g = structureGeometries(s).get(0).base;
    // The ridge 2 ft over the 10 ft walls; the eaves half a foot lower again, a foot out.
    expect(bounds(g)).toEqual([-1, 9.1, -1, 13, 12, 9]);
    for (const shape of ["hip", "lean-to", "flat"]) {
      s.components[0] = { ...s.components[0], shape, facing: 0 };
      expect(structureGeometries(s).get(0).base.attributes.position.count).toBeGreaterThan(0);
    }
  });

  it("lays materials' tiled images over them, inside faces wearing their own", () => {
    const s = emptyStructure();
    s.storeys[0].floor = ["0,0"];
    s.storeys[0].edges["0,0,n"] = { material: "stone" };
    s.materials.stone.tile = { image: "bistone0", every: 4, jitter: 0.2 };
    s.materials.stone.inside = { image: "biplank0", every: 2, jitter: 0 };
    const { overlays } = structureGeometries(s, { imageOf: builtinImage }).get(0);
    const by = Object.fromEntries(overlays.map((o) => [o.image.name, o.geometry]));
    expect(Object.keys(by).sort()).toEqual(["planks", "stone blocks"]);
    // The planks face south, into the floored cell; the stone everywhere else, north among them.
    const n = by.planks.attributes.normal;
    for (let i = 0; i < n.count; i++) expect(n.getZ(i)).toBeCloseTo(1);
    expect(by["stone blocks"].attributes.jitter.getX(0)).toBeCloseTo(0.2);
    // A copy every 4 ft: the wall's 4.75 ft length spans more than one.
    const uv = by["stone blocks"].attributes.uv;
    let most = -Infinity;
    for (let i = 0; i < uv.count; i++) most = Math.max(most, uv.getX(i));
    expect(most).toBeGreaterThan(1);
  });
});
