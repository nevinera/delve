import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { paletteColors } from "../world/builtObjects.js";

// Geometry for built objects (world/builtObjects.js): each piece's primitive filling a unit box,
// sized, turned and moved into place, and the pieces merged into one geometry with a color per
// vertex, flat-shaded like the rest of the world.

// A multiple of four, so round pieces reach their box's sides.
const SIDES = 12;

// A triangular prism along x: full height at the back (-z), sloping down to the front (+z).
function wedge() {
  // Its triangular end's corners as [y, z]: bottom back, bottom front, top back.
  const [b, f, t] = [[-0.5, -0.5], [-0.5, 0.5], [0.5, -0.5]];
  const v = (x, [y, z]) => [x, y, z];
  const [l, r] = [-0.5, 0.5];
  const triangles = [
    [v(l, b), v(l, f), v(l, t)],
    [v(r, b), v(r, t), v(r, f)],
    // Bottom, back and slope, as two triangles each.
    [v(l, b), v(r, b), v(r, f)], [v(l, b), v(r, f), v(l, f)],
    [v(l, b), v(l, t), v(r, t)], [v(l, b), v(r, t), v(r, b)],
    [v(l, f), v(r, f), v(r, t)], [v(l, f), v(r, t), v(l, t)],
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(triangles.flat(2), 3));
  return g;
}

// Each type's primitive, filling the box from -0.5 to 0.5 on every axis.
const PRIMITIVES = {
  box: () => new THREE.BoxGeometry(1, 1, 1),
  wedge,
  cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, SIDES),
  cone: () => new THREE.CylinderGeometry(0, 0.5, 1, SIDES),
  sphere: () => new THREE.IcosahedronGeometry(0.5, 1),
  pyramid: () => new THREE.CylinderGeometry(0, Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4),
  // Three sides on a triangle: three.js's runs from z = 0.5 to -0.25 and 0.866 across, with its
  // flat edge at the back (-z).
  tetrahedron: () => new THREE.CylinderGeometry(0, 0.5, 1, 3).translate(0, 0, -0.125).scale(1 / (0.5 * Math.sqrt(3)), 1, 1 / 0.75),
};

const unit = new Map();
function primitive(type) {
  if (!unit.has(type)) {
    const g = PRIMITIVES[type]();
    unit.set(type, g.index ? g.toNonIndexed() : g);
  }
  return unit.get(type);
}

const euler = new THREE.Euler(0, 0, 0, "YXZ");
const deg = Math.PI / 180;

// One piece's geometry, in place in the object.
export function pieceGeometry({ type, size, at, turn }) {
  const g = primitive(type).clone();
  g.scale(...size);
  g.applyQuaternion(new THREE.Quaternion().setFromEuler(euler.set(turn[1] * deg, turn[0] * deg, turn[2] * deg, "YXZ")));
  g.translate(...at);
  return g;
}

// The whole object as one geometry, each vertex colored by its piece's palette color (with
// `params` overriding the parameters, as paletteColors takes them). Null for an empty object.
export function objectGeometry(object, params) {
  if (!object.pieces.length) return null;
  const colors = paletteColors(object, params).map((hex) => new THREE.Color(hex));
  const parts = object.pieces.map((piece) => {
    const g = pieceGeometry(piece);
    const c = colors[piece.color] ?? new THREE.Color(0xff00ff);
    const rgb = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < rgb.length; i += 3) rgb.set([c.r, c.g, c.b], i);
    g.setAttribute("color", new THREE.BufferAttribute(rgb, 3));
    for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "color") g.deleteAttribute(name);
    return g;
  });
  const merged = mergeGeometries(parts);
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  return merged;
}

export const builtMaterial = () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
