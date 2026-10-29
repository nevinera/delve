import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { SLAB_PRESETS } from "../world/slabs.js";
import { slabGeometry, slabMeshes } from "./slabMeshes.js";
import { presetPixels } from "./slabTextures.js";

const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
// An L, both ways round.
const ell = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]];

// Each triangle's normal, and whether it faces away from the point `inside`.
function outward(geometry, inside) {
  const p = geometry.attributes.position;
  const out = [];
  for (let i = 0; i < p.count; i += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(p, i + k));
    const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const middle = a.clone().add(b).add(c).divideScalar(3);
    out.push(normal.dot(middle.sub(inside)) > 0);
  }
  return out;
}

describe("slabMeshes", () => {
  it("closes a slab: top, bottom and a quad per side", () => {
    const g = slabGeometry({ at: [100, 40, 200], turn: [0, 0, 0], outline: square, thickness: 2 }, [100, 200]);
    expect(g.attributes.position.count / 3).toBe(2 + 2 + 8);
    expect(outward(g, new THREE.Vector3(5, 39, 5)).every(Boolean)).toBe(true);
  });

  it("faces out however it's turned and whichever way its outline goes", () => {
    for (const outline of [square, [...square].reverse()]) {
      for (const turn of [[0, -90, 0], [30, -60, 10], [0, 180, 0]]) {
        const slab = { at: [0, 0, 0], turn, outline, thickness: 1 };
        const g = slabGeometry(slab, [0, 0]);
        const box = new THREE.Box3().setFromBufferAttribute(g.attributes.position);
        expect(outward(g, box.getCenter(new THREE.Vector3())).every(Boolean)).toBe(true);
      }
    }
  });

  it("gives a concave outline's sides the right way out", () => {
    const g = slabGeometry({ at: [0, 0, 0], turn: [0, 0, 0], outline: ell, thickness: 1 }, [0, 0]);
    expect(g.attributes.position.count / 3).toBe(4 + 4 + 12);
    // Each side faces away from a point just inside it, below the top.
    const p = g.attributes.position;
    let sides = 0;
    for (let i = 0; i < p.count; i += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(p, i + k));
      const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
      if (Math.abs(normal.y) > 0.5) continue;
      sides++;
      const middle = a.clone().add(b).add(c).divideScalar(3);
      const inside = middle.clone().addScaledVector(normal, -0.1);
      expect(inside.x > 0 && inside.x < 10 && inside.z > 0 && inside.z < 10 && !(inside.x > 4 && inside.z > 4)).toBe(true);
    }
    expect(sides).toBe(12);
  });

  it("lays its picture across in feet", () => {
    const g = slabGeometry({ at: [0, 0, 0], turn: [0, 0, 0], outline: square, thickness: 1 }, [0, 0]);
    const uv = g.attributes.uv;
    const us = Array.from({ length: uv.count }, (_, i) => uv.getX(i));
    expect(Math.max(...us)).toBe(40);
  });

  it("makes a mesh per surface", () => {
    const slabs = [
      { at: [0, 0, 0], turn: [0, 0, 0], outline: square, thickness: 1, surface: "brick" },
      { at: [20, 0, 0], turn: [0, 0, 0], outline: square, thickness: 1, surface: "brick" },
      { at: [40, 0, 0], turn: [0, 0, 0], outline: square, thickness: 1, surface: { color: "#336699", pattern: "moss" } },
    ];
    const meshes = slabMeshes(slabs, [0, 0]);
    expect(meshes).toHaveLength(2);
    expect(meshes[0].geometry.attributes.position.count).toBe(2 * 36);
  });
});

describe("slab presets", () => {
  it("paints every preset", () => {
    for (const name of Object.keys(SLAB_PRESETS)) {
      const { size, rgba, feet } = presetPixels(name);
      expect(rgba.length).toBe(size * size * 4);
      expect(feet).toBeGreaterThan(0);
    }
  });
});
