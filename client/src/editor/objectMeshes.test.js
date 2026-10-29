import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { addColor, emptyObject } from "../world/builtObjects.js";
import { setBuiltObjects } from "../world/objects.js";
import { objectMeshes } from "./objectMeshes.js";

const crate = () => {
  const object = { ...emptyObject("crate"), id: "crate000" };
  object.pieces.push({ type: "box", size: [2, 2, 2], at: [0, 1, 0], turn: [0, 0, 0], color: addColor(object, "#806040") });
  return object;
};

describe("object meshes", () => {
  it("stands an object with a height there, and leaves out missing kinds", () => {
    setBuiltObjects([crate()]);
    const placed = { id: "p", type: "built:crate000", at: [100, 200], y: 30, yaw: 0, scale: 1, footprint: { rect: [2, 2] }, height: 2 };
    const gone = { id: "g", type: "built:gone0000", at: [100, 200], yaw: 0, scale: 1, footprint: { rect: [2, 2] }, height: 2 };
    const meshes = objectMeshes([placed, gone], () => undefined, [0, 0]);
    expect(meshes.length).toBeGreaterThan(0);
    const matrix = new THREE.Matrix4();
    meshes[0].getMatrixAt(0, matrix);
    expect(new THREE.Vector3().setFromMatrixPosition(matrix).toArray()).toEqual([100, 30, 200]);
    expect(meshes.every((m) => m.userData.objects.every((o) => o === placed))).toBe(true);
  });
});
