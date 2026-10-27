import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { PIECE_TYPES, addColor, emptyObject, pieceCorners } from "../world/builtObjects.js";
import { objectGeometry, pieceGeometry } from "./builtMeshes.js";

const bounds = (g) => {
  g.computeBoundingBox();
  const { min, max } = g.boundingBox;
  return [min.toArray(), max.toArray()].map((v) => v.map((n) => Math.round(n * 1000) / 1000));
};

describe("built object meshes", () => {
  it("fills each piece's box with its primitive", () => {
    for (const type of PIECE_TYPES) {
      const [min, max] = bounds(pieceGeometry({ type, size: [2, 4, 6], at: [1, 2, 3], turn: [0, 0, 0] }));
      expect(min, type).toEqual([0, 0, 0]);
      expect(max, type).toEqual([2, 4, 6]);
    }
  });

  it("faces every primitive's triangles outward", () => {
    for (const type of PIECE_TYPES) {
      const p = pieceGeometry({ type, size: [1, 1, 1], at: [0, 0, 0], turn: [0, 0, 0] }).attributes.position;
      const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
      // Inside the shape: the middle of its corners (a wedge's slope runs through its box's middle).
      const inside = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) inside.add(a.fromBufferAttribute(p, i));
      inside.divideScalar(p.count);
      for (let i = 0; i < p.count; i += 3) {
        a.fromBufferAttribute(p, i);
        b.fromBufferAttribute(p, i + 1);
        c.fromBufferAttribute(p, i + 2);
        const normal = b.clone().sub(a).cross(c.clone().sub(a));
        const middle = a.clone().add(b).add(c).divideScalar(3).sub(inside);
        expect(normal.dot(middle), `${type} triangle ${i / 3}`).toBeGreaterThan(0);
      }
    }
  });

  it("turns pieces the way the format's corners do", () => {
    const piece = { type: "box", size: [4, 1, 2], at: [1, 2, 3], turn: [30, 20, 70] };
    const corners = pieceCorners(piece);
    const g = pieceGeometry(piece);
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const nearest = Math.min(...corners.map((c) => v.distanceTo(new THREE.Vector3(...c))));
      expect(nearest).toBeLessThan(1e-4);
    }
  });

  it("merges pieces, colored by the palette, with parameters overridden", () => {
    const object = emptyObject();
    const red = addColor(object, "#ff0000");
    const blue = addColor(object, "#0000ff");
    object.pieces.push({ type: "box", size: [1, 1, 1], at: [0, 0.5, 0], turn: [0, 0, 0], color: red });
    object.pieces.push({ type: "cone", size: [1, 1, 1], at: [0, 1.5, 0], turn: [0, 0, 0], color: blue });
    const g = objectGeometry(object, ["#00ff00"]);
    const c = g.attributes.color;
    expect([c.getX(0), c.getY(0), c.getZ(0)]).toEqual([0, 1, 0]);
    expect([c.getX(c.count - 1), c.getY(c.count - 1), c.getZ(c.count - 1)]).toEqual([0, 0, 1]);
    expect(objectGeometry(emptyObject())).toBeNull();
  });
});
