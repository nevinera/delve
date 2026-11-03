import * as THREE from "three";
import { turnPoint } from "../world/builtObjects.js";
import { stairShape } from "../world/slabs.js";

// A stair slab drawn as its steps (world/slabs.js): its top's slope, which is what's walked on,
// runs through the middle of each riser, so the first tread starts level with its bottom edge and
// the last ends level with its top. Treads, the sides and the underside wear the slab's surface,
// risers their own. With risers open, treads are boards as thick as the slab, at most a step's
// height, between solid sides and over nothing.

// The flight's geometry as [{ surface, geometry }], in scene feet (continent feet less `origin`,
// [x, z]), with flat normals and uvs in feet.
export function stairParts(slab, origin) {
  const { width, run, rise, steps } = stairShape(slab);
  const [d, h] = [run / steps, rise / steps];
  const angle = Math.atan2(rise, run);
  // A point `u` across, `x` along and `y` up from the bottom edge's first corner, in the scene.
  const place = (u, x, y) => {
    const [px, py, pz] = turnPoint([u, y, x], [slab.turn[0], 0, 0]);
    return new THREE.Vector3(slab.at[0] + px - origin[0], slab.at[1] + py, slab.at[2] + pz - origin[1]);
  };
  const across = new THREE.Vector3(...turnPoint([1, 0, 0], [slab.turn[0], 0, 0]));
  const along = new THREE.Vector3(...turnPoint([0, 0, 1], [slab.turn[0], 0, 0]));
  const up = new THREE.Vector3(0, 1, 0);
  const treads = new Faces();
  const risers = new Faces();
  const open = slab.risers === null;

  // The profile along the top, [x, y] from the bottom edge: level treads and upright risers.
  const profile = [[0, 0]];
  for (let k = 0; k < steps; k++) profile.push([k * d + d / 2, k * h], [k * d + d / 2, (k + 1) * h]);
  profile.push([run, rise]);
  const board = Math.min(slab.thickness, h);
  for (let k = 0; k + 1 < profile.length; k += 2) {
    const [[x0, y], [x1]] = [profile[k], profile[k + 1]];
    treads.quad([place(0, x0, y), place(width, x0, y), place(width, x1, y), place(0, x1, y)], [[0, x0], [width, x0], [width, x1], [0, x1]], up);
    if (!open) continue;
    // A board's underside and front.
    treads.quad([place(0, x0, y - board), place(width, x0, y - board), place(width, x1, y - board), place(0, x1, y - board)], [[0, x0], [width, x0], [width, x1], [0, x1]], up.clone().negate());
    treads.quad([place(0, x0, y), place(width, x0, y), place(width, x0, y - board), place(0, x0, y - board)], [[0, 0], [width, 0], [width, -board], [0, -board]], along.clone().negate());
  }
  if (!open) {
    for (let k = 1; k + 1 < profile.length; k += 2) {
      const [[x, y0], [, y1]] = [profile[k], profile[k + 1]];
      risers.quad([place(0, x, y0), place(width, x, y0), place(width, x, y1), place(0, x, y1)], [[0, y0], [width, y0], [width, y1], [0, y1]], along.clone().negate());
    }
  }

  // The underside, the slope's thickness below its top, and the sides between the two.
  const below = [Math.sin(angle) * slab.thickness, -Math.cos(angle) * slab.thickness];
  const [b0, b1] = [[below[0], below[1]], [run + below[0], rise + below[1]]];
  const side = [...profile, b1, b0];
  for (const [u, facing] of [[0, across.clone().negate()], [width, across]]) {
    for (const tri of THREE.ShapeUtils.triangulateShape(side.map(([x, y]) => new THREE.Vector2(x, y)), [])) {
      treads.triangle(tri.map((i) => place(u, ...side[i])), tri.map((i) => side[i]), facing);
    }
  }
  if (!open) {
    const length = Math.hypot(run, rise);
    const down = new THREE.Vector3(...turnPoint([0, -1, 0], [slab.turn[0], slab.turn[1], 0]));
    treads.quad([place(0, ...b0), place(width, ...b0), place(width, ...b1), place(0, ...b1)], [[0, 0], [width, 0], [width, length], [0, length]], down);
    // The ends: the bottom edge down to the underside, and the top.
    treads.quad([place(0, 0, 0), place(width, 0, 0), place(width, ...b0), place(0, ...b0)], [[0, 0], [width, 0], [width, below[1]], [0, below[1]]], along.clone().negate());
    treads.quad([place(0, run, rise), place(width, run, rise), place(width, ...b1), place(0, ...b1)], [[0, 0], [width, 0], [width, below[1]], [0, below[1]]], along);
  }
  const parts = [{ surface: slab.surface, geometry: treads.geometry() }];
  if (!open && risers.positions.length) parts.push({ surface: slab.risers ?? slab.surface, geometry: risers.geometry() });
  return parts;
}

// Triangles facing the way they're asked, with uvs.
class Faces {
  constructor() {
    this.positions = [];
    this.uvs = [];
  }

  triangle(corners, flat, facing) {
    const [a, b, c] = corners;
    const out = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    for (const i of out.dot(facing) >= 0 ? [0, 1, 2] : [0, 2, 1]) {
      this.positions.push(...corners[i].toArray());
      this.uvs.push(...flat[i]);
    }
  }

  quad([a, b, c, d], [ta, tb, tc, td], facing) {
    this.triangle([a, b, c], [ta, tb, tc], facing);
    this.triangle([a, c, d], [ta, tc, td], facing);
  }

  geometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.computeVertexNormals();
    return geometry;
  }
}
