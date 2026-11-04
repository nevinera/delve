// Draws areas on the ground, for as long as they last: red for what hurts, green for what helps.
import * as THREE from "three";
import { discGeometry, drapedMeshes, stripGeometry } from "../abilities/decal.js";

const COLORS = { enemies: "#ff5040", allies: "#50e070" };
const AREA_LAYER = { color: "main", opacity: 1, repeat: [1, 1], scroll: [0, 0], edge: 0, rim: 0, trail: false, solid: 0.75 };

// What shape to draw an area: a ring, or a strip running from its start. Pure, for testing.
export function markOf({ radius, line, width, dir }) {
  if (!line) return { shape: "ring", radius };
  return { shape: "strip", length: radius, width, turn: Math.atan2(dir[0], dir[1]) };
}

// What to lay on the ground for a mark, as drapedMeshes wants it.
function partsOf(mark) {
  if (mark.shape === "strip") {
    const geometry = () => stripGeometry(mark);
    return [
      { geometry: geometry(), layer: { ...AREA_LAYER, texture: "energy", scroll: [0.5, 0], edge: 0.15, opacity: 0.4 } },
      { geometry: geometry(), layer: { ...AREA_LAYER, texture: "plain", edge: 0.08, opacity: 0.15 } },
    ];
  }
  const { radius } = mark;
  return [
    { geometry: discGeometry({ radius }), layer: { ...AREA_LAYER, texture: "swirl", repeat: [3, 0.5], scroll: [0.1, 0], edge: 0.12, opacity: 0.22 } },
    { geometry: discGeometry({ radius, inner: 0.93 }), layer: { ...AREA_LAYER, texture: "plain", edge: 0.5, opacity: 0.9 } },
  ];
}

export class AreaMarks {
  constructor(view) {
    this.view = view;
    this.marks = new Map(); // id -> { draped, from, until, follows }
  }

  add(area, now) {
    this.remove(area.id);
    const mark = markOf(area);
    const color = COLORS[area.affects] ?? "#ffffff";
    const { origin } = this.view;
    const center = new THREE.Vector3(area.at[0] - origin[0], area.at[1], area.at[2] - origin[1]);
    const draped = drapedMeshes(partsOf(mark), [color, color], center, (x, z) => this.view.renditions?.heightAt(x, z), mark.turn ?? 0);
    draped.show(0, 1);
    this.view.scene.add(draped.group);
    this.marks.set(area.id, { draped, from: now, until: now + area.lasts * 1000, follows: area.follows ?? 0 });
  }

  remove(id) {
    const mark = this.marks.get(id);
    if (!mark) return;
    this.view.scene.remove(mark.draped.group);
    for (const mesh of mark.draped.group.children) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.marks.delete(id);
  }

  // Keeps those that follow someone with them, and takes away those that have run out. place says
  // where a unit is drawn.
  frame(now, place) {
    for (const [id, mark] of this.marks) {
      if (now >= mark.until) {
        this.remove(id);
        continue;
      }
      const at = mark.follows ? place(mark.follows) : null;
      if (at) mark.draped.moveTo(at);
      mark.draped.show((now - mark.from) / 1000, 1);
    }
  }
}
