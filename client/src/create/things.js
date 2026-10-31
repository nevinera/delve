import * as THREE from "three";
import { objectMeshes } from "../editor/objectMeshes.js";
import { slabMeshes, slabAt } from "../editor/slabMeshes.js";
import { objectShape, pushOut } from "../v2/blocking.js";
import { TILE_FT } from "../v2/sizes.js";
import { reachOf } from "../world/objects.js";
import { turnPoint } from "../world/builtObjects.js";
import { inPolygon, slabBottom, slabFootholds, slabTop } from "../world/slabs.js";
import { WALK_DEG } from "./growth.js";

// The objects and slabs placed by hand (placed.js) round the builder, out to REACH_FT, drawn with
// the editor's models: made again when they change, or the builder leaves their tile. The builder
// stands on slabs' tops, and walls and objects stand in their way. Things picked out are outlined.

const REACH_FT = 1500;
const STEP_FT = 2.5; // how far up a walker steps onto a slab
const HEAD_FT = 6; // how tall a walker is, for what's in their way
const UPRIGHT = 0.3; // a slab whose top faces up less than this is a wall, in the way
const STEEPEST = Math.tan((WALK_DEG * Math.PI) / 180);
const PICKED = 0xffe14d;
const NEAR_FT = 64; // how far round a walker slabs are looked at

// An object (placed.js's readyObject) as objectMeshes draws it: standing at `y`.
export const drawable = (object, y) => ({ ...object, y, owner: object });

export class Things {
  // groundAt(x, z, under): the ground's height, or a cave's floor, no higher than `under`.
  constructor(scene, placed, groundAt) {
    Object.assign(this, { placed, groundAt });
    this.group = new THREE.Group();
    scene.add(this.group);
    this.outlines = new THREE.Group();
    this.outlines.renderOrder = 10;
    scene.add(this.outlines);
    this.drawn = "";
    this.picked = new Set();
    this.pickedDrawn = "";
    this.lineMaterial = new THREE.LineBasicMaterial({ color: PICKED, depthTest: false, transparent: true });
  }

  // The height something without its own stands at at (x, z): the highest slab top there no
  // higher than `under`, or the ground.
  standAt(x, z, under = Infinity, slabs = this.placed.near(x, z, NEAR_FT).slabs) {
    let y = this.groundAt(x, z, under);
    for (const slab of slabs) for (const top of slabFootholds(slab, x, z, STEEPEST)) if (top <= under && top > y) y = top;
    return y;
  }

  // The height an object stands at: its own, or what's under it.
  objectY(object) {
    if (Number.isFinite(object.y)) return object.y;
    const [x, z] = object.at;
    const reach = object.footprint.circle ?? Math.min(...(object.footprint.rect ?? [0])) / 2;
    const ground = Math.min(...[[0, 0], [reach, 0], [-reach, 0], [0, reach], [0, -reach]].map(([dx, dz]) => this.groundAt(x + dx, z + dz)));
    const slab = this.standAt(x, z);
    return slab > this.groundAt(x, z) ? slab : ground - 0.1 * object.height;
  }

  // Each frame, with the builder at (x, z).
  tick(x, z) {
    const drawn = `${Math.floor(x / TILE_FT)},${Math.floor(z / TILE_FT)}:${this.placed.version}`;
    if (drawn !== this.drawn) {
      this.drawn = drawn;
      this.clear();
      const { objects, slabs } = this.placed.near(x, z, REACH_FT);
      const near = (p) => Math.hypot(p[0] - x, p[1] - z) <= REACH_FT;
      const meshes = [...objectMeshes(objects.filter((o) => near(o.at)).map((o) => drawable(o, this.objectY(o))), null, [0, 0]), ...slabMeshes(slabs, [0, 0])];
      for (const mesh of meshes) {
        mesh.frustumCulled = false;
        this.group.add(mesh);
      }
    }
    const picked = `${this.placed.version}:${this.picked.size}`;
    if (picked !== this.pickedDrawn) {
      this.pickedDrawn = picked;
      this.outline();
    }
  }

  // What's under the pointer's ray: { thing, point } for the nearest object or slab, or null.
  pick(raycaster) {
    for (const hit of raycaster.intersectObjects(this.group.children, false)) {
      const thing = hit.object.isInstancedMesh ? hit.object.userData.objects?.[hit.instanceId] : slabAt(hit);
      if (thing) return { thing, point: hit.point };
    }
    return null;
  }

  // Outlines what's picked: objects by a ring round their footprint, slabs by their edges.
  outline() {
    for (const line of this.outlines.children) line.geometry.dispose();
    this.outlines.clear();
    const points = [];
    for (const thing of this.picked) {
      if (thing.outline) {
        const [top, bottom] = [slabTop(thing), slabBottom(thing)];
        top.forEach((p, i) => {
          const j = (i + 1) % top.length;
          points.push(p, top[j], bottom[i], bottom[j], p, bottom[i]);
        });
        continue;
      }
      const y = this.objectY(thing) + 0.3;
      const r = Math.max(1, reachOf(thing) + 0.5);
      for (let k = 0; k < 32; k++) {
        const [a, b] = [(k / 32) * Math.PI * 2, ((k + 1) / 32) * Math.PI * 2];
        points.push([thing.at[0] + Math.cos(a) * r, y, thing.at[1] + Math.sin(a) * r], [thing.at[0] + Math.cos(b) * r, y, thing.at[1] + Math.sin(b) * r]);
        if (k % 8 === 0) points.push([thing.at[0] + Math.cos(a) * r, y, thing.at[1] + Math.sin(a) * r], [thing.at[0] + Math.cos(a) * r, y + thing.height, thing.at[1] + Math.sin(a) * r]);
      }
    }
    if (!points.length) return;
    const geometry = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(points.flat(), 3));
    const lines = new THREE.LineSegments(geometry, this.lineMaterial);
    lines.renderOrder = 10;
    lines.frustumCulled = false;
    this.outlines.add(lines);
  }

  // (x, z) pushed out of the walls and objects in the way of a walker `radius` ft round, whose feet
  // are at `y`: those reaching over a step above their feet and under their head.
  pushOut(x, z, y, radius) {
    const { objects, slabs } = this.placed.near(x, z, NEAR_FT);
    const shapes = objects.filter((o) => o.footprint && !o.footprint.open && this.objectY(o) < y + HEAD_FT && this.objectY(o) + o.height > y + STEP_FT).map(objectShape).filter(Boolean);
    [x, z] = pushOut(x, z, radius, shapes);
    for (const slab of slabs) {
      const n = turnPoint([0, 1, 0], slab.turn);
      if (Math.abs(n[1]) >= UPRIGHT) continue;
      // Out of its face the nearer way, where any of the walker's body, from a step up to their
      // head, is in it, but for its holes.
      for (let h = y + STEP_FT; h <= y + HEAD_FT; h += 1) {
        const [u, across, v] = slabSpace(slab, [x, h, z]);
        if (across > radius || across < -slab.thickness - radius) continue;
        if (!inPolygon(slab.outline, [u, v]) || (slab.holes ?? []).some((hole) => inPolygon(hole, [u, v]))) continue;
        const to = across > -slab.thickness / 2 ? radius : -slab.thickness - radius;
        const flat = Math.hypot(n[0], n[2]) || 1;
        [x, z] = [x + ((n[0] / flat) * (to - across)) / flat, z + ((n[2] / flat) * (to - across)) / flat];
        break;
      }
    }
    return [x, z];
  }

  clear() {
    for (const mesh of this.group.children) {
      mesh.dispose?.();
      if (!mesh.isInstancedMesh) mesh.geometry.dispose();
    }
    this.group.clear();
  }
}

// Continent feet [x, y, z] in a slab's own frame, [u, across, v]: u and v along its outline, and
// across out of its top face.
export function slabSpace(slab, [x, y, z]) {
  const deg = Math.PI / 180;
  const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(slab.turn[1] * deg, slab.turn[0] * deg, slab.turn[2] * deg, "YXZ"));
  const p = new THREE.Vector3(x - slab.at[0], y - slab.at[1], z - slab.at[2]).applyQuaternion(turn.invert());
  return [p.x, p.y, p.z];
}
