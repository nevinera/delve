// Draws areas on the ground, for as long as they last: red for what hurts, green for what helps.
import * as THREE from "three";

const COLORS = { enemies: 0xff5040, allies: 0x50e070 };
const ABOVE_FT = 0.3; // over the ground, so it doesn't sink in

// What shape to draw an area: a ring, or a strip running from its start. Pure, for testing.
export function markOf({ radius, line, width, dir }) {
  if (!line) return { shape: "ring", radius };
  return { shape: "strip", length: radius, width, turn: Math.atan2(dir[0], dir[1]) };
}

export class AreaMarks {
  constructor(view) {
    this.view = view;
    this.marks = new Map(); // id -> { mesh, until, follows, at }
  }

  add(area, now) {
    this.remove(area.id);
    const mark = markOf(area);
    const geometry = mark.shape === "ring" ? new THREE.RingGeometry(mark.radius * 0.96, mark.radius, 64).rotateX(-Math.PI / 2) : new THREE.PlaneGeometry(mark.width, mark.length).rotateX(-Math.PI / 2).translate(0, 0, mark.length / 2);
    const material = new THREE.MeshBasicMaterial({ color: COLORS[area.affects] ?? 0xffffff, transparent: true, opacity: mark.shape === "ring" ? 0.8 : 0.3, side: THREE.DoubleSide, depthWrite: false });
    const mesh = new THREE.Mesh(geometry, material);
    if (mark.turn) mesh.rotation.y = mark.turn;
    const { origin } = this.view;
    mesh.position.set(area.at[0] - origin[0], area.at[1] + ABOVE_FT, area.at[2] - origin[1]);
    this.view.scene.add(mesh);
    this.marks.set(area.id, { mesh, until: now + area.lasts * 1000, follows: area.follows ?? 0 });
  }

  remove(id) {
    const mark = this.marks.get(id);
    if (!mark) return;
    this.view.scene.remove(mark.mesh);
    mark.mesh.geometry.dispose();
    mark.mesh.material.dispose();
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
      if (at) mark.mesh.position.set(at.x, at.y + ABOVE_FT, at.z);
    }
  }
}
