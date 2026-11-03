import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { imageOf, makeObject, specOf } from "../world/objects.js";
import { paletteColors } from "../world/builtObjects.js";
import { TEXT_PLACEHOLDER } from "../world/pixelFont.js";
import { atlasTexture, builtMaterial, decalGeometry, decalMaterial, objectGeometry, textGeometry, tileTexture, tiledGeometries, tiledMaterial } from "./builtMeshes.js";
import { meshHeightAt } from "../world/clutter.js";

// Objects for the 3D view (world/objects.js says what they are and where), as instanced meshes:
// one per part shape and variant. Shapes are for scale 1, standing on y = 0 and matching their
// type's footprint and height; long ones (logs) lie along x.

// Objects past a distance from the focus (scene x, z) aren't drawn: they shrink away over the
// last FADE_FT, so they don't pop. Large types (`large: true`) reach farther than small ones.
const FADE_FT = 40;
const sight = { focus: { value: new THREE.Vector2() }, small: { value: 1e9 }, large: { value: 1e9 } };

export function setObjectSight(x, z, smallFt, largeFt) {
  sight.focus.value.set(x, z);
  sight.small.value = Math.min(smallFt, 1e9);
  sight.large.value = Math.min(largeFt, 1e9);
}

function limited(range, vertexColors = false, material = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, side: THREE.DoubleSide, vertexColors })) {
  const before = material.onBeforeCompile.bind(material);
  // Shaders are shared by this key; it keeps what the material did to its shader before apart.
  const key = material.customProgramCacheKey();
  material.customProgramCacheKey = () => `${key}/limited`;
  material.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    shader.uniforms.objectFocus = sight.focus;
    shader.uniforms.objectRange = range;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nuniform vec2 objectFocus;\nuniform float objectRange;").replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
        vec2 objectAt = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
        transformed *= 1.0 - smoothstep(objectRange - ${FADE_FT.toFixed(1)}, objectRange, distance(objectAt, objectFocus));`,
    );
  };
  return material;
}
const materials = { small: limited(sight.small), large: limited(sight.large), builtSmall: limited(sight.small, true), builtLarge: limited(sight.large, true) };
// Built objects at least this tall reach as far as large types.
const BUILT_LARGE_FT = 10;

// A built object's geometry with its parameters' colors, kept per object read from the world.
const builtGeometries = new WeakMap(); // object -> Map(colors -> geometry)
function builtGeometry(object, colors = []) {
  if (!builtGeometries.has(object)) builtGeometries.set(object, new Map());
  const kept = builtGeometries.get(object);
  const key = colors.join(",");
  if (!kept.has(key)) kept.set(key, objectGeometry(object, colors));
  return kept.get(key);
}
// A built object's decals with its parameters' colors, as { geometry, small, large } (a material
// for each reach), or null; kept as its geometry is.
const builtDecals = new WeakMap(); // object -> Map(colors -> decals)
function decalsOf(object, colors = []) {
  if (!builtDecals.has(object)) builtDecals.set(object, new Map());
  const kept = builtDecals.get(object);
  const key = colors.join(",");
  if (!kept.has(key)) {
    const decals = decalGeometry(object, imageOf, colors);
    const texture = decals && atlasTexture(decals.atlas);
    kept.set(key, decals && { geometry: decals.geometry, small: limited(sight.small, false, decalMaterial(texture)), large: limited(sight.large, false, decalMaterial(texture)) });
  }
  return kept.get(key);
}

// A built object's tiled pieces with its parameters' colors, as [{ geometry, small, large }] (one
// per image), kept as its geometry is.
const builtTiles = new WeakMap(); // object -> Map(colors -> tiles)
function tilesOf(object, colors = []) {
  if (!builtTiles.has(object)) builtTiles.set(object, new Map());
  const kept = builtTiles.get(object);
  const key = colors.join(",");
  if (!kept.has(key)) {
    const wearer = paletteColors(object, colors);
    kept.set(
      key,
      tiledGeometries(object, imageOf).map(({ image, geometry }) => {
        const texture = tileTexture(image, wearer);
        return { geometry, small: limited(sight.small, false, tiledMaterial(texture)), large: limited(sight.large, false, tiledMaterial(texture)) };
      }),
    );
  }
  return kept.get(key);
}

// A built object's texts with its parameters' colors and a placement's wording, as { geometry,
// small, large } or null, kept as its geometry is.
const builtTexts = new WeakMap(); // object -> Map(colors and wording -> texts)
function signsOf(object, colors = [], texts = {}) {
  if (!builtTexts.has(object)) builtTexts.set(object, new Map());
  const kept = builtTexts.get(object);
  const key = JSON.stringify([colors, texts]);
  if (!kept.has(key)) {
    const signs = textGeometry(object, colors, texts);
    const texture = signs && atlasTexture(signs.atlas);
    kept.set(key, signs && { geometry: signs.geometry, small: limited(sight.small, false, decalMaterial(texture)), large: limited(sight.large, false, decalMaterial(texture)) });
  }
  return kept.get(key);
}

// A kit type's object at scale 1, white where its parameter is, for its color to tint.
const kitGeometries = new WeakMap(); // spec -> geometry
function kitGeometry(spec) {
  if (!kitGeometries.has(spec)) kitGeometries.set(spec, objectGeometry(spec.kit, ["#ffffff"]).scale(1 / spec.unitFt, 1 / spec.unitFt, 1 / spec.unitFt));
  return kitGeometries.get(spec);
}

const UP = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

// Pushes each vertex in or out by up to `amount`, the same for every copy of a corner so the
// surface stays closed.
function lumpy(geometry, amount, seed) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    const r = random(seed + hashString(key))();
    v.multiplyScalar(1 + amount * (r * 2 - 1));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// A rounded stone `w` wide (x), `h` tall and `d` deep, standing on y = 0.
function stone(w, h, d, seed, { detail = 1, rough = 0.18 } = {}) {
  const base = detail ? new THREE.IcosahedronGeometry(0.5, detail) : new THREE.DodecahedronGeometry(0.5, 0);
  return lumpy(base, rough, seed).scale(w, h, d).translate(0, h * 0.42, 0);
}

function cylinderBetween(a, b, r0, r1, sides = 5) {
  const from = new THREE.Vector3(...a);
  const to = new THREE.Vector3(...b);
  const length = from.distanceTo(to);
  const g = new THREE.CylinderGeometry(r1, r0, length, sides).translate(0, length / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, to.clone().sub(from).normalize()));
  return g.translate(...a);
}

// Several stones scattered round a point, `count` of them within `spread`, up to `tall`.
function heap(count, spread, tall, seed) {
  const rand = random(seed);
  const parts = [];
  for (let s = 0; s < count; s++) {
    const a = rand() * Math.PI * 2;
    const r = spread * Math.sqrt(rand());
    const size = tall * (0.4 + 0.6 * rand());
    parts.push(stone(size * 1.3, size, size * 1.1, seed * 31 + s, { detail: 0, rough: 0.25 }).translate(Math.cos(a) * r, 0, Math.sin(a) * r));
  }
  return mergeGeometries(parts);
}

function log(radius) {
  return new THREE.CylinderGeometry(radius * 0.85, radius, 1, 7).rotateZ(Math.PI / 2).translate(0, radius * 0.9, 0);
}

const SHAPES = {
  boulder: [1, 2, 3].map((seed) => () => stone(0.95, 0.8, 0.85, seed)),
  rock: [4, 5, 6].map((seed) => () => stone(0.95, 0.8, 0.8, seed, { detail: 0, rough: 0.3 })),
  outcrop: [7, 8].map((seed) => () => mergeGeometries([stone(1.4, 1, 1.2, seed, { detail: 0, rough: 0.25 }).translate(-0.5, 0, 0), stone(1.2, 0.7, 1.1, seed + 10, { detail: 0, rough: 0.25 }).translate(0.55, 0, 0.1), stone(0.8, 0.45, 0.8, seed + 20, { detail: 0 }).translate(0.1, 0, -0.35)])),
  bush: [9, 10].map((seed) => () => stone(0.85, 0.95, 0.8, seed, { rough: 0.15 })),
  thicket: [11, 12].map((seed) => () => mergeGeometries([0, 1, 2, 3, 4].map((b) => { const a = b * 1.3 + seed; const r = b ? 0.45 : 0; return stone(0.75, 0.75 + 0.2 * Math.sin(a * 3), 0.7, seed * 7 + b, { rough: 0.15 }).translate(Math.cos(a) * r, 0, Math.sin(a) * r); }))),
  trunk: () => log(0.045),
  // The root plate at the trunk's foot (+x end), standing on edge.
  roots: () => {
    const rand = random(13);
    const parts = [];
    const y = 0.04;
    for (let r = 0; r < 11; r++) {
      const a = (r / 11) * Math.PI * 2 + rand() * 0.4;
      const reach = 0.07 + 0.05 * rand();
      parts.push(cylinderBetween([0.5, y, 0], [0.5 + 0.02 * rand(), Math.max(0, y + Math.sin(a) * reach), Math.cos(a) * reach], 0.012, 0.003, 4));
    }
    parts.push(new THREE.CylinderGeometry(0.07, 0.07, 0.025, 8).rotateZ(Math.PI / 2).translate(0.5, y, 0));
    return mergeGeometries(parts);
  },
  stump: [14, 15].map((seed) => () => lumpy(new THREE.CylinderGeometry(0.65, 0.8, 1, 9, 2), 0.06, seed).translate(0, 0.5, 0)),
  hollowStump: () => lumpy(new THREE.CylinderGeometry(0.65, 0.8, 1, 10, 2, true), 0.08, 16).translate(0, 0.5, 0),
  mossCap: () => new THREE.SphereGeometry(0.4, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 0.9).translate(0, 0.55, 0),
  spire: [17, 18].map((seed) => () => lumpy(new THREE.CylinderGeometry(0.04, 0.15, 1, 6, 4), 0.15, seed).translate(0, 0.5, 0)),
  rubble: [19, 20].map((seed) => () => heap(9, 0.4, 0.3, seed)),
  rootArches: [21, 22].map((seed) => () => {
    const rand = random(seed);
    const parts = [];
    for (let r = 0; r < 6; r++) {
      const radius = 0.25 + 0.25 * rand();
      const arch = new THREE.TorusGeometry(radius, 0.04, 4, 8, Math.PI).scale(1, Math.min(1, 0.6 / radius), 1);
      parts.push(arch.rotateY(rand() * Math.PI).translate((rand() - 0.5) * 0.5, 0, (rand() - 0.5) * 0.5));
    }
    return mergeGeometries(parts);
  }),
  hummock: () => lumpy(new THREE.SphereGeometry(1.1, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0.08, 23).scale(1, 0.9, 1),
};

const geometries = new Map();
function variants(name) {
  if (!geometries.has(name)) {
    geometries.set(name, [SHAPES[name]].flat().map((build) => {
      const g = build();
      return g.index ? g.toNonIndexed() : g;
    }));
  }
  return geometries.get(name);
}

// objects: from tiles' objects lists. tileAt(tx, tz): a decoded tile, for the ground under them.
// origin: the continent position of the scene's origin.
export function objectMeshes(objects, tileAt, origin) {
  const groups = new Map(); // key -> { geometry, material, list: [{ object, p }] }
  const join = (key, geometry, material, item) => {
    if (!groups.has(key)) groups.set(key, { geometry, material, list: [] });
    groups.get(key).list.push(item);
  };
  for (const object of objects) {
    const spec = specOf(object.type);
    if (!spec) continue;
    if (spec.kit) {
      join(`kit:${object.type}/${spec.large ? "large" : "small"}`, kitGeometry(spec), materials[spec.large ? "builtLarge" : "builtSmall"], { object, p: 0 });
      continue;
    }
    if (spec.built) {
      const geometry = builtGeometry(spec.built, object.colors);
      const large = spec.height * object.scale >= BUILT_LARGE_FT;
      const key = `${object.type}/${(object.colors ?? []).join(",")}/${large ? "large" : "small"}`;
      if (geometry) join(key, geometry, large ? materials.builtLarge : materials.builtSmall, { object, p: -1 });
      tilesOf(spec.built, object.colors).forEach((tiles, n) => join(`${key}/tiles${n}`, tiles.geometry, large ? tiles.large : tiles.small, { object, p: -1 }));
      const decals = decalsOf(spec.built, object.colors);
      if (decals) join(`${key}/decals`, decals.geometry, large ? decals.large : decals.small, { object, p: -1 });
      const signs = signsOf(spec.built, object.colors, object.texts);
      if (signs) join(`${key}/texts${JSON.stringify(object.texts ?? {})}`, signs.geometry, large ? signs.large : signs.small, { object, p: -1 });
      continue;
    }
    spec.parts.forEach((part, p) => {
      const { shape } = part;
      const v = Math.floor(object.yaw * 1000) % variants(shape).length;
      join(`${shape}/${v}/${spec.large ? "large" : "small"}`, variants(shape)[v], materials[spec.large ? "large" : "small"], { object, p });
    });
  }
  const meshes = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const tilt = new THREE.Quaternion();
  const color = new THREE.Color();
  for (const { geometry, material, list } of groups.values()) {
    const mesh = new THREE.InstancedMesh(geometry, material, list.length);
    list.forEach(({ object, p }, n) => {
      // Objects with a height stand there, upright.
      const { y, pitch } = object.y !== undefined ? { y: object.y, pitch: 0 } : seat(object, tileAt);
      q.setFromAxisAngle(UP, object.yaw).multiply(tilt.setFromAxisAngle(AXIS_Z, pitch));
      m.compose(new THREE.Vector3(object.at[0] - origin[0], y, object.at[1] - origin[1]), q, new THREE.Vector3(object.scale, object.scale, object.scale));
      mesh.setMatrixAt(n, m);
      // Built objects carry their colors in their geometry.
      mesh.setColorAt(n, p < 0 ? color.set(0xffffff) : color.setRGB(...object.colors[p], THREE.SRGBColorSpace));
    });
    mesh.computeBoundingSphere();
    mesh.userData.objects = list.map(({ object }) => object.owner ?? object);
    meshes.push(mesh);
  }
  return meshes;
}

// One object of `type` on its own, at the middle of its sizes, to look at: a group with its own
// materials, standing on y = 0. Dispose it with disposePreview.
export function typePreview(type) {
  const spec = specOf(type);
  const group = new THREE.Group();
  if (!spec) return group;
  if (spec.built) {
    group.add(own(new THREE.Mesh(objectGeometry(spec.built) ?? new THREE.BufferGeometry(), builtMaterial())));
    const colors = paletteColors(spec.built);
    for (const { image, geometry } of tiledGeometries(spec.built, imageOf)) group.add(own(new THREE.Mesh(geometry, tiledMaterial(tileTexture(image, colors)))));
    const decals = decalGeometry(spec.built, imageOf);
    if (decals) group.add(own(new THREE.Mesh(decals.geometry, decalMaterial(atlasTexture(decals.atlas)))));
    const signs = textGeometry(spec.built, [], {}, TEXT_PLACEHOLDER);
    if (signs) group.add(own(new THREE.Mesh(signs.geometry, decalMaterial(atlasTexture(signs.atlas)))));
    return group;
  }
  const object = makeObject(type, [0, 0], 0, (spec.size[0] + spec.size[1]) / 2, random(hashString(type)));
  if (spec.kit) {
    const mesh = own(new THREE.Mesh(objectGeometry(spec.kit, [`#${new THREE.Color().setRGB(...object.colors[0], THREE.SRGBColorSpace).getHexString()}`]), builtMaterial()));
    mesh.scale.setScalar(object.scale / spec.unitFt);
    group.add(mesh);
    return group;
  }
  spec.parts.forEach((part, p) => {
    const material = new THREE.MeshLambertMaterial({ flatShading: true, side: THREE.DoubleSide, color: new THREE.Color().setRGB(...object.colors[p], THREE.SRGBColorSpace) });
    const mesh = new THREE.Mesh(variants(part.shape)[0], material);
    mesh.scale.setScalar(object.scale);
    group.add(mesh);
  });
  return group;
}

// A built object of `type` with its parameters' `colors` and its `texts`, as a group like
// typePreview's, or undefined for a type that isn't a built object.
export function builtPreview(type, colors = [], texts = {}) {
  const built = specOf(type)?.built;
  if (!built) return undefined;
  const group = new THREE.Group();
  group.add(own(new THREE.Mesh(objectGeometry(built, colors) ?? new THREE.BufferGeometry(), builtMaterial())));
  const wearer = paletteColors(built, colors);
  for (const { image, geometry } of tiledGeometries(built, imageOf)) group.add(own(new THREE.Mesh(geometry, tiledMaterial(tileTexture(image, wearer)))));
  const decals = decalGeometry(built, imageOf, colors);
  if (decals) group.add(own(new THREE.Mesh(decals.geometry, decalMaterial(atlasTexture(decals.atlas)))));
  const signs = textGeometry(built, colors, texts);
  if (signs) group.add(own(new THREE.Mesh(signs.geometry, decalMaterial(atlasTexture(signs.atlas)))));
  return group;
}

// Marks a preview's mesh as having geometry made only for it.
function own(mesh) {
  mesh.userData.ownGeometry = true;
  return mesh;
}

// Frees a preview's materials, and the geometry made only for it (code shapes are shared).
export function disposePreview(group) {
  group.traverse((m) => {
    if (!m.isMesh) return;
    if (!m.userData.sharedMaterial) {
      m.material.map?.dispose();
      m.material.dispose();
    }
    if (m.userData.ownGeometry) m.geometry.dispose();
  });
}

// Where an object sits: long ones rest on the ground at both ends and tilt between them, others
// on the lowest ground under them, so nothing floats. Each sinks in a little.
function seat(object, tileAt) {
  const spec = specOf(object.type);
  const [x, z] = object.at;
  const ground = (dx, dz) => meshHeightAt(tileAt, x + dx, z + dz) ?? 0;
  const sink = (spec.sink ?? 0.1) * object.height;
  const { footprint } = object;
  if (footprint.capsule) {
    const half = footprint.capsule[1];
    const [c, s] = [Math.cos(object.yaw), Math.sin(object.yaw)];
    // The object's +x points at (cos yaw, -sin yaw) in x, z.
    const a = ground(-c * half, s * half);
    const b = ground(c * half, -s * half);
    return { y: (a + b) / 2 - sink, pitch: Math.atan2(b - a, half * 2) };
  }
  const r = footprint.circle ?? Math.min(...footprint.rect) / 2;
  const low = Math.min(ground(0, 0), ground(r, 0), ground(-r, 0), ground(0, r), ground(0, -r));
  return { y: low - sink, pitch: 0 };
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) % 100000;
}

// A steady random sequence, so shapes look the same every load.
function random(seed) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}
