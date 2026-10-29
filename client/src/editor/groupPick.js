import * as THREE from "three";
import { TILE_FT } from "../world/constants.js";
import { reachOf, specOf } from "../world/objects.js";
import { slabBottom, slabTop } from "../world/slabs.js";
import { captureTemplate } from "../world/templates.js";
import { boundary } from "./renderView.js";
import { slabAt } from "./slabMeshes.js";

// The detail step's structures tool picking slabs and objects together, to save as a template
// (world/templates.js), working on a DetailView's tiles. A click on a slab or an object adds it,
// or takes it away if it's picked. Dragging a box from where there's none picks what's in it: the
// slabs whose middles and the objects whose places are inside, with those picked before when
// shift's held. A click on nothing lets them all go, as Escape does. Structures can't be picked.

const COLOR = 0xffe066;
const CLICK_PX = 5; // a press moving less than this before it's let go is a click
const RING_POINTS = 32;

export class GroupPick {
  // detail: the DetailView. onPick({ slabs, objects }) hears how many are picked, when it changes.
  constructor(detail, { onPick } = {}) {
    this.detail = detail;
    this.onPick = onPick;
    this.slabs = []; // [{ slab, key }]: the slabs picked, and the tiles listing them
    this.objects = []; // [{ object, key }]
    this.box = null; // a box being dragged: { from: [x, y] client pixels, adding }
    this.marks = new THREE.Group();
    detail.view.scene.add(this.marks);
    this.on = false;
  }

  // Whether the tool's in use: its marks show only then.
  active(on) {
    this.on = on;
    if (!on) this.endBox(null, { drop: true });
    this.drawMarks();
  }

  get count() {
    return this.slabs.length + this.objects.length;
  }

  // Lets everything go.
  clear() {
    this.slabs = [];
    this.objects = [];
    this.changed();
  }

  // A left button press.
  pointerDown(e) {
    const hit = this.thingAt(e);
    if (!hit) {
      this.box = { from: [e.clientX, e.clientY], adding: e.shiftKey };
      return;
    }
    const list = hit.slab ? this.slabs : this.objects;
    const field = hit.slab ? "slab" : "object";
    const at = list.findIndex((p) => p[field] === hit[field]);
    if (at >= 0) list.splice(at, 1);
    else list.push(hit);
    this.changed();
  }

  pointerMove(e) {
    if (!this.box) return;
    this.boxMark ??= Object.assign(document.createElement("div"), { className: "slab-box" });
    if (!this.boxMark.isConnected) document.body.append(this.boxMark);
    const [x0, y0] = this.box.from;
    Object.assign(this.boxMark.style, { left: `${Math.min(x0, e.clientX)}px`, top: `${Math.min(y0, e.clientY)}px`, width: `${Math.abs(e.clientX - x0)}px`, height: `${Math.abs(e.clientY - y0)}px` });
  }

  pointerUp() {
    if (this.box) this.endBox(this.detail.pointer);
  }

  // Escape lets everything go; true when it did.
  key(e) {
    if (e.key !== "Escape" || !this.count) return false;
    this.clear();
    return true;
  }

  // The template the picks make (captureTemplate), or null with fewer than two.
  template({ id, name, withGround }) {
    if (this.count < 2) return null;
    return captureTemplate({ id, name, withGround, slabs: this.slabs.map((p) => p.slab), objects: this.objects.map((p) => p.object), height: this.detail.cells().height });
  }

  // --- where things are ---

  // The window's slab or object under a pointer event, nearest first, as { slab, key } or
  // { object, key }, or null.
  thingAt(e) {
    const { view, canvas } = this.detail;
    const r = canvas.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), view.camera);
    const shown = new Set(this.detail.keys());
    for (const hit of ray.intersectObjects([...view.slabs.children, ...view.objects.children], false)) {
      const key = hit.object.userData.tile?.join(",");
      if (!shown.has(key)) continue;
      const object = hit.object.userData.objects?.[hit.instanceId];
      if (object && !specOf(object.type)?.structure) return { object, key };
      const slab = !object && slabAt(hit);
      if (slab) return { slab, key };
    }
    return null;
  }

  // The box let go: it picks what's in it, with what was picked before when adding. A box hardly
  // dragged is a click on nothing, and lets everything go unless adding.
  endBox(pointer, { drop = false } = {}) {
    if (!this.box) return;
    const { from, adding } = this.box;
    this.box = null;
    this.boxMark?.remove();
    if (drop) return;
    const [x1, y1] = pointer ? [pointer.clientX, pointer.clientY] : from;
    if (Math.hypot(x1 - from[0], y1 - from[1]) <= CLICK_PX) return adding || this.clear();
    const [left, right, top, bottom] = [Math.min(from[0], x1), Math.max(from[0], x1), Math.min(from[1], y1), Math.max(from[1], y1)];
    const r = this.detail.canvas.getBoundingClientRect();
    const { camera, origin, ground } = this.detail.view;
    const inside = (p) => {
      const v = p.project(camera);
      if (v.z > 1) return false;
      const [x, y] = [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height];
      return x >= left && x <= right && y >= top && y <= bottom;
    };
    if (!adding) [this.slabs, this.objects] = [[], []];
    for (const key of this.detail.keys()) {
      const tile = this.detail.view.decoded.get(key);
      for (const slab of tile?.slabs ?? []) {
        if (this.slabs.some((p) => p.slab === slab)) continue;
        const corners = [...slabTop(slab), ...slabBottom(slab)];
        const middle = corners.reduce((m, [x, y, z]) => m.add(new THREE.Vector3(x - origin[0], y, z - origin[1])), new THREE.Vector3()).divideScalar(corners.length);
        if (inside(middle)) this.slabs.push({ slab, key });
      }
      for (const object of tile?.objects ?? []) {
        if (specOf(object.type)?.structure || this.objects.some((p) => p.object === object)) continue;
        const [x, z] = [object.at[0] - origin[0], object.at[1] - origin[1]];
        if (inside(new THREE.Vector3(x, ground(x, z), z))) this.objects.push({ object, key });
      }
    }
    this.changed();
  }

  // --- marks ---

  changed() {
    this.drawMarks();
    this.onPick?.({ slabs: this.slabs.length, objects: this.objects.length });
  }

  // An outline round each slab picked, top and bottom, and a ring round each object.
  drawMarks() {
    for (const child of [...this.marks.children]) {
      child.geometry.dispose();
      child.material.dispose();
      this.marks.remove(child);
    }
    if (this.on) {
      const { origin, ground } = this.detail.view;
      const add = (line) => {
        line.material.depthTest = false;
        line.renderOrder = 5;
        this.marks.add(line);
      };
      for (const { slab } of this.slabs) {
        for (const face of [slabTop(slab), slabBottom(slab)]) {
          const points = [...face, face[0]].map(([x, y, z]) => new THREE.Vector3(x - origin[0], y, z - origin[1]));
          add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: COLOR })));
        }
      }
      for (const { object } of this.objects) {
        const r = reachOf(object) + 1;
        const ring = Array.from({ length: RING_POINTS }, (_, n) => {
          const a = (n / RING_POINTS) * Math.PI * 2;
          return [(object.at[0] + Math.cos(a) * r) / TILE_FT, (object.at[1] + Math.sin(a) * r) / TILE_FT];
        });
        add(boundary(ring, ground, origin, COLOR));
      }
    }
    this.detail.view.render();
  }
}
