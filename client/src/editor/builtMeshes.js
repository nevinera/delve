import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";
import { IMAGE_PX, imageRgba, paletteColors } from "../world/builtObjects.js";

// Geometry for built objects (world/builtObjects.js): each piece's primitive filling a unit box,
// sized, turned and moved into place, and the pieces merged into one geometry with a color per
// vertex, flat-shaded like the rest of the world. Holes (cut pieces) are taken out of each piece
// they reach into.

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
// A type's primitive filling a unit box, with a cylinder's taper, shared: clone it to change it.
export function primitive(type, taper = 1) {
  const key = type === "cylinder" && taper !== 1 ? `cylinder/${taper}` : type;
  if (!unit.has(key)) {
    const g = key === type ? PRIMITIVES[type]() : new THREE.CylinderGeometry(0.5 * taper, 0.5, 1, SIDES);
    unit.set(key, g.index ? g.toNonIndexed() : g);
  }
  return unit.get(key);
}

const euler = new THREE.Euler(0, 0, 0, "YXZ");
const deg = Math.PI / 180;

// One piece's geometry, in place in the object.
export function pieceGeometry({ type, taper, size, at, turn }) {
  const g = primitive(type, taper).clone();
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
  const colored = (piece) => {
    const g = pieceGeometry(piece);
    const c = colors[piece.color] ?? new THREE.Color(0xff00ff);
    const rgb = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < rgb.length; i += 3) rgb.set([c.r, c.g, c.b], i);
    g.setAttribute("color", new THREE.BufferAttribute(rgb, 3));
    for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "color") g.deleteAttribute(name);
    return g;
  };
  const cuts = object.pieces.filter((p) => p.cut).map((p) => withBounds(colored(p)));
  const parts = object.pieces.filter((p) => !p.cut).map((p) => carve(withBounds(colored(p)), cuts));
  if (!parts.length) return null;
  const merged = mergeGeometries(parts);
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  return merged;
}

function withBounds(g) {
  g.computeBoundingBox();
  return g;
}

const evaluator = new Evaluator();
evaluator.attributes = ["position", "color"];
evaluator.useGroups = false;

// A piece's geometry with the holes that reach into it taken out.
function carve(g, cuts) {
  let brush = null;
  for (const cut of cuts) {
    if (!cut.boundingBox.intersectsBox(g.boundingBox)) continue;
    brush ??= new Brush(g);
    brush = evaluator.evaluate(brush, new Brush(cut), SUBTRACTION);
  }
  if (!brush) return g;
  const out = brush.geometry;
  return out.index ? out.toNonIndexed() : out;
}

// --- decals ---

const DECAL_LIFT_FT = 0.02; // off the face, so it doesn't flicker into it
const roundKey = (v) => v.toArray().map((n) => Number(n.toFixed(2)) + 0).join(",");
// The face a normal (in a primitive's unit box) points out of, as pieceFaces names it.
export const faceIdOf = (normal) => roundKey(normal.clone().normalize());

// A primitive's flat faces, each { id, center, u, v } in its unit box: id is the outward normal
// rounded ("0,1,0" the top); center the middle of the face's extent, and u and v half its extent
// across, u level (along x on tops and bottoms) and v up the face (toward -z on tops).
const faceSets = new Map();
export function pieceFaces(type, taper = 1) {
  const key = `${type}/${taper}`;
  if (faceSets.has(key)) return faceSets.get(key);
  const p = primitive(type, taper).attributes.position;
  const groups = new Map(); // id -> { normal, points }
  const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    if (normal.lengthSq() < 1e-12) continue;
    normal.normalize();
    const id = roundKey(normal);
    if (!groups.has(id)) groups.set(id, { normal, points: [] });
    groups.get(id).points.push(a.clone(), b.clone(), c.clone());
  }
  const faces = [...groups].map(([id, { normal, points }]) => {
    const u = Math.abs(normal.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0).cross(normal).normalize();
    const v = normal.clone().cross(u);
    const across = (axis) => {
      const d = points.map((q) => q.dot(axis));
      return [Math.min(...d), Math.max(...d)];
    };
    const [u0, u1] = across(u);
    const [v0, v1] = across(v);
    const center = u.clone().multiplyScalar((u0 + u1) / 2).add(v.clone().multiplyScalar((v0 + v1) / 2)).add(normal.clone().multiplyScalar(points[0].dot(normal)));
    return { id, center, u: u.multiplyScalar((u1 - u0) / 2), v: v.multiplyScalar((v1 - v0) / 2) };
  });
  faceSets.set(key, faces);
  return faces;
}

// A face of a sized piece, before turning and placing: { center, u, v, across, up, normal }, where
// u and v are the face's half extents, sized; across and up unit directions on the face (up made
// square to across); normal outward. Undefined for a face the piece hasn't got.
export function faceFrame(piece, faceId) {
  const face = pieceFaces(piece.type, piece.taper).find((f) => f.id === faceId);
  if (!face) return undefined;
  const size = new THREE.Vector3(...piece.size);
  const [center, u, v] = [face.center, face.u, face.v].map((w) => w.clone().multiply(size));
  const across = u.clone().normalize();
  const up = v.clone().sub(across.clone().multiplyScalar(v.dot(across))).normalize();
  return { center, u, v, across, up, normal: across.clone().cross(up) };
}

// Where on a piece's face a point (in its unit box) is, as a decal's at: [0 to 1, 0 to 1].
export function faceSpot(piece, faceId, point) {
  const face = pieceFaces(piece.type, piece.taper).find((f) => f.id === faceId);
  const d = new THREE.Vector3(...point).sub(face.center);
  const clamp = (n) => Math.min(1, Math.max(0, n));
  return [clamp((d.dot(face.u) / face.u.lengthSq() + 1) / 2), clamp((d.dot(face.v) / face.v.lengthSq() + 1) / 2)];
}

const pieceTurn = (turn) => new THREE.Quaternion().setFromEuler(euler.set(turn[1] * deg, turn[0] * deg, turn[2] * deg, "YXZ"));

// A decal's four corners in the object, bottom-left, bottom-right, top-right, top-left, with its
// normal; undefined when its face is gone.
export function decalCorners(piece, decal) {
  const frame = faceFrame(piece, decal.face);
  if (!frame) return undefined;
  const middle = frame.center.clone().add(frame.u.clone().multiplyScalar(decal.at[0] * 2 - 1)).add(frame.v.clone().multiplyScalar(decal.at[1] * 2 - 1)).add(frame.normal.clone().multiplyScalar(DECAL_LIFT_FT));
  const spin = new THREE.Quaternion().setFromAxisAngle(frame.normal, decal.turn * deg);
  const across = frame.across.clone().applyQuaternion(spin).multiplyScalar(decal.size[0] / 2);
  const up = frame.up.clone().applyQuaternion(spin).multiplyScalar(decal.size[1] / 2);
  const q = pieceTurn(piece.turn);
  const at = new THREE.Vector3(...piece.at);
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([i, j]) => middle.clone().add(across.clone().multiplyScalar(i)).add(up.clone().multiplyScalar(j)).applyQuaternion(q).add(at));
  return { corners, normal: frame.normal.clone().applyQuaternion(q) };
}

// The object's decals as one geometry (position, normal, uv) with an atlas of their images:
// { geometry, atlas: { size, rgba } }, rgba bottom row first as textures take it. image(id) finds
// an image; decals whose image or face is gone are left out. Null with no decals.
export function decalGeometry(object, image, params) {
  const colors = paletteColors(object, params);
  const placed = [];
  for (const piece of object.pieces) {
    if (piece.cut) continue;
    for (const decal of piece.decals ?? []) {
      const img = image(decal.image);
      const quad = img && decalCorners(piece, decal);
      if (quad) placed.push({ img, ...quad });
    }
  }
  if (!placed.length) return null;
  const used = [...new Set(placed.map((d) => d.img))];
  const cells = Math.ceil(Math.sqrt(used.length));
  const size = cells * IMAGE_PX;
  const rgba = new Uint8ClampedArray(size * size * 4);
  used.forEach((img, n) => {
    const pixels = imageRgba(img, colors);
    const [cx, cy] = [(n % cells) * IMAGE_PX, Math.floor(n / cells) * IMAGE_PX];
    for (let y = 0; y < IMAGE_PX; y++) rgba.set(pixels.subarray(y * IMAGE_PX * 4, (y + 1) * IMAGE_PX * 4), ((cy + IMAGE_PX - 1 - y) * size + cx) * 4);
  });
  const positions = [];
  const normals = [];
  const uvs = [];
  for (const { img, corners, normal } of placed) {
    const n = used.indexOf(img);
    // The cell's edges, in from the pixel edges by a hair so neighbors don't bleed in.
    const inset = 0.01 / size;
    const [u0, v0] = [((n % cells) * IMAGE_PX) / size + inset, (Math.floor(n / cells) * IMAGE_PX) / size + inset];
    const [u1, v1] = [u0 + IMAGE_PX / size - 2 * inset, v0 + IMAGE_PX / size - 2 * inset];
    const uv = [
      [u0, v0],
      [u1, v0],
      [u1, v1],
      [u0, v1],
    ];
    for (const k of [0, 1, 2, 0, 2, 3]) {
      positions.push(...corners[k].toArray());
      normals.push(...normal.toArray());
      uvs.push(...uv[k]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingSphere();
  return { geometry, atlas: { size, rgba } };
}

// The texture for a decal atlas: crisp pixels, as painted.
export function atlasTexture({ size, rgba }) {
  const texture = new THREE.DataTexture(rgba, size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

// --- tiled images ---

// Where on a tiled image each corner of a sized piece's geometry falls, in copies of the image:
// round sides (cylinders and cones) wrap, a whole number of copies around; other faces take the
// two axes they face least along.
function tileUvs(g, piece, every) {
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  const round = piece.type === "cylinder" || piece.type === "cone";
  const around = Math.max(1, Math.round((Math.PI * (piece.size[0] + piece.size[2])) / 2 / every));
  const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    const corners = [a, b, c];
    if (round && Math.abs(n.y) < 0.9) {
      const us = corners.map((q) => ((Math.atan2(q.x, q.z) / (2 * Math.PI) + 1) % 1) * around);
      // A triangle across the seam takes its far side's copy.
      if (Math.max(...us) - Math.min(...us) > around / 2) us.forEach((u, k) => u < around / 2 && (us[k] = u + around));
      corners.forEach((q, k) => uv.set([us[k], q.y / every], (i + k) * 2));
      continue;
    }
    const [ax, ay, az] = [Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)];
    const flat = ax >= ay && ax >= az ? (q) => [q.z, q.y] : ay >= az ? (q) => [q.x, q.z] : (q) => [q.x, q.y];
    corners.forEach((q, k) => uv.set(flat(q).map((v) => v / every), (i + k) * 2));
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

const tileEvaluator = new Evaluator();
tileEvaluator.attributes = ["position", "uv"];
tileEvaluator.useGroups = false;

// The object's tiled pieces, as a geometry (position, uv, and jitter for each corner) per image:
// [{ image, geometry }], holes cut. image(id) finds an image; a piece whose image is gone shows
// none.
export function tiledGeometries(object, image) {
  const cuts = object.pieces
    .filter((p) => p.cut)
    .map((p) => {
      const g = pieceGeometry(p);
      g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "uv") g.deleteAttribute(name);
      return withBounds(g);
    });
  const byImage = new Map(); // image -> geometries
  for (const piece of object.pieces) {
    const img = !piece.cut && piece.tile && image(piece.tile.image);
    if (!img) continue;
    const g = primitive(piece.type, piece.taper).clone();
    g.scale(...piece.size);
    for (const name of Object.keys(g.attributes)) if (name !== "position") g.deleteAttribute(name);
    tileUvs(g, piece, piece.tile.every);
    g.applyQuaternion(pieceTurn(piece.turn));
    g.translate(...piece.at);
    let out = withBounds(g);
    for (const cut of cuts) {
      if (!cut.boundingBox.intersectsBox(out.boundingBox)) continue;
      out = tileEvaluator.evaluate(new Brush(out), new Brush(cut), SUBTRACTION).geometry;
      out = withBounds(out.index ? out.toNonIndexed() : out);
    }
    out.setAttribute("jitter", new THREE.BufferAttribute(new Float32Array(out.attributes.position.count).fill(piece.tile.jitter), 1));
    if (!byImage.has(img)) byImage.set(img, []);
    byImage.get(img).push(out);
  }
  return [...byImage].map(([img, parts]) => {
    const geometry = mergeGeometries(parts);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return { image: img, geometry };
  });
}

// The texture for a tiled image in the wearer's colors: repeating, crisp pixels.
export function tileTexture(img, colors) {
  const pixels = imageRgba(img, colors);
  const rgba = new Uint8ClampedArray(pixels.length);
  const row = IMAGE_PX * 4;
  for (let y = 0; y < IMAGE_PX; y++) rgba.set(pixels.subarray(y * row, (y + 1) * row), (IMAGE_PX - 1 - y) * row);
  const texture = atlasTexture({ size: IMAGE_PX, rgba });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

// A tiled image lies just off its piece, see-through where its pixels are, each copy a little
// lighter or darker by its jitter.
export function tiledMaterial(texture) {
  const material = decalMaterial(texture);
  material.flatShading = true;
  material.customProgramCacheKey = () => "tiled";
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nattribute float jitter;\nvarying float vJitter;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvJitter = jitter;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vJitter;").replace(
      "#include <map_fragment>",
      `#include <map_fragment>
        float tileShade = vJitter * (fract(sin(dot(floor(vMapUv), vec2(12.9898, 78.233))) * 43758.5453) - 0.5);
        diffuseColor.rgb *= 1.0 + tileShade;
        // Where the image is clear, a faint white or black film lightens or darkens the piece.
        float filmAlpha = abs(tileShade) * (1.0 - diffuseColor.a);
        float tileAlpha = diffuseColor.a + filmAlpha;
        if (tileAlpha > 0.0) diffuseColor.rgb = (diffuseColor.rgb * diffuseColor.a + step(0.0, tileShade) * filmAlpha) / tileAlpha;
        diffuseColor.a = tileAlpha;`,
    );
  };
  return material;
}

// Decals lie just off their faces, see-through where their pixels are.
export const decalMaterial = (texture) => new THREE.MeshLambertMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

export const builtMaterial = () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
