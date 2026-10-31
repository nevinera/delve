import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { imageOf } from "../world/objects.js";
import { slabBottom, slabFace } from "../world/slabs.js";
import { tileTexture, tiledMaterial } from "./builtMeshes.js";
import { slabTexture } from "./slabTextures.js";
import { stairParts } from "./stairMeshes.js";

// Slabs for the 3D view (world/slabs.js): one mesh for each surface a tile's slabs wear, in scene
// feet (continent feet less `origin`, [x, z]), stairs as their steps (stairMeshes.js). A surface
// with a tiled world texture is its color with the texture laid over it, as an object piece's
// tile is.

const materials = new Map(); // surface key -> material

// A tile's slabs as meshes. Each mesh's userData.slabs lists the slabs in it, { slab, start,
// count } in its vertices, for slabAt.
export function slabMeshes(slabs = [], origin) {
  const groups = new Map(); // surface key -> { surface, geometries, slabs }
  for (const slab of slabs) {
    for (const { surface, geometry } of slab.kind === "stairs" ? stairParts(slab, origin) : [{ surface: slab.surface, geometry: slabGeometry(slab, origin) }]) {
      const key = JSON.stringify(surface);
      if (!groups.has(key)) groups.set(key, { surface, geometries: [], slabs: [] });
      const group = groups.get(key);
      const start = group.slabs.reduce((n, s) => n + s.count, 0);
      group.geometries.push(geometry);
      group.slabs.push({ slab, start, count: geometry.attributes.position.count });
    }
  }
  const meshes = [];
  for (const [key, { surface, geometries, slabs: parts }] of groups) {
    const geometry = mergeGeometries(geometries);
    const base = typeof surface === "string" || !surface.tile ? slabTexture(surface) : { feet: 1 };
    const mesh = new THREE.Mesh(scaled(geometry, base.feet), materialFor(key, surface, base));
    mesh.userData.slabs = parts;
    meshes.push(mesh);
    if (typeof surface === "object" && surface.tile) {
      const image = imageOf(surface.tile.image);
      if (!image) continue;
      const over = scaled(geometry.clone(), surface.tile.every);
      over.setAttribute("jitter", new THREE.BufferAttribute(new Float32Array(over.attributes.position.count).fill(surface.tile.jitter), 1));
      if (!materials.has(`${key}/tile`)) materials.set(`${key}/tile`, tiledMaterial(tileTexture(image, surface.palette?.length ? surface.palette : [surface.color])));
      meshes.push(new THREE.Mesh(over, materials.get(`${key}/tile`)));
    }
  }
  return meshes;
}

// The slab a raycast hit on one of slabMeshes' meshes, or null.
export function slabAt(hit) {
  const vertex = hit.faceIndex * 3;
  return hit.object.userData.slabs?.find(({ start, count }) => vertex >= start && vertex < start + count)?.slab ?? null;
}

function materialFor(key, surface, { texture }) {
  if (!materials.has(key)) {
    materials.set(key, texture ? new THREE.MeshLambertMaterial({ map: texture }) : new THREE.MeshLambertMaterial({ color: new THREE.Color(surface.color) }));
  }
  return materials.get(key);
}

// The geometry's uvs, in feet, as copies of a picture `feet` across.
function scaled(geometry, feet) {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / feet, uv.getY(i) / feet);
  return geometry;
}

// A slab as triangles facing out, with flat normals and uvs in feet: across the top and bottom
// faces the outline's own [u, v], and round the sides the distance along the outline and down
// from the top.
export function slabGeometry(slab, origin) {
  const local = ([x, y, z]) => new THREE.Vector3(x - origin[0], y, z - origin[1]);
  // The top face's normal: an unturned slab's (0, 1, 0), turned with it.
  const n = new THREE.Vector3(...slabBottom({ ...slab, at: [0, 0, 0], outline: [[0, 0]], thickness: -1 })[0]);
  const down = n.clone().multiplyScalar(-slab.thickness);
  const loops = [slab.outline, ...(slab.holes ?? [])];
  const tops = loops.map((loop) => slabFace(slab, loop).map(local));
  const positions = [];
  const uvs = [];
  const add = (corners, flat, facing) => {
    const [a, b, c] = corners;
    const out = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const order = out.dot(facing) >= 0 ? [0, 1, 2] : [0, 2, 1];
    for (const i of order) {
      positions.push(...corners[i].toArray());
      uvs.push(...flat[i]);
    }
  };
  // The faces, holes left out: the triangles' corners count on through the holes' corners.
  const flat = loops.flat();
  const top = tops.flat();
  const bottom = top.map((p) => p.clone().add(down));
  const shape = (loop) => loop.map(([u, v]) => new THREE.Vector2(u, v));
  for (const tri of THREE.ShapeUtils.triangulateShape(shape(slab.outline), (slab.holes ?? []).map(shape))) {
    add(tri.map((i) => top[i]), tri.map((i) => flat[i]), n);
    add(tri.map((i) => bottom[i]), tri.map((i) => flat[i]), n.clone().negate());
  }
  // The sides round the outline face out, and round each hole, into it.
  tops.forEach((ring, k) => {
    const turning = new THREE.Vector3();
    ring.forEach((p, i) => turning.add(new THREE.Vector3().crossVectors(p, ring[(i + 1) % ring.length])));
    const sign = (turning.dot(n) >= 0 ? 1 : -1) * (k ? -1 : 1);
    let along = 0;
    ring.forEach((p, i) => {
      const j = (i + 1) % ring.length;
      const length = p.distanceTo(ring[j]);
      const facing = new THREE.Vector3().subVectors(ring[j], p).cross(n).multiplyScalar(sign);
      const [pb, qb] = [p.clone().add(down), ring[j].clone().add(down)];
      const [s0, s1, t] = [along, along + length, slab.thickness];
      add([p, ring[j], qb], [[s0, 0], [s1, 0], [s1, -t]], facing);
      add([p, qb, pb], [[s0, 0], [s1, -t], [s0, -t]], facing);
      along += length;
    });
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}
