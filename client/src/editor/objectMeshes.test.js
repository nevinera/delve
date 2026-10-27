import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { addColor, emptyObject } from "../world/builtObjects.js";
import { setBuiltObjects } from "../world/objects.js";
import { emptyStructure, withWalk } from "../world/structures.js";
import { floorAt, tileWalk } from "../world/walkIndex.js";
import { objectMeshes } from "./objectMeshes.js";

const crate = () => {
  const object = { ...emptyObject("crate"), id: "crate000" };
  object.pieces.push({ type: "box", size: [2, 2, 2], at: [0, 1, 0], turn: [0, 0, 0], color: addColor(object, "#806040") });
  return object;
};

// A one-storey structure two cells across, with a cellar under its east cell.
const house = () => {
  const s = { ...emptyStructure("house"), id: "house000" };
  s.storeys[0].floor = ["0,0", "1,0"];
  s.storeys.push({ level: -1, floor: ["1,0"], edges: {} });
  s.objects.push({ type: "built:crate000", name: "crate", at: [2, 0, 2], yaw: 0, scale: 1 }, { type: "built:gone0000", name: "gone", at: [6, 0, 2], yaw: 0, scale: 1 });
  return withWalk(s);
};

describe("object meshes", () => {
  it("draws a structure's objects turned and raised with it, leaving out missing ones", () => {
    setBuiltObjects([crate()], [], [house()]);
    const placed = { id: "p", type: "structure:house000", at: [100, 200], yaw: Math.PI / 2, scale: 1, base: 30, footprint: { open: 10 }, height: 10 };
    const meshes = objectMeshes([placed], () => undefined, [0, 0]);
    const where = meshes
      .map((m) => {
        const matrix = new THREE.Matrix4();
        m.getMatrixAt(0, matrix);
        return new THREE.Vector3().setFromMatrixPosition(matrix).toArray().map((v) => Math.round(v * 100) / 100 + 0);
      })
      .filter(([x]) => x !== 100);
    // A quarter turn takes +x to -z: (2, 2) goes to (2, -2).
    expect(where.length).toBeGreaterThan(0);
    expect(new Set(where.map(String))).toEqual(new Set(["102,30,198"]));
    // Picking one picks the structure.
    expect(meshes.every((m) => m.userData.objects[0] === placed)).toBe(true);
  });

  it("stands things on the floor of a structure over the ground, or the ground", () => {
    setBuiltObjects([], [], [house()]);
    const walk = tileWalk([{ type: "structure:house000", at: [0, 0], yaw: 0, base: 10 }]);
    expect(floorAt(walk, 2, 2, 8)).toBe(10);
    // Over the cellar, the ground floor rather than the cellar's.
    expect(floorAt(walk, 6, 2, 8)).toBe(10);
    expect(floorAt(walk, 20, 2, 8)).toBe(8);
    expect(floorAt(undefined, 2, 2, 8)).toBe(8);
  });
});
