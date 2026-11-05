import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { dummyMaterials, dummyMesh, disposeDummy } from "./dummy.js";

describe("dummyMesh", () => {
  it("stands on the ground about 6ft tall", () => {
    const box = new THREE.Box3().setFromObject(dummyMesh(dummyMaterials()));
    expect(box.min.y).toBeCloseTo(0, 1);
    expect(box.max.y).toBeGreaterThan(5.8);
    expect(box.max.y).toBeLessThan(6.3);
  });

  it("shares its materials and frees only its geometry", () => {
    const look = dummyMaterials(0.5);
    const mesh = dummyMesh(look);
    const used = new Set();
    mesh.traverse((child) => child.material && used.add(child.material));
    expect([...used].every((m) => Object.values(look).includes(m) && m.transparent)).toBe(true);
    disposeDummy(mesh);
  });
});
