import * as THREE from "three";
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";

// Holes cut by hand through a built object's line of sight mesh (world/builtObjects.js
// `sightCuts`). A cut is a polygon swept along a direction through the whole object, taken out of
// the mesh as builtMeshes.js takes holes out of pieces.

const evaluator = new Evaluator();
evaluator.attributes = ["position"];
evaluator.useGroups = false;

// A closed mesh ({ points, faces }, faces loops counterclockwise seen from outside) with the cuts
// taken out, as triangles; the mesh as it is when there are none. Null when nothing's left.
export function cutMesh(mesh, cuts = []) {
  if (!cuts.length) return mesh;
  const geometry = toGeometry(mesh);
  geometry.computeBoundingSphere();
  const reach = geometry.boundingSphere.center.length() + geometry.boundingSphere.radius + 1;
  let brush = new Brush(geometry);
  for (const cut of cuts) {
    brush = evaluator.evaluate(brush, new Brush(prism(cut, reach)), SUBTRACTION);
  }
  return fromGeometry(brush.geometry);
}

// A cut's polygon swept `reach` feet each way along its direction, as a closed geometry.
function prism({ along, outline }, reach) {
  const axis = new THREE.Vector3(...along).normalize();
  const u = new THREE.Vector3().crossVectors(axis, Math.abs(axis.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
  const w = new THREE.Vector3().crossVectors(axis, u);
  const shape = new THREE.Shape(outline.map((p) => new THREE.Vector2(u.dot(new THREE.Vector3(...p)), w.dot(new THREE.Vector3(...p)))));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 2 * reach, bevelEnabled: false });
  // The extrusion runs along +z from z = 0; its x and y are u and w.
  geometry.translate(0, 0, -reach);
  geometry.applyMatrix4(new THREE.Matrix4().makeBasis(u, w, axis));
  geometry.deleteAttribute("uv");
  geometry.deleteAttribute("normal");
  return geometry;
}

// A mesh as a geometry of triangles, each face fanned from its first corner.
function toGeometry({ points, faces }) {
  const positions = [];
  for (const loop of faces) {
    for (let i = 1; i + 1 < loop.length; i++) for (const v of [loop[0], loop[i], loop[i + 1]]) positions.push(...points[v]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

// A geometry's triangles as a mesh, corners within 1/100 ft of each other made one, and triangles
// left with no area dropped.
function fromGeometry(geometry) {
  const position = geometry.index ? geometry.toNonIndexed().attributes.position : geometry.attributes.position;
  const points = [];
  const index = new Map();
  const at = (i) => {
    const p = [position.getX(i), position.getY(i), position.getZ(i)].map((v) => Math.round(v * 100) / 100 + 0);
    const key = p.join(",");
    if (!index.has(key)) {
      index.set(key, points.length);
      points.push(p);
    }
    return index.get(key);
  };
  const faces = [];
  for (let i = 0; i + 2 < position.count; i += 3) {
    const face = [at(i), at(i + 1), at(i + 2)];
    if (new Set(face).size === 3) faces.push(face);
  }
  return faces.length ? { points, faces } : null;
}
